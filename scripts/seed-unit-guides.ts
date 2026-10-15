import dns from 'node:dns';
dns.setDefaultResultOrder('ipv4first');

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface UnitSeedData {
  unitIdentifier: string; // substring to match unit name (e.g. "1210", "Villa 65")
  propertySlug: string;
  gateAccessCode?: string;
  doorLockCode?: string;
  checkInGuide: string;
  checkOutGuide: string;
  googleMapsUrl: string;
  emergencyContacts: string;
}

const ASHADEEP_CONTACTS = `Salim (Contact person): 9503002629
Shankar (Electrician): 9649428190
Ramdayal (Maintenance): 9664147262
Ganesh (Ashadeep) (Proprietor / Manager): 8562884444`;

const ASHADEEP_CHECKOUT = "Switch OFF all MCBs, submit keys and access card to the guard.";
const ASHADEEP_MAPS = "https://share.google/WCIMy4vfr0HOdKbM7";

const ALWAR_CONTACTS = `Salim (Contact person): 9503002629
Sanjay (Electrician): 9887406888
Neeru Chauhan (Manager): 9119128699
Sachin (Contact person): 9887228736`;

const ALWAR_CHECKOUT = "Lock the door. No keys to submit.";
const ALWAR_MAPS = "https://share.google/xKlzJHWZlrcXlZ0rA";

const SEED_DATA: UnitSeedData[] = [
  // 1) Sariska
  {
    unitIdentifier: "Villa 65",
    propertySlug: "ms-valley-sariska",
    checkInGuide: "1. The caretaker will meet you in person to give you the keys. 2. Please call us 30 minutes before reaching the property.",
    checkOutGuide: "Hand over the keys to the caretaker.",
    googleMapsUrl: "https://share.google/6qi5w5SduRJeP56Ar",
    emergencyContacts: `Salim (Contact person): 9503002629\nIrfan (Housekeeping / Caretaker): +91 87694 34974`
  },

  // 2) Urban Suites Jagatpura
  {
    unitIdentifier: "925",
    propertySlug: "urban-jagatpura",
    doorLockCode: "07121986#",
    checkInGuide: "1. This is a self-check-in property. Park the car in the parking area. 2. Move to the reception lobby, show your IDs, and ask them to give access to the 9th Floor, Studio No. 925. 3. Take the elevator to the 9th Floor. 4. After reaching the 9th Floor, take the right and go to Apt No. 925. 5. Use the keypad access code 07121986# to open the door (there is a # at the end of the code). 6. Note: every time you want to go up, ask reception to give you elevator access using their card.",
    checkOutGuide: "Smart lock - no key submission. Submit any access card given.",
    googleMapsUrl: "https://share.google/PKvfyraWswQHA7Tso",
    emergencyContacts: `Salim (Contact person): 9503002629\nProperty Manager (Contact person): 9079994153`
  },

  // 3) Ashadeep Jagatpura (9 units)
  {
    unitIdentifier: "1210",
    propertySlug: "ashadeep-jagatpura",
    gateAccessCode: "299239",
    checkInGuide: "1. Get in through the Gate (Block B1). 2. Share the code 299239 with the guard for seamless check-in into the building. You will get the access card and keys from the guard. 3. To access the elevator, you need to use the access card.",
    checkOutGuide: ASHADEEP_CHECKOUT,
    googleMapsUrl: ASHADEEP_MAPS,
    emergencyContacts: ASHADEEP_CONTACTS
  },
  {
    unitIdentifier: "1211",
    propertySlug: "ashadeep-jagatpura",
    gateAccessCode: "930081",
    checkInGuide: "1. Get in through the Gate (Block B1). 2. Share the code 930081 with the guard for seamless check-in into the building. You will get the access card and keys from the guard. 3. To access the elevator, you need to use the access card.",
    checkOutGuide: ASHADEEP_CHECKOUT,
    googleMapsUrl: ASHADEEP_MAPS,
    emergencyContacts: ASHADEEP_CONTACTS
  },
  {
    unitIdentifier: "1212",
    propertySlug: "ashadeep-jagatpura",
    gateAccessCode: "215224",
    checkInGuide: "1. Get in through the Gate (Block B1). 2. Share the code 215224 with the guard for seamless check-in into the building. You will get the access card and keys from the guard. 3. To access the elevator, you need to use the access card.",
    checkOutGuide: ASHADEEP_CHECKOUT,
    googleMapsUrl: ASHADEEP_MAPS,
    emergencyContacts: ASHADEEP_CONTACTS
  },
  {
    unitIdentifier: "1213",
    propertySlug: "ashadeep-jagatpura",
    gateAccessCode: "813293",
    checkInGuide: "1. Get in through the Gate (Block B1). 2. Share the Access Code 813293 with the entry guard to get the keys. 3. After getting the keys, move to the reception lobby and share the apartment number with the guard to get entry to the elevator.",
    checkOutGuide: ASHADEEP_CHECKOUT,
    googleMapsUrl: ASHADEEP_MAPS,
    emergencyContacts: ASHADEEP_CONTACTS
  },
  {
    unitIdentifier: "212",
    propertySlug: "ashadeep-jagatpura",
    gateAccessCode: "073701",
    checkInGuide: "1. Get in through the Gate (Block B1). 2. Share the code 073701 and get the access card and keys. 3. Take the apartment keys from this gate and go 50 meters inside. You will find a reception glass door on the left side. Enter this door and share the apartment number with the reception guard or manager, who will give you access to the elevator which takes you to the 2nd Floor.",
    checkOutGuide: ASHADEEP_CHECKOUT,
    googleMapsUrl: ASHADEEP_MAPS,
    emergencyContacts: ASHADEEP_CONTACTS
  },
  {
    unitIdentifier: "615",
    propertySlug: "ashadeep-jagatpura",
    gateAccessCode: "225072",
    checkInGuide: "1. Get in through the Gate (Block B1). 2. Share the Access Code 225072 to get the keys from the Block B1 Gate guard. 3. To access the elevator, you need to use the access card. 4. Switch ON all the MCBs one by one from left to right to switch ON all the lights and electrical equipment.",
    checkOutGuide: ASHADEEP_CHECKOUT,
    googleMapsUrl: ASHADEEP_MAPS,
    emergencyContacts: ASHADEEP_CONTACTS
  },
  {
    unitIdentifier: "616",
    propertySlug: "ashadeep-jagatpura",
    gateAccessCode: "559272",
    checkInGuide: "1. Get in through the Gate (Block B1). 2. Share the code 559272 and get the access card and keys. 3. Take the apartment keys from this gate and go 50 meters inside. You will find a reception glass door on the left side. Enter this door and share the apartment number with the reception guard or manager, who will give you access to the elevator which takes you to the 6th Floor.",
    checkOutGuide: ASHADEEP_CHECKOUT,
    googleMapsUrl: ASHADEEP_MAPS,
    emergencyContacts: ASHADEEP_CONTACTS
  },
  {
    unitIdentifier: "711",
    propertySlug: "ashadeep-jagatpura",
    gateAccessCode: "277046",
    checkInGuide: "1. Get in through the Gate (Block B1). 2. Share the code 277046 with the guard for seamless check-in into the building. You will get the access card and keys from the guard. 3. To access the elevator, you need to use the access card. 4. Switch ON all the MCBs one by one from left to right to switch ON all the lights and electrical equipment.",
    checkOutGuide: ASHADEEP_CHECKOUT,
    googleMapsUrl: ASHADEEP_MAPS,
    emergencyContacts: ASHADEEP_CONTACTS
  },
  {
    unitIdentifier: "909",
    propertySlug: "ashadeep-jagatpura",
    gateAccessCode: "704669",
    checkInGuide: "1. Get in through the Gate (Block B1). 2. Share the Access Code 704669 with the entry guard to get the keys. 3. After getting the keys, move to the reception lobby and share the apartment number with the guard to get entry to the elevator.",
    checkOutGuide: ASHADEEP_CHECKOUT,
    googleMapsUrl: ASHADEEP_MAPS,
    emergencyContacts: ASHADEEP_CONTACTS
  },

  // 4) Wonder Megacity Alwar (5 units)
  {
    unitIdentifier: "502",
    propertySlug: "wonder-megacity-alwar",
    gateAccessCode: "335429",
    doorLockCode: "07121987*",
    checkInGuide: "1. At the Main Gate, give the access code 335429 for entry. 2. Head straight to the 5th Floor using the elevator. 3. After reaching the 5th floor, take a left turn to go to apartment 502. 4. Smart Lock Code: 07121987* (there is a star at the end of the code).",
    checkOutGuide: ALWAR_CHECKOUT,
    googleMapsUrl: ALWAR_MAPS,
    emergencyContacts: ALWAR_CONTACTS
  },
  {
    unitIdentifier: "603",
    propertySlug: "wonder-megacity-alwar",
    gateAccessCode: "228023",
    doorLockCode: "07121986*",
    checkInGuide: "1. At the Main Gate, give the access code 228023 for entry. 2. Head straight to the 6th Floor using the elevator. 3. After reaching the 6th floor, take a left turn to go to apartment 603. 4. Smart Lock Code: 07121986* (there is a star at the end of the code).",
    checkOutGuide: ALWAR_CHECKOUT,
    googleMapsUrl: ALWAR_MAPS,
    emergencyContacts: ALWAR_CONTACTS
  },
  {
    unitIdentifier: "807",
    propertySlug: "wonder-megacity-alwar",
    gateAccessCode: "259699",
    doorLockCode: "07121987*",
    checkInGuide: "1. At the Main Gate, give the access code 259699 for entry. 2. Head straight to the 8th Floor using the elevator. 3. After reaching the 8th floor, take a right turn to go to apartment 807. 4. Smart Lock Code: 07121987* (there is a star at the end of the code).",
    checkOutGuide: ALWAR_CHECKOUT,
    googleMapsUrl: ALWAR_MAPS,
    emergencyContacts: ALWAR_CONTACTS
  },
  {
    unitIdentifier: "808",
    propertySlug: "wonder-megacity-alwar",
    gateAccessCode: "235155",
    doorLockCode: "07121986*",
    checkInGuide: "1. At the Main Gate, give the access code 235155 for entry. 2. Head straight to the 8th Floor using the elevator. 3. After reaching the 8th floor, take a right turn to go to apartment 808. 4. Smart Lock Code: 07121986* (there is a star at the end of the code).",
    checkOutGuide: ALWAR_CHECKOUT,
    googleMapsUrl: ALWAR_MAPS,
    emergencyContacts: ALWAR_CONTACTS
  },
  {
    unitIdentifier: "813",
    propertySlug: "wonder-megacity-alwar",
    gateAccessCode: "250819",
    doorLockCode: "141701*",
    checkInGuide: "1. At the Main Gate, give the access code 250819 for entry. 2. Head straight to the Block 2, 8th Floor using the elevator. 3. After reaching the 8th floor, take a left turn to go to apartment 813. 4. Smart Lock Code: 141701* (there is a star at the end of the code).",
    checkOutGuide: ALWAR_CHECKOUT,
    googleMapsUrl: ALWAR_MAPS,
    emergencyContacts: ALWAR_CONTACTS
  }
];

async function seed() {
  console.log(`Starting to seed unit guides for ${SEED_DATA.length} units...`);

  const properties = await prisma.property.findMany({
    include: { units: true }
  });

  let updatedCount = 0;

  for (const item of SEED_DATA) {
    const property = properties.find(p => p.slug === item.propertySlug);
    if (!property) {
      console.warn(`[WARNING] Property slug "${item.propertySlug}" not found!`);
      continue;
    }

    const regex = new RegExp(`(^|\\s)${item.unitIdentifier}($|\\s)`, 'i');
    const unit = property.units.find(u => regex.test(u.name));
    if (!unit) {
      console.warn(`[WARNING] Unit with identifier "${item.unitIdentifier}" not found under property "${property.name}"!`);
      continue;
    }

    await prisma.unit.update({
      where: { id: unit.id },
      data: {
        gateAccessCode: item.gateAccessCode || null,
        doorLockCode: item.doorLockCode || null,
        checkInGuide: item.checkInGuide,
        checkOutGuide: item.checkOutGuide,
        emergencyContacts: item.emergencyContacts,
        googleMapsUrl: item.googleMapsUrl
      }
    });

    console.log(`✔ Updated Unit: [${property.name}] -> ${unit.name} (Gate: ${item.gateAccessCode || 'N/A'}, Door: ${item.doorLockCode || 'N/A'})`);
    updatedCount++;
  }

  console.log(`\nSuccessfully updated ${updatedCount} / ${SEED_DATA.length} units with full guides and codes!`);
}

seed()
  .catch(e => console.error("Error seeding unit guides:", e))
  .finally(() => prisma.$disconnect());
