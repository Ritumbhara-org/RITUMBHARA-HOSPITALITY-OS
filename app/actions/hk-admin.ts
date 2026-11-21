"use server"

import { revalidatePath } from "next/cache"
import { prisma } from "@/lib/prisma"
import { requireAdmin } from "@/lib/auth/guard"
import { hashSecret, isValidPinFormat } from "@/lib/hk/secret"
import { normalizeMobile } from "@/lib/hk/validation"
import { REFERENCE_PREFIX, isOwnedMediaUrl, parseReferenceMedia, type ReferenceMedia } from "@/lib/hk/media"

type Result = { success: boolean; error?: string; message?: string }

function fail(error: unknown, fallback: string): Result {
  const message = error instanceof Error ? error.message : fallback
  console.error("[HK admin action]", error)
  return { success: false, error: message || fallback }
}

const str = (fd: FormData, key: string) => String(fd.get(key) ?? "").trim()

// ── Locations ────────────────────────────────────────────────

export async function createHkLocation(fd: FormData): Promise<Result> {
  await requireAdmin()
  try {
    const propertyId = str(fd, "propertyId")
    const name = str(fd, "name")
    const latitude = Number(str(fd, "latitude"))
    const longitude = Number(str(fd, "longitude"))
    const radiusM = Math.round(Number(str(fd, "radiusM") || 150))

    if (!propertyId || !name) throw new Error("Property and name are required.")
    if (!Number.isFinite(latitude) || Math.abs(latitude) > 90) throw new Error("Latitude must be between -90 and 90.")
    if (!Number.isFinite(longitude) || Math.abs(longitude) > 180) throw new Error("Longitude must be between -180 and 180.")
    if (!Number.isFinite(radiusM) || radiusM < 30 || radiusM > 1000) throw new Error("Radius must be 30 to 1000 metres.")

    await prisma.hkLocation.create({ data: { propertyId, name, latitude, longitude, radiusM } })
    revalidatePath("/hk-admin/locations")
    return { success: true, message: "Location added" }
  } catch (e) {
    return fail(e, "Could not add the location.")
  }
}

export async function setHkLocationActive(id: string, isActive: boolean): Promise<Result> {
  await requireAdmin()
  try {
    await prisma.hkLocation.update({ where: { id }, data: { isActive } })
    revalidatePath("/hk-admin/locations")
    return { success: true, message: isActive ? "Location activated" : "Location deactivated" }
  } catch (e) {
    return fail(e, "Could not update the location.")
  }
}

// ── Housekeepers ─────────────────────────────────────────────

export async function createHkUser(fd: FormData): Promise<Result> {
  await requireAdmin()
  try {
    const name = str(fd, "name")
    const mobile = normalizeMobile(str(fd, "mobile"))
    const pin = str(fd, "pin")

    if (!name) throw new Error("Name is required.")
    if (!mobile) throw new Error("Enter a valid 10 digit Indian mobile number.")
    if (!isValidPinFormat(pin)) throw new Error("PIN must be 4 to 6 digits.")

    const existing = await prisma.hkUser.findUnique({ where: { mobile } })
    if (existing) throw new Error("A housekeeper with this number already exists.")

    await prisma.hkUser.create({ data: { name, mobile, pinHash: hashSecret(pin) } })
    revalidatePath("/hk-admin/housekeepers")
    return { success: true, message: "Housekeeper added" }
  } catch (e) {
    return fail(e, "Could not add the housekeeper.")
  }
}

export async function resetHkUserPin(id: string, fd: FormData): Promise<Result> {
  await requireAdmin()
  try {
    const pin = str(fd, "pin")
    if (!isValidPinFormat(pin)) throw new Error("PIN must be 4 to 6 digits.")
    await prisma.hkUser.update({
      where: { id },
      data: { pinHash: hashSecret(pin), failedAttempts: 0, lockedUntil: null },
    })
    revalidatePath("/hk-admin/housekeepers")
    return { success: true, message: "PIN reset" }
  } catch (e) {
    return fail(e, "Could not reset the PIN.")
  }
}

export async function setHkUserActive(id: string, isActive: boolean): Promise<Result> {
  await requireAdmin()
  try {
    await prisma.hkUser.update({ where: { id }, data: { isActive } })
    revalidatePath("/hk-admin/housekeepers")
    return { success: true, message: isActive ? "Housekeeper activated" : "Housekeeper deactivated" }
  } catch (e) {
    return fail(e, "Could not update the housekeeper.")
  }
}

export async function setHkAssignments(hkUserId: string, fd: FormData): Promise<Result> {
  await requireAdmin()
  try {
    const locationIds = fd.getAll("locationIds").map(String)
    await prisma.$transaction([
      prisma.hkAssignment.deleteMany({ where: { hkUserId, locationId: { notIn: locationIds } } }),
      ...locationIds.map((locationId) =>
        prisma.hkAssignment.upsert({
          where: { hkUserId_locationId: { hkUserId, locationId } },
          create: { hkUserId, locationId },
          update: {},
        })
      ),
    ])
    revalidatePath("/hk-admin/housekeepers")
    revalidatePath("/hk-admin/locations")
    return { success: true, message: "Locations updated" }
  } catch (e) {
    return fail(e, "Could not update locations.")
  }
}

// ── Checklists ───────────────────────────────────────────────

export async function createHkTemplate(fd: FormData): Promise<Result> {
  await requireAdmin()
  try {
    const locationId = str(fd, "locationId")
    const title = str(fd, "title")
    const unitType = str(fd, "unitType") || null
    if (!locationId || !title) throw new Error("Location and title are required.")
    await prisma.hkChecklistTemplate.create({ data: { locationId, title, unitType } })
    revalidatePath("/hk-admin/checklists")
    return { success: true, message: "Template added" }
  } catch (e) {
    return fail(e, "Could not add the template.")
  }
}

export async function setHkTemplateActive(id: string, isActive: boolean): Promise<Result> {
  await requireAdmin()
  try {
    await prisma.hkChecklistTemplate.update({ where: { id }, data: { isActive } })
    revalidatePath("/hk-admin/checklists")
    return { success: true, message: isActive ? "Template activated" : "Template deactivated" }
  } catch (e) {
    return fail(e, "Could not update the template.")
  }
}

export async function createHkArea(templateId: string, fd: FormData): Promise<Result> {
  await requireAdmin()
  try {
    const title = str(fd, "title")
    const instructions = str(fd, "instructions") || null
    const minPhotos = Math.round(Number(str(fd, "minPhotos") || 1))
    const requiresVideo = fd.get("requiresVideo") === "on"
    if (!title) throw new Error("Area name is required.")
    if (!Number.isFinite(minPhotos) || minPhotos < 0 || minPhotos > 10) throw new Error("Photos must be 0 to 10.")
    if (!requiresVideo && minPhotos === 0) throw new Error("An area needs at least one photo or a video.")

    let referenceMedia: ReferenceMedia[] = []
    const raw = str(fd, "referenceMedia")
    if (raw) {
      referenceMedia = parseReferenceMedia(JSON.parse(raw))
      if (referenceMedia.some((m) => !isOwnedMediaUrl(m.url, REFERENCE_PREFIX))) {
        throw new Error("Reference media must be uploaded through this app.")
      }
    }

    const last = await prisma.hkChecklistArea.findFirst({
      where: { templateId },
      orderBy: { sortOrder: "desc" },
      select: { sortOrder: true },
    })
    await prisma.hkChecklistArea.create({
      data: { templateId, title, instructions, minPhotos, requiresVideo, referenceMedia, sortOrder: (last?.sortOrder ?? 0) + 1 },
    })
    revalidatePath("/hk-admin/checklists")
    return { success: true, message: "Area added" }
  } catch (e) {
    return fail(e, "Could not add the area.")
  }
}

export async function updateHkAreaOrder(areaId: string, fd: FormData): Promise<Result> {
  await requireAdmin()
  try {
    const sortOrder = Math.round(Number(str(fd, "sortOrder")))
    if (!Number.isFinite(sortOrder)) throw new Error("Order must be a number.")
    await prisma.hkChecklistArea.update({ where: { id: areaId }, data: { sortOrder } })
    revalidatePath("/hk-admin/checklists")
    return { success: true, message: "Order saved" }
  } catch (e) {
    return fail(e, "Could not save the order.")
  }
}

export async function deleteHkArea(areaId: string): Promise<Result> {
  await requireAdmin()
  try {
    const used = await prisma.hkSubmission.count({ where: { areaId } })
    if (used > 0) throw new Error("This area already has submitted proof, so it can't be deleted.")
    await prisma.hkChecklistArea.delete({ where: { id: areaId } })
    revalidatePath("/hk-admin/checklists")
    return { success: true, message: "Area deleted" }
  } catch (e) {
    return fail(e, "Could not delete the area.")
  }
}
