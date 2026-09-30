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
  | 'TODAY_CHECK_IN'
  | 'GUEST_CHECKED_IN'
  | 'UPCOMING_CHECK_OUT'
  | 'GUEST_CHECKED_OUT'
  | 'TICKET_CREATED'
  | 'TICKET_ASSIGNED'
  | 'TICKET_UPDATED'
  | 'TICKET_RESOLVED'
  | 'SLA_BREACHED'
  | 'HOUSEKEEPING_TASK_COMPLETED'
  | 'POINTS_REDEEMED';

export interface PointsRedemptionPayload {
  guestId: string;
  propertyId: string;
  reservationId: string;
  pointsRedeemed: number;
  rupeeDiscount: number;
}

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

export interface HousekeepingTaskPayload {
  taskId: string;
  unitId: string;
  propertyId: string;
  assignedToId?: string | null;
}

class EventBus {
  private handlers: Map<EventType, EventHandler[]> = new Map();
  private isInitialized = false;
  private initPromise: Promise<void> | null = null;

  on<T>(event: EventType, handler: EventHandler<T>) {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, []);
    }
    this.handlers.get(event)!.push(handler);
  }

  private async ensureInitialized() {
    if (typeof window !== 'undefined') return;
    if (this.isInitialized) return;
    
    if (!this.initPromise) {
      this.initPromise = Promise.all([
        import('../whatsapp/listeners').then(m => m.initWhatsAppListeners()),
        import('../housekeeping/listeners').then(m => m.initHousekeepingListeners())
      ]).then(() => {
        this.isInitialized = true;
      }).catch(console.error);
    }
    await this.initPromise;
  }

  async emit<T>(event: EventType, payload: T) {
    console.log(`[EventBus] Emitting ${event}`);
    await this.ensureInitialized();
    
    const eventHandlers = this.handlers.get(event);
    if (!eventHandlers || eventHandlers.length === 0) {
      console.log(`[EventBus] No handlers registered for ${event}`);
      return;
    }

    // Execute all handlers concurrently
    await Promise.allSettled(eventHandlers.map(handler => handler(payload)));
  }
}

export const eventBus = new EventBus();
