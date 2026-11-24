import { createHmac, timingSafeEqual } from "node:crypto";

// Meta webhook signature: X-Hub-Signature-256 = "sha256=" + hex(HMAC-SHA256(appSecret, rawBody)).
// The raw body must be the exact bytes Meta sent (verify BEFORE JSON.parse). Never logs secrets or signatures.

export function computeMetaSignature(appSecret: string, rawBody: string): string {
  return "sha256=" + createHmac("sha256", appSecret).update(Buffer.from(rawBody, "utf8")).digest("hex");
}

export function verifyMetaSignature(appSecret: string, rawBody: string, header: string | null | undefined): boolean {
  try {
    const sig = typeof header === "string" ? header.trim() : "";
    if (!appSecret || !/^sha256=[0-9a-f]{64}$/i.test(sig)) return false;
    const expected = Buffer.from(computeMetaSignature(appSecret, rawBody), "utf8");
    const given = Buffer.from(sig.toLowerCase(), "utf8");
    return expected.length === given.length && timingSafeEqual(expected, given);
  } catch {
    return false;
  }
}
