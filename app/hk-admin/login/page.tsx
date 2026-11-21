import { AdminLoginForm } from "@/components/hk/login-form"

export const metadata = { title: "Housekeeping admin sign in" }

export default function HkAdminLoginPage() {
  return (
    <main className="mx-auto flex min-h-[100dvh] w-full max-w-sm flex-col justify-center gap-6 p-6">
      <div>
        <h1 className="text-2xl font-bold">Housekeeping admin</h1>
        <p className="text-sm text-muted-foreground">Sign in to manage locations, staff and checklists.</p>
      </div>
      <AdminLoginForm />
    </main>
  )
}
