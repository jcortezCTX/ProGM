import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../lib/prisma.js";
import { addRevision, createDrawing, listDrawings } from "./drawingService.js";

// This table already holds real (Drawing Log Phase 5) rows in dev, so every
// query below is scoped via a marker embedded in `title` unique to this
// test run - never via a full-table walk or an unbounded `limit`.
const runId = Date.now();
const marker = `MARK${runId}`;
const drawingNumber = (n: string) => `TEST-DWG-${runId}-${n}`;
const ids: string[] = [];

beforeAll(async () => {
  // A and B and E have a current revision (current_revision_code set); C
  // and D have none (current_revision_id stays null) - exercises sorting
  // over a relation-scalar field whose null case is "no revisions yet",
  // not a null column.
  const a = await createDrawing({ drawing_number: drawingNumber("A"), title: `Sheet A ${marker}` });
  const b = await createDrawing({ drawing_number: drawingNumber("B"), title: `Sheet B ${marker}` });
  const c = await createDrawing({ drawing_number: drawingNumber("C"), title: `Sheet C ${marker}` });
  const d = await createDrawing({ drawing_number: drawingNumber("D"), title: `Sheet D ${marker}` });
  const e = await createDrawing({ drawing_number: drawingNumber("E"), title: `Sheet E ${marker}` });
  ids.push(a.id, b.id, c.id, d.id, e.id);

  await addRevision(a.id, { revision_code: "1" });
  await addRevision(b.id, { revision_code: "2" });
  await addRevision(e.id, { revision_code: "10" });
});

afterAll(async () => {
  // FK order: clear the current_revision_id pointer before deleting
  // revisions, then delete revisions before deleting the drawings.
  await prisma.drawings.updateMany({ where: { id: { in: ids } }, data: { current_revision_id: null } });
  await prisma.drawing_revisions.deleteMany({ where: { drawing_id: { in: ids } } });
  await prisma.drawings.deleteMany({ where: { id: { in: ids } } });
});

describe("listDrawings pagination", () => {
  it("walks every page to the end with no duplicates or omissions", async () => {
    const seen: string[] = [];
    let cursor: string | undefined;
    for (let guard = 0; guard < 10; guard++) {
      const res = await listDrawings({ cursor, limit: 2, order: "asc", q: marker });
      seen.push(...res.data.map((r) => r.id));
      if (!res.hasMore) break;
      cursor = res.nextCursor ?? undefined;
    }
    expect(new Set(seen).size).toBe(seen.length);
    expect(seen.sort()).toEqual([...ids].sort());
  });

  it("sorts asc by current_revision_code with no-revision drawings last", async () => {
    const res = await listDrawings({ limit: 50, sort: "current_revision_code", order: "asc", q: marker });
    expect(res.data).toHaveLength(5);
    const codes = res.data.map((r) => r.current_revision_code);
    const firstNullIndex = codes.findIndex((c) => c === null);
    const lastNonNullIndex = (() => {
      let idx = -1;
      codes.forEach((c, i) => {
        if (c !== null) idx = i;
      });
      return idx;
    })();
    expect(lastNonNullIndex).toBeLessThan(firstNullIndex);
  });

  it("sorts desc by current_revision_code with no-revision drawings first", async () => {
    const res = await listDrawings({ limit: 50, sort: "current_revision_code", order: "desc", q: marker });
    expect(res.data).toHaveLength(5);
    const codes = res.data.map((r) => r.current_revision_code);
    const lastNullIndex = (() => {
      let idx = -1;
      codes.forEach((c, i) => {
        if (c === null) idx = i;
      });
      return idx;
    })();
    const firstNonNullIndex = codes.findIndex((c) => c !== null);
    expect(lastNullIndex).toBeLessThan(firstNonNullIndex);
  });

  it("filters by free-text search across drawing_number/title/discipline", async () => {
    const res = await listDrawings({ limit: 50, order: "asc", q: `${marker}` });
    expect(res.data).toHaveLength(5);
    expect(res.data.every((r) => r.title.includes(marker))).toBe(true);
  });

  it("narrows to a single row via drawing_number search", async () => {
    const res = await listDrawings({ limit: 50, order: "asc", q: drawingNumber("C") });
    expect(res.data).toHaveLength(1);
    expect(res.data[0].drawing_number).toBe(drawingNumber("C"));
  });

  it("returns an empty page (not an error) when nothing matches", async () => {
    const res = await listDrawings({ limit: 50, order: "asc", q: `no-such-thing-${runId}` });
    expect(res).toEqual({ data: [], hasMore: false, nextCursor: null });
  });
});
