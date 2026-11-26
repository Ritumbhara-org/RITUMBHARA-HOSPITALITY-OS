"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { getFix } from "./geolocation"
import { startTurnover } from "@/app/actions/hk"

export function StartTurnoverButton({ locationId, unitId, resume }: { locationId: string; unitId: string; resume: boolean }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)

  async function go() {
    setBusy(true)
    try {
      const fix = await getFix()
      const res = await startTurnover(locationId, unitId, fix)
      if (res.success) router.push(`/hk/turnover/${res.turnoverId}`)
      else toast.error(res.error)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "चेक-इन नहीं हो सका।")
    } finally {
      setBusy(false)
    }
  }

  return (
    <Button size="sm" onClick={go} disabled={busy}>
      {busy ? "लोकेशन जांच रहे हैं..." : resume ? "जारी रखें" : "चेक-इन"}
    </Button>
  )
}
