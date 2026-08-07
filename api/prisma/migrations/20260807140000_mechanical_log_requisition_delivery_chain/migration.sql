-- Mechanical Log -> Requisition -> Delivery -> Inventory chain.
-- See MATERIAL_FLOW_SPEC.md §4. This migration is purely additive: it wires
-- the FKs up and swaps the fulfillment view. The data backfill (§6) runs as a
-- separate reviewable script, and the drops land in the migration after it.

-- §4.1 -----------------------------------------------------------------------
-- requisition_id: set by the backfill from a numeric `release`, editable from
--   the Requisition UI afterward. Nullable forever - unreleased rows exist.
-- inventory_item_id: null until first receipt, then claimed once by the
--   receiving service. Deliberately NOT a received-quantity counter.
ALTER TABLE "mechanical_log_items"
  ADD COLUMN "requisition_id"    UUID NULL,
  ADD COLUMN "inventory_item_id" UUID NULL;

ALTER TABLE "mechanical_log_items"
  ADD CONSTRAINT "mechanical_log_items_requisition_id_fkey"
  FOREIGN KEY ("requisition_id") REFERENCES "requisitions"("id")
  ON DELETE SET NULL ON UPDATE NO ACTION;

ALTER TABLE "mechanical_log_items"
  ADD CONSTRAINT "mechanical_log_items_inventory_item_id_fkey"
  FOREIGN KEY ("inventory_item_id") REFERENCES "inventory_items"("id")
  ON DELETE SET NULL ON UPDATE NO ACTION;

CREATE INDEX "idx_mechanical_log_items_requisition"
  ON "mechanical_log_items"("requisition_id");
CREATE INDEX "idx_mechanical_log_items_inventory_item"
  ON "mechanical_log_items"("inventory_item_id");

-- §4.2 -----------------------------------------------------------------------
-- Replaces requisition_line_item_id as the "what was this received against"
-- link. inventory_item_id stays NOT NULL: every accepted receipt must resolve
-- to a real inventory item so inventory_transactions.item_id is always valid.
ALTER TABLE "delivery_line_items"
  ADD COLUMN "mechanical_log_item_id" UUID NULL;

ALTER TABLE "delivery_line_items"
  ADD CONSTRAINT "delivery_line_items_mechanical_log_item_id_fkey"
  FOREIGN KEY ("mechanical_log_item_id") REFERENCES "mechanical_log_items"("id")
  ON DELETE SET NULL ON UPDATE NO ACTION;

CREATE INDEX "idx_delivery_line_items_mechanical_log_item"
  ON "delivery_line_items"("mechanical_log_item_id");

-- §5.3 -----------------------------------------------------------------------
-- 129 of 565 real log rows have no tag number but still need a unique SKU.
-- Allocated only at first receipt, never at import - otherwise 129 phantom
-- inventory items appear for material that never arrived.
CREATE SEQUENCE IF NOT EXISTS "mechanical_log_sku_seq";

-- §4.3 -----------------------------------------------------------------------
-- Receipt totals are derived, never stored (same rule as inventory stock).
-- Only accept / conditional_use count; reject contributes nothing.
CREATE VIEW "mechanical_log_fulfillment" AS
SELECT
    dli.mechanical_log_item_id,
    SUM(dli.quantity_received) AS quantity_received
FROM delivery_line_items dli
WHERE dli.mechanical_log_item_id IS NOT NULL
  AND dli.disposition IN ('accept', 'conditional_use')
GROUP BY dli.mechanical_log_item_id;
