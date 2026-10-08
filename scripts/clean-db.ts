const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function cleanDB() {
  console.log("Cleaning database...");

  // Delete messages first
  await prisma.whatsAppMessage.deleteMany({});
  console.log("Deleted all messages.");

  // Delete ticket audit logs
  await prisma.ticketAuditLog.deleteMany({});
  
  // Delete tickets and housekeeping tasks
  await prisma.ticket.deleteMany({});
  await prisma.housekeepingTask.deleteMany({});
  console.log("Deleted all tickets and tasks.");

  // Delete point transactions and memberships before guests
  await prisma.pointTransaction.deleteMany({});
  await prisma.membership.deleteMany({});

  // Delete reservations
  await prisma.reservation.deleteMany({});
  console.log("Deleted all reservations.");

  // Delete guests
  await prisma.guest.deleteMany({});
  console.log("Deleted all guests.");

  // Delete sync logs so we can do a fresh sync
  await prisma.syncLog.deleteMany({});
  console.log("Deleted all sync logs.");

  // Reset units to AVAILABLE
  await prisma.unit.updateMany({
    data: { status: 'AVAILABLE' }
  });
  console.log("Reset all units to AVAILABLE.");

  console.log("Database cleaned successfully.");
}

cleanDB().catch(console.error).finally(() => prisma.$disconnect());
