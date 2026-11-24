// Preview database isolation. SERVER-ONLY.
//
// Production and Preview share DATABASE_URL in Vercel, so a Preview deployment would read and write the PRODUCTION
// database. In a Preview (VERCEL_ENV=preview) this code refuses to do that: it uses META_TEST_DATABASE_URL (a
// Preview-only Vercel variable pointing at the separate Supabase TEST project) and FAILS CLOSED when it is missing
// or identical to DATABASE_URL. Production (VERCEL_ENV=production) and local development are unchanged.
// Never logs the URL; only a short project fingerprint so the right database can be confirmed in the logs.

type Env = Record<string, string | undefined>;

export class PreviewDatabaseIsolationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PreviewDatabaseIsolationError";
  }
}

// "postgresql://postgres.<ref>:…@aws-…pooler.supabase.com:6543/postgres" or "…@db.<ref>.supabase.co:5432/…"
// -> "…" + last 4 characters of the Supabase project ref (not a secret; it appears in the dashboard URL).
export function databaseFingerprint(url: string): string {
  try {
    const u = new URL(url);
    const fromUser = /^postgres\.([a-z0-9]{8,40})$/i.exec(decodeURIComponent(u.username))?.[1];
    const fromHost = /^db\.([a-z0-9]{8,40})\.supabase\.co$/i.exec(u.hostname)?.[1];
    const ref = fromUser || fromHost;
    return ref ? "supabase-project-…" + ref.slice(-4) : "host-…" + u.hostname.slice(-12);
  } catch {
    return "unparseable";
  }
}

// The URL Prisma must use, or undefined to keep the schema default (env("DATABASE_URL")).
export function resolveDatabaseUrl(env: Env = process.env): string | undefined {
  if ((env.VERCEL_ENV || "").trim() !== "preview") return undefined;
  const test = (env.META_TEST_DATABASE_URL || "").trim();
  if (!test) {
    throw new PreviewDatabaseIsolationError(
      "Preview deployment refused to start: META_TEST_DATABASE_URL is not set, and the shared DATABASE_URL is the production database."
    );
  }
  if (!/^postgres(ql)?:\/\//i.test(test)) {
    throw new PreviewDatabaseIsolationError("Preview deployment refused to start: META_TEST_DATABASE_URL is not a PostgreSQL URL.");
  }
  if (test === (env.DATABASE_URL || "").trim() || test === (env.DIRECT_URL || "").trim()) {
    throw new PreviewDatabaseIsolationError("Preview deployment refused to start: META_TEST_DATABASE_URL points at the same database as DATABASE_URL.");
  }
  return withPgBouncer(test);
}

// The Supabase pooler (PgBouncer, transaction mode) does not support Prisma's prepared statements: without
// pgbouncer=true queries fail with 42P05 'prepared statement "s0" already exists'. Adds pgbouncer=true to the
// Preview TEST URL unless a pgbouncer setting is already present. Preview only; never changes any other parameter.
export function withPgBouncer(url: string): string {
  if (/[?&]pgbouncer=/i.test(url)) return url;
  return url + (url.includes("?") ? "&" : "?") + "pgbouncer=true";
}
