import type { Metadata } from "next"
import { getMemberSession } from "@/lib/loyalty/member-session"
import { memberPortalView } from "@/lib/loyalty/queries"
import { MemberLogin, MemberDashboard } from "@/components/loyalty/member-portal"

export const dynamic = "force-dynamic"
export const metadata: Metadata = { title: "Ritumbhara Rewards", robots: { index: false } }

// Public member portal. Shows only the signed-in member's own membership (session from WhatsApp OTP sign-in).
export default async function MemberPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams
  const ref = typeof sp.ref === "string" ? sp.ref.replace(/[^A-Za-z0-9]/g, "").slice(0, 20) : ""
  const member = await getMemberSession()
  if (!member) return <MemberLogin referralCode={ref} />
  const view = await memberPortalView(member.id)
  if (!view) return <MemberLogin referralCode={ref} />
  const base = (process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/+$/, "")
  return <MemberDashboard data={view} referralLink={`${base}/member?ref=${encodeURIComponent(view.referralCode)}`} />
}
