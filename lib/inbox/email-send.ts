// Outbound email for OTA relay replies and direct guest emails.
// Uses Resend's HTTP API when RESEND_API_KEY is set. INBOX_FROM_EMAIL must be the
// address registered on the OTA account, otherwise OTA relays usually drop the reply.

export interface EmailReply {
  to: string;
  subject: string;
  text: string;
  inReplyTo?: string | null;
}

export type EmailSendResult = { ok: true; id: string | null } | { ok: false; error: string };

export function emailSendingConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.INBOX_FROM_EMAIL);
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
