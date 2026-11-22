// Adds the "Villa turnover" checklist to a housekeeping location.
//
// Usage:  npx tsx scripts/seed-villa-checklist.ts "<HK location name>"
// Example: npx tsx scripts/seed-villa-checklist.ts "MS Valley Sariska"
//
// Safe to re-run: it does nothing if the location already has a template with
// this title. The database is shared by production and preview, so this writes
// to whichever DATABASE_URL is set. Only new rows are created.
import { PrismaClient } from '@prisma/client'
import { VILLA_AREAS, VILLA_TEMPLATE_TITLE, VILLA_UNIT_TYPE } from '../lib/hk/villa-checklist'

const prisma = new PrismaClient()

async function main() {
  const name = process.argv[2]?.trim()
  if (!name) throw new Error('Pass the housekeeping location name, e.g. "MS Valley Sariska".')

  const location = await prisma.hkLocation.findFirst({ where: { name: { equals: name, mode: 'insensitive' } } })
  if (!location) {
    const all = await prisma.hkLocation.findMany({ select: { name: true } })
    throw new Error(`No housekeeping location named "${name}". Existing: ${all.map((l) => l.name).join(', ') || 'none'}`)
  }

  const existing = await prisma.hkChecklistTemplate.findFirst({
    where: { locationId: location.id, title: VILLA_TEMPLATE_TITLE },
  })
  if (existing) {
    console.log(`"${VILLA_TEMPLATE_TITLE}" already exists at ${location.name}. Nothing changed.`)
    return
  }

  const template = await prisma.hkChecklistTemplate.create({
    data: {
      locationId: location.id,
      title: VILLA_TEMPLATE_TITLE,
      unitType: VILLA_UNIT_TYPE,
      areas: {
        create: VILLA_AREAS.map((a, i) => ({
          title: a.title,
          instructions: a.instructions,
          minPhotos: a.minPhotos,
          requiresVideo: a.requiresVideo,
          sortOrder: i + 1,
        })),
      },
    },
  })
  console.log(`Created "${template.title}" with ${VILLA_AREAS.length} areas at ${location.name}.`)
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
