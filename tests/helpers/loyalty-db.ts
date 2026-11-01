/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-require-imports */
// Real-database helper for the loyalty integration tests (tests/loyalty-db.test.ts).
//
// Point LOYALTY_TEST_DATABASE_URL at a scratch PostgreSQL database that has the OS schema plus
// prisma/sql/2026-11-01_membership_loyalty.sql applied. The tests TRUNCATE tables, so never use a real database.
// Without the variable the integration tests are skipped.
//
// LOYALTY_TEST_PRISMA_WASM=1 uses Prisma's WASM engine through @prisma/adapter-pg instead of the native engine
// (for machines that can't download Prisma's native binaries; needs the driverAdapters preview client).

export const TEST_DB_URL = process.env.LOYALTY_TEST_DATABASE_URL || ""

export async function makeTestPrisma(): Promise<any> {
  if (process.env.LOYALTY_TEST_PRISMA_WASM === "1") {
    const pg = require("pg")
    const { PrismaPg } = require("@prisma/adapter-pg")
    const { PrismaClient } = require("@prisma/client/wasm")
    return new PrismaClient({ adapter: new PrismaPg(new pg.Pool({ connectionString: TEST_DB_URL, max: 10 })) })
  }
  const { PrismaClient } = require("@prisma/client")
  return new PrismaClient({ datasourceUrl: TEST_DB_URL })
}

export const LOYALTY_TABLES = [
  "LoyaltyAuditLog", "LoyaltyNotification", "LoyaltyEventReward", "Referral", "LoyaltyOtp", "Redemption", "MemberTierHistory",
  "PointAllocation", "PointTransaction", "Membership", "WhatsAppMessage", "Reservation", "Guest", "Unit", "Property",
]

export async function resetDb(prisma: any) {
  await prisma.$executeRawUnsafe(`TRUNCATE ${LOYALTY_TABLES.map((t) => `"${t}"`).join(", ")} CASCADE`)
}
