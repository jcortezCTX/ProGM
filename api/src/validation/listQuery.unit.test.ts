import { z } from "zod";
import { describe, expect, it } from "vitest";
import { buildListQuerySchema } from "./listQuery.js";

const schema = buildListQuerySchema(["name", "created_at"] as const, {
  status: z.enum(["open", "closed"]).optional(),
});

describe("buildListQuerySchema", () => {
  it("applies defaults when only required-less fields are given", () => {
    const parsed = schema.parse({});
    expect(parsed).toEqual({ limit: 50, order: "asc" });
  });

  it("coerces a numeric limit from a query string", () => {
    expect(schema.parse({ limit: "25" }).limit).toBe(25);
  });

  it("rejects a limit below 1", () => {
    expect(schema.safeParse({ limit: "0" }).success).toBe(false);
  });

  it("accepts a large limit for unbounded-picker callers", () => {
    expect(schema.safeParse({ limit: "500" }).success).toBe(true);
  });

  it("rejects a limit above 1000", () => {
    expect(schema.safeParse({ limit: "5000" }).success).toBe(false);
  });

  it("rejects a sort field outside the allowed set", () => {
    expect(schema.safeParse({ sort: "not_a_field" }).success).toBe(false);
  });

  it("accepts a sort field from the allowed set", () => {
    expect(schema.parse({ sort: "name" }).sort).toBe("name");
  });

  it("rejects an order outside asc/desc", () => {
    expect(schema.safeParse({ order: "sideways" }).success).toBe(false);
  });

  it("treats an empty q as absent rather than a validation error", () => {
    expect(schema.parse({ q: "" }).q).toBeUndefined();
  });

  it("keeps a non-empty q", () => {
    expect(schema.parse({ q: "valve" }).q).toBe("valve");
  });

  it("validates module-supplied extra filter fields", () => {
    expect(schema.parse({ status: "open" }).status).toBe("open");
    expect(schema.safeParse({ status: "archived" }).success).toBe(false);
  });
});
