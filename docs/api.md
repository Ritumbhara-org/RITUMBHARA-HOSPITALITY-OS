# API & Service Layer Conventions

Ritumbhara Hospitality OS uses **Next.js Server Actions** as our primary API/Service layer instead of traditional REST routes. This provides full end-to-end type safety, native React integration, and built-in error boundaries.

## Architecture

1. **Validation (`lib/validations/`)**: All incoming data must be validated against a Zod schema before hitting the database.
2. **Response Wrapper (`lib/api-response.ts`)**: Every Server Action is wrapped in the `withAction` higher-order function, which ensures standard error catching, logging, and response shapes.
3. **Actions (`lib/actions/`)**: Each domain (Guests, Units, Tickets, Reservations) has its own file.

## Response Shape

Every action returns an `ApiResponse<T>`:

```ts
type ApiResponse<T = any> = {
  success: boolean;
  data?: T;
  error?: string;
  fieldErrors?: Record<string, string[]>;
}
```

## Available Actions

### Guests (`lib/actions/guests.ts`)
- `getGuests()`: Retrieves all guests, ordered by creation date.
- `createGuest(input: GuestInput)`: Validates via `GuestSchema` and creates a new guest profile. Revalidates `/guests`.

### Units (`lib/actions/units.ts`)
- `getUnits()`: Retrieves all units along with their property relation.
- `updateUnitStatus(id: string, input: UnitUpdateInput)`: Updates a unit's housekeeping/availability status. Revalidates `/units`.

### Reservations (`lib/actions/reservations.ts`)
- `getReservations()`: Retrieves all reservations with guest and unit relations included.
- `createReservation(input: ReservationInput)`: Creates a reservation mapping a guest to a unit for specific dates. Revalidates `/reservations`.

### Tickets (`lib/actions/tickets.ts`)
- `getTickets()`: Retrieves the full ticket lifecycle for operations, including property, unit, and assignment data.
- `createTicket(input: TicketInput)`: Creates a new operational ticket (maintenance, housekeeping). Revalidates `/operations`.

## Logging
All errors thrown inside `withAction` are caught, logged to `console.error` with the prefix `[ACTION ERROR] <ActionName>`, and mapped safely to the standard `ApiResponse` object without leaking database internals.
