import { describe, expect, it } from "vitest";
import { combineWhere, decodeCursor, encodeCursor, keysetWhere, paginate } from "./listQuery.js";

describe("encodeCursor / decodeCursor", () => {
  it("round-trips a string value", () => {
    const payload = { v: "widget", id: "abc-123" };
    expect(decodeCursor(encodeCursor(payload))).toEqual(payload);
  });

  it("round-trips a number value", () => {
    const payload = { v: 42, id: "abc-123" };
    expect(decodeCursor(encodeCursor(payload))).toEqual(payload);
  });

  it("round-trips a null value", () => {
    const payload = { v: null, id: "abc-123" };
    expect(decodeCursor(encodeCursor(payload))).toEqual(payload);
  });

  it("returns null for undefined input", () => {
    expect(decodeCursor(undefined)).toBeNull();
  });

  it("returns null for garbage base64/non-JSON input", () => {
    expect(decodeCursor("not-valid-base64url-json!!!")).toBeNull();
  });

  it("returns null when the decoded payload is missing an id", () => {
    const raw = Buffer.from(JSON.stringify({ v: "x" })).toString("base64url");
    expect(decodeCursor(raw)).toBeNull();
  });

  it("returns null when v is an unsupported type", () => {
    const raw = Buffer.from(JSON.stringify({ v: { nested: true }, id: "abc" })).toString("base64url");
    expect(decodeCursor(raw)).toBeNull();
  });
});

describe("keysetWhere", () => {
  it("returns an empty fragment when there is no cursor", () => {
    expect(keysetWhere("name", "asc", null)).toEqual({});
  });

  it("builds an asc fragment for a non-null cursor value on a nullable field, including the trailing-nulls branch", () => {
    const where = keysetWhere("name", "asc", { v: "m", id: "row-1" }, { nullable: true });
    expect(where).toEqual({
      OR: [{ name: { gt: "m" } }, { name: "m", id: { gt: "row-1" } }, { name: null }],
    });
  });

  it("omits the trailing-nulls branch by default (field assumed non-nullable)", () => {
    const where = keysetWhere("drawing_number", "asc", { v: "m", id: "row-1" });
    expect(where).toEqual({
      OR: [{ drawing_number: { gt: "m" } }, { drawing_number: "m", id: { gt: "row-1" } }],
    });
  });

  it("omits the trailing-nulls branch when nullable is explicitly false", () => {
    const where = keysetWhere("drawing_number", "asc", { v: "m", id: "row-1" }, { nullable: false });
    expect(where).toEqual({
      OR: [{ drawing_number: { gt: "m" } }, { drawing_number: "m", id: { gt: "row-1" } }],
    });
  });

  it("builds a desc fragment for a non-null cursor value, with no trailing-nulls branch regardless of nullable", () => {
    const where = keysetWhere("name", "desc", { v: "m", id: "row-1" }, { nullable: true });
    expect(where).toEqual({
      OR: [{ name: { lt: "m" } }, { name: "m", id: { lt: "row-1" } }],
    });
  });

  it("builds an asc fragment for a null cursor value (already among the trailing nulls)", () => {
    const where = keysetWhere("name", "asc", { v: null, id: "row-1" });
    expect(where).toEqual({ name: null, id: { gt: "row-1" } });
  });

  it("builds a desc fragment for a null cursor value (nulls come first under desc)", () => {
    const where = keysetWhere("name", "desc", { v: null, id: "row-1" });
    expect(where).toEqual({
      OR: [{ name: { not: null } }, { name: null, id: { lt: "row-1" } }],
    });
  });
});

describe("combineWhere", () => {
  it("returns an empty object when every fragment is empty", () => {
    expect(combineWhere({}, {})).toEqual({});
  });

  it("returns the single fragment unwrapped when only one is non-empty", () => {
    expect(combineWhere({}, { status: "open" })).toEqual({ status: "open" });
  });

  it("wraps multiple non-empty fragments in AND, dropping empty ones", () => {
    expect(combineWhere({ a: 1 }, {}, { b: 2 })).toEqual({ AND: [{ a: 1 }, { b: 2 }] });
  });
});

describe("paginate", () => {
  const cursorOf = (row: { id: string; name: string }) => ({ v: row.name, id: row.id });

  it("reports no more pages when rows fit within the limit", () => {
    const rows = [
      { id: "1", name: "a" },
      { id: "2", name: "b" },
    ];
    const result = paginate(rows, 5, cursorOf);
    expect(result.page).toEqual(rows);
    expect(result.hasMore).toBe(false);
    expect(result.nextCursor).toBeNull();
  });

  it("slices off the lookahead row and encodes a cursor from the last page row", () => {
    const rows = [
      { id: "1", name: "a" },
      { id: "2", name: "b" },
      { id: "3", name: "c" }, // lookahead row, fetched via take: limit + 1
    ];
    const result = paginate(rows, 2, cursorOf);
    expect(result.page).toEqual(rows.slice(0, 2));
    expect(result.hasMore).toBe(true);
    expect(decodeCursor(result.nextCursor ?? undefined)).toEqual({ v: "b", id: "2" });
  });
});
