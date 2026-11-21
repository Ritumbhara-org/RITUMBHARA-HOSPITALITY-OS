import { NextResponse } from "next/server"
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client"
import { HkAuthError, assertHk, assertHkAdmin } from "@/lib/hk/session"
import {
  ALLOWED_MEDIA_TYPES,
  MAX_VIDEO_BYTES,
  REFERENCE_PREFIX,
  isPathAllowed,
  proofPrefix,
} from "@/lib/hk/media"

// Issues short-lived client upload tokens. Files go straight from the phone
// to Blob storage, so large videos never pass through a serverless function.
// Who may write where:
//   admin        -> hk/reference/...
//   housekeeper  -> hk/turnover/<their own id>/...

export async function POST(request: Request) {
  const body = (await request.json()) as HandleUploadBody

  try {
    const result = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname) => {
        if (isPathAllowed(pathname, REFERENCE_PREFIX)) {
          await assertHkAdmin()
        } else {
          const hk = await assertHk()
          if (!isPathAllowed(pathname, proofPrefix(hk.id))) throw new Error("Upload path not allowed")
        }
        return {
          allowedContentTypes: ALLOWED_MEDIA_TYPES,
          maximumSizeInBytes: MAX_VIDEO_BYTES,
          addRandomSuffix: true,
        }
      },
    })
    return NextResponse.json(result)
  } catch (error) {
    const message = error instanceof Error ? error.message : "Upload failed"
    const status = error instanceof HkAuthError ? 401 : 400
    return NextResponse.json({ error: message }, { status })
  }
}
