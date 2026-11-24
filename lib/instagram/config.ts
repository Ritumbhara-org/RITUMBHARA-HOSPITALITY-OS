// Instagram Direct Messages (Instagram Messaging API) configuration. SERVER-ONLY.
//
// Two ways Meta lets a business read and answer its Instagram DMs; both work with the same settings:
//   1. "Instagram API with Instagram Login" (no Facebook Page needed) - INSTAGRAM_API_HOST unset (graph.instagram.com),
//      INSTAGRAM_ACCESS_TOKEN is the Instagram user access token from the app dashboard.
//   2. "Instagram API with Facebook Login" (Instagram account linked to a Facebook Page) - INSTAGRAM_API_HOST=graph.facebook.com,
//      INSTAGRAM_ACCESS_TOKEN is the Page access token.
//
// INSTAGRAM_ACCOUNT_ID is our Instagram professional account id as webhooks report it (entry.id). Messages for any other
// account are ignored. The webhook fails closed: without an app secret and a verify token every request is refused.
// Nothing here reads or changes any WhatsApp (Twilio or Meta) setting.

type Env = Record<string, string | undefined>;

export const DEFAULT_IG_API_HOST = "graph.instagram.com";
export const DEFAULT_IG_API_VERSION = "v23.0";

export interface InstagramSendConfig {
  accessToken: string;
  accountId: string;
  apiHost: string;
  apiVersion: string;
  /** Allow replies 24 h - 7 days after the guest's last message with the HUMAN_AGENT tag (needs Meta's approval). */
  humanAgent: boolean;
}

export interface InstagramWebhookConfig {
  appSecret: string;
  verifyToken: string;
}

function read(env: Env, name: string): string {
  const v = env[name];
  return typeof v === "string" ? v.trim() : "";
}

/** Our Instagram account id (digits), or "" when not configured. */
export function instagramAccountId(env: Env = process.env): string {
  const id = read(env, "INSTAGRAM_ACCOUNT_ID");
  return /^\d{5,25}$/.test(id) ? id : "";
}

/** Outbound settings, or the names (never values) of what is missing. */
export function getInstagramSendConfig(env: Env = process.env): { ok: true; config: InstagramSendConfig } | { ok: false; missing: string[] } {
  const accessToken = read(env, "INSTAGRAM_ACCESS_TOKEN");
  const accountId = instagramAccountId(env);
  const missing: string[] = [];
  if (!accessToken) missing.push("INSTAGRAM_ACCESS_TOKEN");
  if (!accountId) missing.push("INSTAGRAM_ACCOUNT_ID");
  if (missing.length) return { ok: false, missing };
  const host = read(env, "INSTAGRAM_API_HOST").replace(/^https?:\/\//, "").replace(/\/+$/, "");
  const version = read(env, "INSTAGRAM_API_VERSION") || read(env, "META_GRAPH_API_VERSION");
  return {
    ok: true,
    config: {
      accessToken,
      accountId,
      apiHost: host === "graph.facebook.com" || host === "graph.instagram.com" ? host : DEFAULT_IG_API_HOST,
      apiVersion: /^v\d+\.\d+$/.test(version) ? version : DEFAULT_IG_API_VERSION,
      humanAgent: ["1", "true", "yes"].includes(read(env, "INSTAGRAM_HUMAN_AGENT").toLowerCase()),
    },
  };
}

export function instagramSendingConfigured(env: Env = process.env): boolean {
  return getInstagramSendConfig(env).ok;
}

/**
 * Webhook settings. Instagram-Login apps sign webhooks with the Instagram app secret, so INSTAGRAM_APP_SECRET wins;
 * a Facebook-Login setup can reuse the Meta app's META_APP_SECRET / META_WEBHOOK_VERIFY_TOKEN.
 */
export function getInstagramWebhookConfig(env: Env = process.env): InstagramWebhookConfig | null {
  const appSecret = read(env, "INSTAGRAM_APP_SECRET") || read(env, "META_APP_SECRET");
  const verifyToken = read(env, "INSTAGRAM_WEBHOOK_VERIFY_TOKEN") || read(env, "META_WEBHOOK_VERIFY_TOKEN");
  if (appSecret.length < 16 || verifyToken.length < 16) return null;
  return { appSecret, verifyToken };
}
