import { headers } from "next/headers"
import { prisma } from "@/lib/prisma"
import { requireAdminPage } from "@/lib/auth/guard"
import { listMembers, loyaltyOverview, type MemberFilters } from "@/lib/loyalty/queries"
import { LoyaltyList } from "@/components/loyalty/loyalty-list"

export const dynamic = "force-dynamic"

const KEYS = ["q", "tier", "propertyId", "joinedFrom", "joinedTo", "minPoints", "maxPoints"] as const

export default async function LoyaltyPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireAdminPage("/loyalty")
  const sp = await searchParams
  const filters: MemberFilters = {}
  for (const k of KEYS) {
    const v = sp[k]
    if (typeof v === "string" && v.trim()) filters[k] = v.trim().slice(0, 100)
  }
  const page = Math.max(1, Math.min(500, Number(sp.page) || 1))
  const pageSize = 50
  const [{ rows, total }, overview, locations] = await Promise.all([
    listMembers(filters, pageSize, (page - 1) * pageSize),
    loyaltyOverview(),
    prisma.property.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ])
  // Public sign-up link staff can share: NEXT_PUBLIC_APP_URL, else this deployment's own address.
  const h = await headers()
  const host = h.get("x-forwarded-host") || h.get("host") || ""
  const base = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/+$/, "") || (host ? `${h.get("x-forwarded-proto") || "https"}://${host}` : "")
  const joinUrl = base + "/member"
  return <LoyaltyList joinUrl={joinUrl} rows={rows} total={total} page={page} pageSize={pageSize} filters={filters} overview={overview} locations={locations} />
}
