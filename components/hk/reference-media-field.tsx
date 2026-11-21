"use client"

import { useState } from "react"
import { upload } from "@vercel/blob/client"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { kindFromMime, type ReferenceMedia } from "@/lib/hk/media"

// Uploads reference photos or videos straight to Blob storage and puts the
// resulting URLs in a hidden field, so the area form can save them.
export function ReferenceMediaField() {
  const [items, setItems] = useState<ReferenceMedia[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    if (!files.length) return
    setBusy(true)
    setError("")
    try {
      const added: ReferenceMedia[] = []
      for (const file of files) {
        const kind = kindFromMime(file.type)
        if (!kind) throw new Error(`${file.name}: only photos and videos are allowed`)
        const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, "_")
        const blob = await upload(`hk/reference/${Date.now()}-${safe}`, file, {
          access: "public",
          handleUploadUrl: "/api/hk/upload",
          contentType: file.type,
        })
        added.push({ url: blob.url, kind })
      }
      setItems((prev) => [...prev, ...added])
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed")
    } finally {
      setBusy(false)
      e.target.value = ""
    }
  }

  return (
    <div className="space-y-2">
      <Label htmlFor="ref-media">Reference photos or videos (what done looks like)</Label>
      <Input id="ref-media" type="file" accept="image/*,video/*" multiple onChange={onPick} disabled={busy} />
      <input type="hidden" name="referenceMedia" value={JSON.stringify(items)} />
      {busy && <p className="text-xs text-muted-foreground">Uploading...</p>}
      {error && <p className="text-xs text-red-600">{error}</p>}
      {items.length > 0 && (
        <p className="text-xs text-muted-foreground">
          {items.length} file(s) ready. They are saved when you add the area.
        </p>
      )}
    </div>
  )
}
