const fs = require('fs');
const path = require('path');
const files = [
  'analytics/page.tsx', 'dashboard/page.tsx', 'guests/page.tsx', 'guests/[id]/page.tsx',
  'inventory/page.tsx', 'locations/page.tsx', 'operations/page.tsx', 'reservations/page.tsx',
  'seo/page.tsx', 'team/page.tsx', 'units/page.tsx', 'whatsapp/page.tsx'
];
files.forEach(f => {
  const p = path.join('d:/RITUMBHARA HOSPITALITY OS/app/(dashboard)', f);
  if(fs.existsSync(p)) {
    let content = fs.readFileSync(p, 'utf8');
    content = content.replace(/export const dynamic = ['"]force-dynamic['"]/g, 'export const revalidate = 15');
    fs.writeFileSync(p, content);
  }
});
console.log('Replaced force-dynamic with revalidate=15');
