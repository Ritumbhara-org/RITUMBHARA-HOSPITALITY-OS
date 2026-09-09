import { prisma } from "@/lib/prisma"
import { intellistay } from "./client"
import { eventBus } from "../events/bus"

// Helper function to map Intellistay status IDs to our statuses
function mapBookingStatus(statusId: number | string): string {
  // Mapping based on typical PMS status codes. Adjust as needed when actual codes are confirmed.
  const statusStr = String(statusId);
  switch (statusStr) {
    case '1': return 'CONFIRMED';
    case '2': return 'CHECKED_IN';
    case '3': return 'CHECKED_OUT';
    case '4': return 'CANCELLED';
    default: return 'CONFIRMED';
  }
}

// Convert IST naive datetime (e.g. "2026-08-24T10:34:50.69") to UTC Date object
function parseIstDate(dateString: string): Date {
  if (!dateString) return new Date();
  
  // If it already contains a 'Z' or offset, it's not naive, just parse it
  if (dateString.includes('Z') || dateString.match(/[+-]\d{2}:\d{2}$/)) {
    return new Date(dateString);
  }
  
  // It's a naive IST string, append +05:30
  return new Date(`${dateString}+05:30`);
}

export async function syncBookings() {
  console.log("Starting Intellistay Booking Sync...");
  
  // Get fallback property (in a real multi-tenant app, this would be passed in)
  const property = await prisma.property.findFirst();
  if (!property) {
    console.error("No properties found in database.");
    return { success: false, error: "No properties found" };
  }

  // Get fallback unit in case a booking has no rooms
  const defaultUnit = await prisma.unit.findFirst({ where: { propertyId: property.id }});

  // Create initial SyncLog record
  const syncLog = await prisma.syncLog.create({
    data: {
      status: "PARTIAL", // Start with partial, change to SUCCESS later
      source: "INTELLISTAY"
    }
  });

  let successCount = 0;
  let newCount = 0;
  let updateCount = 0;
  let errorMessages: string[] = [];

  try {
    // 1. Fetch bookings from Intellistay
    // Using a POST for pagination, typical for such endpoints
    const response = await intellistay.fetch('/api/Booking/GetAllBookingsByPagination', {
      method: 'POST',
      body: JSON.stringify({
        pageNumber: 1,
        pageSize: 50 // Fetch the latest 50 bookings for this sync interval
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Failed to fetch bookings: ${response.status} - ${errorText}`);
      return { success: false, error: "API fetch failed" };
    }

    const data = await response.json();
    
    // Intellistay pagination response wraps bookings in data.bookings
    const bookings = data?.data?.bookings || [];
    console.log(`Fetched ${bookings.length} bookings from Intellistay.`);

    // 2. Normalize and Upsert each booking
    for (const booking of bookings) {
      try {
        const intellistayBookingId = String(booking.bookingId || booking.id);
        
        // --- GUEST UPSERT ---
        const customer = booking.customerDetails && booking.customerDetails.length > 0 ? booking.customerDetails[0] : null;
        const customerPhone = customer?.mobile ? String(customer.mobile) : "0000000000";
        const customerEmail = customer?.email || null;
        const customerName = customer?.customerName || "Unknown Guest";
        
        // We use the phone number to idempotently identify guests if they don't have an ID
        const intellistayGuestId = String(customer?.customerId || customerPhone);

        const guest = await prisma.guest.upsert({
          where: { intellistayGuestId },
          update: {
            name: customerName,
            email: customerEmail,
            phone: customerPhone
          },
          create: {
            intellistayGuestId,
            name: customerName,
            email: customerEmail,
            phone: customerPhone
          }
        });

        // --- UNIT MAPPING ---
        // Extract room details
        let unitId = defaultUnit?.id;
        
        if (booking.roomDetails && Array.isArray(booking.roomDetails) && booking.roomDetails.length > 0) {
          const roomNumber = String(booking.roomDetails[0].roomNo || booking.roomDetails[0].roomId || 'Unassigned');
          
          // Try to find the unit locally, or create it dynamically if it doesn't exist
          const localUnit = await prisma.unit.findFirst({
            where: { propertyId: property.id, name: roomNumber }
          });
          
          if (localUnit) {
            unitId = localUnit.id;
          } else {
            console.log(`Dynamically creating new Unit: ${roomNumber}`);
            const newUnit = await prisma.unit.create({
              data: {
                propertyId: property.id,
                name: roomNumber,
                type: "SYNCED_ROOM",
                capacity: 2,
                status: "AVAILABLE",
                floor: "1"
              }
            });
            unitId = newUnit.id;
          }
        }

        if (!unitId) continue; // Skip if absolutely no unit is available

        // --- RESERVATION UPSERT ---
        const checkInDate = parseIstDate(booking.checkInDate);
        const checkOutDate = parseIstDate(booking.checkOutDate);
        const status = mapBookingStatus(booking.bookingStatusId || booking.status);
        const totalAmount = parseFloat(booking.grandTotal) || 0;
        
        // Construct detailed notes
        const specialRequest = booking.specialRequest ? `Special Request: ${booking.specialRequest}\n` : '';
        const paymentInfo = `Payment Status: ${booking.paymentStatus || 'Unknown'}\nPaid: ${booking.totalPaidAmount || 0}`;
        const bookingNotes = `${specialRequest}${paymentInfo}`;

        // Upsert the reservation
        const existingRes = await prisma.reservation.findUnique({
          where: { intellistayReservationId: intellistayBookingId }
        });

        if (existingRes) {
          const updatedRes = await prisma.reservation.update({
            where: { id: existingRes.id },
            data: {
              guestId: guest.id,
              unitId,
              checkIn: checkInDate,
              checkOut: checkOutDate,
              status,
              totalAmount,
              bookingNotes
            }
          });
          updateCount++;

          // EVENT: Booking Updated / Checked In / Cancelled
          if (existingRes.status !== updatedRes.status) {
            if (updatedRes.status === 'CANCELLED') {
              await eventBus.emit('BOOKING_CANCELLED', { reservationId: updatedRes.id, guestId: guest.id, propertyId: property.id, intellistayBookingId, status: updatedRes.status, checkIn: checkInDate, checkOut: checkOutDate });
            } else if (updatedRes.status === 'CHECKED_IN') {
              await eventBus.emit('GUEST_CHECKED_IN', { reservationId: updatedRes.id, guestId: guest.id, propertyId: property.id, intellistayBookingId, status: updatedRes.status, checkIn: checkInDate, checkOut: checkOutDate });
            } else if (updatedRes.status === 'CHECKED_OUT') {
              await eventBus.emit('GUEST_CHECKED_OUT', { reservationId: updatedRes.id, guestId: guest.id, propertyId: property.id, intellistayBookingId, status: updatedRes.status, checkIn: checkInDate, checkOut: checkOutDate });
            } else {
              await eventBus.emit('BOOKING_UPDATED', { reservationId: updatedRes.id, guestId: guest.id, propertyId: property.id, intellistayBookingId, status: updatedRes.status, checkIn: checkInDate, checkOut: checkOutDate });
            }
          }

        } else {
          const newRes = await prisma.reservation.create({
            data: {
              intellistayReservationId: intellistayBookingId,
              propertyId: property.id,
              guestId: guest.id,
              unitId,
              checkIn: checkInDate,
              checkOut: checkOutDate,
              status,
              source: "INTELLISTAY",
              totalAmount,
              bookingNotes
            }
          });
          newCount++;

          // EVENT: New Booking Created
          await eventBus.emit('BOOKING_CREATED', { reservationId: newRes.id, guestId: guest.id, propertyId: property.id, intellistayBookingId, status: newRes.status, checkIn: checkInDate, checkOut: checkOutDate });
        }
        
        successCount++;
      } catch (err: any) {
        console.error(`Error processing booking ${booking.bookingId}:`, err.message);
        errorMessages.push(`Booking ${booking.bookingId}: ${err.message}`);
      }
    }

    console.log(`Sync Complete. Total Processed: ${successCount}. New: ${newCount}. Updated: ${updateCount}.`);

    // Finalize SyncLog
    await prisma.syncLog.update({
      where: { id: syncLog.id },
      data: {
        completedAt: new Date(),
        status: errorMessages.length > 0 ? "PARTIAL" : "SUCCESS",
        recordsProcessed: bookings.length,
        recordsUpdated: updateCount,
        recordsCreated: newCount,
        error: errorMessages.length > 0 ? errorMessages.join(" | ") : null
      }
    });

    return { success: true, newCount, updateCount, logId: syncLog.id };

  } catch (error: any) {
    console.error("Fatal error during sync:", error);
    
    // Attempt to log fatal error if possible
    try {
      await prisma.syncLog.create({
        data: {
          status: "FAILED",
          error: error.message,
          source: "INTELLISTAY"
        }
      });
    } catch (e) {}

    return { success: false, error: error.message };
  }
}
