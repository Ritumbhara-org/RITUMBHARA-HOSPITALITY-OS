"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { upload } from "@vercel/blob/client"
import { Button } from "@/components/ui/button"
import { tryFix } from "./geolocation"
import { recordSubmission } from "@/app/actions/hk"

// Live camera only. There is deliberately no file picker, so proof cannot be
// an old photo or video from the gallery. Photos and videos are taken here,
// uploaded straight to storage, then recorded against the turnover.

const MAX_RECORD_SECONDS = 60

type Phase = "idle" | "preview" | "recording" | "uploading"

function pickVideoMime(): string {
  const options = ["video/mp4;codecs=avc1.42E01E,mp4a.40.2", "video/mp4", "video/webm;codecs=vp8,opus", "video/webm"]
  return options.find((m) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(m)) ?? ""
}

async function uploadWithRetry(path: string, blob: Blob, contentType: string) {
  let lastError: unknown
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await upload(path, blob, { access: "public", handleUploadUrl: "/api/hk/upload", contentType })
    } catch (e) {
      lastError = e
      await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt))
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Upload failed")
}

export function LiveCapture({
  turnoverId,
  areaId,
  hkUserId,
  mode,
}: {
  turnoverId: string
  areaId: string
  hkUserId: string
  mode: "PHOTO" | "VIDEO"
}) {
  const router = useRouter()
  const [phase, setPhase] = useState<Phase>("idle")
  const [seconds, setSeconds] = useState(0)
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const startedAtRef = useRef(0)
  const mimeRef = useRef("")

  const stopStream = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current)
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
  }, [])

  useEffect(() => stopStream, [stopStream])

  useEffect(() => {
    if ((phase === "preview" || phase === "recording") && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current
    }
  }, [phase])

  async function openCamera() {
    if (!navigator.mediaDevices?.getUserMedia) {
      toast.error("Camera is not available here. Open this page in Chrome or Safari.")
      return
    }
    try {
      streamRef.current = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: mode === "VIDEO",
      })
      setPhase("preview")
    } catch {
      toast.error("Camera is blocked. Allow camera access for this site in your browser settings.")
    }
  }

  function cancel() {
    stopStream()
    setPhase("idle")
  }

  async function finish(blob: Blob, mime: string, durationSec: number | null) {
    const capturedAt = new Date().toISOString()
    stopStream()
    setPhase("uploading")
    try {
      const fix = await tryFix()
      const ext = mime.split("/")[1] === "quicktime" ? "mov" : mime.split("/")[1]
      const path = `hk/turnover/${hkUserId}/${turnoverId}-${areaId}-${Date.now()}.${ext}`
      const stored = await uploadWithRetry(path, blob, mime)
      const res = await recordSubmission(turnoverId, {
        areaId,
        mediaUrl: stored.url,
        mimeType: mime,
        sizeBytes: blob.size,
        durationSec,
        capturedAt,
        fix,
      })
      if (res.success) {
        toast.success(mode === "VIDEO" ? "Video saved" : "Photo saved")
        router.refresh()
      } else {
        toast.error(res.error)
      }
    } catch (e) {
      toast.error(e instanceof Error ? `Upload failed: ${e.message}` : "Upload failed. Check your network and try again.")
    } finally {
      setPhase("idle")
    }
  }

  function takePhoto() {
    const video = videoRef.current
    if (!video || !video.videoWidth) return
    const canvas = document.createElement("canvas")
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    canvas.getContext("2d")?.drawImage(video, 0, 0)
    canvas.toBlob((blob) => blob && finish(blob, "image/jpeg", null), "image/jpeg", 0.85)
  }

  function startRecording() {
    const stream = streamRef.current
    if (!stream) return
    const mimeType = pickVideoMime()
    if (typeof MediaRecorder === "undefined" || !mimeType) {
      toast.error("This browser cannot record video. Use an updated Chrome or Safari.")
      return
    }
    mimeRef.current = mimeType.split(";")[0]
    chunksRef.current = []
    const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 1_500_000, audioBitsPerSecond: 64_000 })
    recorder.ondataavailable = (e) => e.data.size > 0 && chunksRef.current.push(e.data)
    recorder.onstop = () => {
      const elapsed = Math.round((Date.now() - startedAtRef.current) / 1000)
      finish(new Blob(chunksRef.current, { type: mimeRef.current }), mimeRef.current, elapsed)
    }
    recorderRef.current = recorder
    startedAtRef.current = Date.now()
    setSeconds(0)
    recorder.start(1000)
    setPhase("recording")
    timerRef.current = setInterval(() => {
      const s = Math.round((Date.now() - startedAtRef.current) / 1000)
      setSeconds(s)
      if (s >= MAX_RECORD_SECONDS) stopRecording()
    }, 500)
  }

  function stopRecording() {
    if (timerRef.current) clearInterval(timerRef.current)
    if (recorderRef.current?.state === "recording") recorderRef.current.stop()
  }

  if (phase === "idle") {
    return (
      <Button variant="outline" size="sm" onClick={openCamera}>
        {mode === "VIDEO" ? "Record video" : "Take photo"}
      </Button>
    )
  }

  if (phase === "uploading") return <p className="text-sm text-muted-foreground">Uploading, please wait...</p>

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black">
      <video ref={videoRef} autoPlay playsInline muted className="min-h-0 flex-1 object-cover" />
      <div className="flex items-center justify-center gap-3 p-4">
        {mode === "PHOTO" && (
          <>
            <Button variant="outline" onClick={cancel}>Cancel</Button>
            <Button onClick={takePhoto}>Capture</Button>
          </>
        )}
        {mode === "VIDEO" && phase === "preview" && (
          <>
            <Button variant="outline" onClick={cancel}>Cancel</Button>
            <Button onClick={startRecording}>Start recording</Button>
          </>
        )}
        {mode === "VIDEO" && phase === "recording" && (
          <>
            <span className="text-sm text-white">
              Recording {seconds}s / {MAX_RECORD_SECONDS}s
            </span>
            <Button variant="destructive" onClick={stopRecording}>Stop and save</Button>
          </>
        )}
      </div>
    </div>
  )
}
