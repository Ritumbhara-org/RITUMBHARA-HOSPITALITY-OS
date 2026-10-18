import { NextResponse } from "next/server";
import { processDailyAutomations, checkSlaBreaches } from "@/lib/events/cron";
import { cronGuard } from "@/lib/auth/cron";

export async function GET(request: Request) {
  // Cron service only: requires "Authorization: Bearer <CRON_SECRET>"; refused if CRON_SECRET is not configured.
  const denied = cronGuard(request);
  if (denied) return denied;
  try {
    const results = await processDailyAutomations();
    await checkSlaBreaches();
    
    return NextResponse.json({
      success: true,
      message: "Daily automations & SLA checks processed successfully",
      data: results
    });
  } catch (error: any) {
    console.error("[Cron API Error]", error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
