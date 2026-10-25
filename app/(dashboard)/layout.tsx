import { Sidebar } from "@/components/layout/sidebar"
import { Topbar } from "@/components/layout/topbar"
import { requireAdminPage } from "@/lib/auth/guard"
import type { Metadata } from "next"
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
  return (
    <div className="flex h-[100dvh] overflow-hidden w-full flex-col bg-muted/30">
      <div className="flex flex-col flex-1 sm:gap-4 sm:py-4 sm:pl-64 h-full">
        <aside className="fixed inset-y-0 left-0 z-10 hidden w-64 flex-col sm:flex">
          <Sidebar />
        </aside>
        <Topbar />
        <InstallAppBanner />
        <main className="flex-1 flex flex-col overflow-y-auto overflow-x-hidden gap-4 p-4 sm:px-6 sm:py-0 md:gap-8 w-full">
          {children}
        </main>
      </div>
    </div>
  )
}
