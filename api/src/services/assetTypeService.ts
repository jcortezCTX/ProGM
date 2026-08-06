import { Prisma } from "../generated/prisma/client.js";
import { prisma } from "../lib/prisma.js";
import { combineWhere, decodeCursor, keysetWhere, paginate } from "../lib/listQuery.js";
import { assertValidAttributeSchema, validateAttributes } from "../lib/attributeSchemaValidator.js";

export class NotFoundError extends Error {}
export class ConflictError extends Error {}
export class ValidationError extends Error {}

type AssetTypeSortField = "code" | "name" | "category" | "created_at";

export interface ListAssetTypesParams {
  cursor?: string;
  limit: number;
  sort?: AssetTypeSortField;
  order: "asc" | "desc";
  q?: string;
  is_active?: "true" | "false";
}

const SEARCH_FIELDS = ["code", "name", "category"] as const;

function cursorValue(
  row: { code: string; name: string; category: string | null; created_at: Date },
  sortField: AssetTypeSortField,
) {
  if (sortField === "created_at") return row.created_at.toISOString();
  return row[sortField];
}

// Wraps the validator's own error so this module's route only needs to know
// about assetTypeService's error classes, matching the one-error-set-per-
// service-module convention used everywhere else in this repo.
function checkAttributeSchema(schema: unknown): void {
  try {
    assertValidAttributeSchema(schema);
  } catch (err) {
    throw new ValidationError(err instanceof Error ? err.message : "invalid attribute_schema");
  }
}

export async function listAssetTypes(params: ListAssetTypesParams) {
  const sortField = params.sort ?? "code";
  const cursor = decodeCursor(params.cursor);

  const where = combineWhere(
    keysetWhere(sortField, params.order, cursor, { nullable: sortField === "category" }),
    params.q
      ? { OR: SEARCH_FIELDS.map((field) => ({ [field]: { contains: params.q, mode: "insensitive" as const } })) }
      : {},
    params.is_active !== undefined ? { is_active: params.is_active === "true" } : {},
  );

  const rows = await prisma.asset_types.findMany({
    where,
    orderBy: [{ [sortField]: params.order }, { id: params.order }],
    take: params.limit + 1,
  });

  const { page, hasMore, nextCursor } = paginate(rows, params.limit, (row) => ({
    v: cursorValue(row, sortField),
    id: row.id,
  }));
  return { data: page, hasMore, nextCursor };
}

export async function getAssetType(id: string) {
  const assetType = await prisma.asset_types.findUnique({ where: { id } });
  if (!assetType) throw new NotFoundError(`Asset type ${id} not found`);
  return assetType;
}

export interface CreateAssetTypeInput {
  code: string;
  name: string;
  category?: string;
  parent_type_id?: string;
  allowed_geom_types: string[];
  attribute_schema?: unknown;
  ui_schema?: unknown;
  default_useful_life_years?: number;
  icon?: string;
  color?: string;
}

export async function createAssetType(input: CreateAssetTypeInput) {
  const existing = await prisma.asset_types.findUnique({ where: { code: input.code } });
  if (existing) throw new ConflictError(`Asset type code ${input.code} already exists`);

  const schema = input.attribute_schema ?? { type: "object", properties: {} };
  checkAttributeSchema(schema);

  if (input.parent_type_id) {
    const parent = await prisma.asset_types.findUnique({ where: { id: input.parent_type_id } });
    if (!parent) throw new ValidationError(`parent_type_id ${input.parent_type_id} does not exist`);
  }

  return prisma.asset_types.create({
    data: {
      code: input.code,
      name: input.name,
      category: input.category ?? null,
      parent_type_id: input.parent_type_id ?? null,
      allowed_geom_types: input.allowed_geom_types,
      attribute_schema: schema as Prisma.InputJsonValue,
      ui_schema: input.ui_schema !== undefined ? (input.ui_schema as Prisma.InputJsonValue) : undefined,
      default_useful_life_years: input.default_useful_life_years ?? null,
      icon: input.icon ?? null,
      color: input.color ?? null,
    },
  });
}

export interface UpdateAssetTypeInput {
  name?: string;
  category?: string | null;
  parent_type_id?: string | null;
  allowed_geom_types?: string[];
  attribute_schema?: unknown;
  ui_schema?: unknown | null;
  default_useful_life_years?: number | null;
  icon?: string | null;
  color?: string | null;
  is_active?: boolean;
}

// existing assets of this type aren't re-validated on read (spec 3.3:
// "validate strictly on write, leniently on read") - a schema edit can
// never corrupt data already in Postgres. This dry run exists purely so the
// admin isn't left guessing how many records now read as non-conforming
// under the new schema ("do not silently break existing data").
async function countAssetsFailingSchema(assetTypeId: string, schema: unknown): Promise<number> {
  const rows = await prisma.assets.findMany({
    where: { asset_type_id: assetTypeId, deleted_at: null },
    select: { attributes: true },
  });
  let count = 0;
  for (const row of rows) {
    if (!validateAttributes(schema, row.attributes).valid) count++;
  }
  return count;
}

export async function updateAssetType(id: string, input: UpdateAssetTypeInput) {
  const existing = await prisma.asset_types.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError(`Asset type ${id} not found`);

  if (input.parent_type_id) {
    if (input.parent_type_id === id) throw new ValidationError("an asset type cannot be its own parent");
    const parent = await prisma.asset_types.findUnique({ where: { id: input.parent_type_id } });
    if (!parent) throw new ValidationError(`parent_type_id ${input.parent_type_id} does not exist`);
  }

  const schemaChanged = input.attribute_schema !== undefined;
  if (schemaChanged) checkAttributeSchema(input.attribute_schema);

  const wouldInvalidateCount = schemaChanged ? await countAssetsFailingSchema(id, input.attribute_schema) : 0;

  const updated = await prisma.asset_types.update({
    where: { id },
    data: {
      ...input,
      attribute_schema: schemaChanged ? (input.attribute_schema as Prisma.InputJsonValue) : undefined,
      ui_schema: input.ui_schema !== undefined ? (input.ui_schema as Prisma.InputJsonValue) : undefined,
      schema_version: schemaChanged ? { increment: 1 } : undefined,
    },
  });

  return { asset_type: updated, schema_changed: schemaChanged, would_invalidate_count: wouldInvalidateCount };
}

// Asset types are never hard-deleted once they exist (spec 3.3) - "delete"
// always means deactivate, whether or not any asset currently uses it, so
// the API has one predictable behavior instead of a conditional one.
export async function deactivateAssetType(id: string) {
  const existing = await prisma.asset_types.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError(`Asset type ${id} not found`);
  return prisma.asset_types.update({ where: { id }, data: { is_active: false } });
}
