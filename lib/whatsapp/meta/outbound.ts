import { prisma } from "@/lib/prisma";
import { getMetaSendConfig, metaDisplayNumber } from "./config";
import { sendMetaTemplate, sendMetaText, type MetaSendResult } from "./send";
import { metaTemplateFor, orderedParams } from "./templates";
import { isCustomerServiceWindowOpen, WINDOW_CLOSED_MESSAGE } from "./window";

// Meta counterparts of the two existing Twilio senders, with the same inputs, outputs and message logging, so the
// rest of the OS does not notice which provider sent a message. Only reached when resolveWhatsAppProvider() says
// "meta" (a message that arrived on the Meta number, or WHATSAPP_PROVIDER=meta after an approved cutover).
// Unlike the Twilio sender there is no silent "sandbox" success: missing Meta settings are a FAILED send.

type Deps = {
  send?: { text: typeof sendMetaText; template: typeof sendMetaTemplate };
  log?: (data: Record<string, unknown>) => Promise<void>;
  windowOpen?: (phone: string) => Promise<boolean>;
};

// Status stored when Meta ACCEPTED the message. Delivered / read / failed arrive later by webhook and move it forward.
export const META_ACCEPTED_STATUS = "SENT";

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
  let providerMessageId: string | undefined;
  let returnStatus: string | undefined;
  const cfg = getMetaSendConfig();
  if (!cfg.ok) {
    console.error("[Meta WhatsApp] not configured: " + cfg.missing.join(", "));
    status = "FAILED";
  } else {
    const tpl = messageType === "template" && templateName ? metaTemplateFor(templateName) : null;
    let result: MetaSendResult;
    if (tpl) {
      // Approved templates are allowed at any time.
      result = await send.template(cfg.config, toPhone, tpl, orderedParams(templateVariables));
    } else if (await (deps.windowOpen || isCustomerServiceWindowOpen)(toPhone)) {
      result = await send.text(cfg.config, toPhone, content || `Template: ${templateName}`);
    } else {
      // Free text outside the 24-hour window can never be delivered: refuse with a clear reason.
      console.warn("[Meta WhatsApp] not sent: " + WINDOW_CLOSED_MESSAGE);
      result = { ok: false, reason: "window_closed" };
      returnStatus = "WINDOW_CLOSED";
    }
    status = result.ok ? META_ACCEPTED_STATUS : "FAILED";
    if (result.ok) providerMessageId = result.id;
    else if (!returnStatus) console.error("[Meta WhatsApp] send failed: " + describe(result));
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
      ...(providerMessageId ? { providerMessageId } : {}),
    });
  } catch (dbError) {
    console.error("[Meta WhatsApp DB Logging Error]", dbError);
  }
  return { success: status !== "FAILED", status: returnStatus || status };
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
  let providerMessageId: string | undefined;
  const cfg = getMetaSendConfig();
  if (!cfg.ok) {
    error = "WhatsApp (Meta) isn't set up on this deployment.";
  } else {
    let r: MetaSendResult = tpl ? await send.template(cfg.config, msg.to, tpl, orderedParams(msg.variables)) : { ok: false, reason: "no_template" };
    if (!r.ok && msg.body) {
      // The plain-text fallback is only deliverable inside the 24-hour window.
      if (await (deps.windowOpen || isCustomerServiceWindowOpen)(msg.to)) {
        console.warn("[Long Stay WhatsApp Notice] Meta template send failed (" + describe(r) + "), falling back to plain text.");
        r = await send.text(cfg.config, msg.to, msg.body);
      } else {
        console.warn("[Long Stay WhatsApp Notice] Meta template send failed (" + describe(r) + "); no text fallback: " + WINDOW_CLOSED_MESSAGE);
      }
    }
    if (r.ok) {
      status = META_ACCEPTED_STATUS;
      providerMessageId = r.id;
    } else error = "WhatsApp message could not be sent: " + describe(r);
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
      ...(providerMessageId ? { providerMessageId } : {}),
    });
  } catch (dbErr) {
    console.error("[Long Stay WhatsApp log]", dbErr);
  }
  return status === "FAILED" ? { ok: false, error } : { ok: true };
}
