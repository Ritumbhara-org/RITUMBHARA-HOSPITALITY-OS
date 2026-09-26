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
      // Return 200 OK to prevent cron-job.org from deactivating the job due to upstream API failures
      return NextResponse.json(
        { status: "skipped", reason: result.error || "Intellistay API in maintenance" }, 
        { status: 200 }
      );
    }
    
    // After syncing, run the automated check-in and check-out logic
    console.log("Triggering auto check-in/out logic...");
    const autoStatusResult = await processAutoCheckinCheckout();

    return NextResponse.json({
      status: "success",
      message: `Sync completed successfully.`,
      details: {
        newBookings: result.newCount,
        updatedBookings: result.updateCount,
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
