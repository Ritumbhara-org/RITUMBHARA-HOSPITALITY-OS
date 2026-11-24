-- Native PMS + Channex (phase 1). Additive only: new enum, new tables, new nullable / defaulted columns.
-- Existing IntelliStay properties stay on pmsMode = INTELLISTAY and behave exactly as before.

-- CreateEnum
CREATE TYPE "PmsMode" AS ENUM ('INTELLISTAY', 'NATIVE');

-- AlterTable
ALTER TABLE "Property" ADD COLUMN "pmsMode" "PmsMode" NOT NULL DEFAULT 'INTELLISTAY';

-- AlterTable
ALTER TABLE "Unit" ADD COLUMN "roomTypeId" TEXT;

-- AlterTable
ALTER TABLE "Reservation"
    ADD COLUMN "channexBookingId" TEXT,
    ADD COLUMN "otaName" TEXT,
    ADD COLUMN "otaReservationCode" TEXT,
    ADD COLUMN "nightlyRates" JSONB,
    ADD COLUMN "roomTypeId" TEXT,
    ADD COLUMN "overbooked" BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN "reviewNote" TEXT;

-- CreateTable
CREATE TABLE "RoomType" (
    "id" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "countOfRooms" INTEGER NOT NULL,
    "occAdults" INTEGER NOT NULL DEFAULT 2,
    "occChildren" INTEGER NOT NULL DEFAULT 0,
    "occInfants" INTEGER NOT NULL DEFAULT 0,
    "defaultOccupancy" INTEGER NOT NULL DEFAULT 2,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RoomType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RatePlan" (
    "id" TEXT NOT NULL,
    "roomTypeId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "baseRate" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RatePlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RateCell" (
    "id" TEXT NOT NULL,
    "ratePlanId" TEXT NOT NULL,
    "date" VARCHAR(10) NOT NULL,
    "rate" DOUBLE PRECISION,
    "minStay" INTEGER,
    "stopSell" BOOLEAN,
    "closedToArrival" BOOLEAN,
    "closedToDeparture" BOOLEAN,
    "pushedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RateCell_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChannexMapping" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "localId" TEXT NOT NULL,
    "channexId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChannexMapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChannexRevision" (
    "id" TEXT NOT NULL,
    "revisionId" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "outcome" TEXT,
    "error" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "appliedAt" TIMESTAMP(3),

    CONSTRAINT "ChannexRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChannelConnection" (
    "id" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "otaCode" TEXT NOT NULL,
    "otaHotelId" TEXT NOT NULL,
    "channexChannelId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'INACTIVE',
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChannelConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invoice" (
    "id" TEXT NOT NULL,
    "reservationId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "billToName" TEXT NOT NULL,
    "billToGstin" TEXT,
    "placeOfSupply" TEXT,
    "taxableAmount" DOUBLE PRECISION NOT NULL,
    "taxAmount" DOUBLE PRECISION NOT NULL,
    "totalAmount" DOUBLE PRECISION NOT NULL,
    "taxLines" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Unit_roomTypeId_idx" ON "Unit"("roomTypeId");

-- CreateIndex
CREATE INDEX "Reservation_channexBookingId_idx" ON "Reservation"("channexBookingId");

-- CreateIndex
CREATE INDEX "Reservation_roomTypeId_idx" ON "Reservation"("roomTypeId");

-- CreateIndex
CREATE INDEX "RoomType_propertyId_idx" ON "RoomType"("propertyId");

-- CreateIndex
CREATE UNIQUE INDEX "RoomType_propertyId_title_key" ON "RoomType"("propertyId", "title");

-- CreateIndex
CREATE INDEX "RatePlan_roomTypeId_idx" ON "RatePlan"("roomTypeId");

-- CreateIndex
CREATE UNIQUE INDEX "RatePlan_roomTypeId_title_key" ON "RatePlan"("roomTypeId", "title");

-- CreateIndex
CREATE INDEX "RateCell_date_idx" ON "RateCell"("date");

-- CreateIndex
CREATE UNIQUE INDEX "RateCell_ratePlanId_date_key" ON "RateCell"("ratePlanId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "ChannexMapping_kind_localId_key" ON "ChannexMapping"("kind", "localId");

-- CreateIndex
CREATE INDEX "ChannexMapping_kind_channexId_idx" ON "ChannexMapping"("kind", "channexId");

-- CreateIndex
CREATE UNIQUE INDEX "ChannexRevision_revisionId_key" ON "ChannexRevision"("revisionId");

-- CreateIndex
CREATE INDEX "ChannexRevision_bookingId_idx" ON "ChannexRevision"("bookingId");

-- CreateIndex
CREATE INDEX "ChannelConnection_propertyId_idx" ON "ChannelConnection"("propertyId");

-- CreateIndex
CREATE UNIQUE INDEX "ChannelConnection_propertyId_otaCode_otaHotelId_key" ON "ChannelConnection"("propertyId", "otaCode", "otaHotelId");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_number_key" ON "Invoice"("number");

-- CreateIndex
CREATE INDEX "Invoice_reservationId_idx" ON "Invoice"("reservationId");

-- AddForeignKey
ALTER TABLE "Unit" ADD CONSTRAINT "Unit_roomTypeId_fkey" FOREIGN KEY ("roomTypeId") REFERENCES "RoomType"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reservation" ADD CONSTRAINT "Reservation_roomTypeId_fkey" FOREIGN KEY ("roomTypeId") REFERENCES "RoomType"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoomType" ADD CONSTRAINT "RoomType_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RatePlan" ADD CONSTRAINT "RatePlan_roomTypeId_fkey" FOREIGN KEY ("roomTypeId") REFERENCES "RoomType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RateCell" ADD CONSTRAINT "RateCell_ratePlanId_fkey" FOREIGN KEY ("ratePlanId") REFERENCES "RatePlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChannelConnection" ADD CONSTRAINT "ChannelConnection_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "Reservation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
