-- CreateEnum
CREATE TYPE "delivery_line_disposition" AS ENUM ('accept', 'conditional_use', 'reject');

-- AlterEnum
BEGIN;
CREATE TYPE "delivery_status_new" AS ENUM ('open', 'closed');
ALTER TABLE "public"."deliveries" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "deliveries" ALTER COLUMN "status" TYPE "delivery_status_new" USING ("status"::text::"delivery_status_new");
ALTER TYPE "delivery_status" RENAME TO "delivery_status_old";
ALTER TYPE "delivery_status_new" RENAME TO "delivery_status";
DROP TYPE "public"."delivery_status_old";
ALTER TABLE "deliveries" ALTER COLUMN "status" SET DEFAULT 'open';
COMMIT;

-- DropIndex
DROP INDEX "deliveries_reference_number_key";

-- AlterTable
ALTER TABLE "deliveries" DROP COLUMN "delivered_at",
DROP COLUMN "destination",
DROP COLUMN "reference_number",
DROP COLUMN "scheduled_at",
ADD COLUMN     "accepted_by" TEXT,
ADD COLUMN     "accepted_by_supervision" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "bill_of_lading_no" TEXT,
ADD COLUMN     "conforms_to_specifications" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "qc_notes" TEXT,
ADD COLUMN     "received_date" DATE NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "received_in_good_condition" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "report_number" SERIAL NOT NULL,
ADD COLUMN     "requisition_id" UUID,
ADD COLUMN     "supplier" TEXT,
ADD COLUMN     "truck_number" TEXT,
ALTER COLUMN "status" SET DEFAULT 'open';

-- AlterTable
ALTER TABLE "delivery_line_items" DROP COLUMN "quantity",
ADD COLUMN     "condition" TEXT,
ADD COLUMN     "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "description" TEXT,
ADD COLUMN     "disposition" "delivery_line_disposition" NOT NULL DEFAULT 'accept',
ADD COLUMN     "properly_marked" BOOLEAN,
ADD COLUMN     "quantity_received" DECIMAL NOT NULL,
ADD COLUMN     "requisition_line_item_id" UUID,
ADD COLUMN     "shipment_number" TEXT;

-- CreateTable
CREATE TABLE "requisitions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "requisition_number" TEXT NOT NULL,
    "supplier" TEXT,
    "notes" TEXT,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "requisitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "requisition_line_items" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "requisition_id" UUID NOT NULL,
    "inventory_item_id" UUID NOT NULL,
    "description" TEXT,
    "quantity_ordered" DECIMAL NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "requisition_line_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "requisitions_requisition_number_key" ON "requisitions"("requisition_number");

-- CreateIndex
CREATE INDEX "idx_requisition_line_items_requisition" ON "requisition_line_items"("requisition_id");

-- CreateIndex
CREATE UNIQUE INDEX "deliveries_report_number_key" ON "deliveries"("report_number");

-- CreateIndex
CREATE INDEX "idx_delivery_line_items_requisition_line_item" ON "delivery_line_items"("requisition_line_item_id");

-- AddForeignKey
ALTER TABLE "requisitions" ADD CONSTRAINT "requisitions_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "requisition_line_items" ADD CONSTRAINT "requisition_line_items_requisition_id_fkey" FOREIGN KEY ("requisition_id") REFERENCES "requisitions"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "requisition_line_items" ADD CONSTRAINT "requisition_line_items_inventory_item_id_fkey" FOREIGN KEY ("inventory_item_id") REFERENCES "inventory_items"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_requisition_id_fkey" FOREIGN KEY ("requisition_id") REFERENCES "requisitions"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "delivery_line_items" ADD CONSTRAINT "delivery_line_items_requisition_line_item_id_fkey" FOREIGN KEY ("requisition_line_item_id") REFERENCES "requisition_line_items"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;


-- CreateView (not managed by Prisma Migrate; recreate manually if this view's definition changes)
CREATE VIEW "requisition_fulfillment" AS
SELECT
    requisition_line_item_id,
    SUM(quantity_received) AS quantity_received
FROM delivery_line_items
WHERE requisition_line_item_id IS NOT NULL
  AND disposition IN ('accept', 'conditional_use')
GROUP BY requisition_line_item_id;
