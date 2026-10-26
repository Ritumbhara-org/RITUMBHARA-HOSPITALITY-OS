"use client"

import { useEffect, useRef, useState } from "react"
import { upload } from "@vercel/blob/client"
import { toast } from "sonner"
import { Camera, FileText, Loader2, Trash2, Upload } from "lucide-react"
import { attachLongStayMedia, deleteLongStayMedia } from "@/app/actions/long-stay"
import { MAX_UPLOAD_BYTES, mediaPrefix, mediaType, mediaUrl, type MediaKind } from "@/lib/long-stay/shared"
import { useTr } from "@/components/i18n/language-provider"

interface Progress {
  key: string
  name: string
  percent: number
}

const MULTIPART_FROM = 20 * 1024 * 1024

const EXT_FOR_TYPE: Record<string, string> = {
  "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/heic": "heic", "image/heif": "heif", "image/gif": "gif",
  "video/mp4": "mp4", "video/quicktime": "mov", "video/webm": "webm", "video/3gpp": "3gp", "video/x-m4v": "m4v", "application/pdf": "pdf",
}

function safeFileName(name: string, type: string): string {
  const dot = name.lastIndexOf(".")
  const ext = (dot > 0 ? name.slice(dot + 1).toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 8) : "") || EXT_FOR_TYPE[type] || ""
  const base = (dot > 0 ? name.slice(0, dot) : name).replace(/[^A-Za-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "file"
  return ext ? `${base}.${ext}` : base
}

export function MediaUploader({
  bookingId,
  kind,
  paths,
  onChange,
  saved,
  accept,
  label,
  hint,
}: {
  bookingId: string
  kind: MediaKind
  paths: string[]
  onChange: (next: string[]) => void
  saved: boolean // booking already exists, so uploads are recorded right away
  accept: string
  label: string
  hint?: string
}) {
  const tr = useTr()
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploads, setUploads] = useState<Progress[]>([])
  const [deleting, setDeleting] = useState<string | null>(null)
  // Keep the latest list for uploads that finish one after another.
  const latest = useRef(paths)
  const counter = useRef(0)
  useEffect(() => {
    latest.current = paths
  }, [paths])

  const add = (path: string) => {
    const next = Array.from(new Set([...latest.current, path]))
    latest.current = next
    onChange(next)
  }

  async function handleFiles(files: FileList | null) {
    if (!files?.length) return
    const list = Array.from(files)
    for (const file of list) {
      if (file.size > MAX_UPLOAD_BYTES) {
        toast.error(`${file.name} is larger than 500 MB`)
        continue
      }
      const key = `${file.name}-${file.size}-${++counter.current}`
      setUploads((u) => [...u, { key, name: file.name, percent: 0 }])
      try {
        const blob = await upload(mediaPrefix(bookingId, kind) + safeFileName(file.name, file.type), file, {
          access: "private",
          handleUploadUrl: "/api/long-stay/upload",
          multipart: file.size > MULTIPART_FROM,
          contentType: file.type || undefined,
          onUploadProgress: ({ percentage }) => setUploads((u) => u.map((x) => (x.key === key ? { ...x, percent: Math.round(percentage) } : x))),
        })
        add(blob.pathname)
        if (saved) {
          const r = await attachLongStayMedia(bookingId, kind, [blob.pathname])
          if (!r.success) toast.error(tr("Uploaded, but couldn't record it on the booking. Press Save."))
        }
      } catch (err) {
        toast.error(`Couldn't upload ${file.name}`, { description: err instanceof Error ? err.message : undefined })
      } finally {
        setUploads((u) => u.filter((x) => x.key !== key))
      }
    }
    if (inputRef.current) inputRef.current.value = ""
  }

  async function remove(path: string) {
    if (!window.confirm("Delete this file? This can't be undone.")) return
    setDeleting(path)
    const r = await deleteLongStayMedia(bookingId, kind, path)
    setDeleting(null)
    if (!r.success) {
      toast.error(tr("Couldn't delete the file"), { description: r.error })
      return
    }
    const next = latest.current.filter((p) => p !== path)
    latest.current = next
    onChange(next)
    toast.success(tr("File deleted"))
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-medium">{tr(label)}</p>
          {hint && <p className="text-xs text-muted-foreground">{typeof hint === "string" ? tr(hint) : hint}</p>}
        </div>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="inline-flex items-center gap-2 rounded-xl border border-border/60 bg-background px-3 py-2 text-sm font-medium shadow-sm hover:bg-muted"
        >
          {kind === "id" ? <Upload className="h-4 w-4" /> : <Camera className="h-4 w-4" />}
          {kind === "id" ? tr("Upload") : tr("Add photos / videos")}
        </button>
        <input ref={inputRef} type="file" multiple accept={accept} className="hidden" onChange={(e) => handleFiles(e.target.files)} />
      </div>

      {(paths.length > 0 || uploads.length > 0) && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {paths.map((p) => (
            <MediaTile key={p} path={p} deleting={deleting === p} onDelete={() => remove(p)} />
          ))}
          {uploads.map((u) => (
            <div key={u.key} className="aspect-square rounded-xl border border-dashed bg-muted/40 flex flex-col items-center justify-center gap-2 p-2 text-center">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              <span className="text-[11px] text-muted-foreground line-clamp-2 break-all">{u.name}</span>
              <div className="h-1.5 w-4/5 rounded-full bg-muted overflow-hidden">
                <div className="h-full bg-primary transition-all" style={{ width: `${u.percent}%` }} />
              </div>
            </div>
          ))}
        </div>
      )}
      {paths.length === 0 && uploads.length === 0 && (
        <p className="text-xs text-muted-foreground rounded-xl border border-dashed px-3 py-4 text-center">{tr("No files yet.")}</p>
      )}
    </div>
  )
}

function MediaTile({ path, deleting, onDelete }: { path: string; deleting: boolean; onDelete: () => void }) {
  const tr = useTr()
  const type = mediaType(path)
  const name = path.split("/").pop() ?? path
  return (
    <div className="group relative aspect-square overflow-hidden rounded-xl border bg-muted/30">
      {type === "image" && (
        <a href={mediaUrl(path)} target="_blank" rel="noreferrer">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={mediaUrl(path)} alt={name} loading="lazy" className="h-full w-full object-cover" />
        </a>
      )}
      {type === "video" && <video src={mediaUrl(path)} controls preload="metadata" playsInline className="h-full w-full object-cover bg-black" />}
      {(type === "pdf" || type === "file") && (
        <a href={mediaUrl(path)} target="_blank" rel="noreferrer" className="flex h-full w-full flex-col items-center justify-center gap-2 p-2 text-center">
          <FileText className="h-8 w-8 text-muted-foreground" />
          <span className="text-[11px] text-muted-foreground line-clamp-2 break-all">{name}</span>
        </a>
      )}
      <button
        type="button"
        onClick={onDelete}
        disabled={deleting}
        aria-label={tr("Delete file")}
        className="absolute top-1.5 right-1.5 inline-flex h-8 w-8 items-center justify-center rounded-lg bg-black/60 text-white opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity hover:bg-black/75 disabled:opacity-100"
      >
        {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
      </button>
    </div>
  )
}
