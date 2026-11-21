"use client"

import { useActionState } from "react"
import { hkLoginAction, type HkLoginState } from "@/app/actions/hk-auth"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

export function HkLoginForm() {
  const [state, formAction, pending] = useActionState<HkLoginState, FormData>(hkLoginAction, { error: null })
  return (
    <form action={formAction} className="space-y-4">
      {state.error && (
        <div role="alert" className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
          {state.error}
        </div>
      )}
      <div className="space-y-1.5">
        <Label htmlFor="mobile">Mobile number</Label>
        <Input id="mobile" name="mobile" type="tel" inputMode="tel" autoComplete="username" defaultValue={state.mobile ?? ""} required />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="pin">PIN</Label>
        <Input id="pin" name="pin" type="password" inputMode="numeric" autoComplete="current-password" maxLength={6} required />
      </div>
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Signing in..." : "Sign in"}
      </Button>
    </form>
  )
}
