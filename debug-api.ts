import { intellistay } from "./lib/intellistay/client";
import { config } from "dotenv";
config();

async function run() {
  const response = await intellistay.fetch('/api/Booking/GetAllBookingsByPagination', {
    method: 'POST',
    body: JSON.stringify({ pageNumber: 100, pageSize: 10 })
  });

  const data = await response.json();
  const bookings = data?.data?.items || data?.data?.bookings || [];
  for (const b of bookings) {
    if (b.roomDetails && b.roomDetails.length > 0) {
      console.log(`Booking ${b.bookingId}: roomNo=${b.roomDetails[0].roomNo}, roomId=${b.roomDetails[0].roomId}, roomTypeName=${b.roomDetails[0].roomTypeName}`);
    } else {
      console.log(`Booking ${b.bookingId}: No roomDetails!`);
    }
  }
}

run();
