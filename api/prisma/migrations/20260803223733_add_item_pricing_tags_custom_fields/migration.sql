-- CreateEnum
CREATE TYPE "inventory_custom_field_type" AS ENUM ('text', 'textarea', 'number', 'select', 'checkbox');

-- AlterTable
ALTER TABLE "inventory_items" ADD COLUMN     "barcode" TEXT,
ADD COLUMN     "custom_fields" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN     "notes" TEXT,
ADD COLUMN     "price" DECIMAL NOT NULL DEFAULT 0,
ADD COLUMN     "product_link" TEXT;

-- CreateTable
CREATE TABLE "inventory_custom_field_defs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "field_key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "field_type" "inventory_custom_field_type" NOT NULL,
    "options" JSONB,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inventory_custom_field_defs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_tags" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inventory_tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_item_tags" (
    "item_id" UUID NOT NULL,
    "tag_id" UUID NOT NULL,

    CONSTRAINT "inventory_item_tags_pkey" PRIMARY KEY ("item_id","tag_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "inventory_custom_field_defs_field_key_key" ON "inventory_custom_field_defs"("field_key");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_tags_name_key" ON "inventory_tags"("name");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_items_barcode_key" ON "inventory_items"("barcode");

-- AddForeignKey
ALTER TABLE "inventory_item_tags" ADD CONSTRAINT "inventory_item_tags_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "inventory_items"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "inventory_item_tags" ADD CONSTRAINT "inventory_item_tags_tag_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "inventory_tags"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

