-- MATERIAL_FLOW_SPEC.md §3.2 / §4.2 / §6 step 5.
--
-- Because Release IS the requisition, a requisition's line items *are* its
-- Mechanical Log rows. requisition_line_items was a second, divergent copy of
-- the ordered quantity; qty_released on the log row is now the one place that
-- number lives.
--
-- ORDER MATTERS: `npx tsx prisma/backfillMaterialFlow.ts` must run against the
-- previous migration's schema *before* this one is applied, or the
-- requisition_line_item_id -> mechanical_log_item_id remapping (§6 step 3) has
-- nothing left to read. On a fresh/empty database there is nothing to migrate
-- and the order is irrelevant.

DROP VIEW IF EXISTS "requisition_fulfillment";

ALTER TABLE "delivery_line_items"
  DROP CONSTRAINT IF EXISTS "delivery_line_items_requisition_line_item_id_fkey";

DROP INDEX IF EXISTS "idx_delivery_line_items_requisition_line_item";

ALTER TABLE "delivery_line_items"
  DROP COLUMN IF EXISTS "requisition_line_item_id";

DROP TABLE IF EXISTS "requisition_line_items";
