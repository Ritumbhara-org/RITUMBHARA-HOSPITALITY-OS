import { prisma } from "@/lib/prisma";
import { TeamClient } from "@/components/team/team-client";

export const metadata = {
  title: "Team Management | Ritumbhara Hospitality OS",
  description: "Manage your hospitality staff and their operational roles.",
};

import { getSession } from "@/app/actions/auth";

export default async function TeamPage() {
  const session = await getSession();
  const isStaff = session?.user?.role === 'STAFF';
  const propertyFilter = isStaff && session?.user?.propertyId ? { propertyId: session.user.propertyId } : {};
  const teamMembers = await prisma.teamMember.findMany({
    where: propertyFilter,
    orderBy: { createdAt: "desc" },
    include: { property: true }
  });

  const properties = await prisma.property.findMany({
    orderBy: { name: "asc" },
  });

  return <TeamClient initialMembers={teamMembers} properties={properties} userRole={session?.user?.role} userPropertyId={session?.user?.propertyId} />;
}
