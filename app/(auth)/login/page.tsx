import { redirect } from "next/navigation"
import { LoginForm } from "@/components/auth/login-form"
import { getAdminSession } from "@/lib/auth/guard"
import { safeNextPath } from "@/lib/auth/session"
import type { Metadata } from "next"
import { MANIFEST_PATH } from "@/lib/pwa/manifest"

export const dynamic = "force-dynamic"
export const metadata: Metadata = { manifest: MANIFEST_PATH }

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string | string[] }> }) {
  const params = await searchParams
  const next = safeNextPath(Array.isArray(params.next) ? params.next[0] : params.next)
  // Already signed in: go straight to the OS.
  if (await getAdminSession()) redirect(next)
  return <LoginForm next={next} />
}
