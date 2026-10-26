import { cookies } from "next/headers"
import { prisma } from "@/lib/prisma"
import { listConversations } from "@/lib/inbox/service"
import { InboxClient } from "@/components/inbox/inbox-client"
import type { InboxConversationSummary } from "@/lib/inbox/types"
import { requireAdminPage } from "@/lib/auth/guard"

export const dynamic = "force-dynamic"

export default async function InboxPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  await requireAdminPage("/inbox")
  const token = (await cookies()).get("auth-token")

  let user = token ? await prisma.teamMember.findUnique({ where: { id: token.value } }) : null
  if (!user) user = await prisma.teamMember.findFirst({ orderBy: { createdAt: "asc" } })

  const [properties, team] = await Promise.all([
    prisma.property.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.teamMember.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, role: true, propertyId: true },
    }),
  ])

  const params = await searchParams
  // Defaults to all locations; a location picked in the selector comes through the URL.
  const activePropertyId = (params?.propertyId as string) || "ALL"

  let conversations: InboxConversationSummary[] = []
  let setupError: string | null = null
  try {
    conversations = await listConversations(activePropertyId)
  } catch (err) {
    // Most likely the inbox tables haven't been pushed to the database yet.
    console.error("[Inbox page]", err)
    setupError = "The inbox tables aren't in the database yet. Run `npx prisma db push` once, then reload."
  }

  // De-duplicate team members that exist once per property.
  const seen = new Set<string>()
  const teamOptions = team.filter((t) => (seen.has(t.name) ? false : (seen.add(t.name), true)))

  return (
    <div className="flex min-h-0 flex-1 flex-col md:h-[calc(100dvh-4rem)] md:flex-none">
      <InboxClient
        initialConversations={conversations}
        properties={properties}
        team={teamOptions.map((t) => ({ id: t.id, name: t.name }))}
        activePropertyId={activePropertyId}
        currentUser={user ? { id: user.id, name: user.name } : null}
        setupError={setupError}
      />
    </div>
  )
}
