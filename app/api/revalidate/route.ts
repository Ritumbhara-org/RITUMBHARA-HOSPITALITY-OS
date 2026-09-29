import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";

export async function GET(req: NextRequest) {
  // Clear the cache for the entire dashboard
  revalidatePath("/", "layout");
  
  return NextResponse.json({ 
    success: true, 
    message: "Global Next.js Cache Cleared! Please refresh your browser." 
  });
}
