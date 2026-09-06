import { SeoClient } from "./seo-client"
import { prisma } from "@/lib/prisma"

export const metadata = {
  title: "SEO Automation | Hospitality OS",
  description: "Generate SEO packages for your properties",
}

export default async function SeoPage() {
  const properties = await prisma.property.findMany()

  return <SeoClient properties={properties} />
}
