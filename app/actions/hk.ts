"use server"

import { revalidatePath } from "next/cache"
import { prisma } from "@/lib/prisma"
import { assertHk } from "@/lib/hk/session"
import { checkGeofence, type GeofenceResult } from "@/lib/hk/geo"
import { areasForUnit, isCaptureTimeValid, missingRequirements, pickTemplate } from "@/lib/hk/checklist"
import { startOfDayIST } from "@/lib/hk/time"
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
      return "लोकेशन पढ़ी नहीं जा सकी। लोकेशन चालू करके दोबारा कोशिश करें।"
    case "WEAK_SIGNAL":
      return `लोकेशन साफ़ नहीं मिल रही (करीब ${Math.round(r.accuracyM ?? 0)} मीटर का फ़र्क)। फ़ोन की सेटिंग में "सटीक लोकेशन" (Precise location) चालू करें, बाहर या खिड़की के पास जाएं और दोबारा कोशिश करें।`
    case "TOO_FAR":
      return `आप प्रॉपर्टी से लगभग ${Math.round(r.distanceM ?? 0)} मीटर दूर हैं। ${radiusM} मीटर के अंदर होना ज़रूरी है।`
  }
}

function parseFix(raw: unknown): Fix {
  const f = raw as Fix
  if (!f || !Number.isFinite(f.lat) || !Number.isFinite(f.lng)) throw new Error("लोकेशन नहीं मिली। लोकेशन चालू करके दोबारा कोशिश करें।")
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
    if (!assignment || !assignment.location.isActive) throw new Error("यह लोकेशन आपको नहीं दी गई है।")
    const location = assignment.location

    const unit = await prisma.unit.findFirst({ where: { id: unitId, propertyId: location.propertyId } })
    if (!unit) throw new Error("यह यूनिट इस लोकेशन पर नहीं है।")

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
      include: { areas: { select: { unitId: true } } },
    })
    const template = pickTemplate(templates, unit.type)
    if (!template) throw new Error("इस यूनिट के लिए अभी कोई चेकलिस्ट नहीं बनी है। मैनेजर से पूछें।")
    const withAreas = templates.find((t) => t.id === template.id)
    if (!withAreas || areasForUnit(withAreas.areas, unitId).length === 0) throw new Error("इस यूनिट की चेकलिस्ट में अभी कोई हिस्सा नहीं है। मैनेजर से पूछें।")

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
    return fail(e, "चेक-इन नहीं हो सका।")
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
      include: { template: { include: { areas: { select: { id: true, unitId: true } } } } },
    })
    if (!turnover) throw new Error("सफ़ाई का रिकॉर्ड नहीं मिला।")
    if (turnover.status !== "IN_PROGRESS") throw new Error("यह सफ़ाई पहले ही जमा हो चुकी है।")
    if (!areasForUnit(turnover.template.areas, turnover.unitId).some((a) => a.id === input.areaId)) throw new Error("यह हिस्सा इस चेकलिस्ट में नहीं है।")

    const mime = String(input.mimeType).split(";")[0].trim()
    const kind = kindFromMime(mime)
    if (!kind) throw new Error("इस तरह की फ़ाइल मान्य नहीं है।")
    if (!isOwnedMediaUrl(input.mediaUrl, proofPrefix(hk.id))) throw new Error("फ़ाइल इस ऐप से अपलोड नहीं हुई।")

    const size = Math.round(Number(input.sizeBytes))
    if (!Number.isFinite(size) || size <= 0 || size > (kind === "VIDEO" ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES)) throw new Error("फ़ाइल का साइज़ मान्य नहीं है।")

    let durationSec: number | null = null
    if (kind === "VIDEO") {
      durationSec = Math.round(Number(input.durationSec))
      if (!Number.isFinite(durationSec) || durationSec < 3) throw new Error("वीडियो बहुत छोटा है। कम से कम 3 सेकंड रिकॉर्ड करें।")
      if (durationSec > MAX_VIDEO_SECONDS) throw new Error(`वीडियो बहुत लंबा है। ${MAX_VIDEO_SECONDS} सेकंड से कम रखें।`)
    }

    const capturedAt = new Date(input.capturedAt)
    if (!isCaptureTimeValid(capturedAt, turnover.checkInAt)) throw new Error("कैप्चर का समय ग़लत लग रहा है। फ़ोन की घड़ी जांचें और दोबारा रिकॉर्ड करें।")

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
    return fail(e, "प्रमाण सेव नहीं हो सका।")
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
    if (!sub) throw new Error("आइटम नहीं मिला, या सफ़ाई पहले ही जमा हो चुकी है।")
    await prisma.hkSubmission.delete({ where: { id: sub.id } })
    revalidatePath(`/hk/turnover/${sub.turnoverId}`)
    return { success: true }
  } catch (e) {
    return fail(e, "आइटम हटाया नहीं जा सका।")
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
    if (!turnover) throw new Error("सफ़ाई का रिकॉर्ड नहीं मिला।")
    if (turnover.status !== "IN_PROGRESS") throw new Error("यह सफ़ाई पहले ही जमा हो चुकी है।")

    const missing = missingRequirements(areasForUnit(turnover.template.areas, turnover.unitId), turnover.submissions)
    if (missing.length > 0) {
      const first = missing[0]
      const parts = [first.needPhotos > 0 ? `${first.needPhotos} फ़ोटो` : "", first.needVideo ? "एक वीडियो" : ""].filter(Boolean)
      throw new Error(`${missing.length} हिस्सों में अभी कुछ बाकी है। पहले ${first.title} देखें: ${parts.join(" और ")} चाहिए।`)
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
    return fail(e, "जमा नहीं हो सका।")
  }
}

// ── Guest already present ────────────────────────────────────

export async function raiseExemption(locationId: string, unitId: string, reason: string): Promise<Result> {
  try {
    const hk = await assertHk()
    const text = String(reason ?? "").trim()
    if (text.length < 3) throw new Error("बताएं कि यूनिट की सफ़ाई क्यों नहीं हो सकी।")
    if (text.length > 500) throw new Error("कारण 500 अक्षरों से कम रखें।")

    const assignment = await prisma.hkAssignment.findUnique({
      where: { hkUserId_locationId: { hkUserId: hk.id, locationId } },
      include: { location: true },
    })
    if (!assignment || !assignment.location.isActive) throw new Error("यह लोकेशन आपको नहीं दी गई है।")
    const unit = await prisma.unit.findFirst({ where: { id: unitId, propertyId: assignment.location.propertyId }, select: { id: true } })
    if (!unit) throw new Error("यह यूनिट इस लोकेशन पर नहीं है।")

    const day = startOfDayIST()
    const existing = await prisma.hkExemption.findFirst({ where: { hkUserId: hk.id, unitId, day, status: { in: ["PENDING", "APPROVED"] } }, select: { id: true } })
    if (existing) throw new Error("आज के लिए आप यह पहले ही भेज चुके हैं।")

    await prisma.hkExemption.create({ data: { hkUserId: hk.id, unitId, day, reason: text } })
    revalidatePath("/hk")
    revalidatePath("/hk-admin", "layout")
    return { success: true }
  } catch (e) {
    return fail(e, "रिक्वेस्ट नहीं भेजी जा सकी।")
  }
}
