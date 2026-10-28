import { NextResponse, after } from "next/server";
import { getMetaWebhookConfig, metaPhoneNumberId } from "@/lib/whatsapp/meta/config";
import { verifyMetaSignature } from "@/lib/whatsapp/meta/signature";
import { parseMetaWebhook } from "@/lib/whatsapp/meta/parse";
import { defaultPipelineDeps, processMetaInbound } from "@/lib/whatsapp/meta/pipeline";

// Meta WhatsApp Cloud API webhook. Runs ALONGSIDE the Twilio webhook (/api/whatsapp/webhook), which is unchanged.
// Fail closed: without META_APP_SECRET and META_WEBHOOK_VERIFY_TOKEN every request is refused.
//   GET  - Meta's subscription handshake (hub.verify_token must match, hub.challenge is echoed).
//   POST - X-Hub-Signature-256 is verified over the raw body BEFORE anything is parsed. Meta gets 200 at once and
//          the messages are processed after the response (Meta retries slow or failed deliveries; retried message
//          ids are skipped). Delivery-status events are ignored.

export const dynamic = "force-dynamic";
export const maxDuration = 60; // the website guest assistant can take up to ~25 s

const MAX_BODY_BYTES = 256 * 1024;
// wamid -> time: a fast first filter on this instance. The durable check (across instances and restarts) is in the
// pipeline, which records each wamid with the inbound message and skips one it has already recorded.
const seen = new Map<string, number>();
const SEEN_TTL_MS = 60 * 60 * 1000;

function firstSighting(id: string): boolean {
  const now = Date.now();
  if (seen.size > 2000) for (const [k, t] of seen) if (now - t > SEEN_TTL_MS || seen.size > 1500) seen.delete(k);
  if (seen.has(id)) return false;
  seen.set(id, now);
  return true;
}

export async function GET(req: Request) {
  const cfg = getMetaWebhookConfig();
  const p = new URL(req.url).searchParams;
  if (cfg && p.get("hub.mode") === "subscribe" && p.get("hub.verify_token") === cfg.verifyToken) {
    const challenge = (p.get("hub.challenge") || "").slice(0, 200);
    return new Response(challenge, { status: 200, headers: { "Content-Type": "text/plain", "Cache-Control": "no-store" } });
  }
  return new Response("Forbidden", { status: 403 });
}

export async function POST(req: Request) {
  const cfg = getMetaWebhookConfig();
  if (!cfg) return NextResponse.json({ error: "not_configured" }, { status: 503 });

  const declared = Number(req.headers.get("content-length") || "0");
  if (declared > MAX_BODY_BYTES) return new Response(null, { status: 413 });
  const raw = await req.text();
  if (raw.length > MAX_BODY_BYTES) return new Response(null, { status: 413 });

  if (!verifyMetaSignature(cfg.appSecret, raw, req.headers.get("x-hub-signature-256"))) {
    console.warn("[meta-webhook] signature_rejected");
    return new Response(null, { status: 401 });
  }

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return new Response(null, { status: 400 });
  }

  // Only messages addressed to OUR phone number id are processed. Without a configured id nothing is processed
  // (fail closed): a webhook shared with other numbers must never be answered from this app.
  const ownId = metaPhoneNumberId();
  if (!ownId) {
    console.warn("[meta-webhook] phone_number_id_not_configured");
    return new Response("OK", { status: 200, headers: { "Cache-Control": "no-store" } });
  }
  const messages = parseMetaWebhook(body, ownId).filter((m) => firstSighting(m.id));

  if (messages.length) {
    after(async () => {
      const deps = defaultPipelineDeps();
      for (const m of messages) {
        try {
          await processMetaInbound(m, deps);
        } catch (err) {
          console.error("[meta-webhook] processing_failed", err instanceof Error ? err.name : "unknown");
        }
      }
    });
  }
  return new Response("OK", { status: 200, headers: { "Cache-Control": "no-store" } });
}
