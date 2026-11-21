"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { signIn } from "next-auth/react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

export function HkLoginForm() {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")

  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault()
        setBusy(true)
        setError("")
        const fd = new FormData(e.currentTarget)
        const res = await signIn("hk", {
          mobile: fd.get("mobile"),
          pin: fd.get("pin"),
          redirect: false,
        })
        setBusy(false)
        if (res?.ok && !res.error) {
          router.replace("/hk")
          router.refresh()
        } else {
          setError("Wrong number or PIN, or the account is locked for a while.")
        }
      }}
    >
      <div className="space-y-1.5">
        <Label htmlFor="mobile">Mobile number</Label>
        <Input id="mobile" name="mobile" type="tel" inputMode="numeric" autoComplete="username" required placeholder="98765 43210" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="pin">PIN</Label>
        <Input id="pin" name="pin" type="password" inputMode="numeric" autoComplete="current-password" required maxLength={6} />
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <Button type="submit" className="w-full" disabled={busy}>
        {busy ? "Signing in..." : "Sign in"}
      </Button>
    </form>
  )
}

export function AdminLoginForm() {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")

  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault()
        setBusy(true)
        setError("")
        const fd = new FormData(e.currentTarget)
        const res = await signIn("hk-admin", {
          email: fd.get("email"),
          password: fd.get("password"),
          redirect: false,
        })
        setBusy(false)
        if (res?.ok && !res.error) {
          router.replace("/hk-admin")
          router.refresh()
        } else {
          setError("Wrong email or password.")
        }
      }}
    >
      <div className="space-y-1.5">
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" autoComplete="username" required />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="password">Password</Label>
        <Input id="password" name="password" type="password" autoComplete="current-password" required />
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <Button type="submit" className="w-full" disabled={busy}>
        {busy ? "Signing in..." : "Sign in"}
      </Button>
    </form>
  )
}
