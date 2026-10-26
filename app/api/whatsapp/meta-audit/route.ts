import { createHash, timingSafeEqual } from "node:crypto";
import { runMetaAudit } from "@/lib/whatsapp/meta/audit";

// READ-ONLY Meta audit endpoint (Phase 2). Exists ONLY on Preview deployments:
//   - 404 unless VERCEL_ENV=preview AND META_AUDIT_KEY (Preview-only, >= 32 chars) is set AND ?key= matches it.
//   - Makes GET requests to Meta only; returns non-secret metadata; never returns or logs META_WA_ACCESS_TOKEN.
// Production always gets 404. Safe to delete once Phase 2 is done.

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const notFound = () => new Response("Not Found", { status: 404, headers: { "Cache-Control": "no-store" } });

function sameKey(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}

export async function GET(req: Request) {
  if ((process.env.VERCEL_ENV || "") !== "preview") return notFound();
  const expected = (process.env.META_AUDIT_KEY || "").trim();
  const given = (new URL(req.url).searchParams.get("key") || "").trim();
  if (expected.length < 32 || !given || !sameKey(given, expected)) return notFound();

  const p = new URL(req.url).searchParams;
  const report = await runMetaAudit({
    token: process.env.META_WA_ACCESS_TOKEN || "",
    wabaId: (p.get("waba") || process.env.META_WA_WABA_ID || "").trim(),
    testNumber: (p.get("number") || "").trim() || undefined,
    graphApiVersion: process.env.META_GRAPH_API_VERSION,
  });
  return new Response(JSON.stringify(report, null, 2), { status: 200, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
}
