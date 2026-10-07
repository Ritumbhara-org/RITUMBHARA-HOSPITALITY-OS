import { NextResponse, after } from "next/server";
import { syncBookings } from "@/lib/intellistay/sync";
import { processAutoCheckinCheckout } from "@/lib/reservations/auto-status";

export const dynamic = 'force-dynamic';
// For Vercel Cron Jobs, you typically specify maxDuration
export const maxDuration = 60; // Allow up to 60 seconds for synchronization

export async function GET(request: Request) {
  try {
    // Basic security for manual cron invocation
    const authHeader = request.headers.get('authorization');
    if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    console.log("Triggering scheduled booking synchronization...");
    
    // We use Next.js `after()` to run the extremely slow Intellistay DB sync (which takes 40+ seconds)
    // in the background AFTER we instantly return the 202 Accepted response to cron-job.org.
    // This prevents cron-job.org from killing the connection at 30s!
    after(async () => {
      console.log("[Background] Starting Intellistay sync...");
      try {
        const result = await syncBookings();
        if (!result.success) {
          console.warn("[Background] Intellistay sync failed:", result.error);
        }
        
        console.log("[Background] Triggering auto check-in/out logic...");
        await processAutoCheckinCheckout();
        console.log("[Background] Sync complete!");
      } catch (err) {
        console.error("[Background] Sync Error:", err);
      }
    });

    return NextResponse.json({
      status: "success",
      message: "Cron job accepted. Sync running in background.",
      timestamp: new Date().toISOString()
    }, { status: 202 });

  } catch (error: any) {
    console.error("Cron sync endpoint error:", error);
    return NextResponse.json({
      status: "skipped",
      reason: error.message || "Internal error during sync"
    }, { status: 200 });
  }
}
