import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../lib/prisma.js";
import { listMechanicalLogItems } from "./mechanicalLogService.js";

// ES2022 target lacks Array.prototype.findLastIndex.
function lastIndexWhere<T>(arr: T[], predicate: (item: T) => boolean): number {
  for (let i = arr.length - 1; i >= 0; i--) {
    if (predicate(arr[i])) return i;
  }
  return -1;
}

// This table already holds hundreds of real (imported CSV) rows in dev, so
// every query below is scoped via a marker embedded in `description` (and,
// for the search test, in `supplier`) unique to this test run - never via
// a full-table walk or an unbounded `limit`, which would be slow and flaky
// against real data volume.
const runId = Date.now();
const marker = `MARK${runId}`;
const tag = (n: number) => `TEST-TAG-${runId}-${n}`;
const ids: string[] = [];

beforeAll(async () => {
  // Mix of tagged and untagged (null tag_number) rows so pagination and
  // sorting over a nullable sort field - the default sort - is exercised.
  const rows = await prisma.$transaction([
    prisma.mechanical_log_items.create({
      data: { tag_number: tag(1), description: `Butterfly valve ${marker}`, supplier: `Acme-${runId} Valves` },
    }),
    prisma.mechanical_log_items.create({
      data: { tag_number: tag(2), description: `Gate valve ${marker}`, supplier: `Acme-${runId} Valves` },
    }),
    prisma.mechanical_log_items.create({
      data: { tag_number: tag(3), description: `Check valve ${marker}`, supplier: `Beta-${runId} Supply` },
    }),
    prisma.mechanical_log_items.create({
      data: { tag_number: null, description: `Untagged spool ${marker}`, supplier: `Beta-${runId} Supply` },
    }),
    prisma.mechanical_log_items.create({
      data: { tag_number: null, description: `Another untagged spool ${marker}`, supplier: `Gamma-${runId} Co` },
    }),
  ]);
  ids.push(...rows.map((r) => r.id));
});

afterAll(async () => {
  await prisma.mechanical_log_items.deleteMany({ where: { id: { in: ids } } });
});

describe("listMechanicalLogItems pagination", () => {
  it("walks every page to the end with no duplicates or omissions, including null tag_number rows", async () => {
    const seen: string[] = [];
    let cursor: string | undefined;
    for (let guard = 0; guard < 10; guard++) {
      const res = await listMechanicalLogItems({ cursor, limit: 2, order: "asc", q: marker });
      seen.push(...res.data.map((r) => r.id));
      if (!res.hasMore) break;
      cursor = res.nextCursor ?? undefined;
    }
    expect(new Set(seen).size).toBe(seen.length); // no duplicates
    expect(seen.sort()).toEqual([...ids].sort()); // nothing missing
  });

  it("sorts asc by tag_number with nulls last (Postgres default)", async () => {
    const res = await listMechanicalLogItems({ limit: 50, sort: "tag_number", order: "asc", q: marker });
    expect(res.data).toHaveLength(5);
    const lastTaggedIndex = lastIndexWhere(res.data, (r) => r.tag_number !== null);
    const firstUntaggedIndex = res.data.findIndex((r) => r.tag_number === null);
    expect(lastTaggedIndex).toBeLessThan(firstUntaggedIndex);
  });

  it("sorts desc by tag_number with nulls first", async () => {
    const res = await listMechanicalLogItems({ limit: 50, sort: "tag_number", order: "desc", q: marker });
    expect(res.data).toHaveLength(5);
    const lastUntaggedIndex = lastIndexWhere(res.data, (r) => r.tag_number === null);
    const firstTaggedIndex = res.data.findIndex((r) => r.tag_number !== null);
    expect(lastUntaggedIndex).toBeLessThan(firstTaggedIndex);
  });

  it("filters by free-text search across description/supplier/tag_number", async () => {
    const res = await listMechanicalLogItems({ limit: 50, order: "asc", q: `Acme-${runId}` });
    expect(res.data).toHaveLength(2);
    expect(res.data.every((r) => r.supplier === `Acme-${runId} Valves`)).toBe(true);
  });

  it("returns an empty page (not an error) when nothing matches the search", async () => {
    const res = await listMechanicalLogItems({ limit: 50, order: "asc", q: `no-such-thing-${runId}` });
    expect(res).toEqual({ data: [], hasMore: false, nextCursor: null });
  });

  // Regression: keysetWhere used to unconditionally add a `{ field: null }`
  // OR-branch for asc sorts, which Prisma rejects against a non-nullable
  // column like created_at. Paginating past the first page is what
  // triggers it (the first page never needs a keyset predicate at all).
  it("paginates across multiple pages when sorting by the non-nullable created_at field", async () => {
    const seen: string[] = [];
    let cursor: string | undefined;
    for (let guard = 0; guard < 10; guard++) {
      const res = await listMechanicalLogItems({ cursor, limit: 2, sort: "created_at", order: "asc", q: marker });
      seen.push(...res.data.map((r) => r.id));
      if (!res.hasMore) break;
      cursor = res.nextCursor ?? undefined;
    }
    expect(new Set(seen).size).toBe(seen.length);
    expect(seen.sort()).toEqual([...ids].sort());
  });
});
