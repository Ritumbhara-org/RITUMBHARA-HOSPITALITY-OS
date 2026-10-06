import { Sidebar } from "@/components/layout/sidebar"
import { Topbar } from "@/components/layout/topbar"
import { getSession } from "@/app/actions/auth"

export const dynamic = 'force-dynamic'
export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await getSession();

  return (
    <div className="flex h-[100dvh] overflow-hidden w-full flex-col bg-muted/30">
      <div className="flex flex-col flex-1 sm:gap-4 sm:py-4 sm:pl-64 h-full">
        <aside className="fixed inset-y-0 left-0 z-10 hidden w-64 flex-col sm:flex">
          <Sidebar />
        </aside>
        <Topbar user={session?.user} />
        <main className="flex-1 flex flex-col overflow-y-auto overflow-x-hidden gap-4 p-4 sm:px-6 sm:py-0 md:gap-8 w-full">
          {children}
        </main>
      </div>
    </div>
  )
}
