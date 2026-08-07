# MATERIAL_FLOW_SPEC.md — Mechanical Log → Requisition → Delivery → Inventory

**Status:** Approved by the project owner (2026-08-07). This document is the
authority on how these four modules relate. Where it conflicts with
`BUILD_PLAN.md` notes or existing code comments, **this document wins** — and
the conflicting comment must be updated, not left to rot.

**Read before writing any code that touches** `mechanical_log_items`,
`requisitions`, `requisition_line_items`, `deliveries`, `delivery_line_items`,
`inventory_items`, or `inventory_transactions`.

---

## 1. The real-world process

This is how the job actually runs. The database must mirror it.

1. **The project engineer builds the Mechanical Log.** It is the master list of
   every item that will be ordered on the job — one row per released tag/spool,
   with size, material, lining, coating, area, system, contract drawing,
   quantity, and contract pricing. The Mechanical Log is authored *before*
   anything is purchased and is the single source of truth for *what the job
   needs*.

2. **Requisitions are cut from the Mechanical Log.** The engineer groups a set
   of Mechanical Log rows and releases them to a supplier as a numbered
   requisition. In the source spreadsheet this is the **`Release` column** —
   *Release number **is** the requisition number.* Rows with Release `1` belong
   to Requisition 1, rows with Release `2` to Requisition 2, and so on.

3. **Material arrives on site → Delivery Log.** Each truck/shipment gets a
   receiving report. The receiver picks the items off the requisition, records
   the quantity actually received, inspects condition, and accepts or rejects.

4. **Accepted material becomes Inventory.** ~90% of everything in Inventory
   originated on the Mechanical Log. The receiving screen should let the user
   search the Mechanical Log, pick items, enter received quantities, and have
   the system **create the inventory item if it doesn't exist yet, or add stock
   to it if it does** — without the receiver having to pre-register anything.

### One sentence version

> Mechanical Log = what we plan to buy. Requisition = what we ordered.
> Delivery = what showed up. Inventory = what we currently have.

---

## 2. What is wrong today

The current schema models this chain **backwards**. Verified against
`api/prisma/schema.prisma` on 2026-08-07:

| Problem | Evidence | Impact |
|---|---|---|
| **`mechanical_log_items` is an orphan table.** | No FK to `requisitions`, `inventory_items`, or `delivery_line_items`. Schema comment reads *"Deliberately NOT wired into inventory_transactions."* | The master list of what the job needs is disconnected from everything that consumes it. Nothing can roll up. |
| **Requisitions are built from Inventory, not the Mechanical Log.** | `requisition_line_items.inventory_item_id` is **NOT NULL**. | Forces an inventory item to exist before it can be ordered — the exact inverse of the real process, where inventory is only created on receipt. |
| **Deliveries receive against Inventory, not the Log.** | `delivery_line_items.inventory_item_id` NOT NULL; `addDeliveryLineItem()` in `api/src/services/deliveryService.ts` throws `NotFoundError` if the inventory item doesn't already exist. | The receiver cannot record a delivery of anything not already in Inventory. There is no auto-create path. |
| **`Release` is dead text.** | `mechanical_log_items.release` is a nullable `String?` with no relation. | The one field that identifies the requisition is stored as an unindexed loose string. |
| **Duplicate identity is undefined.** | The real CSV has 565 rows, 394 unique tag numbers, 129 blank tag numbers. | No rule for what a "unique item" is, so an import creates duplicates or fails. |

### Facts from the real data (`logs_samples/Mechanical Log.csv`)

These are measured, not assumed. Any implementation must survive them.

- **565 data rows.**
- **`Release` values:** `1`(99), *blank*(99), `2`(74), `5`(72), `11`(48),
  `EMAIL`(43), `7`(36), `9`(30), `13`(18), `6`(11), `10`(9), `3`(8),
  `Hold - Not in GMP2`(7), `4`(5), `8`(3), `Email`(1), `12`(1), `14`(1).
- **Tag Number:** 436 rows have one; **129 rows are blank**. 394 distinct values.
- **38 tag numbers appear on more than one row — and *all 38* span two different
  Releases** (e.g. `104Ua-30-03` appears under Release `1` and Release `2`).
  The same product is legitimately ordered on two requisitions.
- **Suppliers:** `KAT`(394), *blank*(96), `ServCorp`(61), `Harrington`(14).
- The file is **not UTF-8** — it is latin-1 (inch marks `"` encoded as `0x94`).
  Any importer must open it with `encoding='latin-1'` / `latin1`.

---

## 3. Target model

```
                  mechanical_log_items                     ← master list, one row per released tag
                   │            │
   requisition_id  │            │  inventory_item_id        ← set at first receipt (nullable until then)
                   ▼            ▼
             requisitions   inventory_items ◄──────┐        ← SKU = tag number (or generated)
                   │                               │
   requisition_id  │ (nullable, single)            │ item_id
                   ▼                               │
              deliveries                  inventory_transactions
                   │                               ▲
     delivery_id   │                               │ delivery_line_item_id
                   ▼                               │
          delivery_line_items ─────────────────────┘
                   │
  mechanical_log_item_id  (nullable — the ~10% not on the log)
                   │
                   └──────────► mechanical_log_items
```

### 3.1 Cardinality — decided, do not re-litigate

| Relationship | Rule |
|---|---|
| Mechanical Log row → Requisition | **Many-to-one.** One log row belongs to at most one requisition. A log row's quantity is **never split** across requisitions. |
| Requisition → Delivery | **One-to-many.** A requisition can be filled by several deliveries (partial shipments). |
| Delivery → Requisition | **Many-to-one, single FK.** One delivery/truck carries material from **exactly one** requisition (or none). Keep `deliveries.requisition_id` as-is — do **not** move it to the line level. |
| Mechanical Log row → Inventory item | **Many-to-one.** Several log rows can point at the same inventory item, because the same tag number recurs across releases. |
| Delivery line → Mechanical Log row | **Many-to-one, nullable.** Multiple partial receipts against the same log row are normal. Null = received something never on the log. |

### 3.2 `requisition_line_items` is removed

Because **Release IS the requisition**, a requisition's line items *are* its
Mechanical Log rows. A separate join table is redundant and creates a second,
divergent copy of the ordered quantity.

- **Drop** `requisition_line_items`.
- `delivery_line_items.requisition_line_item_id` → replaced by
  `delivery_line_items.mechanical_log_item_id`.
- The `requisition_fulfillment` view is rewritten to key on
  `mechanical_log_item_id` (see §4.3).

> A requisition's ordered quantity for a line is `mechanical_log_items.qty_released`.
> There is exactly one place that number lives.

### 3.3 Releases that are not requisitions

`EMAIL` (44 rows, both casings), `Hold - Not in GMP2` (7 rows), and blank (99
rows) are **notes, not requisitions**.

- Do **not** create `requisitions` rows for them.
- `mechanical_log_items.requisition_id` stays **NULL**.
- Preserve the raw text in `mechanical_log_items.release` exactly as imported.
  It is a human annotation and must not be normalized, uppercased, or blanked.
- A release string is treated as a requisition number **only if it matches
  `^\d+$`** after trimming. Everything else is a note.

---

## 4. Schema changes

One Prisma migration. Name it `mechanical_log_requisition_delivery_chain`.

### 4.1 `mechanical_log_items`

```sql
ALTER TABLE mechanical_log_items
  ADD COLUMN requisition_id    UUID NULL REFERENCES requisitions(id),
  ADD COLUMN inventory_item_id UUID NULL REFERENCES inventory_items(id);

CREATE INDEX idx_mechanical_log_items_requisition ON mechanical_log_items(requisition_id);
CREATE INDEX idx_mechanical_log_items_inventory_item ON mechanical_log_items(inventory_item_id);
```

- `requisition_id` — set by the backfill from a numeric `release`; settable
  afterward from the Requisition UI. Nullable forever (unreleased rows exist).
- `inventory_item_id` — **null until the row is first received.** Set once, on
  first receipt, by the receiving service. Not user-editable in v1.

**Do not** add `quantity_received` / `quantity_remaining` columns to this table.
Both are derived (§4.3). This is the same rule as
`inventory_items.quantity_on_hand` in `CLAUDE.md` — a stored receipt total will
drift the first time a delivery line is corrected.

### 4.2 `delivery_line_items`

```sql
ALTER TABLE delivery_line_items
  ADD COLUMN mechanical_log_item_id UUID NULL REFERENCES mechanical_log_items(id);

CREATE INDEX idx_delivery_line_items_mechanical_log_item
  ON delivery_line_items(mechanical_log_item_id);

-- after backfill (§6):
ALTER TABLE delivery_line_items DROP COLUMN requisition_line_item_id;
DROP TABLE requisition_line_items;
```

`inventory_item_id` **stays NOT NULL.** Every accepted receipt must resolve to a
real inventory item — the service creates it if needed (§5.2). This preserves
the invariant that `inventory_transactions` always has a valid `item_id`.

### 4.3 Views — rewrite `requisition_fulfillment`

Replaces the version in
`api/prisma/migrations/20260804001938_delivery_receiving_and_requisitions/migration.sql`.

```sql
DROP VIEW IF EXISTS requisition_fulfillment;

CREATE VIEW mechanical_log_fulfillment AS
SELECT
    dli.mechanical_log_item_id,
    SUM(dli.quantity_received) AS quantity_received
FROM delivery_line_items dli
WHERE dli.mechanical_log_item_id IS NOT NULL
  AND dli.disposition IN ('accept', 'conditional_use')
GROUP BY dli.mechanical_log_item_id;
```

Rules that carry over unchanged:

- Only `accept` and `conditional_use` count. `reject` contributes nothing —
  identical to the inventory-stock rule.
- Never stored. Never cached in a column.

Add the matching Prisma `view` block alongside `inventory_current_stock` in
`schema.prisma`, and delete the `requisition_fulfillment` view model.

**Derived fields the API exposes** (computed, never columns):

| Field | Definition |
|---|---|
| `quantity_received` | `mechanical_log_fulfillment.quantity_received`, default `0` |
| `quantity_outstanding` | `qty_released - quantity_received`, floored at `0` |
| `fulfillment_status` | `not_received` (0) · `partial` (0 < r < qty) · `complete` (r ≥ qty) |

> Note: the legacy CSV columns `delivered_qty`, `need_qty`, `received_on`,
> `received_by` on `mechanical_log_items` are **imported history only**. Once
> the Delivery Log is live they are read-only and must not be written by the
> receiving flow. The live numbers come from the view. Mark them as such in the
> schema comment and grey them in the UI.

---

## 5. Service-layer behavior

### 5.1 Requisition service (`api/src/services/requisitionService.ts`)

- `createRequisition({ requisition_number, supplier, notes, mechanical_log_item_ids[] })`
  — creates the requisition, then sets `requisition_id` on each named log row **in
  the same DB transaction**.
- Reject with `409` if any supplied log row already has a different
  `requisition_id`. A row belongs to one requisition; reassignment must be
  explicit, not a silent overwrite.
- `getRequisition(id)` returns the requisition plus its log rows, each with
  `qty_released`, `quantity_received`, `quantity_outstanding`,
  `fulfillment_status`.
- `requisition_number` stays free-text `TEXT UNIQUE`. Do not coerce to integer —
  future jobs may number differently.

### 5.2 Receiving (`api/src/services/deliveryService.ts` → `addDeliveryLineItem`)

This is the heart of the change. New signature:

```ts
interface AddDeliveryLineItemInput {
  mechanical_log_item_id?: string | null;  // preferred path
  inventory_item_id?: string | null;       // fallback for off-log receipts
  shipment_number?: string | null;
  description?: string | null;
  quantity_received: DecimalInput;
  condition?: string | null;
  properly_marked?: boolean | null;
  disposition: DeliveryLineDisposition;
  note?: string | null;
  location?: string;
  created_by?: string | null;
}
```

**Resolution order for the inventory item — implement exactly this:**

1. If `inventory_item_id` is supplied, use it. Validate it exists. Done.
2. Else if `mechanical_log_item_id` is supplied:
   a. Load the log row. 404 if missing.
   b. If `log.inventory_item_id` is set → use it.
   c. Else compute the SKU:
      - `log.tag_number` trimmed, if non-empty; **else** a generated
        `ML-` + zero-padded 6-digit sequence (see §5.3).
   d. `findUnique({ sku })`. If found → use it. **This is the case where two
      releases share a tag number — they must converge on one inventory item,
      not create a duplicate.**
   e. If not found → create `inventory_items` from the log row:

      | inventory_items | ← mechanical_log_items |
      |---|---|
      | `sku` | `tag_number` (or generated) |
      | `name` | `description` truncated, else `tag_number` |
      | `description` | `description` |
      | `unit` | `unit`, defaulted to `'each'` if blank |
      | `price` | `contract_unit_price` ?? `0` |
      | `custom_fields` | `{ size, material, lining, coating, area, system, contract_dwg, shop_dwg }` |

   f. Write `log.inventory_item_id` back on the log row (idempotent claim).
3. Else → `400 { error: "..." }`. Never invent an item from nothing.

**Everything above happens inside the existing `prisma.$transaction`.** The
item create, the log-row backlink, the `delivery_line_items` insert, and the
`inventory_transactions` insert are one atomic unit. A partial write here
corrupts stock — the existing comment in `deliveryService.ts` already says this
and it still applies.

**Stock posting is unchanged:** `accept` and `conditional_use` post a `received`
transaction with `quantity.abs()`; `reject` posts nothing.

**Validation:**

- `quantity_received > 0`. Reject `0` and negatives at the Zod boundary.
- If `deliveries.requisition_id` is set **and** `mechanical_log_item_id` is set,
  the log row's `requisition_id` must match the delivery's. Mismatch → `409`
  with a message naming both requisition numbers.
- **Over-receipt is a warning, not an error.** If cumulative received would
  exceed `qty_released`, allow it and return
  `{ warning: "over_received", ordered, received_to_date }` in the response body.
  Field conditions produce legitimate overages; do not block the receiver.

### 5.3 Generated SKUs for untagged rows

129 of 565 log rows have no tag number. They still need a SKU because
`inventory_items.sku` is `UNIQUE NOT NULL`.

- Create a Postgres sequence `mechanical_log_sku_seq`.
- Format `ML-` + `LPAD(nextval::text, 6, '0')` → `ML-000001`.
- Allocate **only at first receipt**, never at import — otherwise 129 phantom
  inventory items appear for material that never arrived.
- The SKU is user-editable afterward on the Inventory detail page. Renaming the
  SKU must not break the `inventory_item_id` FK — it doesn't, since the link is
  by UUID.

### 5.4 Delete / correction semantics

- Deleting a `delivery_line_items` row must delete its `inventory_transactions`
  rows in the same transaction, or stock silently inflates.
- Do **not** clear `mechanical_log_items.inventory_item_id` when the last
  delivery line is deleted. The link is a durable identity claim, not a receipt
  counter.
- Changing a line's `disposition` from accepted → `reject` must delete the
  transaction; `reject` → accepted must create one. Handle both directions.

---

## 6. Backfill / migration of existing data

Run as a script under `api/prisma/`, alongside the existing
`importMechanicalLog.ts`. Idempotent — safe to run twice.

1. **Create requisitions from numeric releases.** Distinct `TRIM(release)`
   matching `^\d+$` → one `requisitions` row each, `requisition_number` = that
   string. Set `supplier` from the modal supplier of that release's rows
   (`KAT` dominates); leave null on a tie.
2. **Link log rows.** `mechanical_log_items.requisition_id` = the matching
   requisition. Rows with blank / `EMAIL` / `Email` / `Hold - Not in GMP2`
   releases stay NULL.
3. **Migrate existing delivery lines.** For each `delivery_line_items` row with
   a `requisition_line_item_id`, resolve the old line's `inventory_item_id`,
   find the log row whose `tag_number` equals that item's `sku` **and** whose
   `requisition_id` matches the delivery's, and set `mechanical_log_item_id`.
   Log every unresolved row to stdout — do not guess, do not fail the run.
4. **Backlink inventory.** For each log row, if an `inventory_items` row exists
   with `sku = TRIM(tag_number)`, set `inventory_item_id`.
5. **Then** drop `requisition_line_items` and the old column.

Print a summary: requisitions created, log rows linked, delivery lines migrated,
delivery lines unresolved. **Do not drop anything until the unresolved count is
reviewed.**

---

## 7. UI

### 7.1 Delivery detail — "Add from Mechanical Log"

`web/src/pages/DeliveryDetailPage.tsx`. This is the screen the whole change
exists to enable.

- Primary action on an open delivery: **Add items from Mechanical Log**.
- Opens a searchable picker over `mechanical_log_items`:
  - Search across `tag_number`, `description`, `size`, `material`, `area`,
    `system`.
  - **Default filter: rows on this delivery's requisition** when
    `deliveries.requisition_id` is set. A clearly-labelled toggle widens the
    search to the whole log — that's the escape hatch for the ~10%.
  - Each row shows `qty_released`, `quantity_received`, `quantity_outstanding`,
    and a fulfillment badge.
  - **Rows already fully received are shown, greyed, not hidden.** Hiding them
    makes over-receipt look like missing data.
- Multi-select, then one quantity input per selected row, pre-filled with
  `quantity_outstanding`.
- Per row: disposition (accept / conditional use / reject), condition, properly
  marked, note, storage location.
- Save posts one line per selection.
- After save, show per row: `Created inventory item ABC-123` or
  `Updated stock: ABC-123 → 78 LF`. The receiver must be able to see which of
  the two happened.
- Over-receipt renders an inline amber warning, not a blocking error.
- Keep a secondary **Add off-log item** action that picks straight from
  Inventory, for the ~10%.

### 7.2 Mechanical Log detail

Add a **Procurement** panel: requisition number (linked), received-to-date,
outstanding, fulfillment badge, linked inventory item (linked), and a table of
every delivery line that hit this row (delivery report #, date, qty,
disposition).

### 7.3 Requisition detail

Line items table is now the requisition's Mechanical Log rows, with ordered /
received / outstanding per row and a requisition-level fulfillment roll-up.
Deliveries against this requisition list underneath.

### 7.4 Inventory detail

Add a **Source** section: the Mechanical Log rows pointing at this item (there
may be several — the shared-tag-across-releases case), each with its
requisition.

---

## 8. Invariants — do not "optimize" these away

1. **Stock is derived.** No `quantity_on_hand` column, ever
   (`CLAUDE.md` rule 1). Unchanged by this spec.
2. **Receipt totals are derived.** No `quantity_received` column on
   `mechanical_log_items` or `requisitions`. Same failure mode as #1.
3. **One log row → one requisition.** Quantities are never split across
   requisitions. If a real case requires it, **stop and ask** — that is a
   structural change, not a column add.
4. **Release text is preserved verbatim.** `EMAIL` and `Hold - Not in GMP2` are
   data, not dirt.
5. **Tag number is not unique.** 38 tags recur across releases. `inventory_items.sku`
   is unique; `mechanical_log_items.tag_number` is not and must never be made so.
6. **Receiving is atomic.** Item create + log backlink + line insert +
   transaction insert, or nothing.
7. **Rejected material posts no stock.** Only `accept` and `conditional_use`.
8. **`delivered_qty` / `need_qty` / `received_on` / `received_by` on the log are
   frozen import history.** The live numbers come from the view.

---

## 9. Verification — required before this is called done

Per `CLAUDE.md`, assume nothing works until proven. Show real output for each:

- [ ] `tsc --noEmit` clean in `api/` and `web/`.
- [ ] Migration applied; `\d mechanical_log_items` shows both new FK columns
      and indexes; `\d+ mechanical_log_fulfillment` shows the view.
- [ ] `requisition_line_items` table is gone; nothing in `api/src` references it.
- [ ] Backfill run against a fresh import of the real CSV. Assert:
      **14 requisitions created** (releases 1–14), **rows with blank/EMAIL/Hold
      releases have `requisition_id IS NULL`**, and the linked-row count equals
      565 minus (99 blank + 43 `EMAIL` + 1 `Email` + 7 `Hold`) = **415**.
- [ ] Integration test: receive a log row with a tag number that has **no**
      inventory item → item auto-created with `sku = tag_number`, stock = qty,
      `log.inventory_item_id` set.
- [ ] Integration test: receive a **second** log row with the **same** tag
      number from a different release → **no** new inventory item; stock is the
      **sum**; both log rows point at the same `inventory_item_id`.
- [ ] Integration test: receive a log row with a **blank** tag → `ML-000001`
      generated; a second blank-tag row → `ML-000002`.
- [ ] Integration test: `disposition = 'reject'` → line row created, **zero**
      inventory transactions, `mechanical_log_fulfillment` unchanged.
- [ ] Integration test: partial receipt → `fulfillment_status = 'partial'`;
      second receipt closing the balance → `complete`.
- [ ] Integration test: over-receipt → succeeds, returns `warning: 'over_received'`.
- [ ] Integration test: delivery line deleted → its inventory transactions gone,
      `inventory_current_stock` back to the prior value.
- [ ] Integration test: log row on Requisition 2 added to a delivery whose
      `requisition_id` is Requisition 1 → `409`.
- [ ] `curl` the real endpoints and paste the responses — not "the code looks right".
- [ ] Manual UI pass: pick 3 log rows on a delivery, save, confirm one item was
      created and two updated, and that the confirmation says which.

---

## 10. Out of scope / stop and ask

- **Splitting a log row's quantity across requisitions.** Explicitly excluded.
- **One delivery spanning multiple requisitions.** Explicitly excluded;
  `deliveries.requisition_id` stays a single nullable FK.
- **Invoice reconciliation.** The CSV's `Invoice No.` field contains compound
  values like `3858(20);4179(20)` — multiple invoices with per-invoice
  quantities. Modelling that is a separate spec. Leave the column as text.
- **Purchase orders as a distinct entity from requisitions.** Not modelled.
- **Auto-creating requisitions when a user types a new release number** on a log
  row. Ask first — it decides whether requisitions are user-authored or derived.
- Anything requiring a structural schema change beyond the columns in §4.
