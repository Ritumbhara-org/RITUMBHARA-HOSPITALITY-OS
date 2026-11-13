import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { clientFromEnv } from "@/lib/channex/runtime"
import { PrismaMappingStore } from "@/lib/channex/store"
import { runDoctor } from "@/lib/channex/doctor"
import { adminApiGuard } from "@/lib/auth/guard"

export const dynamic = "force-dynamic"
export const maxDuration = 60

// Admin-only (the proxy requires the admin session for every non-public path). Read-only: it never writes to Channex.
export async function GET(request: Request) {
  const denied = await adminApiGuard()
  if (denied) return denied
  const propertyId = new URL(request.url).searchParams.get("propertyId") ?? undefined
  const result = await runDoctor(prisma, clientFromEnv(), new PrismaMappingStore(prisma), propertyId)
  return NextResponse.json(result, { status: result.ok ? 200 : 503 })
}
