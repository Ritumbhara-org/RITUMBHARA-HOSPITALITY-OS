import { requireHk } from "@/lib/hk/session"
import { HkSignOutButton } from "@/components/hk/sign-out-button"

import { HK_MANIFEST_PATH } from "@/lib/pwa/manifest"

export const metadata = { manifest: HK_MANIFEST_PATH }
export const dynamic = "force-dynamic"

export default async function HkAppLayout({ children }: { children: React.ReactNode }) {
  const hk = await requireHk()
  return (
    <div className="mx-auto min-h-[100dvh] w-full max-w-xl p-4">
      <header className="mb-4 flex items-center justify-between">
        <div>
          <p className="text-xs text-muted-foreground">Housekeeping</p>
          <p className="font-semibold">{hk.name}</p>
        </div>
        <HkSignOutButton />
      </header>
      {children}
    </div>
  )
}
