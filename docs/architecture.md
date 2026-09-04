# Ritumbhara Hospitality OS - V3 Architecture

## System Objective
Ritumbhara Hospitality OS is a lightweight Hospitality Operations + Guest Engagement platform built **on top** of Intellistay PMS.

**Important Note**: This OS is *not* a replacement for Intellistay. Intellistay remains the single source of truth for:
- Reservations
- Guest information
- Room/unit information
- Check-in/check-out statuses
- Booking sources
- PMS data

The Hospitality OS acts as the connected layer managing Operations, Team communications, Guest engagement, WhatsApp integrations, and Management visibility.

## Data Flow
The architecture relies on synchronous and asynchronous data flowing primarily from the PMS to the OS:

`Intellistay PMS` → `Hospitality OS` → `Operations / Guest / Team / WhatsApp`

1. **Inbound Webhooks/API Polling**: The OS ingests Guest Profiles, Unit status, and Reservations from Intellistay.
2. **Operations Layer**: OS translates booking events into actionable workflows (e.g., checkout → housekeeping task).
3. **Communication Layer**: OS interfaces with WhatsApp API to send guest confirmations, pre-arrival details, and team task assignments.

## Module Boundaries

1. **Auth Module**: NextAuth.js based authentication for Team and Management.
2. **Dashboard Module**: Centralized view for Management to monitor arrivals, departures, unit status, and open tickets.
3. **Ticketing Engine**: Universal ticket creation (by guests or team) spanning maintenance, housekeeping, IT, etc. 
4. **Housekeeping Module**: Workflow engine for cleaning tasks based on unit status transitions.
5. **Guest Interface**: Self-service portal for guests to raise requests, order services, and communicate via WhatsApp.
6. **SEO Module**: AI-powered automation (via Anthropic API) for generating property-specific SEO metadata.

## North-Star Workflow
1. **BOOKING** created in Intellistay.
2. Synced to **HOSPITALITY OS**.
3. **GUEST CREATED / UPDATED** in the OS database.
4. Automated **WHATSAPP CONFIRMATION** sent.
5. **PRE-ARRIVAL** messaging initiated.
6. Guest **CHECK-IN** at property.
7. During the **GUEST STAY**, they or the team may raise an issue.
8. **TICKET CREATED** (with Category + Priority).
9. Ticket routed and **ASSIGNED** to a team member.
10. **TEAM WHATSAPP** notification sent.
11. Team member **ACCEPTS**, **STARTS**, and **RESOLVES** the ticket.
12. Management retains full **VISIBILITY** of the process.
13. **GUEST NOTIFIED** upon resolution.
14. Ticket goes to **CLOSE / REOPEN** state.

### Secondary Core Workflow (Checkout)
1. **CHECKOUT** detected (from PMS).
2. **HOUSEKEEPING TASK** created automatically.
3. **TEAM WHATSAPP** notification sent.
4. Housekeeper **ACCEPTS** and **STARTS** cleaning.
5. Post-clean, housekeeper takes **PHOTO**.
6. Task marked **COMPLETE**.
7. **UNIT = READY**.
