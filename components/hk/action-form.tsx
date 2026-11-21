"use client"

import { useRef, useTransition } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"

type Result = { success: boolean; error?: string; message?: string }

// A form that calls a server action and shows the result as a toast.
export function ActionForm({
  action,
  submitLabel,
  children,
  className,
  resetOnSuccess = true,
  variant = "default",
}: {
  action: (formData: FormData) => Promise<Result>
  submitLabel: string
  children?: React.ReactNode
  className?: string
  resetOnSuccess?: boolean
  variant?: "default" | "outline" | "destructive"
}) {
  const ref = useRef<HTMLFormElement>(null)
  const [pending, start] = useTransition()

  return (
    <form
      ref={ref}
      className={className}
      onSubmit={(e) => {
        e.preventDefault()
        const fd = new FormData(e.currentTarget)
        start(async () => {
          const res = await action(fd)
          if (res.success) {
            toast.success(res.message ?? "Saved")
            if (resetOnSuccess) ref.current?.reset()
          } else {
            toast.error(res.error ?? "Something went wrong")
          }
        })
      }}
    >
      {children}
      <Button type="submit" variant={variant} disabled={pending}>
        {pending ? "Saving..." : submitLabel}
      </Button>
    </form>
  )
}
