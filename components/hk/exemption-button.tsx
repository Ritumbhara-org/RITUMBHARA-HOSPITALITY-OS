"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { raiseExemption } from "@/app/actions/hk"

// "Guest already present": ask the manager to excuse this unit for today.
export function ExemptionButton({ locationId, unitId }: { locationId: string; unitId: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState("")
  const [pending, start] = useTransition()

  if (!open) {
    return (
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        Guest present
      </Button>
    )
  }
  return (
    <div className="w-full space-y-2 pt-2">
      <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} maxLength={500} placeholder="e.g. Guest is still inside, checkout is late" />
      <div className="flex gap-2">
        <Button
          size="sm"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const res = await raiseExemption(locationId, unitId, reason)
              if (res.success) {
                toast.success("Sent to your manager")
                setOpen(false)
                setReason("")
                router.refresh()
              } else toast.error(res.error)
            })
          }
        >
          {pending ? "Sending..." : "Send request"}
        </Button>
        <Button size="sm" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
      </div>
    </div>
  )
}
