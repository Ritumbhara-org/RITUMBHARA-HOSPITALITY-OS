import Link from "next/link"
import { requireAdminPage } from "@/lib/auth/guard"

export default async function HkAdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdminPage("/hk-admin")
  const links = [
    { href: "/hk-admin", label: "Overview" },
    { href: "/hk-admin/locations", label: "Locations" },
    { href: "/hk-admin/housekeepers", label: "Housekeepers" },
    { href: "/hk-admin/checklists", label: "Checklists" },
  ]
  return (
    <div className="space-y-4">
      <nav className="flex flex-wrap gap-2 text-sm" aria-label="Housekeeping">
        {links.map((l) => (
          <Link key={l.href} href={l.href} className="rounded-md border px-3 py-1.5 hover:bg-muted/40">
            {l.label}
          </Link>
        ))}
      </nav>
      {children}
    </div>
  )
}
