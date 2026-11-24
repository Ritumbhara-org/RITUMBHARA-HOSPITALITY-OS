import { NextResponse } from "next/server"
import { cronGuard } from "@/lib/auth/cron"
import { runLoyaltyJobs } from "@/lib/loyalty/jobs"

export const maxDuration = 60

// Daily loyalty work: enrolment, booking points safety net, birthday/anniversary bonuses, expiry, 30-day expiry
// reminders, rolling tier re-evaluation and WhatsApp retries. Cron service only (Authorization: Bearer CRON_SECRET).
export async function GET(request: Request) {
  // Cron service only: requires "Authorization: Bearer <CRON_SECRET>"; refused if CRON_SECRET is not configured.
  const denied = cronGuard(request);
  if (denied) return denied;
  try {
    const data = await runLoyaltyJobs()
    return NextResponse.json({ success: true, data }, { headers: { "Cache-Control": "no-store" } })
  } catch (error) {
    console.error("[Loyalty cron]", error)
    return NextResponse.json({ success: false, error: "loyalty_job_failed" }, { status: 500 })
  }
}
