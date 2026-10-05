import { prisma } from "./lib/prisma"; async function main() { const u = await prisma.unit.findMany({ select: { name: true } }); console.log(u); } main();
