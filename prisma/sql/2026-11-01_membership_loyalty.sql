-- Membership & Loyalty programme (Star / RockStar / Super Star). Same result as `npx prisma db push` for this change,
-- plus data backfill and the immutable-ledger trigger. Safe to run more than once (every step is IF NOT EXISTS /
-- idempotent) in the Supabase/Postgres SQL editor. Run it BEFORE deploying the code.

BEGIN;

-- ---------- Reservation: loyalty inputs ----------
ALTER TABLE "Reservation" ADD COLUMN IF NOT EXISTS "sourceDetail" TEXT;
ALTER TABLE "Reservation" ADD COLUMN IF NOT EXISTS "taxAmount" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "Reservation" ADD COLUMN IF NOT EXISTS "refundedAmount" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "Reservation" ADD COLUMN IF NOT EXISTS "paidAmount" DOUBLE PRECISION;
ALTER TABLE "Reservation" ADD COLUMN IF NOT EXISTS "paymentStatus" TEXT;

-- ---------- Membership ----------
ALTER TABLE "Membership" ALTER COLUMN "guestId" DROP NOT NULL;
ALTER TABLE "Membership" ADD COLUMN IF NOT EXISTS "phone" TEXT;
ALTER TABLE "Membership" ADD COLUMN IF NOT EXISTS "name" TEXT;
ALTER TABLE "Membership" ADD COLUMN IF NOT EXISTS "membershipNumber" TEXT;
ALTER TABLE "Membership" ADD COLUMN IF NOT EXISTS "tierOverride" TEXT;
ALTER TABLE "Membership" ADD COLUMN IF NOT EXISTS "tierOverrideUntil" TIMESTAMP(3);
ALTER TABLE "Membership" ADD COLUMN IF NOT EXISTS "qualifyingSpend" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "Membership" ADD COLUMN IF NOT EXISTS "tierEvaluatedAt" TIMESTAMP(3);
ALTER TABLE "Membership" ADD COLUMN IF NOT EXISTS "referralCode" TEXT;
ALTER TABLE "Membership" ADD COLUMN IF NOT EXISTS "referredBy" TEXT;
ALTER TABLE "Membership" ADD COLUMN IF NOT EXISTS "birthday" DATE;
ALTER TABLE "Membership" ADD COLUMN IF NOT EXISTS "anniversary" DATE;
ALTER TABLE "Membership" ALTER COLUMN "tier" SET DEFAULT 'STAR';
ALTER TABLE "Membership" ALTER COLUMN "joinedAt" SET DEFAULT CURRENT_TIMESTAMP;

-- Old tier names (SILVER, STANDARD, GOLD, PLATINUM, DIAMOND...) become Star; the first loyalty job run recomputes
-- every member's tier from their last 6 months of stays.
UPDATE "Membership" SET "tier" = 'STAR' WHERE "tier" NOT IN ('STAR', 'ROCKSTAR', 'SUPERSTAR');
UPDATE "Membership" SET "referralCode" = 'RB' || upper(substr(md5(random()::text || "id"), 1, 8)) WHERE "referralCode" IS NULL;

-- Phone + name from the linked guest. If two memberships share a phone (duplicate guest rows), only the oldest
-- keeps it; the others stay unlinked by phone and can be reviewed in the admin.
UPDATE "Membership" m SET "name" = g."name" FROM "Guest" g WHERE m."guestId" = g."id" AND m."name" IS NULL;
WITH ranked AS (
  SELECT m."id", g."phone", row_number() OVER (PARTITION BY g."phone" ORDER BY m."createdAt", m."id") AS rn
  FROM "Membership" m JOIN "Guest" g ON g."id" = m."guestId"
  WHERE m."phone" IS NULL AND g."phone" ~ '^\+[1-9][0-9]{9,14}$'
    AND regexp_replace(g."phone", '^\+91', '') !~ '^([0-9])\1+$'   -- skip PMS placeholders like +910000000000
)
UPDATE "Membership" m SET "phone" = r."phone" FROM ranked r
WHERE m."id" = r."id" AND r.rn = 1 AND NOT EXISTS (SELECT 1 FROM "Membership" x WHERE x."phone" = r."phone");

CREATE SEQUENCE IF NOT EXISTS "MembershipNumberSeq" START WITH 100001;
UPDATE "Membership" m SET "membershipNumber" = n.num
FROM (SELECT s."id", 'RBM-' || nextval('"MembershipNumberSeq"') AS num
      FROM (SELECT "id" FROM "Membership" WHERE "membershipNumber" IS NULL ORDER BY "createdAt", "id") s) n
WHERE m."id" = n."id";

CREATE UNIQUE INDEX IF NOT EXISTS "Membership_phone_key" ON "Membership"("phone");
CREATE UNIQUE INDEX IF NOT EXISTS "Membership_membershipNumber_key" ON "Membership"("membershipNumber");
CREATE UNIQUE INDEX IF NOT EXISTS "Membership_referralCode_key" ON "Membership"("referralCode");
ALTER TABLE "Membership" ALTER COLUMN "referralCode" SET NOT NULL;
CREATE INDEX IF NOT EXISTS "Membership_tier_idx" ON "Membership"("tier");
CREATE INDEX IF NOT EXISTS "Membership_points_idx" ON "Membership"("points");

-- ---------- Points ledger ----------
CREATE TABLE IF NOT EXISTS "PointTransaction" (
    "id" TEXT NOT NULL,
    "membershipId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PointTransaction_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "PointTransaction" ADD COLUMN IF NOT EXISTS "idempotencyKey" TEXT;
ALTER TABLE "PointTransaction" ADD COLUMN IF NOT EXISTS "expiresAt" TIMESTAMP(3);
ALTER TABLE "PointTransaction" ADD COLUMN IF NOT EXISTS "reservationId" TEXT;
ALTER TABLE "PointTransaction" ADD COLUMN IF NOT EXISTS "propertyId" TEXT;
ALTER TABLE "PointTransaction" ADD COLUMN IF NOT EXISTS "channel" TEXT;
ALTER TABLE "PointTransaction" ADD COLUMN IF NOT EXISTS "tier" TEXT;
ALTER TABLE "PointTransaction" ADD COLUMN IF NOT EXISTS "channelMultiplier" INTEGER;
ALTER TABLE "PointTransaction" ADD COLUMN IF NOT EXISTS "tierMultiplier" INTEGER;
ALTER TABLE "PointTransaction" ADD COLUMN IF NOT EXISTS "eligibleAmount" DOUBLE PRECISION;
ALTER TABLE "PointTransaction" ADD COLUMN IF NOT EXISTS "calculation" JSONB;
ALTER TABLE "PointTransaction" ADD COLUMN IF NOT EXISTS "relatedId" TEXT;
ALTER TABLE "PointTransaction" ADD COLUMN IF NOT EXISTS "actor" TEXT;
ALTER TABLE "PointTransaction" ADD COLUMN IF NOT EXISTS "reason" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "PointTransaction_idempotencyKey_key" ON "PointTransaction"("idempotencyKey");
DROP INDEX IF EXISTS "PointTransaction_membershipId_idx";
CREATE INDEX IF NOT EXISTS "PointTransaction_membershipId_createdAt_idx" ON "PointTransaction"("membershipId", "createdAt");
CREATE INDEX IF NOT EXISTS "PointTransaction_membershipId_expiresAt_idx" ON "PointTransaction"("membershipId", "expiresAt");
CREATE INDEX IF NOT EXISTS "PointTransaction_reservationId_idx" ON "PointTransaction"("reservationId");
CREATE INDEX IF NOT EXISTS "PointTransaction_type_idx" ON "PointTransaction"("type");

-- Points members already hold get a fresh 6-month validity from go-live, so nobody's balance lapses the day the
-- new programme starts. (New points are valid 6 months from when they are credited.)
UPDATE "PointTransaction" SET "expiresAt" = CURRENT_TIMESTAMP + INTERVAL '6 months' WHERE "amount" > 0 AND "expiresAt" IS NULL;

-- Memberships whose cached balance was never written to the ledger (the old guest-portal join) get an opening
-- balance credit, so moving to the ledger doesn't silently wipe points.
INSERT INTO "PointTransaction" ("id", "membershipId", "amount", "type", "description", "idempotencyKey", "expiresAt", "actor", "createdAt")
SELECT 'legacy_' || m."id", m."id", m."points" - COALESCE(s.total, 0), 'LEGACY_OPENING_BALANCE',
       'Opening balance carried over from the previous rewards programme', 'LEGACY:' || m."id",
       CURRENT_TIMESTAMP + INTERVAL '6 months', 'SYSTEM', CURRENT_TIMESTAMP
FROM "Membership" m
LEFT JOIN (SELECT "membershipId", SUM("amount") AS total FROM "PointTransaction" GROUP BY "membershipId") s ON s."membershipId" = m."id"
WHERE m."points" - COALESCE(s.total, 0) > 0
ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS "PointAllocation" (
    "id" TEXT NOT NULL,
    "debitId" TEXT NOT NULL,
    "creditId" TEXT NOT NULL,
    "points" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PointAllocation_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "PointAllocation_points_positive" CHECK ("points" > 0)
);
CREATE UNIQUE INDEX IF NOT EXISTS "PointAllocation_debitId_creditId_key" ON "PointAllocation"("debitId", "creditId");
CREATE INDEX IF NOT EXISTS "PointAllocation_creditId_idx" ON "PointAllocation"("creditId");

CREATE TABLE IF NOT EXISTS "MemberTierHistory" (
    "id" TEXT NOT NULL,
    "membershipId" TEXT NOT NULL,
    "fromTier" TEXT,
    "toTier" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "qualifyingSpend" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "actor" TEXT NOT NULL DEFAULT 'SYSTEM',
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MemberTierHistory_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "MemberTierHistory_membershipId_createdAt_idx" ON "MemberTierHistory"("membershipId", "createdAt");

CREATE TABLE IF NOT EXISTS "Redemption" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "membershipId" TEXT NOT NULL,
    "points" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING_OTP',
    "reservationId" TEXT,
    "propertyId" TEXT,
    "note" TEXT,
    "adminId" TEXT NOT NULL,
    "transactionId" TEXT,
    "failureReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    CONSTRAINT "Redemption_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "Redemption_reference_key" ON "Redemption"("reference");
CREATE UNIQUE INDEX IF NOT EXISTS "Redemption_transactionId_key" ON "Redemption"("transactionId");
CREATE INDEX IF NOT EXISTS "Redemption_membershipId_createdAt_idx" ON "Redemption"("membershipId", "createdAt");
CREATE INDEX IF NOT EXISTS "Redemption_status_idx" ON "Redemption"("status");

CREATE TABLE IF NOT EXISTS "LoyaltyOtp" (
    "id" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "redemptionId" TEXT,
    "codeHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "consumedAt" TIMESTAMP(3),
    "lockedAt" TIMESTAMP(3),
    "ip" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LoyaltyOtp_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "LoyaltyOtp_phone_purpose_createdAt_idx" ON "LoyaltyOtp"("phone", "purpose", "createdAt");
CREATE INDEX IF NOT EXISTS "LoyaltyOtp_redemptionId_idx" ON "LoyaltyOtp"("redemptionId");

CREATE TABLE IF NOT EXISTS "Referral" (
    "id" TEXT NOT NULL,
    "referrerId" TEXT NOT NULL,
    "refereeId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "qualifyingReservationId" TEXT,
    "rewardedAt" TIMESTAMP(3),
    "rejectReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Referral_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Referral_not_self" CHECK ("referrerId" <> "refereeId")
);
CREATE UNIQUE INDEX IF NOT EXISTS "Referral_refereeId_key" ON "Referral"("refereeId");
CREATE UNIQUE INDEX IF NOT EXISTS "Referral_qualifyingReservationId_key" ON "Referral"("qualifyingReservationId");
CREATE INDEX IF NOT EXISTS "Referral_referrerId_idx" ON "Referral"("referrerId");
CREATE INDEX IF NOT EXISTS "Referral_status_idx" ON "Referral"("status");

CREATE TABLE IF NOT EXISTS "LoyaltyEventReward" (
    "id" TEXT NOT NULL,
    "membershipId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "transactionId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LoyaltyEventReward_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "LoyaltyEventReward_transactionId_key" ON "LoyaltyEventReward"("transactionId");
CREATE UNIQUE INDEX IF NOT EXISTS "LoyaltyEventReward_membershipId_kind_year_key" ON "LoyaltyEventReward"("membershipId", "kind", "year");

CREATE TABLE IF NOT EXISTS "LoyaltyNotification" (
    "id" TEXT NOT NULL,
    "membershipId" TEXT,
    "kind" TEXT NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "to" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "variables" JSONB NOT NULL DEFAULT '{}',
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "LoyaltyNotification_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "LoyaltyNotification_dedupeKey_key" ON "LoyaltyNotification"("dedupeKey");
CREATE INDEX IF NOT EXISTS "LoyaltyNotification_status_attempts_idx" ON "LoyaltyNotification"("status", "attempts");
CREATE INDEX IF NOT EXISTS "LoyaltyNotification_membershipId_createdAt_idx" ON "LoyaltyNotification"("membershipId", "createdAt");

CREATE TABLE IF NOT EXISTS "LoyaltyAuditLog" (
    "id" TEXT NOT NULL,
    "actor" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "membershipId" TEXT,
    "details" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LoyaltyAuditLog_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "LoyaltyAuditLog_membershipId_createdAt_idx" ON "LoyaltyAuditLog"("membershipId", "createdAt");
CREATE INDEX IF NOT EXISTS "LoyaltyAuditLog_action_idx" ON "LoyaltyAuditLog"("action");

-- ---------- Foreign keys (added only when missing) ----------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PointTransaction_membershipId_fkey') THEN
    ALTER TABLE "PointTransaction" ADD CONSTRAINT "PointTransaction_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "Membership"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PointTransaction_reservationId_fkey') THEN
    ALTER TABLE "PointTransaction" ADD CONSTRAINT "PointTransaction_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "Reservation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PointTransaction_propertyId_fkey') THEN
    ALTER TABLE "PointTransaction" ADD CONSTRAINT "PointTransaction_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PointAllocation_debitId_fkey') THEN
    ALTER TABLE "PointAllocation" ADD CONSTRAINT "PointAllocation_debitId_fkey" FOREIGN KEY ("debitId") REFERENCES "PointTransaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PointAllocation_creditId_fkey') THEN
    ALTER TABLE "PointAllocation" ADD CONSTRAINT "PointAllocation_creditId_fkey" FOREIGN KEY ("creditId") REFERENCES "PointTransaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'MemberTierHistory_membershipId_fkey') THEN
    ALTER TABLE "MemberTierHistory" ADD CONSTRAINT "MemberTierHistory_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "Membership"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Redemption_membershipId_fkey') THEN
    ALTER TABLE "Redemption" ADD CONSTRAINT "Redemption_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "Membership"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'LoyaltyOtp_redemptionId_fkey') THEN
    ALTER TABLE "LoyaltyOtp" ADD CONSTRAINT "LoyaltyOtp_redemptionId_fkey" FOREIGN KEY ("redemptionId") REFERENCES "Redemption"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Referral_referrerId_fkey') THEN
    ALTER TABLE "Referral" ADD CONSTRAINT "Referral_referrerId_fkey" FOREIGN KEY ("referrerId") REFERENCES "Membership"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Referral_refereeId_fkey') THEN
    ALTER TABLE "Referral" ADD CONSTRAINT "Referral_refereeId_fkey" FOREIGN KEY ("refereeId") REFERENCES "Membership"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'LoyaltyEventReward_membershipId_fkey') THEN
    ALTER TABLE "LoyaltyEventReward" ADD CONSTRAINT "LoyaltyEventReward_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "Membership"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'LoyaltyNotification_membershipId_fkey') THEN
    ALTER TABLE "LoyaltyNotification" ADD CONSTRAINT "LoyaltyNotification_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "Membership"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- ---------- Immutable ledger ----------
-- Ledger and allocation rows can never be deleted, and a ledger row's financial fields can never change. The only
-- update allowed is the database itself clearing reservationId/propertyId when that reservation/property is removed.
CREATE OR REPLACE FUNCTION loyalty_ledger_immutable() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'loyalty ledger rows are immutable (% on %)', TG_OP, TG_TABLE_NAME;
  END IF;
  IF TG_TABLE_NAME = 'PointAllocation' THEN
    RAISE EXCEPTION 'loyalty allocation rows are immutable';
  END IF;
  IF NEW."id" IS DISTINCT FROM OLD."id" OR NEW."membershipId" IS DISTINCT FROM OLD."membershipId"
     OR NEW."amount" IS DISTINCT FROM OLD."amount" OR NEW."type" IS DISTINCT FROM OLD."type"
     OR NEW."description" IS DISTINCT FROM OLD."description" OR NEW."idempotencyKey" IS DISTINCT FROM OLD."idempotencyKey"
     OR NEW."expiresAt" IS DISTINCT FROM OLD."expiresAt" OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt"
     OR NEW."eligibleAmount" IS DISTINCT FROM OLD."eligibleAmount" OR NEW."calculation" IS DISTINCT FROM OLD."calculation"
     OR NEW."tier" IS DISTINCT FROM OLD."tier" OR NEW."channel" IS DISTINCT FROM OLD."channel"
     OR NEW."tierMultiplier" IS DISTINCT FROM OLD."tierMultiplier" OR NEW."channelMultiplier" IS DISTINCT FROM OLD."channelMultiplier"
     OR NEW."relatedId" IS DISTINCT FROM OLD."relatedId" OR NEW."actor" IS DISTINCT FROM OLD."actor" OR NEW."reason" IS DISTINCT FROM OLD."reason" THEN
    RAISE EXCEPTION 'loyalty ledger rows are immutable';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "PointTransaction_immutable" ON "PointTransaction";
CREATE TRIGGER "PointTransaction_immutable" BEFORE UPDATE OR DELETE ON "PointTransaction" FOR EACH ROW EXECUTE FUNCTION loyalty_ledger_immutable();
DROP TRIGGER IF EXISTS "PointAllocation_immutable" ON "PointAllocation";
CREATE TRIGGER "PointAllocation_immutable" BEFORE UPDATE OR DELETE ON "PointAllocation" FOR EACH ROW EXECUTE FUNCTION loyalty_ledger_immutable();

COMMIT;
