import { HkLoginForm } from "@/components/hk/login-form"

import { HK_MANIFEST_PATH } from "@/lib/pwa/manifest"

export const metadata = { title: "Housekeeping sign in", manifest: HK_MANIFEST_PATH }

export default function HkLoginPage() {
  return (
    <main className="mx-auto flex min-h-[100dvh] w-full max-w-sm flex-col justify-center gap-6 p-6">
      <div>
        <h1 className="text-2xl font-bold">Housekeeping</h1>
        <p className="text-sm text-muted-foreground">Sign in with your mobile number and PIN.</p>
      </div>
      <HkLoginForm />
    </main>
  )
}
