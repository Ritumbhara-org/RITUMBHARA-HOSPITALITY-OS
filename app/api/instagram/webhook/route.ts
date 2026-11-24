import { NextResponse, after } from "next/server";
import { getInstagramWebhookConfig, instagramAccountId } from "@/lib/instagram/config";
import { verifyMetaSignature } from "@/lib/whatsapp/meta/signature";
import { parseInstagramWebhook } from "@/lib/instagram/parse";
import { defaultInstagramIngestDeps, ingestInstagramDM } from "@/lib/instagram/ingest";

// Instagram Direct Messages webhook -> unified inbox. Fail closed: without an app secret and verify token
// (INSTAGRAM_APP_SECRET / INSTAGRAM_WEBHOOK_VERIFY_TOKEN, or the Meta ones) every request is refused.
//   GET  - Meta's subscription handshake (hub.verify_token must match, hub.challenge is echoed).
//   POST - X-Hub-Signature-256 is verified over the raw body BEFORE parsing. Meta gets 200 at once and the messages
//          are stored after the response. Only messages for INSTAGRAM_ACCOUNT_ID are kept.

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const MAX_BODY_BYTES = 256 * 1024;
const OK = () => new Response("OK", { status: 200, headers: { "Cache-Control": "no-store" } });

export async function GET(req: Request) {
  const cfg = getInstagramWebhookConfig();
  const p = new URL(req.url).searchParams;
  if (cfg && p.get("hub.mode") === "subscribe" && p.get("hub.verify_token") === cfg.verifyToken) {
    const challenge = (p.get("hub.challenge") || "").slice(0, 200);
    return new Response(challenge, { status: 200, headers: { "Content-Type": "text/plain", "Cache-Control": "no-store" } });
  }
  return new Response("Forbidden", { status: 403 });
}

export async function POST(req: Request) {
  const cfg = getInstagramWebhookConfig();
  if (!cfg) return NextResponse.json({ error: "not_configured" }, { status: 503 });

  const declared = Number(req.headers.get("content-length") || "0");
  if (declared > MAX_BODY_BYTES) return new Response(null, { status: 413 });
  const raw = await req.text();
  if (raw.length > MAX_BODY_BYTES) return new Response(null, { status: 413 });

  if (!verifyMetaSignature(cfg.appSecret, raw, req.headers.get("x-hub-signature-256"))) {
    console.warn("[instagram-webhook] signature_rejected");
    return new Response(null, { status: 401 });
  }

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return new Response(null, { status: 400 });
  }

  const ownId = instagramAccountId();
  if (!ownId) {
    console.warn("[instagram-webhook] INSTAGRAM_ACCOUNT_ID not configured; message ignored");
    return OK();
  }

  const messages = parseInstagramWebhook(body, ownId);
  if (!messages.length) {
    // Helps setup: shows which account id Meta is sending for when it doesn't match INSTAGRAM_ACCOUNT_ID.
    const ids = Array.isArray((body as any)?.entry) ? (body as any).entry.map((e: any) => String(e?.id ?? "")).filter(Boolean) : [];
    if (ids.length && !ids.includes(ownId)) console.warn("[instagram-webhook] delivery for other account id(s):", ids.slice(0, 3).join(","));
    return OK();
  }

  after(async () => {
    const deps = defaultInstagramIngestDeps();
    for (const m of messages) {
      try {
        await ingestInstagramDM(m, deps);
      } catch (err) {
        console.error("[instagram-webhook] store_failed", err instanceof Error ? err.name : "unknown");
      }
    }
  });
  return OK();
}
