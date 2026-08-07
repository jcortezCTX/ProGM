/**
 * Backfill for MATERIAL_FLOW_SPEC.md §6 — wires the existing Mechanical Log,
 * Requisition, Delivery and Inventory rows into the new chain.
 *
 * Run it AFTER migration 20260807140000_mechanical_log_requisition_delivery_chain
 * and BEFORE 20260807141000_drop_requisition_line_items — step 3 reads
 * delivery_line_items.requisition_line_item_id, which the later migration drops.
 *
 *   npx tsx prisma/backfillMaterialFlow.ts
 *
 * Idempotent: safe to run twice, and safe to re-run after re-importing the CSV
 * (importMechanicalLog.ts). Everything is queried through raw SQL rather than
 * the generated client so the script keeps working either side of the drop.
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma.js";

// A release string is a requisition number only if it is all digits after
// trimming (§3.3). `EMAIL`, `Hold - Not in GMP2` and blank are human
// annotations, not requisitions — their log rows keep requisition_id NULL and
// their raw release text is never normalised.
const NUMERIC_RELEASE = /^\d+$/;

interface Summary {
  requisitionsCreated: number;
  requisitionsExisting: number;
  logRowsLinkedToRequisition: number;
  logRowsBacklinkedToInventory: number;
  deliveryLinesMigrated: number;
  deliveryLinesUnresolved: number;
}

async function createRequisitionsFromReleases(): Promise<Pick<Summary, "requisitionsCreated" | "requisitionsExisting">> {
  const releases = await prisma.$queryRaw<{ release: string }[]>`
    SELECT DISTINCT TRIM(release) AS release
    FROM mechanical_log_items
    WHERE release IS NOT NULL AND TRIM(release) <> ''
  `;

  const numeric = releases.map((r) => r.release).filter((r) => NUMERIC_RELEASE.test(r));
  // Numeric sort so the summary reads 1,2,…,14 rather than 1,10,11,…
  numeric.sort((a, b) => Number(a) - Number(b));

  let created = 0;
  let existing = 0;

  for (const release of numeric) {
    const already = await prisma.requisitions.findUnique({ where: { requisition_number: release } });
    if (already) {
      existing += 1;
      continue;
    }

    // Modal supplier across that release's rows; null on a tie, per §6 step 1.
    const suppliers = await prisma.$queryRaw<{ supplier: string; n: bigint }[]>`
      SELECT supplier, COUNT(*) AS n
      FROM mechanical_log_items
      WHERE TRIM(release) = ${release}
        AND supplier IS NOT NULL AND TRIM(supplier) <> ''
      GROUP BY supplier
      ORDER BY n DESC
    `;
    const isTie = suppliers.length > 1 && suppliers[0].n === suppliers[1].n;
    const supplier = suppliers.length === 0 || isTie ? null : suppliers[0].supplier;

    await prisma.requisitions.create({
      data: { requisition_number: release, supplier, notes: "Created by material-flow backfill from Mechanical Log release." },
    });
    created += 1;
  }

  return { requisitionsCreated: created, requisitionsExisting: existing };
}

// Only ever fills in a NULL — never reassigns a row that already belongs to a
// requisition, so a user's manual reassignment survives a re-run (§5.1).
async function linkLogRowsToRequisitions(): Promise<number> {
  const linked = await prisma.$executeRaw`
    UPDATE mechanical_log_items m
    SET requisition_id = r.id
    FROM requisitions r
    WHERE m.requisition_id IS NULL
      AND m.release IS NOT NULL
      AND TRIM(m.release) ~ '^[0-9]+$'
      AND TRIM(m.release) = r.requisition_number
  `;
  return linked;
}

async function backlinkInventory(): Promise<number> {
  const linked = await prisma.$executeRaw`
    UPDATE mechanical_log_items m
    SET inventory_item_id = i.id
    FROM inventory_items i
    WHERE m.inventory_item_id IS NULL
      AND m.tag_number IS NOT NULL
      AND TRIM(m.tag_number) <> ''
      AND TRIM(m.tag_number) = i.sku
  `;
  return linked;
}

// §6 step 3. Only runs while requisition_line_item_id still exists; once the
// drop migration has been applied there is nothing to migrate and this is a
// no-op, which is what makes the script safe to re-run afterwards.
async function migrateDeliveryLines(): Promise<Pick<Summary, "deliveryLinesMigrated" | "deliveryLinesUnresolved">> {
  const [{ exists: columnExists }] = await prisma.$queryRaw<{ exists: boolean }[]>`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'delivery_line_items' AND column_name = 'requisition_line_item_id'
    ) AS exists
  `;
  if (!columnExists) {
    console.log("  delivery_line_items.requisition_line_item_id already dropped — nothing to migrate.");
    return { deliveryLinesMigrated: 0, deliveryLinesUnresolved: 0 };
  }

  const rows = await prisma.$queryRawUnsafe<
    { id: string; delivery_id: string; sku: string; delivery_requisition_id: string | null }[]
  >(`
    SELECT dli.id,
           dli.delivery_id,
           i.sku,
           d.requisition_id AS delivery_requisition_id
    FROM delivery_line_items dli
    JOIN inventory_items i ON i.id = dli.inventory_item_id
    JOIN deliveries d ON d.id = dli.delivery_id
    WHERE dli.requisition_line_item_id IS NOT NULL
      AND dli.mechanical_log_item_id IS NULL
  `);

  let migrated = 0;
  let unresolved = 0;

  for (const row of rows) {
    // Match on tag number *and* requisition, per §6 step 3 — the same tag
    // legitimately appears under two releases (38 of them do), so tag alone is
    // ambiguous.
    const candidates = await prisma.$queryRaw<{ id: string }[]>`
      SELECT id FROM mechanical_log_items
      WHERE TRIM(tag_number) = ${row.sku}
        AND requisition_id IS NOT DISTINCT FROM ${row.delivery_requisition_id}::uuid
    `;

    if (candidates.length !== 1) {
      // Never guess, never fail the run — just report it (§6).
      console.log(
        `  UNRESOLVED delivery_line_item ${row.id}: sku=${row.sku} ` +
          `delivery_requisition_id=${row.delivery_requisition_id ?? "null"} ` +
          `matched ${candidates.length} mechanical log rows`,
      );
      unresolved += 1;
      continue;
    }

    await prisma.$executeRaw`
      UPDATE delivery_line_items
      SET mechanical_log_item_id = ${candidates[0].id}::uuid
      WHERE id = ${row.id}::uuid
    `;
    migrated += 1;
  }

  return { deliveryLinesMigrated: migrated, deliveryLinesUnresolved: unresolved };
}

async function main() {
  console.log("Material-flow backfill (MATERIAL_FLOW_SPEC.md §6)\n");

  console.log("1/4 creating requisitions from numeric releases…");
  const { requisitionsCreated, requisitionsExisting } = await createRequisitionsFromReleases();

  console.log("2/4 linking mechanical log rows to requisitions…");
  const logRowsLinkedToRequisition = await linkLogRowsToRequisitions();

  console.log("3/4 migrating existing delivery lines…");
  const { deliveryLinesMigrated, deliveryLinesUnresolved } = await migrateDeliveryLines();

  console.log("4/4 backlinking mechanical log rows to inventory items…");
  const logRowsBacklinkedToInventory = await backlinkInventory();

  const summary: Summary = {
    requisitionsCreated,
    requisitionsExisting,
    logRowsLinkedToRequisition,
    logRowsBacklinkedToInventory,
    deliveryLinesMigrated,
    deliveryLinesUnresolved,
  };

  const totals = await prisma.$queryRaw<{ total: bigint; linked: bigint; unlinked: bigint }[]>`
    SELECT COUNT(*) AS total,
           COUNT(requisition_id) AS linked,
           COUNT(*) - COUNT(requisition_id) AS unlinked
    FROM mechanical_log_items
  `;

  console.log("\n--- summary ---");
  console.log(`requisitions created             : ${summary.requisitionsCreated}`);
  console.log(`requisitions already present     : ${summary.requisitionsExisting}`);
  console.log(`log rows linked this run         : ${summary.logRowsLinkedToRequisition}`);
  console.log(`log rows backlinked to inventory : ${summary.logRowsBacklinkedToInventory}`);
  console.log(`delivery lines migrated          : ${summary.deliveryLinesMigrated}`);
  console.log(`delivery lines unresolved        : ${summary.deliveryLinesUnresolved}`);
  console.log(`\nmechanical_log_items total       : ${totals[0].total}`);
  console.log(`  with requisition_id            : ${totals[0].linked}`);
  console.log(`  without (blank/EMAIL/Hold)     : ${totals[0].unlinked}`);

  if (summary.deliveryLinesUnresolved > 0) {
    console.log(
      "\n!! Review the UNRESOLVED lines above before applying " +
        "20260807141000_drop_requisition_line_items — that migration is what makes them unrecoverable.",
    );
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
