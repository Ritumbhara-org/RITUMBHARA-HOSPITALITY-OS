import { requireAdminPage } from "@/lib/auth/guard"
import { AuditClient } from "./audit-client"

export const metadata = {
  title: "Website SEO Audit | Hospitality OS",
  description: "Audit a website's SEO and get a prioritized action plan",
}

export default async function SeoAuditPage() {
  await requireAdminPage("/seo-audit")
  return <AuditClient />
}
