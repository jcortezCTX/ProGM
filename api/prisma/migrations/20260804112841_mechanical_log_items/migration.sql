-- CreateTable
CREATE TABLE "mechanical_log_items" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "release" TEXT,
    "supplier" TEXT,
    "review" TEXT,
    "tag_number" TEXT,
    "qty_released" DECIMAL,
    "unit" TEXT,
    "size" TEXT,
    "description" TEXT,
    "material" TEXT,
    "lining" TEXT,
    "coating" TEXT,
    "release_date" DATE,
    "due_date" DATE,
    "area" TEXT,
    "system" TEXT,
    "contract_dwg" TEXT,
    "system2" TEXT,
    "shop_dwg" TEXT,
    "delivered_qty" DECIMAL,
    "need_qty" DECIMAL,
    "received_on" DATE,
    "received_by" TEXT,
    "storage_location" TEXT,
    "notes" TEXT,
    "estimate_cost" DECIMAL,
    "contract_unit_price" DECIMAL,
    "contract_extended_price" DECIMAL,
    "above_below" TEXT,
    "invoice_no" TEXT,
    "invoice_unit_price" DECIMAL,
    "invoice_extended_price" DECIMAL,
    "delta_invoice_contract" DECIMAL,
    "qty_invoiced_to_date" DECIMAL,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mechanical_log_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_mechanical_log_items_tag_number" ON "mechanical_log_items"("tag_number");

-- AddForeignKey
ALTER TABLE "mechanical_log_items" ADD CONSTRAINT "mechanical_log_items_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

