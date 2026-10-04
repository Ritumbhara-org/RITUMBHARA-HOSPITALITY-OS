const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
  const properties = await prisma.property.findMany();
  
  const getPropertyId = (slug) => {
    return properties.find(p => p.slug.includes(slug))?.id;
  };

  const ashadeepId = getPropertyId('ashadeep');
  const urbanId = getPropertyId('urban');
  const wonderId = getPropertyId('wonder');
  const sariskaId = getPropertyId('sariska');

  const teamMembers = [
    {
      name: "Salim",
      role: "STAFF",
      department: "Front Desk",
      phone: "+919503002629",
      whatsappNumber: "+919503002629",
      propertyId: ashadeepId
    },
    {
      name: "Lokesh",
      role: "MANAGER", // Setting supervisor as MANAGER
      department: "Housekeeping",
      phone: "+919503002629",
      whatsappNumber: "+919503002629",
      propertyId: ashadeepId
    },
    {
      name: "Salim",
      role: "STAFF",
      department: "Front Desk",
      phone: "+919503002629",
      whatsappNumber: "+919503002629",
      propertyId: urbanId
    },
    {
      name: "Lokesh",
      role: "MANAGER",
      department: "Housekeeping",
      phone: "+919503002629",
      whatsappNumber: "+919503002629",
      propertyId: urbanId
    },
    {
      name: "Salim",
      role: "STAFF",
      department: "Front Desk",
      phone: "+919503002629",
      whatsappNumber: "+919503002629",
      propertyId: wonderId
    },
    {
      name: "Sachin",
      role: "MANAGER",
      department: "Housekeeping",
      phone: "+916350263096",
      whatsappNumber: "+916350263096",
      propertyId: wonderId
    },
    {
      name: "Salim",
      role: "STAFF",
      department: "Front Desk",
      phone: "+919503002629",
      whatsappNumber: "+919503002629",
      propertyId: sariskaId
    },
    {
      name: "Irfan",
      role: "MANAGER",
      department: "Housekeeping",
      phone: "+918769434974",
      whatsappNumber: "+918769434974",
      propertyId: sariskaId
    }
  ];

  let created = 0;
  for (const member of teamMembers) {
    if (!member.propertyId) {
      console.log(`Skipping ${member.name} because property ID not found.`);
      continue;
    }
    
    await prisma.teamMember.create({
      data: {
        name: member.name,
        role: member.role,
        department: member.department,
        phone: member.phone,
        whatsappNumber: member.whatsappNumber,
        propertyId: member.propertyId,
        isActive: true
      }
    });
    created++;
  }
  
  console.log(`Successfully created ${created} team members!`);
}

run().catch(console.error).finally(() => prisma.$disconnect());
