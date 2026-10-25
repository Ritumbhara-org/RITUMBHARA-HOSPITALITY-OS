-- Long Stays tables. Same result as `npx prisma db push` for this change.
-- Safe to run once in the Supabase/Postgres SQL editor: it only ADDS four enums and two tables.
-- Existing tables are not changed (Property/Unit get back-relations in Prisma only, no columns).
-- Wrapped in a transaction, so nothing is applied if any statement fails.

BEGIN;

CREATE TYPE "LongStayStatus" AS ENUM ('UPCOMING', 'CHECKED_IN', 'CHECKED_OUT', 'CANCELLED');
CREATE TYPE "LongStayInclusion" AS ENUM ('UNIT_ONLY', 'UNIT_ELECTRICITY', 'UNIT_ELECTRICITY_MAINTENANCE', 'ALL_INCLUSIVE');
CREATE TYPE "LongStayRateType" AS ENUM ('PER_NIGHT', 'PER_MONTH');
CREATE TYPE "LongStayAgreementStatus" AS ENUM ('SENT', 'VIEWED', 'SIGNED', 'VOIDED');

CREATE TABLE "LongStayBooking" (
    "id" TEXT NOT NULL,
    "status" "LongStayStatus" NOT NULL DEFAULT 'UPCOMING',
    "guestName" TEXT NOT NULL,
    "contactNumber" TEXT NOT NULL,
    "altContactNumber" TEXT,
    "email" TEXT,
    "occupants" INTEGER NOT NULL DEFAULT 1,
    "emergencyContact" TEXT,
    "idType" TEXT NOT NULL,
    "idNumber" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "unitId" TEXT,
    "propertyType" TEXT NOT NULL,
    "checkIn" DATE NOT NULL,
    "checkOut" DATE NOT NULL,
    "nights" INTEGER NOT NULL,
    "inclusion" "LongStayInclusion" NOT NULL,
    "rateType" "LongStayRateType" NOT NULL DEFAULT 'PER_MONTH',
    "rate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "advancePaid" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "paymentMode" TEXT,
    "securityDeposit" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "depositMode" TEXT,
    "depositTerms" TEXT NOT NULL,
    "termsAccepted" BOOLEAN NOT NULL DEFAULT false,
    "depositDeduction" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "deductionReason" TEXT,
    "depositRefundedOn" DATE,
    "idDocuments" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "checkInMedia" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "checkOutMedia" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "LongStayBooking_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "LongStayAgreement" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "status" "LongStayAgreementStatus" NOT NULL DEFAULT 'SENT',
    "tokenHash" TEXT NOT NULL,
    "snapshot" JSONB NOT NULL,
    "snapshotHash" TEXT NOT NULL,
    "sentVia" TEXT NOT NULL DEFAULT 'LINK',
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "viewedAt" TIMESTAMP(3),
    "otpHash" TEXT,
    "otpExpiresAt" TIMESTAMP(3),
    "otpAttempts" INTEGER NOT NULL DEFAULT 0,
    "otpSendCount" INTEGER NOT NULL DEFAULT 0,
    "otpLastSentAt" TIMESTAMP(3),
    "lockedAt" TIMESTAMP(3),
    "phoneVerified" TEXT,
    "phoneVerifiedAt" TIMESTAMP(3),
    "signedAt" TIMESTAMP(3),
    "signerName" TEXT,
    "signaturePath" TEXT,
    "signerIp" TEXT,
    "signerUserAgent" TEXT,
    "pdfPath" TEXT,
    "voidedAt" TIMESTAMP(3),
    "voidReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "LongStayAgreement_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "LongStayBooking_propertyId_idx" ON "LongStayBooking"("propertyId");
CREATE INDEX "LongStayBooking_unitId_idx" ON "LongStayBooking"("unitId");
CREATE INDEX "LongStayBooking_status_idx" ON "LongStayBooking"("status");
CREATE INDEX "LongStayBooking_checkIn_idx" ON "LongStayBooking"("checkIn");
CREATE UNIQUE INDEX "LongStayAgreement_tokenHash_key" ON "LongStayAgreement"("tokenHash");
CREATE INDEX "LongStayAgreement_bookingId_idx" ON "LongStayAgreement"("bookingId");
CREATE INDEX "LongStayAgreement_status_idx" ON "LongStayAgreement"("status");

ALTER TABLE "LongStayBooking" ADD CONSTRAINT "LongStayBooking_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "LongStayBooking" ADD CONSTRAINT "LongStayBooking_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "LongStayAgreement" ADD CONSTRAINT "LongStayAgreement_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "LongStayBooking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

COMMIT;
