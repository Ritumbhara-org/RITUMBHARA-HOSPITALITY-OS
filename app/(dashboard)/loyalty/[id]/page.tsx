import { notFound } from "next/navigation"
import { requireAdminPage } from "@/lib/auth/guard"
import { memberDetail } from "@/lib/loyalty/queries"
import { MemberProfile } from "@/components/loyalty/member-profile"

export const dynamic = "force-dynamic"

export default async function LoyaltyMemberPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  await requireAdminPage("/loyalty/" + id)
  const member = await memberDetail(id)
  if (!member) notFound()
  return <MemberProfile member={member} />
}
