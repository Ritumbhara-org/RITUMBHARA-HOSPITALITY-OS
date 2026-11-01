// Loyalty WhatsApp messages: templates, a provider abstraction over the existing Twilio / Meta senders, a delivery
// log (LoyaltyNotification) with de-duplication and retries. SERVER-ONLY.
//
// Business-initiated WhatsApp messages need approved templates:
//   Twilio: LOYALTY_WA_TEMPLATES = JSON map of kind -> Content SID, e.g. {"POINTS_CREDITED":"HX...","OTP":"HX..."}
//   Meta:   templates named loyalty_<kind lowercase> (override names/languages with META_WA_TEMPLATES as usual)
// Variables are positional ({{1}}, {{2}}, ...) in the order listed in TEMPLATES below. Without a template the plain
// text is sent, which WhatsApp only delivers inside a 24-hour customer-service window.
// No credentials are read or stored here beyond what the existing WhatsApp senders already use.

import twilio from "twilio"
import { prisma } from "@/lib/prisma"
import { normalizePhoneNumber } from "@/lib/utils/phone"
import { resolveWhatsAppProvider, getMetaSendConfig, metaDisplayNumber } from "@/lib/whatsapp/meta/config"
import { sendMetaTemplate, sendMetaText } from "@/lib/whatsapp/meta/send"
import { metaTemplateFor, orderedParams } from "@/lib/whatsapp/meta/templates"
import { isTwilioSendBlocked, TWILIO_BLOCKED_MESSAGE } from "@/lib/twilio/preview-guard"
import { metaOtpTemplateName, twilioSidFor } from "./template-ids"

export type LoyaltyMessageKind =
  | "POINTS_CREDITED"
  | "BIRTHDAY_BONUS"
  | "ANNIVERSARY_BONUS"
  | "REFERRAL_BONUS"
  | "TIER_UPGRADE"
  | "POINTS_EXPIRING"
  | "POINTS_EXPIRED"
  | "OTP"
  | "REDEMPTION_SUCCESS"

type Vars = Record<string, string>

export const TEMPLATES: Record<LoyaltyMessageKind, { vars: string[]; text: (v: Vars) => string }> = {
  POINTS_CREDITED: {
    vars: ["name", "points", "balance", "value"],
    text: (v) => `Congratulations ${v.name}! Your stay at Ritumbhara has earned you ${v.points} loyalty points. Your current balance is ${v.balance} points (₹${v.value}). Keep staying with us to unlock more rewards!`,
  },
  BIRTHDAY_BONUS: {
    vars: ["name", "points", "balance"],
    text: (v) => `Happy Birthday, ${v.name}! 🎂 We've added ${v.points} bonus points to your Ritumbhara membership. Your balance is now ${v.balance} points.`,
  },
  ANNIVERSARY_BONUS: {
    vars: ["name", "points", "balance"],
    text: (v) => `Happy Anniversary, ${v.name}! We've added ${v.points} bonus points to your Ritumbhara membership. Your balance is now ${v.balance} points.`,
  },
  REFERRAL_BONUS: {
    vars: ["name", "points", "balance"],
    text: (v) => `Thank you, ${v.name}! Your referral was successful and ${v.points} bonus points have been credited. Your balance is now ${v.balance} points.`,
  },
  TIER_UPGRADE: {
    vars: ["name", "tier", "multiplier"],
    text: (v) => `Congratulations ${v.name}! You are now a Ritumbhara ${v.tier} member and earn ${v.multiplier}X points on every stay — even more when you book direct.`,
  },
  POINTS_EXPIRING: {
    vars: ["name", "points", "expiry_date"],
    text: (v) => `Dear ${v.name}, ${v.points} loyalty points will expire on ${v.expiry_date}. Redeem them on your next Ritumbhara stay!`,
  },
  POINTS_EXPIRED: {
    vars: ["name", "points", "balance"],
    text: (v) => `Dear ${v.name}, ${v.points} loyalty points have expired. Your Ritumbhara balance is now ${v.balance} points.`,
  },
  OTP: {
    vars: ["code"],
    text: (v) => `${v.code} is your Ritumbhara membership code. It is valid for 5 minutes. Don't share it with anyone except Ritumbhara staff at the desk.`,
  },
  REDEMPTION_SUCCESS: {
    vars: ["name", "points", "reference", "balance"],
    text: (v) => `Dear ${v.name}, ${v.points} points have been redeemed (ref ${v.reference}). Your remaining balance is ${v.balance} points.`,
  },
}

export function templateName(kind: LoyaltyMessageKind): string {
  return "loyalty_" + kind.toLowerCase()
}

export function renderMessage(kind: LoyaltyMessageKind, vars: Vars): { body: string; positional: Record<string, string> } {
  const t = TEMPLATES[kind]
  const positional: Record<string, string> = {}
  t.vars.forEach((k, i) => (positional[String(i + 1)] = String(vars[k] ?? "")))
  return { body: t.text(vars), positional }
}



export type DeliveryResult = { ok: true; status: "SENT" | "SANDBOX" } | { ok: false; error: string }

export interface DeliveryInput {
  kind: LoyaltyMessageKind
  to: string
  body: string
  positional: Record<string, string>
  logBody: string
  relatedId?: string | null
}

// Provider abstraction. Tests (and a future provider) replace this through setLoyaltyTransport.
export type LoyaltyTransport = (msg: DeliveryInput) => Promise<DeliveryResult>

async function logMessage(msg: DeliveryInput, from: string, status: string, isTemplate: boolean) {
  try {
    await prisma.whatsAppMessage.create({
      data: {
        direction: "OUTBOUND", from, to: msg.to, messageType: isTemplate ? "template" : "text", content: msg.logBody,
        templateName: isTemplate ? templateName(msg.kind) : null, status, relatedEntityType: "LOYALTY", relatedEntityId: msg.relatedId ?? null,
      },
    })
  } catch (e) {
    console.error("[Loyalty WhatsApp log]", e)
  }
}

export const whatsappTransport: LoyaltyTransport = async (msg) => {
  if (resolveWhatsAppProvider() === "meta") {
    const cfg = getMetaSendConfig()
    if (!cfg.ok) {
      await logMessage(msg, metaDisplayNumber(), "FAILED", false)
      return { ok: false, error: "WhatsApp (Meta) isn't set up: " + cfg.missing.join(", ") }
    }
    const tpl = metaTemplateFor(msg.kind === "OTP" ? metaOtpTemplateName() : templateName(msg.kind))
    let r = tpl ? await sendMetaTemplate(cfg.config, msg.to, tpl, orderedParams(msg.positional)) : null
    if (!r || !r.ok) r = await sendMetaText(cfg.config, msg.to, msg.body)
    await logMessage(msg, cfg.config.displayNumber, r.ok ? "DELIVERED" : "FAILED", !!tpl && r.ok)
    return r.ok ? { ok: true, status: "SENT" } : { ok: false, error: "Meta send failed: " + r.reason }
  }

  if (isTwilioSendBlocked()) {
    await logMessage(msg, "SYSTEM", "BLOCKED_PREVIEW", false)
    return { ok: false, error: TWILIO_BLOCKED_MESSAGE }
  }
  const accountSid = process.env.TWILIO_ACCOUNT_SID
  const authToken = process.env.TWILIO_AUTH_TOKEN
  const fromNumber = process.env.TWILIO_WHATSAPP_NUMBER
  if (!accountSid || !authToken || !fromNumber) {
    if (process.env.NODE_ENV === "production") {
      await logMessage(msg, "SYSTEM", "FAILED", false)
      return { ok: false, error: "WhatsApp (Twilio) isn't set up on this deployment." }
    }
    console.log(`[Loyalty WhatsApp sandbox] to ${msg.to}: ${msg.logBody}`)
    await logMessage(msg, "SYSTEM", "SANDBOX_DELIVERED", false)
    return { ok: true, status: "SANDBOX" }
  }
  const sid = twilioSidFor(msg.kind)
  const client = twilio(accountSid, authToken)
  const base = { to: `whatsapp:${msg.to}`, from: `whatsapp:${normalizePhoneNumber(fromNumber)}` }
  try {
    try {
      await client.messages.create((sid ? { ...base, contentSid: sid, contentVariables: JSON.stringify(msg.positional) } : { ...base, body: msg.body }) as never)
    } catch (err) {
      if (!sid) throw err
      console.warn("[Loyalty WhatsApp] template send failed, falling back to plain text")
      await client.messages.create({ ...base, body: msg.body } as never)
    }
    await logMessage(msg, fromNumber, "DELIVERED", !!sid)
    return { ok: true, status: "SENT" }
  } catch (err) {
    await logMessage(msg, fromNumber, "FAILED", !!sid)
    return { ok: false, error: "WhatsApp message could not be sent: " + (err instanceof Error ? err.message : String(err)).slice(0, 200) }
  }
}

let transport: LoyaltyTransport = whatsappTransport
export function setLoyaltyTransport(t: LoyaltyTransport | null) {
  transport = t ?? whatsappTransport
}

// ---------- queued notifications ----------

export interface OutboxItem {
  kind: Exclude<LoyaltyMessageKind, "OTP">
  membershipId: string
  to: string
  vars: Vars
  dedupeKey: string
}

export const MAX_NOTIFICATION_ATTEMPTS = 3

async function deliverRow(row: { id: string; kind: string; to: string; body: string; variables: unknown; membershipId: string | null; attempts: number }) {
  const kind = row.kind as LoyaltyMessageKind
  const r = await transport({ kind, to: row.to, body: row.body, positional: (row.variables || {}) as Record<string, string>, logBody: row.body, relatedId: row.membershipId })
  await prisma.loyaltyNotification.update({
    where: { id: row.id },
    data: r.ok ? { status: "SENT", sentAt: new Date(), attempts: { increment: 1 }, lastError: null } : { status: "FAILED", attempts: { increment: 1 }, lastError: r.error.slice(0, 500) },
  })
  return r.ok
}

// Sends each message once: a repeated dedupeKey (duplicate webhook, re-run job) is skipped. Never throws; a failed
// delivery stays FAILED and is retried by the loyalty job up to MAX_NOTIFICATION_ATTEMPTS times.
export async function flushOutbox(items: OutboxItem[]): Promise<{ sent: number; failed: number; skipped: number }> {
  const out = { sent: 0, failed: 0, skipped: 0 }
  for (const item of items) {
    try {
      if (!item.to) {
        out.skipped++
        continue
      }
      const { body, positional } = renderMessage(item.kind, item.vars)
      let row
      try {
        row = await prisma.loyaltyNotification.create({
          data: { membershipId: item.membershipId, kind: item.kind, dedupeKey: item.dedupeKey, to: item.to, body, variables: positional },
        })
      } catch (e) {
        if ((e as { code?: string }).code === "P2002") {
          out.skipped++
          continue
        }
        throw e
      }
      if (await deliverRow(row)) out.sent++
      else out.failed++
    } catch (e) {
      console.error("[Loyalty notify]", e)
      out.failed++
    }
  }
  return out
}

export async function retryFailedNotifications(now = new Date()): Promise<number> {
  const rows = await prisma.loyaltyNotification.findMany({
    where: { status: "FAILED", attempts: { lt: MAX_NOTIFICATION_ATTEMPTS }, updatedAt: { lt: new Date(now.getTime() - 10 * 60 * 1000) } },
    take: 50,
    orderBy: { createdAt: "asc" },
  })
  let sent = 0
  for (const r of rows) if (await deliverRow(r).catch(() => false)) sent++
  return sent
}

// One-time codes: sent directly (never queued or retried), and logged without the code.
export async function sendOtpMessage(to: string, code: string, relatedId?: string): Promise<DeliveryResult> {
  const { body, positional } = renderMessage("OTP", { code })
  try {
    return await transport({ kind: "OTP", to, body, positional, logBody: "Membership code sent (code hidden)", relatedId })
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}
