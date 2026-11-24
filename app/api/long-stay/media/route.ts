// Streams a private Long Stays file (ID copy, check-in/out photo or video, signature, signed PDF). Admin only.
// Range requests are passed through so phone videos can be scrubbed.

import { NextResponse, type NextRequest } from "next/server"
import { get } from "@/lib/long-stay/blob"
import { adminApiGuard } from "@/lib/auth/guard"
import { isLongStayPath } from "@/lib/long-stay/shared"

export async function GET(request: NextRequest) {
  const denied = await adminApiGuard()
  if (denied) return denied

  const path = request.nextUrl.searchParams.get("path") ?? ""
  if (!isLongStayPath(path)) return NextResponse.json({ error: "Invalid path" }, { status: 400 })

  try {
    const range = request.headers.get("range")
    const file = await get(path, { access: "private", ...(range ? { headers: { range } } : {}) })
    if (!file || file.statusCode !== 200) return NextResponse.json({ error: "Not found" }, { status: 404 })

    const out = new Headers({
      "Content-Type": file.blob.contentType || "application/octet-stream",
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Accept-Ranges": "bytes",
    })
    const len = file.headers.get("content-length")
    const contentRange = file.headers.get("content-range")
    if (len) out.set("Content-Length", len)
    if (contentRange) out.set("Content-Range", contentRange)
    const name = path.split("/").pop() || "file"
    const download = request.nextUrl.searchParams.get("download") === "1"
    out.set("Content-Disposition", `${download ? "attachment" : "inline"}; filename="${name.replace(/"/g, "")}"`)
    return new Response(file.stream, { status: contentRange ? 206 : 200, headers: out })
  } catch (err) {
    console.error("[Long Stay] media read failed", err)
    return NextResponse.json({ error: "Couldn't load the file" }, { status: 502 })
  }
}
