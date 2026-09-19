import { prisma } from "@/lib/prisma";
import { TeamClient } from "@/components/team/team-client";

export const metadata = {
  title: "Team Management | Ritumbhara Hospitality OS",
  description: "Manage your hospitality staff and their operational roles.",
};

export default async function TeamPage() {
  const teamMembers = await prisma.teamMember.findMany({
    orderBy: { createdAt: "desc" },
    include: { property: true }
  });

  const properties = await prisma.property.findMany({
    orderBy: { name: "asc" },
  });

  return <TeamClient initialMembers={teamMembers} properties={properties} />;
}
