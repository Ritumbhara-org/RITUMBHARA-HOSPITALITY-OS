"use client"

import { useTransition } from "react"
import { DropdownMenuItem } from "@/components/ui/dropdown-menu"
import { logoutAction } from "@/app/actions/auth"
import { useTr } from "@/components/i18n/language-provider"

// Signs the admin out: the server removes the session cookie and redirects to /login.
export function LogoutMenuItem() {
  const [pending, startTransition] = useTransition()
  const tr = useTr()
  return (
    <DropdownMenuItem
      className="text-destructive focus:text-destructive"
      disabled={pending}
      onClick={() => startTransition(() => logoutAction())}
    >
      {pending ? tr("Signing out…") : tr("Logout")}
    </DropdownMenuItem>
  )
}
