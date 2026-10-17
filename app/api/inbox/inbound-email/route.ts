import { NextResponse } from "next/server";
import { parseInboundEmail } from "@/lib/inbox/email-parser";
import { ingestInboundEmail } from "@/lib/inbox/ingest";

export const dynamic = "force-dynamic";

// Receives forwarded OTA notification emails (Airbnb, Booking.com, Agoda, Expedia) and
// direct guest emails from an inbound-email service (Postmark, SendGrid Inbound Parse,
// Cloudflare Email Worker, ...) and files them in the unified inbox.
//
// Protect it with INBOX_WEBHOOK_SECRET, sent as the `x-inbox-secret` header or `?token=`.

function authorized(request: Request): boolean {
  const secret = process.env.INBOX_WEBHOOK_SECRET;
  if (!secret) return false;
  const url = new URL(request.url);
  return request.headers.get("x-inbox-secret") === secret || url.searchParams.get("token") === secret;
}

async function readPayload(request: Request): Promise<Record<string, unknown>> {
  const type = request.headers.get("content-type") || "";
  if (type.includes("application/json")) return (await request.json()) as Record<string, unknown>;
  if (type.includes("multipart/form-data") || type.includes("application/x-www-form-urlencoded")) {
    const form = await request.formData();
    const out: Record<string, unknown> = {};
    for (const [k, v] of form.entries()) if (typeof v === "string") out[k] = v;
    return out;
  }
  throw new Error(`Unsupported content type: ${type || "none"}`);
}

export async function POST(request: Request) {
  if (!process.env.INBOX_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "INBOX_WEBHOOK_SECRET is not set" }, { status: 503 });
  }
  if (!authorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let payload: Record<string, unknown>;
  try {
    payload = await readPayload(request);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Bad payload" }, { status: 400 });
  }

  const parsed = parseInboundEmail(payload);
  if (!parsed.body && !parsed.subject) {
    return NextResponse.json({ error: "Empty email" }, { status: 400 });
  }

  try {
    const result = await ingestInboundEmail(parsed, payload);
    return NextResponse.json({ ok: true, channel: parsed.channel, ...result });
  } catch (err) {
    console.error("[Inbox inbound-email]", err);
    return NextResponse.json({ error: "Could not store the message" }, { status: 500 });
  }
}
