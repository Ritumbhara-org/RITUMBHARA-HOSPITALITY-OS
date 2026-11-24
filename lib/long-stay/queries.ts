// Long Stays page data. SERVER-ONLY; callers check the admin session first.

import { prisma } from "@/lib/prisma"
import { agreementBadge, isLinkUsable } from "./agreement"
import { toDateOnly, type LongStayInput } from "./shared"
import type { AgreementView, LocationOption, UnitOption } from "./view"

export async function loadFormOptions(): Promise<{ locations: LocationOption[]; units: UnitOption[] }> {
  const [locations, units] = await Promise.all([
    prisma.property.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.unit.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, type: true, propertyId: true } }),
  ])
  return { locations, units }
}

export async function loadBookingForForm(id: string) {
  const b = await prisma.longStayBooking.findUnique({ where: { id }, include: { agreements: { orderBy: { createdAt: "desc" } } } })
  if (!b) return null
  const input: LongStayInput = {
    id: b.id, status: b.status, guestName: b.guestName, contactNumber: b.contactNumber, altContactNumber: b.altContactNumber ?? "",
    email: b.email ?? "", occupants: b.occupants, emergencyContact: b.emergencyContact ?? "", idType: b.idType, idNumber: b.idNumber,
    propertyId: b.propertyId, unitId: b.unitId ?? "", propertyType: b.propertyType, checkIn: toDateOnly(b.checkIn), checkOut: toDateOnly(b.checkOut),
    inclusion: b.inclusion, rateType: b.rateType, rate: b.rate, totalAmount: b.totalAmount, advancePaid: b.advancePaid,
    paymentMode: b.paymentMode ?? "", securityDeposit: b.securityDeposit, depositMode: b.depositMode ?? "", depositTerms: b.depositTerms,
    depositDeduction: b.depositDeduction, deductionReason: b.deductionReason ?? "",
    depositRefundedOn: b.depositRefundedOn ? toDateOnly(b.depositRefundedOn) : "", idDocuments: b.idDocuments, checkInMedia: b.checkInMedia,
    checkOutMedia: b.checkOutMedia, notes: b.notes ?? "",
  }
  const latest = b.agreements[0]
  const iso = (d: Date | null) => (d ? d.toISOString() : null)
  const agreement: AgreementView | null = latest
    ? {
        badge: agreementBadge(b.agreements), linkActive: isLinkUsable(latest), sentAt: iso(latest.sentAt), sentVia: latest.sentVia,
        expiresAt: iso(latest.expiresAt), viewedAt: iso(latest.viewedAt), signedAt: iso(latest.signedAt), signerName: latest.signerName,
        pdfPath: latest.pdfPath, voidReason: latest.voidReason, locked: Boolean(latest.lockedAt),
      }
    : null
  return { input, status: b.status, agreement, createdAt: b.createdAt }
}
