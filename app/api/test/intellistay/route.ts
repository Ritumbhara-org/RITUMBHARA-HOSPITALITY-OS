import { NextResponse } from "next/server";
import { intellistay } from "@/lib/intellistay/client";

export const dynamic = 'force-dynamic'; // Prevent caching so we hit the live server every time

export async function GET() {
  try {
    const success = await intellistay.authenticate();
    
    if (success) {
      const token = await intellistay.getAccessToken();
      return NextResponse.json({
        status: "success",
        message: "Successfully authenticated with Intellistay PMS Sandbox!",
        live_token_preview: token ? `${token.substring(0, 30)}...` : null,
        timestamp: new Date().toISOString()
      }, { status: 200 });
    } else {
      return NextResponse.json({
        status: "error",
        message: "Failed to authenticate with Intellistay. Check server logs."
      }, { status: 500 });
    }
  } catch (error: any) {
    return NextResponse.json({
      status: "error",
      message: error.message
    }, { status: 500 });
  }
}
