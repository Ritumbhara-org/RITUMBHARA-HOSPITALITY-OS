import Link from "next/link"
import { requireHkAdmin } from "@/lib/hk/session"
import { SignOutButton } from "@/components/hk/sign-out-button"

export const dynamic = "force-dynamic"

const nav = [
  { href: "/hk-admin", label: "Overview" },
  { href: "/hk-admin/locations", label: "Locations" },
  { href: "/hk-admin/housekeepers", label: "Housekeepers" },
  { href: "/hk-admin/checklists", label: "Checklists" },
]

export default async function HkAdminLayout({ children }: { children: React.ReactNode }) {
  await requireHkAdmin()
  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 p-4 sm:p-6">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b pb-3">
        <nav className="flex flex-wrap gap-4 text-sm font-medium">
          {nav.map((n) => (
            <Link key={n.href} href={n.href} className="hover:underline">
              {n.label}
            </Link>
          ))}
        </nav>
        <SignOutButton to="/hk-admin/login" />
      </header>
      {children}
    </div>
  )
}
