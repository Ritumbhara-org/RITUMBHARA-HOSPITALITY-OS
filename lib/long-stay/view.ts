// Shapes passed from the Long Stays server pages to their client components (plain JSON, no Dates).

import type { AgreementBadge } from "./agreement"
import type { LongStayInput } from "./shared"

export interface LongStayRow {
  id: string
  guestName: string
  contactNumber: string
  unitName: string | null
  locationId: string
  locationName: string
  checkIn: string
  checkOut: string
  nights: number
  inclusion: string
  totalAmount: number
  securityDeposit: number
  depositRefundedOn: string | null
  checkInCount: number
  checkOutCount: number
  status: string
  agreement: AgreementBadge
}

export interface LocationOption {
  id: string
  name: string
}

export interface UnitOption {
  id: string
  name: string
  type: string
  propertyId: string
}

export interface AgreementView {
  badge: AgreementBadge
  linkActive: boolean
  sentAt: string | null
  sentVia: string | null
  expiresAt: string | null
  viewedAt: string | null
  signedAt: string | null
  signerName: string | null
  pdfPath: string | null
  voidReason: string | null
  locked: boolean
}

export interface LongStayFormProps {
  mode: "new" | "edit"
  initial: LongStayInput
  initialStatus: string | null
  locations: LocationOption[]
  units: UnitOption[]
  agreement: AgreementView | null
  createdAt?: string
}
