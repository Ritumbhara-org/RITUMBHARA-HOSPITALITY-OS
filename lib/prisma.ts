import dns from "node:dns";
if (typeof dns.setDefaultResultOrder === "function") {
  dns.setDefaultResultOrder("ipv4first");
}

import { PrismaClient } from "@prisma/client"
import { databaseFingerprint, resolveDatabaseUrl } from "@/lib/db/preview-isolation"

const prismaClientSingleton = () => {
  // Preview deployments must use the separate TEST database (fails closed); Production/local are unchanged.
  const previewUrl = resolveDatabaseUrl()
  if (previewUrl) {
    console.log("[db] Preview is using the isolated test database: " + databaseFingerprint(previewUrl))
    return new PrismaClient({ datasourceUrl: previewUrl })
  }
  return new PrismaClient()
}

declare global {
  var prismaGlobal: undefined | ReturnType<typeof prismaClientSingleton>
}

export const prisma = globalThis.prismaGlobal ?? prismaClientSingleton()

if (process.env.NODE_ENV !== "production") globalThis.prismaGlobal = prisma
