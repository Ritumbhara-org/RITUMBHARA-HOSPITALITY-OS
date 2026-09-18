import { prisma } from "../lib/prisma"; prisma.whatsAppMessage.findMany({ orderBy: { createdAt: "desc" }, take: 5 }).then(console.log).catch(console.error).finally(() => prisma.$disconnect());
