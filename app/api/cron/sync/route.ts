import { NextResponse } from "next/server";
import { syncBookings } from "@/lib/intellistay/sync";

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
      return NextResponse.json(
        { status: "error", message: result.error }, 
        { status: 500 }
      );
    }

    return NextResponse.json({
      status: "success",
      message: `Sync completed successfully.`,
      details: {
        newBookings: result.newCount,
        updatedBookings: result.updateCount
      },
      timestamp: new Date().toISOString()
    }, { status: 200 });

  } catch (error: any) {
    console.error("Cron sync endpoint error:", error);
    return NextResponse.json({
      status: "error",
      message: error.message
    }, { status: 500 });
  }
}
