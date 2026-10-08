import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const properties = await prisma.property.findMany({
    include: {
      units: true,
      teamMembers: true
    }
  });

  const output: any = [];

  for (const property of properties) {
    output.push({
      Property: property.name,
      Slug: property.slug,
      City: property.city,
      TotalUnits: property.units.length,
      Units: property.units.map((u: any) => `${u.name} (${u.type})`),
      TotalTeamMembers: property.teamMembers.length,
      TeamMembers: property.teamMembers.map((t: any) => `${t.name} - ${t.role} (${t.department})`)
    });
  }

  console.log(JSON.stringify(output, null, 2));
}

main()
  .catch(e => console.error(e))
  .finally(() => prisma.$disconnect());
