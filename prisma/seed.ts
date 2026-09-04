import { PrismaClient, UnitStatus, TicketCategory, TicketPriority, TicketStatus, ReporterType, HousekeepingTaskType, HousekeepingTaskStatus } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  console.log('Starting seed...')

  // Clean DB
  await prisma.ticketAuditLog.deleteMany()
  await prisma.ticket.deleteMany()
  await prisma.housekeepingTask.deleteMany()
  await prisma.reservation.deleteMany()
  await prisma.unit.deleteMany()
  await prisma.teamMember.deleteMany()
  await prisma.membership.deleteMany()
  await prisma.guest.deleteMany()
  await prisma.property.deleteMany()

  // 1 Property
  const property = await prisma.property.create({
    data: {
      name: 'Wonder Megacity',
      slug: 'wonder-megacity-bhubaneswar',
      address: 'Plot No. 123, Infocity Road',
      city: 'Bhubaneswar',
      state: 'Odisha',
      country: 'India',
      phone: '+919876543210',
      email: 'info@wondermegacity.com',
      timezone: 'Asia/Kolkata',
    },
  })

  // 4 Units
  const units = await Promise.all([
    prisma.unit.create({ data: { propertyId: property.id, name: '101', type: 'STANDARD', floor: '1', capacity: 2, status: UnitStatus.AVAILABLE } }),
    prisma.unit.create({ data: { propertyId: property.id, name: '102', type: 'DELUXE', floor: '1', capacity: 2, status: UnitStatus.OCCUPIED } }),
    prisma.unit.create({ data: { propertyId: property.id, name: '201', type: 'STANDARD', floor: '2', capacity: 2, status: UnitStatus.DIRTY } }),
    prisma.unit.create({ data: { propertyId: property.id, name: '204', type: 'SUITE', floor: '2', capacity: 4, status: UnitStatus.OCCUPIED } }),
  ])
  const unit101 = units[0]
  const unit102 = units[1]
  const unit201 = units[2]
  const unit204 = units[3]

  // 3 Guests
  const guest1 = await prisma.guest.create({ data: { name: 'Rahul Sharma', phone: '+919000000001', email: 'rahul@example.com' } })
  const guest2 = await prisma.guest.create({ data: { name: 'Priya Mehta', phone: '+919000000002', email: 'priya@example.com' } })
  const guest3 = await prisma.guest.create({ data: { name: 'Arjun Das', phone: '+919000000003', email: 'arjun@example.com' } })

  // 2 Reservations
  const today = new Date()
  const tomorrow = new Date(today)
  tomorrow.setDate(tomorrow.getDate() + 1)
  
  const yesterday = new Date(today)
  yesterday.setDate(yesterday.getDate() - 1)

  await prisma.reservation.create({
    data: {
      guestId: guest1.id,
      unitId: unit102.id,
      propertyId: property.id,
      checkIn: yesterday,
      checkOut: tomorrow,
      status: 'CHECKED_IN',
      source: 'DIRECT',
      totalAmount: 4500.0,
    }
  })

  await prisma.reservation.create({
    data: {
      guestId: guest2.id,
      unitId: unit204.id,
      propertyId: property.id,
      checkIn: today,
      checkOut: tomorrow,
      status: 'ARRIVING',
      source: 'OTA',
      totalAmount: 6000.0,
    }
  })

  // 3 Team Members
  const amit = await prisma.teamMember.create({ data: { name: 'Amit', phone: '+918000000001', whatsappNumber: '+918000000001', role: 'TECHNICIAN', department: 'MAINTENANCE', propertyId: property.id } })
  const priyaTeam = await prisma.teamMember.create({ data: { name: 'Priya', phone: '+918000000002', whatsappNumber: '+918000000002', role: 'HOUSEKEEPER', department: 'HOUSEKEEPING', propertyId: property.id } })
  const rohit = await prisma.teamMember.create({ data: { name: 'Rohit', phone: '+918000000003', whatsappNumber: '+918000000003', role: 'RECEPTIONIST', department: 'FRONT_DESK', propertyId: property.id } })

  // 2 Tickets
  const ticket1 = await prisma.ticket.create({
    data: {
      id: 'RT-0001',
      propertyId: property.id,
      unitId: unit204.id,
      guestId: guest2.id,
      reporterId: guest2.id,
      reporterType: ReporterType.GUEST,
      category: TicketCategory.MAINTENANCE,
      subcategory: 'AC',
      description: 'AC not working',
      priority: TicketPriority.HIGH,
      status: TicketStatus.IN_PROGRESS,
      assignedToId: amit.id,
      slaDeadline: new Date(today.getTime() + 4 * 60 * 60 * 1000), // +4 hours
    }
  })

  await prisma.ticketAuditLog.create({
    data: {
      ticketId: ticket1.id,
      action: 'Status updated to IN_PROGRESS',
      actorId: amit.id,
      actorType: 'TEAM',
      toStatus: TicketStatus.IN_PROGRESS,
    }
  })

  const ticket2 = await prisma.ticket.create({
    data: {
      id: 'RT-0002',
      propertyId: property.id,
      unitId: unit102.id,
      guestId: guest1.id,
      reporterId: rohit.id,
      reporterType: ReporterType.TEAM,
      category: TicketCategory.GUEST_REQUEST,
      subcategory: 'TOWELS',
      description: 'Extra towels requested',
      priority: TicketPriority.MEDIUM,
      status: TicketStatus.OPEN,
      slaDeadline: new Date(today.getTime() + 24 * 60 * 60 * 1000), // +24 hours
    }
  })

  // 1 Housekeeping Task
  await prisma.housekeepingTask.create({
    data: {
      unitId: unit201.id,
      propertyId: property.id,
      type: HousekeepingTaskType.CHECKOUT_CLEAN,
      status: HousekeepingTaskStatus.PENDING,
      scheduledFor: today,
    }
  })

  console.log('Seed completed successfully.')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
