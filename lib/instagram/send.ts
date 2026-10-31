import type { InstagramSendConfig } from "./config";

// Instagram Graph API calls: send a DM and look up a guest's name. SERVER-ONLY.
// Never throws, never logs the token or Meta's error text.

export const IG_TIMEOUT_MS = 10000;
/** Instagram rejects text messages over 1000 characters. */
export const IG_TEXT_LIMIT = 1000;

export type InstagramSendResult = { ok: true; id: string } | { ok: false; reason: string; status?: number; code?: number };

export interface InstagramCallOptions {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

async function call(url: string, init: RequestInit, opts?: InstagramCallOptions): Promise<{ res: Response; data: any } | { error: string }> {
  const doFetch = opts?.fetchImpl || fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts?.timeoutMs || IG_TIMEOUT_MS);
  try {
    const res = await doFetch(url, { ...init, signal: controller.signal, cache: "no-store" });
    let data: any = null;
    try { data = await res.json(); } catch { data = null; }
    return { res, data };
  } catch (err) {
    return { error: err instanceof Error && err.name === "AbortError" ? "timeout" : "network" };
  } finally {
    clearTimeout(timer);
  }
}

/** Sends a text DM to a guest (by IGSID). Outside 24 h it is only delivered with the HUMAN_AGENT tag (useTag). */
export async function sendInstagramText(
  cfg: InstagramSendConfig,
  recipientId: string,
  body: string,
  useTag = false,
  opts?: InstagramCallOptions
): Promise<InstagramSendResult> {
  const text = (body || "").trim();
  if (!/^\d{5,30}$/.test(recipientId || "") || !text) return { ok: false, reason: "invalid_input" };
  if (text.length > IG_TEXT_LIMIT) return { ok: false, reason: "too_long" };
  const payload: Record<string, unknown> = { recipient: { id: recipientId }, message: { text } };
  if (useTag) Object.assign(payload, { messaging_type: "MESSAGE_TAG", tag: "HUMAN_AGENT" });

  const r = await call(
    `https://${cfg.apiHost}/${cfg.apiVersion}/me/messages`,
    {
      method: "POST",
      headers: { Authorization: "Bearer " + cfg.accessToken, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    },
    opts
  );
  if ("error" in r) return { ok: false, reason: r.error };
  const id = typeof r.data?.message_id === "string" ? r.data.message_id : "";
  if (r.res.ok && id) return { ok: true, id };
  const code = typeof r.data?.error?.code === "number" ? r.data.error.code : undefined;
  const out: InstagramSendResult = { ok: false, reason: r.res.ok ? "bad_response" : "http_" + r.res.status, status: r.res.status };
  if (code !== undefined) out.code = code;
  return out;
}

/** The guest's display name and @username, or nulls when Instagram won't say. */
export async function fetchInstagramProfile(
  cfg: InstagramSendConfig,
  igsid: string,
  opts?: InstagramCallOptions
): Promise<{ name: string | null; username: string | null }> {
  const none = { name: null, username: null };
  if (!/^\d{5,30}$/.test(igsid || "")) return none;
  const url = `https://${cfg.apiHost}/${cfg.apiVersion}/${igsid}?fields=name,username&access_token=${encodeURIComponent(cfg.accessToken)}`;
  const r = await call(url, { method: "GET" }, opts);
  if ("error" in r || !r.res.ok) return none;
  const name = typeof r.data?.name === "string" && r.data.name.trim() ? r.data.name.trim() : null;
  const username = typeof r.data?.username === "string" && r.data.username.trim() ? r.data.username.trim() : null;
  return { name, username };
}

/** Plain-language reason for a failed send, shown to the team. */
export function describeInstagramError(r: Extract<InstagramSendResult, { ok: false }>): string {
  if (r.reason === "too_long") return `Instagram messages can be at most ${IG_TEXT_LIMIT} characters.`;
  if (r.reason === "timeout" || r.reason === "network") return "Couldn't reach Instagram. Try again in a moment.";
  if (r.code === 10 || r.code === 551) return "Instagram won't deliver this: the guest's last message is too old or they can't receive messages. Reply in the Instagram app.";
  if (r.code === 190) return "The Instagram access token has expired. Generate a new one and update INSTAGRAM_ACCESS_TOKEN.";
  return "Instagram send failed. Check the Instagram settings.";
}
