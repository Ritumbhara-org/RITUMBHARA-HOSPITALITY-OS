# Data Flow Architecture - Ritumbhara Hospitality OS

This document maps out where data originates, how it is transformed, where it is stored, and where it goes.

## System Boundaries
- **External Source of Truth**: Intellistay PMS (Guest profiles, Unit inventory, Reservations).
- **Internal State**: PostgreSQL DB (via Prisma) holding Tickets, Tasks, Team Profiles, WhatsApp logs.
- **External Output**: WhatsApp Business API.

## Core Entities & Flow

### 1. Property & Units
- **Entry**: Synced from Intellistay API via scheduled cron jobs or manual sync trigger.
- **Storage**: `Property` and `Unit` tables.
- **Output**: Displayed on Management Dashboard; used to associate Tickets and Housekeeping Tasks.

### 2. Guests & Reservations
- **Entry**: Webhooks from Intellistay (Booking Created/Updated/Cancelled, Check-in, Check-out).
- **Storage**: `Guest` and `Reservation` tables. `intellistayReservationId` and `intellistayGuestId` used as foreign keys.
- **Output**: 
  - Management Dashboard (Arrivals/Departures).
  - Triggers automated WhatsApp workflows.

### 3. Tickets (Universal Ticketing Engine)
- **Entry**: 
  - Guest Interface (Self-service).
  - Team Interface (Housekeeping/Maintenance reporting).
  - Management Dashboard.
- **Storage**: `Ticket` and `TicketAuditLog` tables.
- **Output**: 
  - Team WhatsApp assignment notification.
  - Management Dashboard (Open Tickets panel).
  - Guest WhatsApp status updates.

### 4. Housekeeping Tasks
- **Entry**: 
  - Automated generation from PMS Checkout webhook (Unit status transitions to DIRTY).
  - Manual creation by Management.
- **Storage**: `HousekeepingTask` table.
- **Output**: 
  - Assigned Housekeeper's WhatsApp.
  - Team Mobile Interface.

### 5. WhatsApp Messages
- **Entry**: WhatsApp Webhooks (Inbound guest replies) or System Triggers (Outbound notifications).
- **Storage**: `WhatsAppMessage` table for audit and conversation history.
- **Output**: WhatsApp API (Twilio/Meta).

## Data Flow Diagram (Conceptual)
```
[Intellistay API]
       | (REST / Webhooks)
       v
[Next.js API Routes (Sync Layer)]
       |
       v
[PostgreSQL Database] <--> [Prisma ORM] <--> [Next.js Services]
                                                    |
                                                    |---> [Next.js App Router (UI)]
                                                    |       - Management Dashboard
                                                    |       - Guest Interface
                                                    |       - Team Interface
                                                    |
                                                    |---> [WhatsApp Business API]
                                                            - Guest Engagement
                                                            - Team Notifications
```
