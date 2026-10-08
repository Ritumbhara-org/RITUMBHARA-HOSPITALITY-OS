import { prisma } from "../lib/prisma";
import { intellistay } from "../lib/intellistay/client";
import { normalizePhoneNumber } from "../lib/utils/phone";
import { calculateEffectiveStatus } from "../lib/reservations/auto-status";

// Helper function to map Intellistay status IDs to our statuses
function mapBookingStatus(statusId: number | string): string {
  const statusStr = String(statusId);
  switch (statusStr) {
    case '1': return 'CONFIRMED';
    case '2': return 'CHECKED_IN';
    case '3': return 'CHECKED_OUT';
    case '4': return 'CANCELLED';
    case '5': return 'CANCELLED'; 
    case 'CheckedOut': return 'CHECKED_OUT';
    case 'Cancelled': return 'CANCELLED';
    default: return 'CONFIRMED';
  }
}

function parseIstDate(dateString: string): Date {
  if (!dateString) return new Date();
  if (dateString.includes('Z') || dateString.match(/[+-]\d{2}:\d{2}$/)) {
    return new Date(dateString);
  }
  return new Date(`${dateString}+05:30`);
}

function normalizeText(text: string): string {
  if (!text) return '';
  return text.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
}

async function runBackfill() {
  console.log("Starting Full Historical Booking Backfill...");

  let allLocalUnits = await prisma.unit.findMany({
    select: { id: true, propertyId: true, name: true, type: true }
  });

  const firstProperty = await prisma.property.findFirst();
  if (!firstProperty) {
    throw new Error("No property found in database to assign bookings to!");
  }

  // Get total pages from first request
  const initialRes = await intellistay.fetch('/api/Booking/GetAllBookingsByPagination', {
    method: 'POST',
    body: JSON.stringify({
      pagination: { page: 1, limit: 10 },
      filter: { getAll: true, orderBy: "bookingId", order: "desc" }
    })
  });

  if (!initialRes.ok) throw new Error("Failed to authenticate or reach API.");
  const initialData = await initialRes.json();
  const totalPages = initialData?.pagination?.totalPages || 100;
  
  console.log(`Total Pages to fetch: ${totalPages}`);

  let successCount = 0;
  let newCount = 0;
  let updateCount = 0;

  for (let page = 1; page <= totalPages; page++) {
    console.log(`Fetching Page ${page} of ${totalPages}...`);
    const response = await intellistay.fetch('/api/Booking/GetAllBookingsByPagination', {
      method: 'POST',
      body: JSON.stringify({
        pagination: { page: page, limit: 10 },
        filter: { getAll: true, orderBy: "bookingId", order: "desc" }
      })
    });

    if (!response.ok) continue;

    const data = await response.json();
    const bookings = data?.data?.items || data?.data?.bookings || [];

    if (bookings.length === 0) {
      console.log("No more bookings found. Ending backfill.");
      break;
    }

    for (const booking of bookings) {
      try {
        const intellistayBookingId = String(booking.bookingId || booking.id);
        
        // Guest Upsert
        const customer = booking.customerDetails && booking.customerDetails.length > 0 ? booking.customerDetails[0] : null;
        let customerPhone = customer?.mobile ? String(customer.mobile) : "0000000000";
        customerPhone = normalizePhoneNumber(customerPhone);
        const customerEmail = customer?.email || null;
        const customerName = customer?.customerName || "Unknown Guest";
        const rawCustomerId = customer?.customerId;
        const intellistayGuestId = (rawCustomerId && rawCustomerId !== 0) ? String(rawCustomerId) : customerPhone;

        let guest = await prisma.guest.findFirst({
          where: { OR: [{ intellistayGuestId: intellistayGuestId }, { phone: customerPhone }] }
        });

        if (guest) {
          guest = await prisma.guest.update({
            where: { id: guest.id },
            data: { name: customerName, email: customerEmail, phone: customerPhone, intellistayGuestId: intellistayGuestId }
          });
        } else {
          guest = await prisma.guest.create({
            data: { intellistayGuestId, name: customerName, email: customerEmail, phone: customerPhone }
          });
        }

        // Unit Mapping
        let unitId = null;
        let propertyId = null;
        if (booking.roomDetails && Array.isArray(booking.roomDetails) && booking.roomDetails.length > 0) {
          const r = booking.roomDetails[0];
          const roomNumber = String(r.roomNo || r.roomId || r.roomTypeName || 'Unassigned'); 
          const normalizedIncoming = normalizeText(roomNumber);
          
          let localUnit = allLocalUnits.find(u => {
            if (u.type === 'SYNCED_ROOM') return false;
            const normLocal = normalizeText(u.name);
            return normLocal === normalizedIncoming || normLocal.includes(normalizedIncoming) || normalizedIncoming.includes(normLocal);
          });
          
          if (!localUnit) {
            console.log(`Skipping backfill for booking ${intellistayBookingId} as room ${roomNumber} is not matched.`);
            continue; // Skip invalid rooms
          }
          
          if (localUnit) {
            unitId = localUnit.id;
            propertyId = localUnit.propertyId;
          }
        }

        if (!unitId || !propertyId) continue; // Skip invalid rooms

        const checkInDate = parseIstDate(booking.checkInDate);
        const checkOutDate = parseIstDate(booking.checkOutDate);
        const rawStatus = mapBookingStatus(booking.bookingStatusId || booking.status);
        const status = calculateEffectiveStatus(rawStatus, checkInDate, checkOutDate);
        const totalAmount = parseFloat(booking.grandTotal) || 0;
        const specialRequest = booking.specialRequest ? `Special Request: ${booking.specialRequest}\n` : '';
        const paymentInfo = `Payment Status: ${booking.paymentStatus || 'Unknown'}\nPaid: ${booking.totalPaidAmount || 0}`;
        const bookingNotes = `${specialRequest}${paymentInfo}`;

        const existingRes = await prisma.reservation.findUnique({
          where: { intellistayReservationId: intellistayBookingId }
        });

        if (existingRes) {
          // If already checked in/out/cancelled locally, skip to protect user manual overrides
          if (existingRes.status !== 'CONFIRMED') continue;

          await prisma.reservation.update({
            where: { id: existingRes.id },
            data: { guestId: guest.id, unitId, checkIn: checkInDate, checkOut: checkOutDate, status, totalAmount, bookingNotes }
          });
          updateCount++;
        } else {
          let inferredSource = booking.source || "Walk-In";
          if (inferredSource.toLowerCase() !== 'walk-in' && inferredSource.toLowerCase() !== 'walkin') inferredSource = "OTA";

          await prisma.reservation.create({
            data: { intellistayReservationId: intellistayBookingId, propertyId, guestId: guest.id, unitId, checkIn: checkInDate, checkOut: checkOutDate, status, source: inferredSource, totalAmount, bookingNotes }
          });
          newCount++;
        }
        successCount++;
      } catch (err: any) {
        console.error(`Error processing booking: ${err.message}`);
      }
    }
  }

  console.log(`Backfill Complete! Processed: ${successCount} (New: ${newCount}, Updated: ${updateCount})`);
}

runBackfill().catch(console.error);
