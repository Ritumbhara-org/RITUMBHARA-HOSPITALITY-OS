import { z } from "zod";

// --- GUESTS ---
export const GuestSchema = z.object({
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  email: z.string().email("Invalid email address").optional().or(z.literal("")),
  phone: z.string().min(5, "Phone number is required"),
  whatsappNumber: z.string().optional(),
  idDocument: z.string().optional(),
});

export type GuestInput = z.infer<typeof GuestSchema>;

// --- RESERVATIONS ---
export const ReservationSchema = z.object({
  unitId: z.string().uuid(),
  guestId: z.string().uuid(),
  checkIn: z.date({ required_error: "Check-in date is required" }),
  checkOut: z.date({ required_error: "Check-out date is required" }),
  status: z.enum(["CONFIRMED", "CHECKED_IN", "CHECKED_OUT", "CANCELLED"]),
  totalAmount: z.number().min(0).optional(),
});

export type ReservationInput = z.infer<typeof ReservationSchema>;

// --- TICKETS ---
export const TicketSchema = z.object({
  propertyId: z.string().uuid(),
  unitId: z.string().uuid().optional(),
  title: z.string().min(1, "Title is required"),
  description: z.string().optional(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).default("MEDIUM"),
  status: z.enum(["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"]).default("OPEN"),
  category: z.enum(["MAINTENANCE", "HOUSEKEEPING", "GUEST_REQUEST", "COMPLAINT", "OTHER"]),
});

export type TicketInput = z.infer<typeof TicketSchema>;

// --- UNITS ---
export const UnitUpdateSchema = z.object({
  status: z.enum(["AVAILABLE", "OCCUPIED", "MAINTENANCE", "CLEANING"]),
});

export type UnitUpdateInput = z.infer<typeof UnitUpdateSchema>;
