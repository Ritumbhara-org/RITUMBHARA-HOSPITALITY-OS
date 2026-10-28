import { AsyncLocalStorage } from "node:async_hooks";

// Meta WhatsApp Cloud API configuration and provider selection. SERVER-ONLY.
//
// Meta runs ALONGSIDE Twilio. Twilio stays the default everywhere:
//   - WHATSAPP_PROVIDER unset (or anything other than "meta")  -> outbound goes through Twilio, exactly as before.
//   - WHATSAPP_PROVIDER="meta"                                -> outbound goes through Meta (only after an approved cutover).
// Independently of that switch, everything triggered by a message that ARRIVED on the Meta number (replies, staff
// confirmations, events those actions emit) is sent through Meta, so a Meta conversation is never answered from the
// Twilio production number. That is done with a per-request provider context (runWithWhatsAppProvider).
// Nothing here reads, changes or depends on any Twilio setting.

export type WhatsAppProvider = "twilio" | "meta";

type Env = Record<string, string | undefined>;

const providerContext = new AsyncLocalStorage<WhatsAppProvider>();

// Runs fn with a fixed provider for every WhatsApp send made inside it (including awaited event listeners).
export function runWithWhatsAppProvider<T>(provider: WhatsAppProvider, fn: () => Promise<T>): Promise<T> {
  return providerContext.run(provider, fn);
}

// The provider for an outbound send: the request context first, then WHATSAPP_PROVIDER, then Twilio.
export function resolveWhatsAppProvider(env: Env = process.env): WhatsAppProvider {
  const fromContext = providerContext.getStore();
  if (fromContext) return fromContext;
  return (env.WHATSAPP_PROVIDER || "").trim().toLowerCase() === "meta" ? "meta" : "twilio";
}

export const DEFAULT_GRAPH_API_VERSION = "v23.0";

export interface MetaSendConfig {
  accessToken: string;
  phoneNumberId: string;
  graphApiVersion: string;
  displayNumber: string; // E.164 of the Meta number, used as "from" in the message log
}

export interface MetaWebhookConfig {
  appSecret: string;
  verifyToken: string;
}

function read(env: Env, name: string): string {
  const v = env[name];
  return typeof v === "string" ? v.trim() : "";
}

// Outbound settings, or the names (never values) of what is missing.
export function getMetaSendConfig(env: Env = process.env): { ok: true; config: MetaSendConfig } | { ok: false; missing: string[] } {
  const accessToken = read(env, "META_WA_ACCESS_TOKEN");
  const phoneNumberId = read(env, "META_WA_PHONE_NUMBER_ID");
  const missing: string[] = [];
  if (!accessToken) missing.push("META_WA_ACCESS_TOKEN");
  if (!/^\d{5,25}$/.test(phoneNumberId)) missing.push("META_WA_PHONE_NUMBER_ID");
  if (missing.length) return { ok: false, missing };
  const version = read(env, "META_GRAPH_API_VERSION");
  return {
    ok: true,
    config: {
      accessToken,
      phoneNumberId,
      graphApiVersion: /^v\d+\.\d+$/.test(version) ? version : DEFAULT_GRAPH_API_VERSION,
      displayNumber: read(env, "META_WA_DISPLAY_NUMBER") || "META",
    },
  };
}

// Webhook settings. Both are required; without them the Meta webhook refuses everything (fail closed).
export function getMetaWebhookConfig(env: Env = process.env): MetaWebhookConfig | null {
  const appSecret = read(env, "META_APP_SECRET");
  const verifyToken = read(env, "META_WEBHOOK_VERIFY_TOKEN");
  if (appSecret.length < 16 || verifyToken.length < 16) return null;
  return { appSecret, verifyToken };
}

// Our own Meta phone number id (digits), or "" when not configured. Inbound messages are only accepted for this id,
// independently of whether an access token is set.
export function metaPhoneNumberId(env: Env = process.env): string {
  const id = read(env, "META_WA_PHONE_NUMBER_ID");
  return /^\d{5,25}$/.test(id) ? id : "";
}

export function metaDisplayNumber(env: Env = process.env): string {
  return read(env, "META_WA_DISPLAY_NUMBER") || "META";
}
