import { requireAdminPage } from "@/lib/auth/guard"
import type { Metadata } from "next"
import { AppShell } from "@/components/layout/app-shell"
import { InstallAppBanner } from "@/components/pwa/install-app-banner"
import { MANIFEST_PATH } from "@/lib/pwa/manifest"

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { manifest: MANIFEST_PATH }
export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // Every OS page is admin-only. Each page and server action also checks on its own.
  await requireAdminPage()
  return <AppShell banner={<InstallAppBanner />}>{children}</AppShell>
}
