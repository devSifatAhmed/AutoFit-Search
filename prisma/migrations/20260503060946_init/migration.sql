-- CreateEnum
CREATE TYPE "FieldType" AS ENUM ('SELECT', 'RANGE');

-- CreateEnum
CREATE TYPE "SortOrder" AS ENUM ('A_Z', 'Z_A', 'DB_ORDER', 'POPULARITY');

-- CreateEnum
CREATE TYPE "Visibility" AS ENUM ('VISIBLE', 'HIDDEN');

-- CreateEnum
CREATE TYPE "AttachmentType" AS ENUM ('PRODUCT', 'COLLECTION');

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "isOnline" BOOLEAN NOT NULL DEFAULT false,
    "scope" TEXT,
    "expires" TIMESTAMP(3),
    "accessToken" TEXT NOT NULL,
    "userId" BIGINT,
    "firstName" TEXT,
    "lastName" TEXT,
    "email" TEXT,
    "accountOwner" BOOLEAN NOT NULL DEFAULT false,
    "locale" TEXT,
    "collaborator" BOOLEAN DEFAULT false,
    "emailVerified" BOOLEAN DEFAULT false,
    "refreshToken" TEXT,
    "refreshTokenExpires" TIMESTAMP(3),

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Shop" (
    "id" TEXT NOT NULL,
    "shopifyGid" TEXT NOT NULL,
    "domain" TEXT,
    "name" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Shop_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Field" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "type" "FieldType" NOT NULL,
    "label" TEXT NOT NULL,
    "placeholder" TEXT,
    "visibility" "Visibility" NOT NULL,
    "sortOrder" "SortOrder" NOT NULL,
    "rangeStart" INTEGER,
    "rangeEnd" INTEGER,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Field_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SearchRow" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SearchRow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RowValue" (
    "id" TEXT NOT NULL,
    "rowId" TEXT NOT NULL,
    "fieldId" TEXT NOT NULL,
    "value" TEXT,
    "minValue" INTEGER,
    "maxValue" INTEGER,

    CONSTRAINT "RowValue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RowAttachment" (
    "id" TEXT NOT NULL,
    "rowId" TEXT NOT NULL,
    "type" "AttachmentType" NOT NULL,
    "shopifyGid" TEXT NOT NULL,

    CONSTRAINT "RowAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FilterSuggestion" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "fieldId" TEXT NOT NULL,
    "value" TEXT NOT NULL,

    CONSTRAINT "FilterSuggestion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Shop_shopifyGid_key" ON "Shop"("shopifyGid");

-- CreateIndex
CREATE INDEX "Field_shopId_idx" ON "Field"("shopId");

-- CreateIndex
CREATE UNIQUE INDEX "Field_shopId_id_key" ON "Field"("shopId", "id");

-- CreateIndex
CREATE INDEX "SearchRow_shopId_idx" ON "SearchRow"("shopId");

-- CreateIndex
CREATE INDEX "RowValue_fieldId_value_idx" ON "RowValue"("fieldId", "value");

-- CreateIndex
CREATE INDEX "RowValue_fieldId_minValue_maxValue_idx" ON "RowValue"("fieldId", "minValue", "maxValue");

-- CreateIndex
CREATE UNIQUE INDEX "RowValue_rowId_fieldId_key" ON "RowValue"("rowId", "fieldId");

-- CreateIndex
CREATE INDEX "RowAttachment_shopifyGid_idx" ON "RowAttachment"("shopifyGid");

-- CreateIndex
CREATE UNIQUE INDEX "RowAttachment_rowId_shopifyGid_key" ON "RowAttachment"("rowId", "shopifyGid");

-- CreateIndex
CREATE INDEX "FilterSuggestion_shopId_fieldId_idx" ON "FilterSuggestion"("shopId", "fieldId");

-- CreateIndex
CREATE UNIQUE INDEX "FilterSuggestion_shopId_fieldId_value_key" ON "FilterSuggestion"("shopId", "fieldId", "value");

-- AddForeignKey
ALTER TABLE "Field" ADD CONSTRAINT "Field_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("shopifyGid") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SearchRow" ADD CONSTRAINT "SearchRow_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("shopifyGid") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RowValue" ADD CONSTRAINT "RowValue_rowId_fkey" FOREIGN KEY ("rowId") REFERENCES "SearchRow"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RowValue" ADD CONSTRAINT "RowValue_fieldId_fkey" FOREIGN KEY ("fieldId") REFERENCES "Field"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RowAttachment" ADD CONSTRAINT "RowAttachment_rowId_fkey" FOREIGN KEY ("rowId") REFERENCES "SearchRow"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FilterSuggestion" ADD CONSTRAINT "FilterSuggestion_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("shopifyGid") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FilterSuggestion" ADD CONSTRAINT "FilterSuggestion_fieldId_fkey" FOREIGN KEY ("fieldId") REFERENCES "Field"("id") ON DELETE CASCADE ON UPDATE CASCADE;
