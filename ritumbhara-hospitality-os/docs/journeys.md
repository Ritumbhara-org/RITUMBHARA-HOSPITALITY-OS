# User Journeys - Ritumbhara Hospitality OS

## 1. Guest Journey
**Objective**: Seamless, automated communication from booking to checkout, with easy issue reporting.

1. **Booking Confirmed**: Intellistay sends webhook. OS creates Guest and Reservation.
2. **Confirmation Message**: OS sends WhatsApp template "Booking Confirmed".
3. **Pre-Arrival (T-24h)**: OS sends WhatsApp message with location, weather, and check-in link.
4. **Check-In**: Guest checks in (via Intellistay). OS sends Welcome message + WiFi details.
5. **During Stay (Issue Raised)**:
   - Guest clicks link in WhatsApp or scans QR code in room.
   - Opens Guest Interface.
   - Raises issue (e.g., "AC not working").
   - OS creates Ticket (Category: Maintenance, Priority: HIGH).
6. **Ticket Update**: Guest receives automated WhatsApp when ticket is "IN PROGRESS" and "RESOLVED".
7. **Check-Out**: Guest checks out. OS sends "Thank You" message and feedback link.

## 2. Team Journey (Operations)
**Objective**: Clear, WhatsApp-driven task management requiring minimal training.

1. **Task Assigned**: OS assigns Ticket or Housekeeping Task based on rules.
2. **Notification**: Team member receives WhatsApp message: *"New Task: Unit 204 - AC not working (HIGH)"*.
3. **Acceptance**: Team member clicks "Accept" link or replies.
4. **Execution**: Team member goes to unit. Clicks "Start Work" in Team UI.
5. **Completion**: 
   - Team member finishes work.
   - Clicks "Resolve".
   - (For Housekeeping): Uploads a photo of the clean room.
6. **Verification**: OS logs completion timestamp. Management dashboard updates. Unit status becomes "READY".

## 3. Membership Journey (V1 P1)
**Objective**: Basic tier and points tracking.

1. **Enrollment**: First-time guest checks in. OS auto-enrolls in "STANDARD" tier.
2. **Points Accrual**: After checkout, points are added based on totalAmount from Intellistay.
3. **Tier Upgrade**: Guest crosses threshold, OS updates tier (e.g., STANDARD → GOLD).
4. **Visibility**: Guest sees tier badge and points balance in their Guest Interface.

## 4. Ticket Lifecycle
**Objective**: Strict SLA tracking and accountability.

1. `OPEN` - Created by guest or team.
2. `TRIAGED` - System or Manager categorizes and prioritizes.
3. `ASSIGNED` - Routed to specific team member.
4. `ACKNOWLEDGED` - Team member accepts.
5. `IN_PROGRESS` - Team member starts work.
6. `RESOLVED` - Team member marks complete.
7. `VERIFIED` - Manager verifies (optional, mostly for critical issues).
8. `CLOSED` - Final state.
9. `REOPENED` - If guest complains the issue isn't fixed.
