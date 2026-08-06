import { describe, expect, it } from "vitest";
import {
  assertValidAttributeSchema,
  InvalidAttributeSchemaError,
  validateAttributes,
} from "./attributeSchemaValidator.js";

// Modeled on the valve_gate seed type from the asset tracking spec.
const VALVE_SCHEMA = {
  type: "object",
  properties: {
    size_in: { type: "number", minimum: 0 },
    body_material: { type: "string", enum: ["ductile_iron", "cast_iron", "brass"] },
    normally_open: { type: "boolean" },
  },
  required: ["size_in", "body_material"],
  additionalProperties: false,
};

describe("validateAttributes", () => {
  it("passes valid attributes with no errors", () => {
    const result = validateAttributes(VALVE_SCHEMA, {
      size_in: 6,
      body_material: "ductile_iron",
      normally_open: true,
    });
    expect(result).toEqual({ valid: true, errors: [] });
  });

  it("passes when optional fields are omitted", () => {
    const result = validateAttributes(VALVE_SCHEMA, { size_in: 6, body_material: "brass" });
    expect(result.valid).toBe(true);
  });

  it("reports a missing required field by name", () => {
    const result = validateAttributes(VALVE_SCHEMA, { size_in: 6 });
    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual(
      expect.objectContaining({ path: "body_material", message: expect.stringContaining("required") }),
    );
  });

  it("reports a wrong-type field by name", () => {
    const result = validateAttributes(VALVE_SCHEMA, { size_in: "six", body_material: "brass" });
    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual(expect.objectContaining({ path: "size_in" }));
  });

  it("reports an enum violation by name", () => {
    const result = validateAttributes(VALVE_SCHEMA, { size_in: 6, body_material: "unobtainium" });
    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual(
      expect.objectContaining({ path: "body_material", message: expect.stringContaining("allowed values") }),
    );
  });

  it("reports an unrecognized field by name when additionalProperties is false", () => {
    const result = validateAttributes(VALVE_SCHEMA, {
      size_in: 6,
      body_material: "brass",
      not_a_real_field: true,
    });
    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual(expect.objectContaining({ path: "not_a_real_field" }));
  });

  it("collects every violation in one pass, not just the first", () => {
    const result = validateAttributes(VALVE_SCHEMA, { size_in: "six" });
    expect(result.valid).toBe(false);
    const paths = result.errors.map((e) => e.path);
    expect(paths).toContain("size_in");
    expect(paths).toContain("body_material");
  });

  it("joins nested field paths with dots", () => {
    const schema = {
      type: "object",
      properties: {
        dimensions: {
          type: "object",
          properties: { length_ft: { type: "number" } },
          required: ["length_ft"],
        },
      },
    };
    const result = validateAttributes(schema, { dimensions: { length_ft: "long" } });
    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual(expect.objectContaining({ path: "dimensions.length_ft" }));
  });

  it("throws InvalidAttributeSchemaError for a malformed schema", () => {
    expect(() => validateAttributes({ type: "not-a-real-json-schema-type" }, {})).toThrow(
      InvalidAttributeSchemaError,
    );
  });

  it("accepts the spec's default empty attribute_schema", () => {
    const result = validateAttributes({ type: "object", properties: {} }, { anything: "goes" });
    expect(result.valid).toBe(true);
  });

  it("tolerates the spec's custom `unit` annotation keyword (non-standard JSON Schema)", () => {
    const schema = {
      type: "object",
      properties: { size_in: { type: "number", unit: "in" } },
    };
    const result = validateAttributes(schema, { size_in: 6 });
    expect(result.valid).toBe(true);
  });
});

describe("assertValidAttributeSchema", () => {
  it("does not throw for a well-formed schema", () => {
    expect(() => assertValidAttributeSchema(VALVE_SCHEMA)).not.toThrow();
  });

  it("throws InvalidAttributeSchemaError for a malformed schema", () => {
    expect(() => assertValidAttributeSchema({ type: "not-a-real-json-schema-type" })).toThrow(
      InvalidAttributeSchemaError,
    );
  });
});

describe("compiled schema cache", () => {
  // Regression test: the cache is capped and FIFO-evicted so distinct
  // schema text (e.g. from repeated attribute_schema edits over the app's
  // lifetime) doesn't grow it forever. This doesn't inspect the cache
  // directly (not exported) - it drives eviction by validating against far
  // more distinct schemas than the cap, then confirms both a schema from
  // well before the cap (should have been evicted and recompiled) and one
  // from after it (should still be cached) validate correctly. A regression
  // in the eviction logic itself (wrong key deleted, crash, etc.) would
  // show up here as either exception or an incorrect result.
  it("keeps validating correctly across many more distinct schemas than the cache cap", () => {
    for (let i = 0; i < 550; i++) {
      const schema = { type: "object", properties: { [`field_${i}`]: { type: "number" } }, required: [`field_${i}`] };
      expect(validateAttributes(schema, { [`field_${i}`]: i }).valid).toBe(true);
      expect(validateAttributes(schema, {}).valid).toBe(false);
    }

    const earlySchema = { type: "object", properties: { field_0: { type: "number" } }, required: ["field_0"] };
    expect(validateAttributes(earlySchema, { field_0: 1 }).valid).toBe(true);

    const lateSchema = { type: "object", properties: { field_549: { type: "number" } }, required: ["field_549"] };
    expect(validateAttributes(lateSchema, { field_549: 1 }).valid).toBe(true);
  });
});
