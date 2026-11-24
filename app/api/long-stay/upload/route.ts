// Issues Vercel Blob client-upload tokens for Long Stays files. Admin only.
// The browser uploads straight to Vercel Blob (private); this route only approves the path, type and size.

import { NextResponse } from "next/server"
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client"
import { adminApiGuard } from "@/lib/auth/guard"
import { MAX_UPLOAD_BYTES, parseUploadPath } from "@/lib/long-stay/shared"

const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif", "image/gif"]
const VIDEO_TYPES = ["video/mp4", "video/quicktime", "video/webm", "video/3gpp", "video/x-m4v"]

export async function POST(request: Request) {
  const denied = await adminApiGuard()
  if (denied) return denied

  let body: HandleUploadBody
  try {
    body = (await request.json()) as HandleUploadBody
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 })
  }

  try {
    const result = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname) => {
        const parsed = parseUploadPath(pathname)
        if (!parsed) throw new Error("Uploads must go under long-stay/<booking>/<id|checkin|checkout>/")
        return {
          allowedContentTypes: parsed.kind === "id" ? [...IMAGE_TYPES, "application/pdf"] : [...IMAGE_TYPES, ...VIDEO_TYPES],
          maximumSizeInBytes: MAX_UPLOAD_BYTES,
          addRandomSuffix: true,
        }
      },
    })
    return NextResponse.json(result)
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Upload refused" }, { status: 400 })
  }
}
