// Preview Twilio guard. SERVER-ONLY.
//
// The Twilio credentials in Vercel are shared by Production AND Preview, so without this a Preview deployment could
// send real WhatsApp messages from the production number. This guard blocks every Twilio send on a Preview
// deployment, fail closed: Twilio is allowed ONLY when the deployment is Production, or when the code is not running
// on Vercel at all (local scripts / `next dev`, unchanged). Any other Vercel environment, including "preview" and
// unknown values, is blocked. Production behaviour is unchanged: the guard returns false there and the existing
// Twilio code runs exactly as before. The Meta path is not affected (it hands off before this guard is reached).

type Env = Record<string, string | undefined>;

export const TWILIO_BLOCKED_STATUS = "BLOCKED_PREVIEW";

function val(env: Env, name: string): string {
  return (env[name] || "").trim().toLowerCase();
}

// True when Twilio must NOT send from this deployment.
export function isTwilioSendBlocked(env: Env = process.env): boolean {
  const vercelEnv = val(env, "VERCEL_ENV");
  const targetEnv = val(env, "VERCEL_TARGET_ENV");
  if (vercelEnv === "preview" || targetEnv === "preview") return true; // Preview: always blocked
  if (!vercelEnv && !targetEnv) {
    // Not identified as a Vercel deployment: local scripts / `next dev` keep their existing behaviour…
    // …unless Vercel says this IS a Vercel deployment (VERCEL=1) without an environment name: fail closed.
    return val(env, "VERCEL") === "1";
  }
  // Only Production and Vercel's local development mode are allowed; anything unexpected is blocked.
  const allowed = (v: string) => !v || v === "production" || v === "development";
  return !(allowed(vercelEnv) && allowed(targetEnv));
}

export const TWILIO_BLOCKED_MESSAGE = "Twilio sending is disabled on Preview deployments (Preview Twilio guard); the message was not sent.";
