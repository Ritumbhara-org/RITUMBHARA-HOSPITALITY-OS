// Preview deployments must never use the production database (DATABASE_URL is shared by Production and Preview).
// Run with: node --import tsx --experimental-test-module-mocks --test "tests/**/*.test.ts"
import { test, before } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL } from "node:url";

const root = path.resolve(__dirname, "..");
const mod = (p: string) => pathToFileURL(path.join(root, p)).href;

let resolveDatabaseUrl: any, databaseFingerprint: any, PreviewDatabaseIsolationError: any;
before(async () => {
  ({ resolveDatabaseUrl, databaseFingerprint, PreviewDatabaseIsolationError } = await import(mod("lib/db/preview-isolation.ts")));
});

const PROD = "postgresql://postgres.prodref1234abcd:pw@aws-0-ap-south-1.pooler.supabase.com:6543/postgres";
const TEST = "postgresql://postgres.testrefzz99wxyz:pw@aws-0-ap-south-1.pooler.supabase.com:6543/postgres";

test("production and local: unchanged (schema default DATABASE_URL), even if a test URL exists", () => {
  assert.equal(resolveDatabaseUrl({ VERCEL_ENV: "production", DATABASE_URL: PROD, META_TEST_DATABASE_URL: TEST }), undefined);
  assert.equal(resolveDatabaseUrl({ DATABASE_URL: PROD }), undefined);
  assert.equal(resolveDatabaseUrl({ VERCEL_ENV: "development", DATABASE_URL: PROD }), undefined);
});

test("preview: uses the separate test database", () => {
  assert.equal(resolveDatabaseUrl({ VERCEL_ENV: "preview", DATABASE_URL: PROD, META_TEST_DATABASE_URL: TEST }), TEST);
});

test("preview: fails closed when the test URL is missing, not PostgreSQL, or the same as production", () => {
  assert.throws(() => resolveDatabaseUrl({ VERCEL_ENV: "preview", DATABASE_URL: PROD }), PreviewDatabaseIsolationError);
  assert.throws(() => resolveDatabaseUrl({ VERCEL_ENV: "preview", DATABASE_URL: PROD, META_TEST_DATABASE_URL: "  " }), PreviewDatabaseIsolationError);
  assert.throws(() => resolveDatabaseUrl({ VERCEL_ENV: "preview", DATABASE_URL: PROD, META_TEST_DATABASE_URL: "https://x" }), PreviewDatabaseIsolationError);
  assert.throws(() => resolveDatabaseUrl({ VERCEL_ENV: "preview", DATABASE_URL: PROD, META_TEST_DATABASE_URL: PROD }), PreviewDatabaseIsolationError);
  assert.throws(() => resolveDatabaseUrl({ VERCEL_ENV: "preview", DIRECT_URL: TEST, META_TEST_DATABASE_URL: TEST }), PreviewDatabaseIsolationError);
});

test("errors never contain the URL; fingerprint shows only the last 4 characters of the project ref", () => {
  try { resolveDatabaseUrl({ VERCEL_ENV: "preview", DATABASE_URL: PROD, META_TEST_DATABASE_URL: PROD }); } catch (e) {
    assert.ok(!String((e as Error).message).includes("prodref"));
    assert.ok(!String((e as Error).message).includes("pw@"));
  }
  assert.equal(databaseFingerprint(TEST), "supabase-project-…wxyz");
  assert.equal(databaseFingerprint("postgresql://postgres:pw@db.abcdefghij123456.supabase.co:5432/postgres"), "supabase-project-…3456");
  assert.equal(databaseFingerprint("not a url"), "unparseable");
});
