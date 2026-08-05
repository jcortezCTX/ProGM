import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../lib/prisma.js";
import { createDelivery, listDeliveries, updateDelivery } from "./deliveryService.js";
import { createRequisition } from "./requisitionService.js";

// This table already holds real (Phase 4 Delivery Log) rows in dev, so
// every query below is scoped via a marker embedded in `truck_number`
// unique to this test run - never via a full-table walk or unbounded
// `limit`.
const runId = Date.now();
const marker = `MARK${runId}`;
const ids: string[] = [];
const requisitionIds: string[] = [];

beforeAll(async () => {
  const r1 = await createRequisition({ requisition_number: `TEST-REQ-LIST-${runId}-1` });
  const r2 = await createRequisition({ requisition_number: `TEST-REQ-LIST-${runId}-2` });
  requisitionIds.push(r1.id, r2.id);

  // D1/D2 are linked to a requisition (requisition_number resolvable);
  // D3/D4 are not (requisition_id null) - exercises sorting over a
  // relation-scalar field whose null case is "no linked requisition".
  const d1 = await createDelivery({ requisition_id: r1.id, truck_number: marker });
  const d2 = await createDelivery({ requisition_id: r2.id, truck_number: marker });
  const d3 = await createDelivery({ truck_number: marker });
  const d4 = await createDelivery({ truck_number: marker });
  ids.push(d1.id, d2.id, d3.id, d4.id);

  // D2 and D4 are closed; D1 and D3 stay open (the default) - exercises the
  // status filter combined with search/sort.
  await updateDelivery(d2.id, { status: "closed" });
  await updateDelivery(d4.id, { status: "closed" });
});

afterAll(async () => {
  await prisma.deliveries.deleteMany({ where: { id: { in: ids } } });
  await prisma.requisitions.deleteMany({ where: { id: { in: requisitionIds } } });
});

describe("listDeliveries pagination", () => {
  it("walks every page to the end with no duplicates or omissions", async () => {
    const seen: string[] = [];
    let cursor: string | undefined;
    for (let guard = 0; guard < 10; guard++) {
      const res = await listDeliveries({ cursor, limit: 2, order: "asc", q: marker });
      seen.push(...res.data.map((r) => r.id));
      if (!res.hasMore) break;
      cursor = res.nextCursor ?? undefined;
    }
    expect(new Set(seen).size).toBe(seen.length);
    expect(seen.sort()).toEqual([...ids].sort());
  });

  it("sorts asc by requisition_number with unlinked deliveries last", async () => {
    const res = await listDeliveries({ limit: 50, sort: "requisition_number", order: "asc", q: marker });
    expect(res.data).toHaveLength(4);
    const codes = res.data.map((r) => r.requisition_number);
    const firstNullIndex = codes.findIndex((c) => c === null);
    let lastNonNullIndex = -1;
    codes.forEach((c, i) => {
      if (c !== null) lastNonNullIndex = i;
    });
    expect(lastNonNullIndex).toBeLessThan(firstNullIndex);
  });

  it("sorts desc by requisition_number with unlinked deliveries first", async () => {
    const res = await listDeliveries({ limit: 50, sort: "requisition_number", order: "desc", q: marker });
    expect(res.data).toHaveLength(4);
    const codes = res.data.map((r) => r.requisition_number);
    let lastNullIndex = -1;
    codes.forEach((c, i) => {
      if (c === null) lastNullIndex = i;
    });
    const firstNonNullIndex = codes.findIndex((c) => c !== null);
    expect(lastNullIndex).toBeLessThan(firstNonNullIndex);
  });

  it("filters by status=open combined with search", async () => {
    const res = await listDeliveries({ limit: 50, order: "asc", q: marker, status: "open" });
    expect(res.data).toHaveLength(2);
    expect(res.data.every((r) => r.status === "open")).toBe(true);
  });

  it("filters by status=closed combined with search", async () => {
    const res = await listDeliveries({ limit: 50, order: "asc", q: marker, status: "closed" });
    expect(res.data).toHaveLength(2);
    expect(res.data.every((r) => r.status === "closed")).toBe(true);
  });

  it("returns an empty page (not an error) when the status filter matches nothing in scope", async () => {
    const res = await listDeliveries({ limit: 50, order: "asc", q: `no-such-thing-${runId}`, status: "open" });
    expect(res).toEqual({ data: [], hasMore: false, nextCursor: null });
  });
});
