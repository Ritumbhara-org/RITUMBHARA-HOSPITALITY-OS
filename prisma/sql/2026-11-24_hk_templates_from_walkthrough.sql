-- HK checklist templates from the Ashadeep "5-Star Housekeeping Checklist" walkthrough video.
-- Run AFTER the HkLocation rows exist (add them in /hk-admin/locations). Idempotent: skips a
-- template if one with the same title already exists for that location. Edit areas later in /hk-admin/checklists.
DO $$
DECLARE
  loc record;
  tid text;
  n int;
  i int;
  bedrooms int := 3;   -- Penthouse 813 (3BHK): change if different
  bathrooms int := 3;
  bed_items text := E'• पुरानी चादर और तकिए के कवर हटाएं\n• बेड के नीचे सफ़ाई करें\n• गद्दा और हेडबोर्ड साफ़ करें\n• नई चादरें ठीक से बिछाएं (सिलवट नहीं, कोने टाइट)\n• तकिए और कुशन सही जगह रखें\n• दराज़ और अलमारी साफ़ करें';
  bath_items text := E'• टॉयलेट सीट पूरी तरह साफ़ करें\n• वॉशबेसिन और नल चमकाएं\n• शॉवर एरिया साफ़ करें\n• फ़र्श सूखा रखें (एक भी बाल नहीं दिखना चाहिए)';
  kit_items text := E'• गैस / इंडक्शन साफ़ करें\n• सिंक और फ्रिज साफ़ करें\n• माइक्रोवेव अंदर-बाहर साफ़ करें\n• बर्तन सूखे रखें (नया स्पंज लगाएं)';
  liv_items text := E'• सोफ़ा और कुशन साफ़ करें\n• रिमोट सही जगह रखें\n• डेकोर और पर्दे साफ़ करें\n• झाड़ू लगाएं\n• पत्ते और जाले हटाएं\n• एंट्रेंस साफ़ करें';
BEGIN
  -- Studio template: Studio units at these properties
  FOR loc IN
    SELECT l.id FROM "HkLocation" l JOIN "Property" p ON p.id = l."propertyId"
    WHERE p.name IN ('Ashadeep Jagatpura','Wonder Megacity Alwar','Urban Suites Jagatpura')
  LOOP
    IF NOT EXISTS (SELECT 1 FROM "HkChecklistTemplate" WHERE "locationId"=loc.id AND title='Studio – 5-Star Checklist') THEN
      tid := 'hkt_' || md5(random()::text || clock_timestamp()::text);
      INSERT INTO "HkChecklistTemplate"(id,"locationId",title,"unitType","isActive","updatedAt")
        VALUES (tid, loc.id, 'Studio – 5-Star Checklist', 'Studio', true, now());
      INSERT INTO "HkChecklistArea"(id,"templateId",title,"sortOrder",instructions,"updatedAt") VALUES
        ('hka_'||md5(random()::text||'1'||tid), tid, 'बेडरूम (Bedroom)', 1, bed_items, now()),
        ('hka_'||md5(random()::text||'2'||tid), tid, 'बाथरूम (Bathroom)', 2, bath_items, now()),
        ('hka_'||md5(random()::text||'3'||tid), tid, 'किचन (Kitchen)', 3, kit_items, now()),
        ('hka_'||md5(random()::text||'4'||tid), tid, 'लिविंग एरिया (Living area)', 4, liv_items, now());
    END IF;
  END LOOP;

  -- 3BHK template: Penthouse at Wonder Megacity; bedroom + bathroom repeated per room
  FOR loc IN
    SELECT l.id FROM "HkLocation" l JOIN "Property" p ON p.id = l."propertyId"
    WHERE p.name = 'Wonder Megacity Alwar'
  LOOP
    IF NOT EXISTS (SELECT 1 FROM "HkChecklistTemplate" WHERE "locationId"=loc.id AND title='3BHK – 5-Star Checklist') THEN
      tid := 'hkt_' || md5(random()::text || clock_timestamp()::text);
      INSERT INTO "HkChecklistTemplate"(id,"locationId",title,"unitType","isActive","updatedAt")
        VALUES (tid, loc.id, '3BHK – 5-Star Checklist', 'Penthouse', true, now());
      n := 0;
      FOR i IN 1..bedrooms LOOP
        n := n + 1;
        INSERT INTO "HkChecklistArea"(id,"templateId",title,"sortOrder",instructions,"updatedAt")
          VALUES ('hka_'||md5(random()::text||n||tid), tid, 'बेडरूम '||i||' (Bedroom '||i||')', n, bed_items, now());
      END LOOP;
      FOR i IN 1..bathrooms LOOP
        n := n + 1;
        INSERT INTO "HkChecklistArea"(id,"templateId",title,"sortOrder",instructions,"updatedAt")
          VALUES ('hka_'||md5(random()::text||n||tid), tid, 'बाथरूम '||i||' (Bathroom '||i||')', n, bath_items, now());
      END LOOP;
      INSERT INTO "HkChecklistArea"(id,"templateId",title,"sortOrder",instructions,"updatedAt") VALUES
        ('hka_'||md5(random()::text||'k'||tid), tid, 'किचन (Kitchen)', n+1, kit_items, now()),
        ('hka_'||md5(random()::text||'l'||tid), tid, 'लिविंग एरिया (Living area)', n+2, liv_items, now());
    END IF;
  END LOOP;
END $$;
