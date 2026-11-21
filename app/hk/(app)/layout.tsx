import Link from "next/link"
import { requireHk } from "@/lib/hk/session"
import { SignOutButton } from "@/components/hk/sign-out-button"

export const dynamic = "force-dynamic"

export default async function HkLayout({ children }: { children: React.ReactNode }) {
  const hk = await requireHk()
  return (
    <div className="mx-auto w-full max-w-md space-y-4 p-4">
      <header className="flex items-center justify-between border-b pb-3">
        <Link href="/hk" className="font-semibold">
          {hk.name}
        </Link>
        <SignOutButton to="/hk/login" />
      </header>
      {children}
    </div>
  )
}
