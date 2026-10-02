import { NextResponse } from "next/server";
import { syncBookings } from "@/lib/intellistay/sync";
import { processAutoCheckinCheckout } from "@/lib/reservations/auto-status";

export const dynamic = 'force-dynamic';
// For Vercel Cron Jobs, you typically specify maxDuration
export const maxDuration = 60; // Allow up to 60 seconds for synchronization

export async function GET(request: Request) {
  try {
    // Basic security for manual cron invocation
    const authHeader = request.headers.get('authorization');
    // If you are setting up Vercel Cron, Vercel securely sends a bearer token you can verify.
    // For local testing, we'll bypass this if not set.
    if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    console.log("Triggering scheduled booking synchronization...");
    const result = await syncBookings();

    if (!result.success) {
      console.warn("Intellistay sync failed:", result.error);
    }
    
    // After syncing, run the automated check-in and check-out logic EVEN IF sync failed
    console.log("Triggering auto check-in/out logic...");
    const autoStatusResult = await processAutoCheckinCheckout();

    return NextResponse.json({
      status: "success",
      message: `Cron job completed.`,
      details: {
        syncStatus: result.success ? "success" : "failed",
        syncError: result.error || null,
        newBookings: result.success ? result.newCount : 0,
        updatedBookings: result.success ? result.updateCount : 0,
        autoCheckIns: autoStatusResult.checkedInCount,
        autoCheckOuts: autoStatusResult.checkedOutCount
      },
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
