// Saved replies for the unified inbox. {guest}, {unit}, {property}, {address}, {checkIn}, {checkOut}
// are filled from the linked booking; missing values are dropped cleanly.
// OTA messages must not include phone numbers, emails or outside links before check-in.

export interface QuickReply {
  id: string;
  label: string;
  text: string;
}

export const QUICK_REPLIES: QuickReply[] = [
  {
    id: "thanks",
    label: "Thanks for booking",
    text: "Hi {guest}, thank you for booking {unit}! We're looking forward to hosting you on {checkIn}. Let us know if there's anything you need before you arrive.",
  },
  {
    id: "checkin-time",
    label: "Check-in / check-out times",
    text: "Hi {guest}, check-in is any time after 1 PM on {checkIn} and check-out is before 10 AM on {checkOut}.",
  },
  {
    id: "early-checkin",
    label: "Early check-in request",
    text: "Hi {guest}, early check-in is possible up to 11:30 AM at the latest, subject to availability. We'll confirm on the morning of {checkIn}.",
  },
  {
    id: "late-checkout",
    label: "Late check-out request",
    text: "Hi {guest}, late check-out depends on the next booking. We'll check and confirm the day before {checkOut}.",
  },
  {
    id: "directions",
    label: "Directions",
    text: "Hi {guest}, the address is {address}. We'll share the exact map pin and entry details before check-in.",
  },
  {
    id: "parking",
    label: "Parking",
    text: "Hi {guest}, yes, parking is available at the property. Our team will guide you on arrival.",
  },
  {
    id: "id-docs",
    label: "ID required",
    text: "Hi {guest}, as per local rules we need a valid photo ID for every guest at check-in. Thank you!",
  },
  {
    id: "after-stay",
    label: "Thank you after stay",
    text: "Hi {guest}, thank you for staying with us at {property}! We hope you had a great time and would love to host you again.",
  },
];

export function fillQuickReply(
  text: string,
  values: Partial<Record<"guest" | "unit" | "property" | "address" | "checkIn" | "checkOut", string | null>>
): string {
  return text
    .replace(/\{(\w+)\}/g, (_, k: string) => (values as Record<string, string | null | undefined>)[k] || "")
    .replace(/Hi ,/g, "Hi,")
    .replace(/ on \./g, ".")
    .replace(/ {2,}/g, " ")
    .replace(/ ([.,!])/g, "$1")
    .trim();
}
