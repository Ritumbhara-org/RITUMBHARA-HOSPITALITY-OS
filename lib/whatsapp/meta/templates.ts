// OS template name -> Meta template (name + language + kind). SERVER-ONLY.
//
// Twilio identifies templates by Content SID (HX…); Meta by template NAME + LANGUAGE. By default each OS template
// maps to a Meta template with the same name (the "_v2" aliases share one template, as they share one Twilio SID),
// in META_WA_TEMPLATE_LANGUAGE (default "en"). META_WA_TEMPLATES (JSON) overrides any entry once the real approved
// names/languages are known, e.g. {"booking_confirmation":{"name":"booking_confirmation_v3","language":"en_US"}}.
//
// Twilio variables {"1": "...", "2": "..."} become positional body parameters {{1}}, {{2}} in key order.

export type MetaTemplateKind = "standard" | "authentication";

export interface MetaTemplateRef {
  name: string;
  language: string;
  kind: MetaTemplateKind;
}

// Every template the OS can send today (lib/whatsapp/client.ts contentSidMap + long stay).
export const OS_TEMPLATE_DEFAULTS: Record<string, { name: string; kind?: MetaTemplateKind }> = {
  team_new_task: { name: "team_new_task" },
  ticket_resolved: { name: "ticket_resolved" },
  ticket_resolved_custom: { name: "ticket_resolved_custom" },
  day_of_arrival_reminder: { name: "day_of_arrival_reminder" },
  post_stay_thank_you: { name: "post_stay_thank_you" },
  ticket_assigned: { name: "ticket_assigned" },
  pre_arrival_instructions: { name: "pre_arrival_instructions" },
  checkout_instructions: { name: "checkout_instructions" },
  checkout_instructions_v2: { name: "checkout_instructions" },
  sla_breach_alert: { name: "sla_breach_alert" },
  booking_confirmation: { name: "booking_confirmation" },
  booking_confirmation_v2: { name: "booking_confirmation" },
  points_redemption_alert: { name: "points_redemption_alert" },
  long_stay_sign_link: { name: "long_stay_sign_link" },
  long_stay_otp: { name: "long_stay_otp", kind: "authentication" },
  long_stay_signed: { name: "long_stay_signed" },
};

const NAME = /^[a-z0-9_]{1,512}$/;
const LANG = /^[a-z]{2,3}(_[A-Z]{2})?$/;

type Env = Record<string, string | undefined>;

function overrides(env: Env): Record<string, Partial<MetaTemplateRef>> {
  try {
    const parsed = JSON.parse(env.META_WA_TEMPLATES || "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

// The Meta template for an OS template name, or null when the OS name is unknown/invalid.
export function metaTemplateFor(osName: string, env: Env = process.env): MetaTemplateRef | null {
  const base = OS_TEMPLATE_DEFAULTS[osName];
  const o = overrides(env)[osName] || {};
  if (!base && !o.name) return null;
  const language = (o.language || env.META_WA_TEMPLATE_LANGUAGE || "en").trim();
  const name = (o.name || base!.name).trim();
  const kind: MetaTemplateKind = o.kind === "authentication" || (!o.kind && base?.kind === "authentication") ? "authentication" : "standard";
  if (!NAME.test(name) || !LANG.test(language)) return null;
  return { name, language, kind };
}

// {"2":"b","1":"a"} -> ["a","b"]. Only numeric keys; Meta rejects empty parameters, so they become "-".
export function orderedParams(vars: Record<string, string> | undefined): string[] {
  if (!vars) return [];
  return Object.keys(vars)
    .filter((k) => /^\d{1,2}$/.test(k))
    .sort((a, b) => Number(a) - Number(b))
    .map((k) => {
      const v = String(vars[k] ?? "").replace(/[\r\n\t]+/g, " ").replace(/ {5,}/g, "    ").trim();
      return v || "-";
    });
}
