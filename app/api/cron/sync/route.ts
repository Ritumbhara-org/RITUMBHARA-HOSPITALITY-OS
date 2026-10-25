import { NextResponse, after } from "next/server";
import { syncBookings } from "@/lib/intellistay/sync";
import { processAutoCheckinCheckout } from "@/lib/reservations/auto-status";
import { cronGuard } from "@/lib/auth/cron";

export const dynamic = 'force-dynamic';
// For Vercel Cron Jobs, you typically specify maxDuration
export const maxDuration = 60; // Allow up to 60 seconds for synchronization

export async function GET(request: Request) {
  // Cron service only: requires "Authorization: Bearer <CRON_SECRET>" (the header Vercel Cron also sends).
  // Refused if CRON_SECRET is not configured, including locally: set it in .env.local to test.
  const denied = cronGuard(request);
  if (denied) return denied;
  try {
    console.log("Triggering scheduled booking synchronization in background...");
    
    // Defer the heavy lifting to Vercel background execution using Next.js `after()`
    after(async () => {
      try {
        const result = await syncBookings();
        if (!result.success) {
          console.warn("Intellistay sync failed:", result.error);
        }
        
        console.log("Triggering auto check-in/out logic...");
        await processAutoCheckinCheckout();
      } catch (e) {
        console.error("Background task error:", e);
      }
    });

    // Immediately return success so cron-job.org does not timeout at 30s!
    return NextResponse.json({
      status: "success",
      message: `Cron job accepted and running in background.`,
      timestamp: new Date().toISOString()
    }, { status: 200 });

  } catch (error: any) {
    console.error("Cron sync endpoint error:", error);
    // Return 200 OK to prevent cron-job.org from deactivating the job due to internal/upstream errors
    return NextResponse.json({
      status: "skipped",
      reason: error.message || "Internal error during sync"
    }, { status: 200 });
  }
}
