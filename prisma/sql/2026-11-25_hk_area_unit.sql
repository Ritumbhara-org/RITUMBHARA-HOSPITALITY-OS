-- Extra rooms/spaces for one unit: a checklist area can be limited to a single unit. Additive and idempotent.
ALTER TABLE "HkChecklistArea" ADD COLUMN IF NOT EXISTS "unitId" TEXT;
CREATE INDEX IF NOT EXISTS "HkChecklistArea_unitId_idx" ON "HkChecklistArea"("unitId");
DO $$ BEGIN
  ALTER TABLE "HkChecklistArea" ADD CONSTRAINT "HkChecklistArea_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
