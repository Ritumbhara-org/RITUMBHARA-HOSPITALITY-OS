"use client"

import { hkLogoutAction } from "@/app/actions/hk-auth"
import { Button } from "@/components/ui/button"

export function HkSignOutButton() {
  return (
    <form action={hkLogoutAction}>
      <Button type="submit" variant="outline" size="sm">साइन आउट</Button>
    </form>
  )
}
