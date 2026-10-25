"use server"

// Long Stays server actions: save a booking, attach/delete its photos and videos, and send/cancel the e-sign agreement.
// Every action checks the admin session first.

import { revalidatePath } from "next/cache"
import { headers } from "next/headers"
import { del } from "@/lib/long-stay/blob"
import type { Prisma } from "@prisma/client"
import { requireAdmin } from "@/lib/auth/guard"
import { prisma } from "@/lib/prisma"
import {
  isBookingMediaPath, isValidBookingId, MEDIA_KINDS, nightsBetween, normalizeLongStayInput, parseDateOnly, toDateOnly,
  validateLongStay, type LongStayErrors, type MediaKind,
} from "@/lib/long-stay/shared"
import { buildSnapshot, LINK_TTL_MS, materialKey, type AgreementSnapshot } from "@/lib/long-stay/agreement"
import { newSigningToken, publicBaseUrl, sendLongStayWhatsApp, signingUrl, snapshotHash } from "@/lib/long-stay/server"

export type SaveLongStayResult =
  | { success: true; id: string; voidedSignature: boolean }
  | { success: false; error: string; errors?: LongStayErrors }

const MEDIA_FIELD: Record<MediaKind, "idDocuments" | "checkInMedia" | "checkOutMedia"> = {
  id: "idDocuments", checkin: "checkInMedia", checkout: "checkOutMedia",
}

const MEDIA_SELECT = { idDocuments: true, checkInMedia: true, checkOutMedia: true } as const

function revalidateBooking(id: string) {
  revalidatePath("/long-stay")
  revalidatePath("/long-stay/" + id)
}

function dateValue(s: string): Date {
  return new Date(parseDateOnly(s) as number)
}

export async function saveLongStayBooking(raw: unknown): Promise<SaveLongStayResult> {
  await requireAdmin()
  const input = normalizeLongStayInput(raw)
  const errors = validateLongStay(input)
  if (Object.keys(errors).length) return { success: false, error: "Please fix the highlighted fields.", errors }

  try {
    const [property, unit, existing] = await Promise.all([
      prisma.property.findUnique({ where: { id: input.propertyId }, select: { id: true, name: true, address: true } }),
      input.unitId ? prisma.unit.findUnique({ where: { id: input.unitId }, select: { id: true, name: true, propertyId: true } }) : null,
      prisma.longStayBooking.findUnique({ where: { id: input.id }, include: { agreements: true } }),
    ])
    if (!property) return { success: false, error: "Please fix the highlighted fields.", errors: { propertyId: "Location not found" } }
    if (input.unitId && (!unit || unit.propertyId !== property.id)) {
      return { success: false, error: "Please fix the highlighted fields.", errors: { unitId: "This unit doesn't belong to the chosen location" } }
    }

    const nights = nightsBetween(input.checkIn, input.checkOut)
    const snapshot = buildSnapshot({ ...input, unitId: unit?.id ?? null, nights, property, unit })
    const key = materialKey(snapshot)

    // Agreements that no longer match the booking are voided: a signature only covers what the guest saw.
    const live = (existing?.agreements ?? []).filter((a) => a.status !== "VOIDED")
    const changed = live.filter((a) => materialKey(a.snapshot as unknown as AgreementSnapshot) !== key)
    const pendingOnCancel = input.status === "CANCELLED" ? live.filter((a) => a.status !== "SIGNED" && !changed.includes(a)) : []
    const signed = live.find((a) => a.status === "SIGNED" && !changed.includes(a))

    const wasIn = existing?.status === "CHECKED_IN" || existing?.status === "CHECKED_OUT"
    if ((input.status === "CHECKED_IN" || input.status === "CHECKED_OUT") && !wasIn && !signed) {
      return {
        success: false,
        error: "The guest has to e-sign the agreement before check-in.",
        errors: { status: changed.some((a) => a.status === "SIGNED") ? "These changes void the signed agreement. Send it for e-sign again before check-in." : "The guest has to e-sign the agreement before check-in" },
      }
    }

    const media = (kind: MediaKind, list: string[]) => Array.from(new Set(list.filter((p) => isBookingMediaPath(input.id, kind, p))))
    const data = {
      status: input.status as Prisma.LongStayBookingCreateInput["status"],
      guestName: input.guestName,
      contactNumber: input.contactNumber,
      altContactNumber: input.altContactNumber || null,
      email: input.email || null,
      occupants: input.occupants,
      emergencyContact: input.emergencyContact || null,
      idType: input.idType,
      idNumber: input.idNumber,
      propertyType: input.propertyType,
      checkIn: dateValue(input.checkIn),
      checkOut: dateValue(input.checkOut),
      nights,
      inclusion: input.inclusion as Prisma.LongStayBookingCreateInput["inclusion"],
      rateType: input.rateType as Prisma.LongStayBookingCreateInput["rateType"],
      rate: input.rate,
      totalAmount: input.totalAmount,
      advancePaid: input.advancePaid,
      paymentMode: input.paymentMode || null,
      securityDeposit: input.securityDeposit,
      depositMode: input.depositMode || null,
      depositTerms: input.depositTerms,
      termsAccepted: Boolean(signed),
      depositDeduction: input.depositDeduction,
      deductionReason: input.deductionReason || null,
      depositRefundedOn: input.depositRefundedOn ? dateValue(input.depositRefundedOn) : null,
      idDocuments: media("id", input.idDocuments),
      checkInMedia: media("checkin", input.checkInMedia),
      checkOutMedia: media("checkout", input.checkOutMedia),
      notes: input.notes || null,
    }
    const relations = {
      property: { connect: { id: property.id } },
      unit: unit ? { connect: { id: unit.id } } : existing?.unitId ? { disconnect: true } : undefined,
    }

    const now = new Date()
    await prisma.$transaction([
      ...changed.map((a) =>
        prisma.longStayAgreement.update({
          where: { id: a.id },
          data: { status: "VOIDED", voidedAt: now, voidReason: "Booking details changed after the agreement was sent" },
        }),
      ),
      ...pendingOnCancel.map((a) =>
        prisma.longStayAgreement.update({ where: { id: a.id }, data: { status: "VOIDED", voidedAt: now, voidReason: "Booking cancelled" } }),
      ),
      prisma.longStayBooking.upsert({
        where: { id: input.id },
        create: { id: input.id, ...data, property: relations.property, unit: unit ? { connect: { id: unit.id } } : undefined },
        update: { ...data, property: relations.property, unit: relations.unit },
      }),
    ])

    revalidateBooking(input.id)
    return { success: true, id: input.id, voidedSignature: changed.length > 0 }
  } catch (err) {
    console.error("[Long Stay] save failed", err)
    return { success: false, error: "Couldn't save the booking. Please try again." }
  }
}

// Records uploaded files on a booking that is already saved, so they aren't lost if staff close the page before saving.
export async function attachLongStayMedia(bookingId: string, kind: string, paths: string[]): Promise<{ success: boolean; error?: string }> {
  await requireAdmin()
  if (!isValidBookingId(bookingId) || !(MEDIA_KINDS as readonly string[]).includes(kind)) return { success: false, error: "Invalid request" }
  const k = kind as MediaKind
  const clean = (Array.isArray(paths) ? paths : []).filter((p) => typeof p === "string" && isBookingMediaPath(bookingId, k, p))
  if (!clean.length) return { success: true }
  const booking = await prisma.longStayBooking.findUnique({ where: { id: bookingId }, select: MEDIA_SELECT })
  if (!booking) return { success: true } // not saved yet; the form keeps the paths and saves them with the booking
  const current = booking[MEDIA_FIELD[k]]
  await prisma.longStayBooking.update({
    where: { id: bookingId },
    data: { [MEDIA_FIELD[k]]: Array.from(new Set([...current, ...clean])) },
  })
  revalidateBooking(bookingId)
  return { success: true }
}

export async function deleteLongStayMedia(bookingId: string, kind: string, path: string): Promise<{ success: boolean; error?: string }> {
  await requireAdmin()
  if (!isValidBookingId(bookingId) || !(MEDIA_KINDS as readonly string[]).includes(kind)) return { success: false, error: "Invalid request" }
  const k = kind as MediaKind
  if (!isBookingMediaPath(bookingId, k, path)) return { success: false, error: "That file doesn't belong to this booking" }
  try {
    await del(path)
    const booking = await prisma.longStayBooking.findUnique({ where: { id: bookingId }, select: MEDIA_SELECT })
    if (booking) {
      const current = booking[MEDIA_FIELD[k]]
      await prisma.longStayBooking.update({ where: { id: bookingId }, data: { [MEDIA_FIELD[k]]: current.filter((p) => p !== path) } })
      revalidateBooking(bookingId)
    }
    return { success: true }
  } catch (err) {
    console.error("[Long Stay] delete file failed", err)
    return { success: false, error: "Couldn't delete the file. Please try again." }
  }
}

export type SendAgreementResult = { success: true; url: string; warning?: string } | { success: false; error: string }

// mode "whatsapp": send the link to the guest. "in_person": staff open it on their own phone and hand it over.
export async function sendLongStayAgreement(bookingId: string, mode: string): Promise<SendAgreementResult> {
  await requireAdmin()
  if (!isValidBookingId(bookingId) || (mode !== "whatsapp" && mode !== "in_person")) return { success: false, error: "Invalid request" }

  const booking = await prisma.longStayBooking.findUnique({
    where: { id: bookingId },
    include: { property: { select: { name: true, address: true } }, unit: { select: { name: true } }, agreements: true },
  })
  if (!booking) return { success: false, error: "Save the booking before sending the agreement." }
  if (booking.status === "CANCELLED") return { success: false, error: "This booking is cancelled." }

  const snapshot = buildSnapshot({
    ...booking, checkIn: toDateOnly(booking.checkIn), checkOut: toDateOnly(booking.checkOut), unit: booking.unit,
  })
  const key = materialKey(snapshot)
  const live = booking.agreements.filter((a) => a.status !== "VOIDED")
  if (live.some((a) => a.status === "SIGNED" && materialKey(a.snapshot as unknown as AgreementSnapshot) === key)) {
    return { success: false, error: "The guest has already signed this agreement." }
  }

  const { token, tokenHash } = newSigningToken()
  const now = new Date()
  try {
    await prisma.$transaction([
      ...live.map((a) =>
        prisma.longStayAgreement.update({ where: { id: a.id }, data: { status: "VOIDED", voidedAt: now, voidReason: "Replaced by a new signing link" } }),
      ),
      prisma.longStayAgreement.create({
        data: {
          bookingId, tokenHash, snapshot: snapshot as unknown as Prisma.InputJsonValue, snapshotHash: snapshotHash(snapshot),
          sentVia: mode === "whatsapp" ? "WHATSAPP" : "IN_PERSON", sentAt: now, expiresAt: new Date(now.getTime() + LINK_TTL_MS),
        },
      }),
    ])
  } catch (err) {
    console.error("[Long Stay] create agreement failed", err)
    return { success: false, error: "Couldn't create the signing link. Please try again." }
  }

  const h = await headers()
  const url = signingUrl(publicBaseUrl(h.get("x-forwarded-host") || h.get("host"), h.get("x-forwarded-proto")), token)
  revalidateBooking(bookingId)

  if (mode === "whatsapp") {
    const first = booking.guestName.split(" ")[0] || booking.guestName
    const sent = await sendLongStayWhatsApp({
      to: booking.contactNumber, kind: "SIGN_LINK", bookingId,
      body: `Hi ${first}, please review and e-sign your stay agreement with Ritumbhara: ${url}\nThe link is valid for 7 days.`,
      variables: { "1": first, "2": url },
    })
    if (!sent.ok) return { success: true, url, warning: (sent.error || "WhatsApp message failed") + " Copy the link and share it another way." }
  }
  return { success: true, url }
}

export async function cancelLongStayAgreement(bookingId: string): Promise<{ success: boolean; error?: string }> {
  await requireAdmin()
  if (!isValidBookingId(bookingId)) return { success: false, error: "Invalid request" }
  await prisma.longStayAgreement.updateMany({
    where: { bookingId, status: { in: ["SENT", "VIEWED"] } },
    data: { status: "VOIDED", voidedAt: new Date(), voidReason: "Cancelled by staff" },
  })
  revalidateBooking(bookingId)
  return { success: true }
}
