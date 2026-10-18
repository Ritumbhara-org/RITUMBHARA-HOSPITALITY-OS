import { AnalyticsClient } from "@/components/analytics/analytics-client";
import { requireAdminPage } from "@/lib/auth/guard"

export const metadata = {
  title: "Analytics | Ritumbhara Hospitality OS",
  description: "Management dashboard for revenue, operations, and guest analytics.",
};

export default async function AnalyticsPage() {
  await requireAdminPage("/analytics")
  return <AnalyticsClient />;
}
