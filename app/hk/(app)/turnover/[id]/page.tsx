import { notFound } from "next/navigation"
import Link from "next/link"
import { prisma } from "@/lib/prisma"
import { requireHk } from "@/lib/hk/session"
import { parseReferenceMedia } from "@/lib/hk/media"
import { areasForUnit } from "@/lib/hk/checklist"
import { TurnoverRunner } from "@/components/hk/turnover-runner"

export const metadata = { title: "सफ़ाई" }

export default async function TurnoverPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const hk = await requireHk()

  const turnover = await prisma.hkTurnover.findFirst({
    where: { id, hkUserId: hk.id },
    include: {
      unit: { select: { name: true } },
      location: { select: { name: true } },
      template: { include: { areas: { orderBy: { sortOrder: "asc" } } } },
      submissions: { orderBy: { receivedAt: "asc" } },
    },
  })
  if (!turnover) notFound()

  const areas = areasForUnit(turnover.template.areas, turnover.unitId).map((a) => ({
    id: a.id,
    title: a.title,
    instructions: a.instructions,
    minPhotos: a.minPhotos,
    requiresVideo: a.requiresVideo,
    referenceMedia: parseReferenceMedia(a.referenceMedia),
    submissions: turnover.submissions
      .filter((s) => s.areaId === a.id)
      .map((s) => ({ id: s.id, kind: s.kind, mediaUrl: s.mediaUrl })),
  }))

  return (
    <div className="space-y-4">
      <div>
        <Link href="/hk" className="text-xs underline">
          पीछे
        </Link>
        <h1 className="text-lg font-bold">{turnover.unit.name}</h1>
        <p className="text-xs text-muted-foreground">
          {turnover.location.name} · चेक-इन {turnover.checkInAt.toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit" })}
        </p>
        {turnover.status !== "IN_PROGRESS" && <p className="mt-1 text-sm font-medium">यह सफ़ाई जमा हो चुकी है।</p>}
      </div>
      <TurnoverRunner turnoverId={turnover.id} hkUserId={hk.id} areas={areas} readOnly={turnover.status !== "IN_PROGRESS"} />
    </div>
  )
}
