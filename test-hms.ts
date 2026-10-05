import { intellistay } from "./lib/intellistay/client";
import { config } from "dotenv";
config();

async function showPaginationBug() {
  console.log("Fetching Page 1 from Intellistay Production...");
  const res1 = await intellistay.fetch('/api/Booking/GetAllBookingsByPagination', {
    method: 'POST',
    body: JSON.stringify({ pageNumber: 1, pageSize: 10 })
  });
  const data1 = await res1.json();
  const bookings1 = data1?.data?.items || data1?.data?.bookings || [];
  const ids1 = bookings1.map((b: any) => b.bookingId);
  
  console.log("Fetching Page 50 from Intellistay Production...");
  const res50 = await intellistay.fetch('/api/Booking/GetAllBookingsByPagination', {
    method: 'POST',
    body: JSON.stringify({ pageNumber: 50, pageSize: 10 })
  });
  const data50 = await res50.json();
  const bookings50 = data50?.data?.items || data50?.data?.bookings || [];
  const ids50 = bookings50.map((b: any) => b.bookingId);

  console.log("\n--- RESULTS ---");
  console.log("Total Bookings Reported by API:", data1?.data?.pagination?.total);
  console.log("Page 1 Booking IDs:", ids1);
  console.log("Page 50 Booking IDs:", ids50);
}

showPaginationBug();
