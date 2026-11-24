// Web app manifest for installing Ritumbhara OS. Public (installing needs it before sign-in); holds no data.
import { osManifest } from "@/lib/pwa/manifest"

export const dynamic = "force-static"

export function GET() {
  return new Response(JSON.stringify(osManifest()), {
    headers: { "Content-Type": "application/manifest+json", "Cache-Control": "public, max-age=3600" },
  })
}
