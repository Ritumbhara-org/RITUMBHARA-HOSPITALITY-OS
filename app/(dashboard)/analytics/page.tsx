import { AnalyticsClient } from "@/components/analytics/analytics-client";

export const metadata = {
  title: "Analytics | Ritumbhara Hospitality OS",
  description: "Management dashboard for revenue, operations, and guest analytics.",
};

export default function AnalyticsPage() {
  return <AnalyticsClient />;
}
