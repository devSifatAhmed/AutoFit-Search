/*
  Warnings:

  - A unique constraint covering the columns `[shopId,position]` on the table `Field` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "Field_shopId_position_key" ON "Field"("shopId", "position");
