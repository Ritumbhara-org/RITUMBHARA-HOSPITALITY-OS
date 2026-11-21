"use server"

import { revalidatePath } from "next/cache"
import { prisma } from "@/lib/prisma"
import { assertHk } from "@/lib/hk/session"
import { checkGeofence, type GeofenceResult } from "@/lib/hk/geo"
import { isCaptureTimeValid, missingRequirements, pickTemplate } from "@/lib/hk/checklist"
import { MAX_IMAGE_BYTES, MAX_VIDEO_BYTES, MAX_VIDEO_SECONDS, isOwnedMediaUrl, kindFromMime, proofPrefix } from "@/lib/hk/media"

type Fix = { lat: number; lng: number; accuracyM?: number | null }
type Result<T = object> = ({ success: true } & T) | { success: false; error: string }

function fail(error: unknown, fallback: string): { success: false; error: string } {
  const message = error instanceof Error ? error.message : fallback
  console.error("[HK action]", error)
  return { success: false, error: message || fallback }
}

function geofenceError(r: Exclude<GeofenceResult, { ok: true }>, radiusM: number): string {
  switch (r.reason) {
    case "BAD_COORDS":
      return "Could not read your location. Turn on location and try again."
    case "WEAK_SIGNAL":
      return "Your location signal is weak. Step outside or near a window and try again."
    case "TOO_FAR":
      return `You are about ${Math.round(r.distanceM ?? 0)} m from the property. You must be within ${radiusM} m.`
  }
}

function parseFix(raw: unknown): Fix {
  const f = raw as Fix
  if (!f || !Number.isFinite(f.lat) || !Number.isFinite(f.lng)) throw new Error("Location is missing. Turn on location and try again.")
  return { lat: f.lat, lng: f.lng, accuracyM: Number.isFinite(f.accuracyM) ? (f.accuracyM as number) : null }
}

// ── Check in ─────────────────────────────────────────────────

export async function startTurnover(locationId: string, unitId: string, rawFix: Fix): Promise<Result<{ turnoverId: string }>> {
  try {
    const hk = await assertHk()
    const fix = parseFix(rawFix)

    const assignment = await prisma.hkAssignment.findUnique({
      where: { hkUserId_locationId: { hkUserId: hk.id, locationId } },
      include: { location: true },
    })
    if (!assignment || !assignment.location.isActive) throw new Error("You are not assigned to this location.")
    const location = assignment.location

    const unit = await prisma.unit.findFirst({ where: { id: unitId, propertyId: location.propertyId } })
    if (!unit) throw new Error("This unit is not at this location.")

    // Resuming an unfinished turnover needs no new check-in.
    const open = await prisma.hkTurnover.findFirst({
      where: { hkUserId: hk.id, unitId, status: "IN_PROGRESS" },
      select: { id: true },
    })
    if (open) return { success: true, turnoverId: open.id }

    const geo = checkGeofence(fix, { lat: location.latitude, lng: location.longitude }, location.radiusM)
    if (!geo.ok) throw new Error(geofenceError(geo, location.radiusM))

    const templates = await prisma.hkChecklistTemplate.findMany({
      where: { locationId },
      include: { _count: { select: { areas: true } } },
    })
    const template = pickTemplate(templates, unit.type)
    if (!template) throw new Error("No checklist is set up for this unit yet. Ask your manager.")
    const withAreas = templates.find((t) => t.id === template.id)
    if (!withAreas || withAreas._count.areas === 0) throw new Error("The checklist for this unit has no areas yet. Ask your manager.")

    const turnover = await prisma.hkTurnover.create({
      data: {
        unitId,
        locationId,
        hkUserId: hk.id,
        templateId: template.id,
        checkInLat: fix.lat,
        checkInLng: fix.lng,
        checkInAccuracyM: fix.accuracyM ?? null,
      },
    })
    revalidatePath("/hk")
    return { success: true, turnoverId: turnover.id }
  } catch (e) {
    return fail(e, "Could not check in.")
  }
}

// ── Proof ────────────────────────────────────────────────────

export type SubmissionInput = {
  areaId: string
  mediaUrl: string
  mimeType: string
  sizeBytes: number
  durationSec?: number | null
  capturedAt: string // ISO time on the phone when capture finished
  fix?: Fix | null
}

export async function recordSubmission(turnoverId: string, input: SubmissionInput): Promise<Result<{ submissionId: string }>> {
  try {
    const hk = await assertHk()
    const turnover = await prisma.hkTurnover.findFirst({
      where: { id: turnoverId, hkUserId: hk.id },
      include: { template: { include: { areas: { select: { id: true } } } } },
    })
    if (!turnover) throw new Error("Turnover not found.")
    if (turnover.status !== "IN_PROGRESS") throw new Error("This turnover is already submitted.")
    if (!turnover.template.areas.some((a) => a.id === input.areaId)) throw new Error("That area is not part of this checklist.")

    const mime = String(input.mimeType).split(";")[0].trim()
    const kind = kindFromMime(mime)
    if (!kind) throw new Error("Unsupported file type.")
    if (!isOwnedMediaUrl(input.mediaUrl, proofPrefix(hk.id))) throw new Error("File was not uploaded through this app.")

    const size = Math.round(Number(input.sizeBytes))
    if (!Number.isFinite(size) || size <= 0 || size > (kind === "VIDEO" ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES)) throw new Error("File size is not allowed.")

    let durationSec: number | null = null
    if (kind === "VIDEO") {
      durationSec = Math.round(Number(input.durationSec))
      if (!Number.isFinite(durationSec) || durationSec < 3) throw new Error("The video is too short. Record at least 3 seconds.")
      if (durationSec > MAX_VIDEO_SECONDS) throw new Error(`The video is too long. Keep it under ${MAX_VIDEO_SECONDS} seconds.`)
    }

    const capturedAt = new Date(input.capturedAt)
    if (!isCaptureTimeValid(capturedAt, turnover.checkInAt)) throw new Error("The capture time looks wrong. Check your phone clock and record again.")

    const fix = input.fix && Number.isFinite(input.fix.lat) && Number.isFinite(input.fix.lng) ? input.fix : null

    const sub = await prisma.hkSubmission.create({
      data: {
        turnoverId,
        areaId: input.areaId,
        kind,
        mediaUrl: input.mediaUrl,
        mimeType: mime,
        sizeBytes: size,
        durationSec,
        capturedAtClient: capturedAt,
        latitude: fix?.lat ?? null,
        longitude: fix?.lng ?? null,
        accuracyM: fix?.accuracyM ?? null,
      },
    })
    revalidatePath(`/hk/turnover/${turnoverId}`)
    return { success: true, submissionId: sub.id }
  } catch (e) {
    return fail(e, "Could not save the proof.")
  }
}

// Retake: remove one of your own items while the turnover is still open.
export async function removeSubmission(submissionId: string): Promise<Result> {
  try {
    const hk = await assertHk()
    const sub = await prisma.hkSubmission.findFirst({
      where: { id: submissionId, turnover: { hkUserId: hk.id, status: "IN_PROGRESS" } },
      select: { id: true, turnoverId: true },
    })
    if (!sub) throw new Error("Item not found, or the turnover is already submitted.")
    await prisma.hkSubmission.delete({ where: { id: sub.id } })
    revalidatePath(`/hk/turnover/${sub.turnoverId}`)
    return { success: true }
  } catch (e) {
    return fail(e, "Could not remove the item.")
  }
}

// ── Check out ────────────────────────────────────────────────

export async function finishTurnover(turnoverId: string, rawFix: Fix): Promise<Result> {
  try {
    const hk = await assertHk()
    const fix = parseFix(rawFix)
    const turnover = await prisma.hkTurnover.findFirst({
      where: { id: turnoverId, hkUserId: hk.id },
      include: {
        location: true,
        template: { include: { areas: true } },
        submissions: { select: { areaId: true, kind: true } },
      },
    })
    if (!turnover) throw new Error("Turnover not found.")
    if (turnover.status !== "IN_PROGRESS") throw new Error("This turnover is already submitted.")

    const missing = missingRequirements(turnover.template.areas, turnover.submissions)
    if (missing.length > 0) {
      const first = missing[0]
      const parts = [first.needPhotos > 0 ? `${first.needPhotos} photo(s)` : "", first.needVideo ? "a video" : ""].filter(Boolean)
      throw new Error(`Still missing in ${missing.length} area(s). Start with ${first.title}: ${parts.join(" and ")}.`)
    }

    const geo = checkGeofence(fix, { lat: turnover.location.latitude, lng: turnover.location.longitude }, turnover.location.radiusM)
    if (!geo.ok) throw new Error(geofenceError(geo, turnover.location.radiusM))

    await prisma.hkTurnover.update({
      where: { id: turnoverId },
      data: {
        status: "SUBMITTED",
        checkOutAt: new Date(),
        checkOutLat: fix.lat,
        checkOutLng: fix.lng,
        checkOutAccuracyM: fix.accuracyM ?? null,
      },
    })
    revalidatePath("/hk")
    revalidatePath(`/hk/turnover/${turnoverId}`)
    return { success: true }
  } catch (e) {
    return fail(e, "Could not submit.")
  }
}
