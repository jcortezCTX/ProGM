import { Ajv2020 } from "ajv/dist/2020.js";
import type { ErrorObject, ValidateFunction } from "ajv";

// asset_types.attribute_schema is JSON Schema draft 2020-12 (spec 2.3).
const ajv = new Ajv2020({ allErrors: true, strict: false });

export interface FieldValidationError {
  path: string;
  message: string;
}

export interface AttributeValidationResult {
  valid: boolean;
  errors: FieldValidationError[];
}

export class InvalidAttributeSchemaError extends Error {}

// attribute_schema changes far less often than assets are written against
// it (CLAUDE.md rule 3 spirit: schema edits are rare, writes are constant),
// so compiled validators are cached by the schema's JSON text instead of
// being recompiled on every call - this is also what makes a stage-3
// dry-run pass over thousands of existing assets cheap: compile once, then
// call the cached validate function in a loop.
const compiledCache = new Map<string, ValidateFunction>();

function compile(schema: unknown): ValidateFunction {
  const key = JSON.stringify(schema);
  const cached = compiledCache.get(key);
  if (cached) return cached;

  let validate: ValidateFunction;
  try {
    validate = ajv.compile(schema as object);
  } catch (err) {
    throw new InvalidAttributeSchemaError(
      `attribute_schema is not a valid JSON Schema: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  compiledCache.set(key, validate);
  return validate;
}

// ajv reports "required" and "additionalProperties" violations at the
// parent's instancePath rather than the offending field itself - fold the
// field name in from `params` so e.g. a missing "size_in" points at
// "size_in", not "(root)".
function fieldPath(error: ErrorObject): string {
  const base = error.instancePath ? error.instancePath.slice(1).replace(/\//g, ".") : "";
  const params = error.params as { missingProperty?: string; additionalProperty?: string };
  const field = params.missingProperty ?? params.additionalProperty;
  if (field) return base ? `${base}.${field}` : field;
  return base || "(root)";
}

// Validates `schema` itself compiles as JSON Schema, without validating any
// data against it - use when an asset_types.attribute_schema is created or
// edited (spec 5.3), before it's ever applied to an asset's attributes.
export function assertValidAttributeSchema(schema: unknown): void {
  compile(schema);
}

// Validates `attributes` against an asset type's attribute_schema, returning
// field-level errors rather than a single pass/fail (spec 5.1: POST/PATCH
// /api/.../assets must return field-level validation errors, not a generic
// 400). Throws InvalidAttributeSchemaError if the schema itself is malformed.
export function validateAttributes(schema: unknown, attributes: unknown): AttributeValidationResult {
  const validate = compile(schema);
  if (validate(attributes)) return { valid: true, errors: [] };

  const errors: FieldValidationError[] = (validate.errors ?? []).map((error) => ({
    path: fieldPath(error),
    message: error.message ?? "is invalid",
  }));
  return { valid: false, errors };
}
