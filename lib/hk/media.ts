// Rules for media uploaded to Vercel Blob by the housekeeping module.
//   Admin reference media:  hk/reference/<file>
//   Housekeeper proof:      hk/turnover/<hkUserId>/<file>

export const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"]
export const ALLOWED_VIDEO_TYPES = ["video/webm", "video/mp4", "video/quicktime"]
export const ALLOWED_MEDIA_TYPES = [...ALLOWED_IMAGE_TYPES, ...ALLOWED_VIDEO_TYPES]

export const MAX_IMAGE_BYTES = 15 * 1024 * 1024
export const MAX_VIDEO_BYTES = 150 * 1024 * 1024
export const MAX_VIDEO_SECONDS = 90

export const REFERENCE_PREFIX = "hk/reference/"
export const proofPrefix = (hkUserId: string) => `hk/turnover/${hkUserId}/`

export function isPathAllowed(pathname: string, prefix: string): boolean {
  if (!pathname.startsWith(prefix)) return false
  const rest = pathname.slice(prefix.length)
  return rest.length > 0 && !rest.includes("..") && !rest.includes("//")
}

// A media URL we will accept in the database: https, a Vercel Blob host,
// and a path under the expected prefix. Stops a client from saving an
// arbitrary external URL as "proof".
export function isOwnedMediaUrl(url: string, prefix: string): boolean {
  try {
    const u = new URL(url)
    if (u.protocol !== "https:") return false
    if (!u.hostname.endsWith(".blob.vercel-storage.com")) return false
    return isPathAllowed(decodeURIComponent(u.pathname).replace(/^\//, ""), prefix)
  } catch {
    return false
  }
}

export function kindFromMime(mime: string): "PHOTO" | "VIDEO" | null {
  if (ALLOWED_IMAGE_TYPES.includes(mime)) return "PHOTO"
  if (ALLOWED_VIDEO_TYPES.includes(mime)) return "VIDEO"
  return null
}

export type ReferenceMedia = { url: string; kind: "PHOTO" | "VIDEO" }

export function parseReferenceMedia(value: unknown): ReferenceMedia[] {
  if (!Array.isArray(value)) return []
  return value.filter(
    (m): m is ReferenceMedia =>
      !!m && typeof m === "object" && typeof (m as ReferenceMedia).url === "string" &&
      ((m as ReferenceMedia).kind === "PHOTO" || (m as ReferenceMedia).kind === "VIDEO")
  )
}
