import { prisma } from "@/lib/prisma";
import { getMetaSendConfig, metaDisplayNumber } from "./config";
import { sendMetaTemplate, sendMetaText, type MetaSendResult } from "./send";
import { metaTemplateFor, orderedParams } from "./templates";

// Meta counterparts of the two existing Twilio senders, with the same inputs, outputs and message logging, so the
// rest of the OS does not notice which provider sent a message. Only reached when resolveWhatsAppProvider() says
// "meta" (a message that arrived on the Meta number, or WHATSAPP_PROVIDER=meta after an approved cutover).
// Unlike the Twilio sender there is no silent "sandbox" success: missing Meta settings are a FAILED send.

type Deps = {
  send?: { text: typeof sendMetaText; template: typeof sendMetaTemplate };
  log?: (data: Record<string, unknown>) => Promise<void>;
};

async function defaultLog(data: Record<string, unknown>) {
  await prisma.whatsAppMessage.create({ data: data as never });
}

function describe(r: MetaSendResult): string {
  if (r.ok) return "ok";
  const parts: string[] = [];
  if (r.code !== undefined) parts.push("meta " + r.code);
  if (r.subcode !== undefined) parts.push("subcode " + r.subcode);
  if (r.type) parts.push(r.type);
  const detail = parts.length ? " (" + parts.join(", ") + ")" : "";
  return r.reason + detail + (r.message ? ": " + r.message : "");
}

// Same signature and return shape as sendWhatsAppMessage in lib/whatsapp/client.ts.
export async function sendWhatsAppMessageViaMeta(
  toPhone: string,
  messageType: "template" | "text",
  content: string,
  templateName?: string,
  relatedEntityType?: string,
  relatedEntityId?: string,
  templateVariables?: Record<string, string>,
  deps: Deps = {}
): Promise<{ success: boolean; status: string }> {
  const send = deps.send || { text: sendMetaText, template: sendMetaTemplate };
  let status = "PENDING";
  const cfg = getMetaSendConfig();
  if (!cfg.ok) {
    console.error("[Meta WhatsApp] not configured: " + cfg.missing.join(", "));
    status = "FAILED";
  } else {
    const tpl = messageType === "template" && templateName ? metaTemplateFor(templateName) : null;
    const result = tpl
      ? await send.template(cfg.config, toPhone, tpl, orderedParams(templateVariables))
      : await send.text(cfg.config, toPhone, content || `Template: ${templateName}`);
    status = result.ok ? "DELIVERED" : "FAILED";
    if (!result.ok) console.error("[Meta WhatsApp] send failed: " + describe(result));
  }
  try {
    await (deps.log || defaultLog)({
      direction: "OUTBOUND",
      from: cfg.ok ? cfg.config.displayNumber : metaDisplayNumber(),
      to: toPhone,
      messageType,
      content,
      templateName,
      status,
      relatedEntityType,
      relatedEntityId,
    });
  } catch (dbError) {
    console.error("[Meta WhatsApp DB Logging Error]", dbError);
  }
  return { success: status !== "FAILED", status };
}

export interface LongStaySend {
  to: string;
  kind: "SIGN_LINK" | "OTP" | "SIGNED";
  body: string;
  variables: Record<string, string>;
  bookingId: string;
  logBody?: string;
}

// Same contract as sendLongStayWhatsApp in lib/long-stay/server.ts: template first, plain-text fallback.
export async function sendLongStayWhatsAppViaMeta(msg: LongStaySend, deps: Deps = {}): Promise<{ ok: boolean; error?: string }> {
  const send = deps.send || { text: sendMetaText, template: sendMetaTemplate };
  const tplName = "long_stay_" + msg.kind.toLowerCase();
  const tpl = metaTemplateFor(tplName);
  let status = "FAILED";
  let error: string | undefined;
  const cfg = getMetaSendConfig();
  if (!cfg.ok) {
    error = "WhatsApp (Meta) isn't set up on this deployment.";
  } else {
    let r: MetaSendResult = tpl ? await send.template(cfg.config, msg.to, tpl, orderedParams(msg.variables)) : { ok: false, reason: "no_template" };
    if (!r.ok && msg.body) {
      console.warn("[Long Stay WhatsApp Notice] Meta template send failed (" + describe(r) + "), falling back to plain text.");
      r = await send.text(cfg.config, msg.to, msg.body);
    }
    if (r.ok) status = "DELIVERED";
    else error = "WhatsApp message could not be sent: " + describe(r);
  }
  if (error) console.error("[Long Stay WhatsApp]", error);
  try {
    await (deps.log || defaultLog)({
      direction: "OUTBOUND",
      from: cfg.ok ? cfg.config.displayNumber : metaDisplayNumber(),
      to: msg.to,
      messageType: tpl ? "template" : "text",
      content: msg.logBody ?? msg.body,
      templateName: tpl ? tplName : null,
      status,
      relatedEntityType: "LONG_STAY",
      relatedEntityId: msg.bookingId,
    });
  } catch (dbErr) {
    console.error("[Long Stay WhatsApp log]", dbErr);
  }
  return status === "FAILED" ? { ok: false, error } : { ok: true };
}
