"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { LiveCapture } from "./live-capture"
import { getFix } from "./geolocation"
import { finishTurnover, removeSubmission } from "@/app/actions/hk"
import type { ReferenceMedia } from "@/lib/hk/media"

export type RunnerArea = {
  id: string
  title: string
  instructions: string | null
  minPhotos: number
  requiresVideo: boolean
  referenceMedia: ReferenceMedia[]
  submissions: { id: string; kind: "PHOTO" | "VIDEO"; mediaUrl: string }[]
}

export function TurnoverRunner({
  turnoverId,
  hkUserId,
  areas,
  readOnly,
}: {
  turnoverId: string
  hkUserId: string
  areas: RunnerArea[]
  readOnly: boolean
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)

  async function submit() {
    setBusy(true)
    try {
      const fix = await getFix()
      const res = await finishTurnover(turnoverId, fix)
      if (res.success) {
        toast.success("Submitted for review")
        router.replace("/hk")
        router.refresh()
      } else {
        toast.error(res.error)
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not submit.")
    } finally {
      setBusy(false)
    }
  }

  async function remove(id: string) {
    const res = await removeSubmission(id)
    if (res.success) router.refresh()
    else toast.error(res.error)
  }

  return (
    <div className="space-y-4">
      {areas.map((a) => {
        const photos = a.submissions.filter((s) => s.kind === "PHOTO")
        const hasVideo = a.submissions.some((s) => s.kind === "VIDEO")
        const done = photos.length >= a.minPhotos && (!a.requiresVideo || hasVideo)
        return (
          <section key={a.id} className="space-y-3 rounded-lg border p-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h2 className="font-semibold">{a.title}</h2>
                <p className="text-xs text-muted-foreground">
                  Photos {photos.length}/{a.minPhotos}
                  {a.requiresVideo ? ` · Video ${hasVideo ? "done" : "needed"}` : ""}
                </p>
              </div>
              <span className={`rounded-full px-2 py-0.5 text-xs ${done ? "bg-green-100 text-green-800" : "bg-amber-100 text-amber-800"}`}>
                {done ? "Done" : "To do"}
              </span>
            </div>

            {a.instructions && <p className="text-sm">{a.instructions}</p>}

            {a.referenceMedia.length > 0 && (
              <div>
                <p className="mb-1 text-xs font-medium text-muted-foreground">How it should look</p>
                <div className="flex gap-2 overflow-x-auto">
                  {a.referenceMedia.map((m) =>
                    m.kind === "PHOTO" ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img key={m.url} src={m.url} alt="" className="h-24 w-24 shrink-0 rounded object-cover" />
                    ) : (
                      <video key={m.url} src={m.url} className="h-24 w-36 shrink-0 rounded object-cover" controls preload="metadata" playsInline />
                    )
                  )}
                </div>
              </div>
            )}

            {a.submissions.length > 0 && (
              <div>
                <p className="mb-1 text-xs font-medium text-muted-foreground">Your proof</p>
                <div className="flex gap-2 overflow-x-auto">
                  {a.submissions.map((s) => (
                    <div key={s.id} className="shrink-0 space-y-1">
                      {s.kind === "PHOTO" ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={s.mediaUrl} alt="" className="h-24 w-24 rounded object-cover" />
                      ) : (
                        <video src={s.mediaUrl} className="h-24 w-36 rounded object-cover" controls preload="metadata" playsInline />
                      )}
                      {!readOnly && (
                        <button className="text-xs text-red-600 underline" onClick={() => remove(s.id)}>
                          Remove
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {!readOnly && (
              <div className="flex gap-2">
                <LiveCapture turnoverId={turnoverId} areaId={a.id} hkUserId={hkUserId} mode="PHOTO" />
                {a.requiresVideo && <LiveCapture turnoverId={turnoverId} areaId={a.id} hkUserId={hkUserId} mode="VIDEO" />}
              </div>
            )}
          </section>
        )
      })}

      {!readOnly && (
        <Button className="w-full" onClick={submit} disabled={busy}>
          {busy ? "Checking location..." : "Finish and submit"}
        </Button>
      )}
    </div>
  )
}
