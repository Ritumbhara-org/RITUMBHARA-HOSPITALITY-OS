// Shared types for the Channex integration. Pure types, no I/O.

export type ChannexEntityKind = "property" | "room_type" | "rate_plan" | "booking" | "channel"

export interface ChannexConfig {
  apiKey: string
  /** https://staging.channex.io/api/v1 (sandbox) or https://app.channex.io/api/v1 (production). */
  baseUrl: string
}

export interface ChannexErrorBody {
  code?: string
  title?: string
  details?: unknown
}

/** One value entry for POST /restrictions. Only the fields present are changed (Channex applies partial updates). */
export interface RestrictionValue {
  property_id: string
  rate_plan_id: string
  date?: string
  date_from?: string
  date_to?: string
  /** Minor units (paise). */
  rate?: number
  min_stay_arrival?: number
  stop_sell?: boolean
  closed_to_arrival?: boolean
  closed_to_departure?: boolean
}

export interface AvailabilityValue {
  property_id: string
  room_type_id: string
  date?: string
  date_from?: string
  date_to?: string
  availability: number
}

/** A booking revision from the Channex feed, reduced to what the OS needs. Every field may be missing upstream. */
export interface NormalizedRevision {
  revisionId: string
  bookingId: string
  status: "new" | "modified" | "cancelled"
  propertyId: string | null
  otaName: string | null
  otaReservationCode: string | null
  arrivalDate: string | null
  departureDate: string | null
  /** Major units, e.g. 2300.5. */
  amount: number | null
  currency: string | null
  paymentCollect: string | null
  customer: { name: string; email: string | null; phone: string | null }
  rooms: NormalizedRevisionRoom[]
}

export interface NormalizedRevisionRoom {
  roomTypeId: string | null
  ratePlanId: string | null
  checkinDate: string | null
  checkoutDate: string | null
  amount: number | null
  adults: number
  children: number
  /** date (YYYY-MM-DD) -> nightly price in major units. */
  days: Record<string, number>
}
