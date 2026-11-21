// Pure rules for a turnover: which template applies, whether proof is
// complete, and whether a capture timestamp is believable.

export type TemplateLite = { id: string; unitType: string | null; isActive: boolean }

// Prefer a template made for this unit type; otherwise one with no unit type.
export function pickTemplate<T extends TemplateLite>(templates: T[], unitType: string): T | null {
  const active = templates.filter((t) => t.isActive)
  const wanted = unitType.trim().toLowerCase()
  const exact = active.find((t) => t.unitType && t.unitType.trim().toLowerCase() === wanted)
  if (exact) return exact
  return active.find((t) => !t.unitType) ?? null
}

export type AreaLite = { id: string; title: string; minPhotos: number; requiresVideo: boolean }
export type SubmissionLite = { areaId: string; kind: "PHOTO" | "VIDEO" }

export type Missing = { areaId: string; title: string; needPhotos: number; needVideo: boolean }

export function missingRequirements(areas: AreaLite[], submissions: SubmissionLite[]): Missing[] {
  const out: Missing[] = []
  for (const a of areas) {
    const subs = submissions.filter((s) => s.areaId === a.id)
    const photos = subs.filter((s) => s.kind === "PHOTO").length
    const hasVideo = subs.some((s) => s.kind === "VIDEO")
    const needPhotos = Math.max(0, a.minPhotos - photos)
    const needVideo = a.requiresVideo && !hasVideo
    if (needPhotos > 0 || needVideo) out.push({ areaId: a.id, title: a.title, needPhotos, needVideo })
  }
  return out
}

const CLOCK_SKEW_MS = 5 * 60_000

// Proof must be captured after check-in (small allowance for clock drift)
// and cannot be from the future. This blocks reusing older footage.
export function isCaptureTimeValid(capturedAt: Date, checkInAt: Date, now: Date = new Date()): boolean {
  if (Number.isNaN(capturedAt.getTime())) return false
  if (capturedAt.getTime() > now.getTime() + CLOCK_SKEW_MS) return false
  if (capturedAt.getTime() < checkInAt.getTime() - CLOCK_SKEW_MS) return false
  return true
}
