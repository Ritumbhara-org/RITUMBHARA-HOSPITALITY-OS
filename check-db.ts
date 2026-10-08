import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  // Delete the mock reservations and guests that the seed script created
  await prisma.reservation.deleteMany()
  await prisma.guest.deleteMany()
  // Clean DB
  await prisma.syncLog.deleteMany()

  const propertyCount = await prisma.property.count()
  const unitCount = await prisma.unit.count()
  const teamMemberCount = await prisma.teamMember.count()
  const reservationCount = await prisma.reservation.count()
  const guestCount = await prisma.guest.count()

  console.log(`Properties: ${propertyCount}`)
  console.log(`Units: ${unitCount}`)
  console.log(`Team Members: ${teamMemberCount}`)
  console.log(`Reservations: ${reservationCount}`)
  console.log(`Guests: ${guestCount}`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
