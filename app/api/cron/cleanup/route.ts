import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { cronGuard } from "@/lib/auth/cron";

export const dynamic = 'force-dynamic';
export const maxDuration = 60; // Allow up to 60 seconds

export async function GET(request: Request) {
  // Cron service only: requires "Authorization: Bearer <CRON_SECRET>"; refused if CRON_SECRET is not configured.
  const denied = cronGuard(request);
  if (denied) return denied;
  try {
    console.log("Triggering scheduled WhatsApp message cleanup...");

    // Calculate the date 30 days ago
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    // Delete records older than 30 days
    const result = await prisma.whatsAppMessage.deleteMany({
      where: {
        createdAt: {
          lt: thirtyDaysAgo
        }
      }
    });

    console.log(`Deleted ${result.count} old WhatsApp messages.`);

    return NextResponse.json({
      status: "success",
      message: `Cleanup completed. Deleted ${result.count} messages older than 30 days.`,
      timestamp: new Date().toISOString()
    }, { status: 200 });

  } catch (error: any) {
    console.error("Cron cleanup endpoint error:", error);
    return NextResponse.json({
      status: "skipped",
      reason: error.message || "Internal error during cleanup"
    }, { status: 200 });
  }
}
