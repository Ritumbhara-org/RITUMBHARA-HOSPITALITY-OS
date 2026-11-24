import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { adminApiGuard } from "@/lib/auth/guard";

export async function GET(req: NextRequest) {
  const denied = await adminApiGuard()
  if (denied) return denied
  // Clear the cache for the entire dashboard
  revalidatePath("/", "layout");
  
  return NextResponse.json({ 
    success: true, 
    message: "Global Next.js Cache Cleared! Please refresh your browser." 
  });
}
