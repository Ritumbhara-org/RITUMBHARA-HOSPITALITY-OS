type EventHandler<T = any> = (payload: T) => void | Promise<void>;

export interface BookingEventPayload {
  reservationId: string;
  guestId: string;
  propertyId: string;
  intellistayBookingId: string;
  status: string;
  checkIn: Date;
  checkOut: Date;
}

export type EventType = 
  | 'BOOKING_CREATED'
  | 'BOOKING_UPDATED'
  | 'BOOKING_CANCELLED'
  | 'UPCOMING_CHECK_IN'
  | 'GUEST_CHECKED_IN'
  | 'UPCOMING_CHECK_OUT'
  | 'GUEST_CHECKED_OUT'
  | 'TICKET_ASSIGNED'
  | 'TICKET_UPDATED'
  | 'SLA_BREACHED';

export interface TicketEventPayload {
  ticketId: string;
  assignedToId?: string | null;
  propertyId: string;
  unitId?: string | null;
  priority: string;
  status: string;
}

export interface SlaBreachPayload {
  ticketId: string;
  description: string;
  priority: string;
  assignedToId?: string | null;
  unitId?: string | null;
  slaDeadline: Date;
}

class EventBus {
  private handlers: Map<EventType, EventHandler[]> = new Map();

  on<T>(event: EventType, handler: EventHandler<T>) {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, []);
    }
    this.handlers.get(event)!.push(handler);
  }

  async emit<T>(event: EventType, payload: T) {
    console.log(`[EventBus] Emitting ${event}`);
    const eventHandlers = this.handlers.get(event);
    if (!eventHandlers || eventHandlers.length === 0) {
      return;
    }

    // Execute all handlers concurrently
    await Promise.allSettled(eventHandlers.map(handler => handler(payload)));
  }
}

export const eventBus = new EventBus();

// Initialize listeners
import { initWhatsAppListeners } from '../whatsapp/listeners';
import { initHousekeepingListeners } from '../housekeeping/listeners';

initWhatsAppListeners();
initHousekeepingListeners();
