-- Housekeeping proof-of-work module (HK sign-in, locations, checklists, turnovers, media submissions).
-- Same result as `npx prisma db push` for this change. Purely additive: new enums and new tables only,
-- no existing table is altered. Safe to run more than once. Run it BEFORE deploying the code.

BEGIN;

DO $$ BEGIN
  CREATE TYPE "HkTurnoverStatus" AS ENUM ('IN_PROGRESS', 'SUBMITTED', 'APPROVED', 'REJECTED', 'EXEMPT');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "HkMediaKind" AS ENUM ('PHOTO', 'VIDEO');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "HkLocation" (
  "id" TEXT NOT NULL,
  "propertyId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "latitude" DOUBLE PRECISION NOT NULL,
  "longitude" DOUBLE PRECISION NOT NULL,
  "radiusM" INTEGER NOT NULL DEFAULT 150,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "HkLocation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "HkUser" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "mobile" TEXT NOT NULL,
  "pinHash" TEXT NOT NULL,
  "failedAttempts" INTEGER NOT NULL DEFAULT 0,
  "lockedUntil" TIMESTAMP(3),
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "lastLoginAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "HkUser_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "HkAssignment" (
  "id" TEXT NOT NULL,
  "hkUserId" TEXT NOT NULL,
  "locationId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "HkAssignment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "HkChecklistTemplate" (
  "id" TEXT NOT NULL,
  "locationId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "unitType" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "HkChecklistTemplate_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "HkChecklistArea" (
  "id" TEXT NOT NULL,
  "templateId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "instructions" TEXT,
  "minPhotos" INTEGER NOT NULL DEFAULT 1,
  "requiresVideo" BOOLEAN NOT NULL DEFAULT true,
  "referenceMedia" JSONB NOT NULL DEFAULT '[]',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "HkChecklistArea_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "HkTurnover" (
  "id" TEXT NOT NULL,
  "unitId" TEXT NOT NULL,
  "locationId" TEXT NOT NULL,
  "hkUserId" TEXT NOT NULL,
  "templateId" TEXT NOT NULL,
  "status" "HkTurnoverStatus" NOT NULL DEFAULT 'IN_PROGRESS',
  "checkInAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "checkInLat" DOUBLE PRECISION NOT NULL,
  "checkInLng" DOUBLE PRECISION NOT NULL,
  "checkInAccuracyM" DOUBLE PRECISION,
  "checkOutAt" TIMESTAMP(3),
  "checkOutLat" DOUBLE PRECISION,
  "checkOutLng" DOUBLE PRECISION,
  "checkOutAccuracyM" DOUBLE PRECISION,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "HkTurnover_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "HkSubmission" (
  "id" TEXT NOT NULL,
  "turnoverId" TEXT NOT NULL,
  "areaId" TEXT NOT NULL,
  "kind" "HkMediaKind" NOT NULL,
  "mediaUrl" TEXT NOT NULL,
  "mimeType" TEXT,
  "sizeBytes" INTEGER,
  "durationSec" INTEGER,
  "capturedAtClient" TIMESTAMP(3) NOT NULL,
  "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "latitude" DOUBLE PRECISION,
  "longitude" DOUBLE PRECISION,
  "accuracyM" DOUBLE PRECISION,
  CONSTRAINT "HkSubmission_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "HkUser_mobile_key" ON "HkUser"("mobile");
CREATE UNIQUE INDEX IF NOT EXISTS "HkAssignment_hkUserId_locationId_key" ON "HkAssignment"("hkUserId", "locationId");
CREATE INDEX IF NOT EXISTS "HkLocation_propertyId_idx" ON "HkLocation"("propertyId");
CREATE INDEX IF NOT EXISTS "HkAssignment_locationId_idx" ON "HkAssignment"("locationId");
CREATE INDEX IF NOT EXISTS "HkChecklistTemplate_locationId_idx" ON "HkChecklistTemplate"("locationId");
CREATE INDEX IF NOT EXISTS "HkChecklistArea_templateId_idx" ON "HkChecklistArea"("templateId");
CREATE INDEX IF NOT EXISTS "HkTurnover_hkUserId_checkInAt_idx" ON "HkTurnover"("hkUserId", "checkInAt");
CREATE INDEX IF NOT EXISTS "HkTurnover_locationId_checkInAt_idx" ON "HkTurnover"("locationId", "checkInAt");
CREATE INDEX IF NOT EXISTS "HkTurnover_unitId_idx" ON "HkTurnover"("unitId");
CREATE INDEX IF NOT EXISTS "HkTurnover_status_idx" ON "HkTurnover"("status");
CREATE INDEX IF NOT EXISTS "HkSubmission_turnoverId_idx" ON "HkSubmission"("turnoverId");
CREATE INDEX IF NOT EXISTS "HkSubmission_areaId_idx" ON "HkSubmission"("areaId");

-- Foreign keys (guarded so the script can be re-run)
DO $$ BEGIN ALTER TABLE "HkLocation" ADD CONSTRAINT "HkLocation_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE RESTRICT ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "HkAssignment" ADD CONSTRAINT "HkAssignment_hkUserId_fkey" FOREIGN KEY ("hkUserId") REFERENCES "HkUser"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "HkAssignment" ADD CONSTRAINT "HkAssignment_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "HkLocation"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "HkChecklistTemplate" ADD CONSTRAINT "HkChecklistTemplate_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "HkLocation"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "HkChecklistArea" ADD CONSTRAINT "HkChecklistArea_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "HkChecklistTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "HkTurnover" ADD CONSTRAINT "HkTurnover_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "HkTurnover" ADD CONSTRAINT "HkTurnover_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "HkLocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "HkTurnover" ADD CONSTRAINT "HkTurnover_hkUserId_fkey" FOREIGN KEY ("hkUserId") REFERENCES "HkUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "HkTurnover" ADD CONSTRAINT "HkTurnover_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "HkChecklistTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "HkSubmission" ADD CONSTRAINT "HkSubmission_turnoverId_fkey" FOREIGN KEY ("turnoverId") REFERENCES "HkTurnover"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "HkSubmission" ADD CONSTRAINT "HkSubmission_areaId_fkey" FOREIGN KEY ("areaId") REFERENCES "HkChecklistArea"("id") ON DELETE RESTRICT ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMIT;
