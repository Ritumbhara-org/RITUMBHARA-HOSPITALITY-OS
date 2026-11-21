"use client"

import { signOut } from "next-auth/react"
import { Button } from "@/components/ui/button"

export function SignOutButton({ to }: { to: string }) {
  return (
    <Button variant="outline" size="sm" onClick={() => signOut({ callbackUrl: to })}>
      Sign out
    </Button>
  )
}
