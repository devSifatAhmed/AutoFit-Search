-- Add row-scoped storage for every RANGE field.
CREATE TABLE "RowRangeValue" (
    "id" TEXT NOT NULL,
    "rowId" TEXT NOT NULL,
    "fieldId" TEXT NOT NULL,
    "minValue" INTEGER NOT NULL,
    "maxValue" INTEGER NOT NULL,

    CONSTRAINT "RowRangeValue_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RowRangeValue_rowId_fieldId_key" ON "RowRangeValue"("rowId", "fieldId");
CREATE INDEX "RowRangeValue_rowId_fieldId_idx" ON "RowRangeValue"("rowId", "fieldId");
CREATE INDEX "RowRangeValue_fieldId_minValue_maxValue_idx" ON "RowRangeValue"("fieldId", "minValue", "maxValue");

ALTER TABLE "RowRangeValue" ADD CONSTRAINT "RowRangeValue_rowId_fkey" FOREIGN KEY ("rowId") REFERENCES "SearchRow"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RowRangeValue" ADD CONSTRAINT "RowRangeValue_fieldId_fkey" FOREIGN KEY ("fieldId") REFERENCES "Field"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Keep the old columns during the transition, but stop making new code depend on them.
ALTER TABLE "SearchRow" ALTER COLUMN "startYear" DROP NOT NULL;
ALTER TABLE "SearchRow" ALTER COLUMN "endYear" DROP NOT NULL;

-- Backfill current single-range rows into the new field-scoped storage.
INSERT INTO "RowRangeValue" ("id", "rowId", "fieldId", "minValue", "maxValue")
SELECT
    CONCAT('legacy_range_', row_data."id", '_', first_range_field."id"),
    row_data."id",
    first_range_field."id",
    row_data."startYear",
    row_data."endYear"
FROM "SearchRow" row_data
JOIN LATERAL (
    SELECT "id"
    FROM "Field"
    WHERE "shopId" = row_data."shopId"
      AND "type" = 'RANGE'
    ORDER BY "position" ASC
    LIMIT 1
) first_range_field ON TRUE
WHERE row_data."startYear" IS NOT NULL
  AND row_data."endYear" IS NOT NULL
ON CONFLICT ("rowId", "fieldId") DO NOTHING;
