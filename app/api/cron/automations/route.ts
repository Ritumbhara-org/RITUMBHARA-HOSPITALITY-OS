import { NextResponse } from "next/server";
import { processDailyAutomations, checkSlaBreaches } from "@/lib/events/cron";

export async function GET(request: Request) {
  try {
    // Optional: Add authorization check here if needed (e.g. Vercel Cron Secret)
    // const authHeader = request.headers.get('authorization');
    // if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    //   return new Response('Unauthorized', { status: 401 });
    // }

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
