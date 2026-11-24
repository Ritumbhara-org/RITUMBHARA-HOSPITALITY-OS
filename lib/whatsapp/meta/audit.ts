// READ-ONLY Meta WhatsApp audit (Phase 2). SERVER-ONLY. Preview deployments only.
//
// Uses META_WA_ACCESS_TOKEN (a Preview-only Vercel variable) to READ what exists in Meta: token type/app/scopes,
// the WhatsApp Business Account, its phone numbers (ID, status, display-name status, quality), templates and the
// apps subscribed to the WABA's webhooks. Only GET requests are made; nothing in Meta is created or changed.
// The token is never returned, logged or included in errors (anything token-shaped is scrubbed).

const GRAPH = "https://graph.facebook.com";
const TIMEOUT_MS = 10000;

type Json = Record<string, any>;

function scrub(text: string, token: string): string {
  let t = String(text || "");
  if (token) t = t.split(token).join("[redacted]");
  return t.replace(/EAA[A-Za-z0-9]{20,}/g, "[redacted]").slice(0, 300);
}

async function get(path: string, params: Record<string, string>, token: string, fetchImpl: typeof fetch, version: string): Promise<{ ok: boolean; data?: Json; error?: Json }> {
  const url = new URL(`${GRAPH}/${version}/${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetchImpl(url.toString(), { method: "GET", headers: { Authorization: "Bearer " + token }, signal: controller.signal, cache: "no-store" });
    let body: Json = {};
    try { body = await res.json(); } catch { body = {}; }
    if (res.ok && !body.error) return { ok: true, data: body };
    const e = body.error || {};
    return { ok: false, error: { status: res.status, code: e.code, subcode: e.error_subcode, type: e.type, message: scrub(e.message || "", token) } };
  } catch (err) {
    return { ok: false, error: { reason: err instanceof Error && err.name === "AbortError" ? "timeout" : "network" } };
  } finally {
    clearTimeout(timer);
  }
}

export interface AuditInput {
  token: string;
  wabaId: string;
  testNumber?: string; // e.g. "+17116946197"
  graphApiVersion?: string;
  fetchImpl?: typeof fetch;
}

export async function runMetaAudit(input: AuditInput): Promise<Json> {
  const token = (input.token || "").trim();
  const version = /^v\d+\.\d+$/.test(input.graphApiVersion || "") ? (input.graphApiVersion as string) : "v23.0";
  const f = input.fetchImpl || fetch;
  const report: Json = { readOnly: true, graphApiVersion: version, wabaId: input.wabaId };
  if (!token) return { ...report, blocker: "META_WA_ACCESS_TOKEN is not set on this Preview deployment" };
  if (!/^\d{5,25}$/.test(input.wabaId)) return { ...report, blocker: "waba id is not numeric" };

  // 1. The token itself (no value): validity, type, app, expiry, scopes and which assets they cover.
  const dbg = await get("debug_token", { input_token: token }, token, f, version);
  if (dbg.ok) {
    const d = dbg.data?.data || {};
    report.token = {
      isValid: d.is_valid === true,
      type: d.type || null, // USER | SYSTEM_USER | PAGE | APP
      appId: d.app_id || null,
      application: d.application || null,
      expiresAt: d.expires_at ? (d.expires_at === 0 ? "never" : new Date(d.expires_at * 1000).toISOString()) : "never",
      scopes: Array.isArray(d.scopes) ? d.scopes : [],
      granularScopes: Array.isArray(d.granular_scopes) ? d.granular_scopes.map((g: Json) => ({ scope: g.scope, targetIds: g.target_ids || "all" })) : [],
    };
  } else report.token = { error: dbg.error };

  const required = ["whatsapp_business_messaging", "whatsapp_business_management"];
  const scopes: string[] = report.token?.scopes || [];
  report.requiredPermissions = Object.fromEntries(required.map((s) => [s, scopes.includes(s)]));

  // 2. App (from the token).
  if (report.token?.appId) {
    const app = await get(String(report.token.appId), { fields: "id,name,link,category" }, token, f, version);
    report.app = app.ok ? app.data : { id: report.token.appId, error: app.error };
  }

  // 3. WhatsApp Business Account.
  const waba = await get(input.wabaId, {
    fields: "id,name,currency,timezone_id,message_template_namespace,account_review_status,business_verification_status,ownership_type,owner_business_info",
  }, token, f, version);
  report.waba = waba.ok ? waba.data : { error: waba.error };

  // 4. Phone numbers on the WABA.
  const phones = await get(`${input.wabaId}/phone_numbers`, {
    fields: "id,display_phone_number,verified_name,code_verification_status,name_status,new_name_status,quality_rating,status,platform_type,account_mode,messaging_limit_tier,is_official_business_account,throughput",
    limit: "50",
  }, token, f, version);
  report.phoneNumbers = phones.ok ? phones.data?.data || [] : { error: phones.error };
  if (Array.isArray(report.phoneNumbers) && input.testNumber) {
    const want = input.testNumber.replace(/\D/g, "");
    const match = report.phoneNumbers.find((p: Json) => String(p.display_phone_number || "").replace(/\D/g, "") === want);
    report.testNumber = match
      ? { found: true, phoneNumberId: match.id, status: match.status, codeVerificationStatus: match.code_verification_status, nameStatus: match.name_status, qualityRating: match.quality_rating, platformType: match.platform_type, accountMode: match.account_mode }
      : { found: false, number: input.testNumber };
  }

  // 5. Templates.
  const tpl = await get(`${input.wabaId}/message_templates`, { fields: "name,status,category,language", limit: "100" }, token, f, version);
  report.templates = tpl.ok ? { count: (tpl.data?.data || []).length, items: tpl.data?.data || [] } : { error: tpl.error };

  // 6. Apps subscribed to this WABA's webhooks (the callback URL itself needs the app secret, so it is not read).
  const subs = await get(`${input.wabaId}/subscribed_apps`, {}, token, f, version);
  report.webhookSubscribedApps = subs.ok
    ? (subs.data?.data || []).map((s: Json) => ({ appId: s.whatsapp_business_api_data?.id || s.id || null, name: s.whatsapp_business_api_data?.name || s.name || null, overrideCallbackUri: s.override_callback_uri ? "set" : "not set" }))
    : { error: subs.error };

  return report;
}
