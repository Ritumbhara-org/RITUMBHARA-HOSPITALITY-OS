// Web app manifest for the housekeeping app. Public (installing needs it before sign-in); holds no data.
import { hkManifest } from "@/lib/pwa/manifest"

export const dynamic = "force-static"

export function GET() {
  return new Response(JSON.stringify(hkManifest()), {
    headers: { "Content-Type": "application/manifest+json", "Cache-Control": "public, max-age=3600" },
  })
}
