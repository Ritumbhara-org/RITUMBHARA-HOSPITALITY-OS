// Outbound email for OTA relay replies and direct guest emails. Two ways to send:
//
// 1. Gmail bridge (preferred): the same Apps Script that forwards OTA emails into the inbox
//    (scripts/gmail-to-inbox.gs) also replies to them. The reply leaves from the Gmail account
//    the OTA already knows, in the same email thread, so Booking.com / Agoda / Expedia accept it.
//    Needs GMAIL_BRIDGE_URL (the script's web app URL) and INBOX_WEBHOOK_SECRET.
// 2. Resend: RESEND_API_KEY + INBOX_FROM_EMAIL. INBOX_FROM_EMAIL must be the address
//    registered on the OTA account, otherwise OTA relays usually drop the reply.

export interface EmailReply {
  to: string;
  subject: string;
  text: string;
  inReplyTo?: string | null;
}

export type EmailSendResult = { ok: true; id: string | null } | { ok: false; error: string };

export function gmailBridgeConfigured(): boolean {
  return Boolean(process.env.GMAIL_BRIDGE_URL && process.env.INBOX_WEBHOOK_SECRET);
}

export function resendConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.INBOX_FROM_EMAIL);
}

export function emailSendingConfigured(): boolean {
  return gmailBridgeConfigured() || resendConfigured();
}

/** Replies to one received email through the Gmail bridge. gmailId is Gmail's own id for that email. */
export async function sendViaGmailBridge(gmailId: string, text: string, fetchImpl: typeof fetch = fetch): Promise<EmailSendResult> {
  const url = process.env.GMAIL_BRIDGE_URL;
  const secret = process.env.INBOX_WEBHOOK_SECRET;
  if (!url || !secret) return { ok: false, error: "The Gmail bridge isn't set up for sending (GMAIL_BRIDGE_URL)." };
  try {
    // Apps Script web apps answer a POST with a redirect to the result; fetch follows it.
    const res = await fetchImpl(url, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ action: "reply", secret, gmailId, text }),
      redirect: "follow",
    });
    const data = (await res.json().catch(() => ({}))) as { ok?: boolean; id?: string; error?: string };
    if (!res.ok || !data.ok) return { ok: false, error: data.error || `Gmail bridge returned ${res.status}` };
    return { ok: true, id: data.id ?? null };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Gmail bridge send failed" };
  }
}

export async function sendEmailReply(reply: EmailReply, fetchImpl: typeof fetch = fetch): Promise<EmailSendResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.INBOX_FROM_EMAIL;
  if (!apiKey || !from) {
    return { ok: false, error: "Email replies aren't set up yet (RESEND_API_KEY and INBOX_FROM_EMAIL). Reply from the OTA extranet for now." };
  }

  const headers: Record<string, string> = {};
  if (reply.inReplyTo) {
    headers["In-Reply-To"] = `<${reply.inReplyTo}>`;
    headers["References"] = `<${reply.inReplyTo}>`;
  }

  try {
    const res = await fetchImpl("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: [reply.to], subject: reply.subject, text: reply.text, headers }),
    });
    const data = (await res.json().catch(() => ({}))) as { id?: string; message?: string };
    if (!res.ok) return { ok: false, error: data.message || `Email provider returned ${res.status}` };
    return { ok: true, id: data.id ?? null };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Email send failed" };
  }
}
