import type { MetaSendConfig } from "./config";
import type { MetaTemplateRef } from "./templates";

// Outbound messages through the Meta WhatsApp Cloud API (Graph API /<phone-number-id>/messages). SERVER-ONLY.
// Never throws and never logs the token. On failure Meta's error (code, subcode, type and message) is returned with
// the message sanitized: no token, and long digit runs such as phone numbers masked to their last 4 digits.

export const META_SEND_TIMEOUT_MS = 10000;

export type MetaSendResult =
  | { ok: true; id: string }
  | { ok: false; reason: string; status?: number; code?: number; subcode?: number; type?: string; message?: string };

// Meta's error text, made safe to log: the access token (and anything token-shaped) is removed, and long digit runs
// (phone numbers, ids) are masked to their last 4 digits. Capped at 300 characters.
export function sanitizeMetaErrorText(text: unknown, accessToken: string): string {
  let t = typeof text === "string" ? text : "";
  if (accessToken) t = t.split(accessToken).join("[redacted]");
  t = t.replace(/\bBearer\s+\S+/gi, "Bearer [redacted]").replace(/EAA[A-Za-z0-9]{10,}/g, "[redacted]");
  t = t.replace(/\+?\d{7,}/g, (m) => "…" + m.slice(-4));
  return t.slice(0, 300);
}

export interface MetaSendOptions {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

const E164 = /^\+?[1-9]\d{7,14}$/;

async function post(cfg: MetaSendConfig, payload: Record<string, unknown>, opts?: MetaSendOptions): Promise<MetaSendResult> {
  const doFetch = opts?.fetchImpl || fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts?.timeoutMs || META_SEND_TIMEOUT_MS);
  let res: Response;
  try {
    res = await doFetch(`https://graph.facebook.com/${cfg.graphApiVersion}/${cfg.phoneNumberId}/messages`, {
      method: "POST",
      headers: { Authorization: "Bearer " + cfg.accessToken, "Content-Type": "application/json" },
      body: JSON.stringify(Object.assign({ messaging_product: "whatsapp", recipient_type: "individual" }, payload)),
      signal: controller.signal,
      cache: "no-store",
    });
  } catch (err) {
    return { ok: false, reason: err instanceof Error && err.name === "AbortError" ? "timeout" : "network" };
  } finally {
    clearTimeout(timer);
  }
  let data: any = null;
  try { data = await res.json(); } catch { data = null; }
  const id = data && Array.isArray(data.messages) && typeof data.messages[0]?.id === "string" ? data.messages[0].id : "";
  if (res.status >= 200 && res.status < 300 && id) return { ok: true, id };
  const code = typeof data?.error?.code === "number" ? data.error.code : undefined;
  const out: MetaSendResult = { ok: false, reason: res.ok ? "bad_response" : "http_" + res.status, status: res.status };
  if (code !== undefined) out.code = code;
  if (!out.ok && data?.error) {
    if (typeof data.error.error_subcode === "number") out.subcode = data.error.error_subcode;
    if (typeof data.error.type === "string") out.type = data.error.type.slice(0, 60);
    const message = sanitizeMetaErrorText(data.error.message, cfg.accessToken);
    if (message) out.message = message;
  }
  return out;
}

function digits(to: string): string | null {
  const clean = (to || "").replace(/[^\d+]/g, "");
  return E164.test(clean) ? clean.replace(/^\+/, "") : null;
}

// Free-form text. WhatsApp only delivers it within 24 h of the recipient's last message to this number.
export async function sendMetaText(cfg: MetaSendConfig, to: string, body: string, opts?: MetaSendOptions): Promise<MetaSendResult> {
  const recipient = digits(to);
  const text = (body || "").slice(0, 4096);
  if (!recipient || !text.trim()) return { ok: false, reason: "invalid_input" };
  return post(cfg, { to: recipient, type: "text", text: { preview_url: false, body: text } }, opts);
}

// Approved template with positional body parameters. Authentication (OTP) templates also need the code on the
// copy-code button (button index 0), which Meta requires.
export async function sendMetaTemplate(cfg: MetaSendConfig, to: string, tpl: MetaTemplateRef, params: string[], opts?: MetaSendOptions): Promise<MetaSendResult> {
  const recipient = digits(to);
  if (!recipient) return { ok: false, reason: "invalid_input" };
  const components: Record<string, unknown>[] = [];
  if (params.length) components.push({ type: "body", parameters: params.map((p) => ({ type: "text", text: p.slice(0, 1024) })) });
  if (tpl.kind === "authentication" && params[0]) {
    components.push({ type: "button", sub_type: "url", index: "0", parameters: [{ type: "text", text: params[0].slice(0, 15) }] });
  }
  const template: Record<string, unknown> = { name: tpl.name, language: { code: tpl.language } };
  if (components.length) template.components = components;
  return post(cfg, { to: recipient, type: "template", template }, opts);
}
