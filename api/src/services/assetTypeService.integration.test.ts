import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../lib/prisma.js";
import {
  ConflictError,
  NotFoundError,
  ValidationError,
  createAssetType,
  deactivateAssetType,
  updateAssetType,
} from "./assetTypeService.js";
import { createAsset } from "./assetService.js";
import { createSite } from "./siteService.js";

const runId = `${Date.now()}${Math.random().toString(36).slice(2, 8)}`;
const code = (n: string) => `test-type-${runId}-${n}`;
const typeIds: string[] = [];
const assetIds: string[] = [];
let siteId: string;

beforeAll(async () => {
  const site = await createSite({ name: `Asset Type Test Site ${runId}` });
  siteId = site.id;
});

afterAll(async () => {
  await prisma.assets.deleteMany({ where: { id: { in: assetIds } } });
  await prisma.asset_types.deleteMany({ where: { id: { in: typeIds } } });
  await prisma.sites.delete({ where: { id: siteId } });
});

describe("createAssetType", () => {
  it("rejects a duplicate code", async () => {
    const type = await createAssetType({ code: code("dup"), name: "Dup", allowed_geom_types: ["Point"] });
    typeIds.push(type.id);
    await expect(createAssetType({ code: code("dup"), name: "Dup 2", allowed_geom_types: ["Point"] })).rejects.toThrow(
      ConflictError,
    );
  });

  it("rejects a malformed attribute_schema", async () => {
    await expect(
      createAssetType({
        code: code("bad-schema"),
        name: "Bad Schema",
        allowed_geom_types: ["Point"],
        attribute_schema: { type: "not-a-real-json-schema-type" },
      }),
    ).rejects.toThrow(ValidationError);
  });

  it("defaults attribute_schema to an empty object schema", async () => {
    const type = await createAssetType({ code: code("default-schema"), name: "Default", allowed_geom_types: ["Point"] });
    typeIds.push(type.id);
    expect(type.attribute_schema).toEqual({ type: "object", properties: {} });
    expect(type.schema_version).toBe(1);
  });
});

describe("updateAssetType dry-run", () => {
  it("reports how many existing assets would fail validation under a tightened schema, without blocking the update", async () => {
    const type = await createAssetType({
      code: code("dryrun"),
      name: "Dry Run Type",
      allowed_geom_types: ["Point"],
      attribute_schema: { type: "object", properties: { size_in: { type: "number" } } },
    });
    typeIds.push(type.id);

    const conforming = await createAsset(siteId, {
      asset_type_id: type.id,
      tag: `DRYRUN-A-${runId}`,
      name: "Conforming",
      attributes: { size_in: 6 },
    });
    const nonConforming = await createAsset(siteId, {
      asset_type_id: type.id,
      tag: `DRYRUN-B-${runId}`,
      name: "Will become non-conforming",
      attributes: {},
    });
    assetIds.push(conforming.id, nonConforming.id);

    const result = await updateAssetType(type.id, {
      attribute_schema: {
        type: "object",
        properties: { size_in: { type: "number" } },
        required: ["size_in"],
      },
    });

    expect(result.schema_changed).toBe(true);
    expect(result.would_invalidate_count).toBe(1);
    expect(result.asset_type.schema_version).toBe(2);

    // the update commits regardless (spec 3.3: validate strictly on write,
    // leniently on read) - the old row is untouched and still reads fine.
    const stillThere = await prisma.assets.findUnique({ where: { id: nonConforming.id } });
    expect(stillThere?.attributes).toEqual({});
  });

  it("does not touch would_invalidate_count or schema_version when attribute_schema isn't part of the update", async () => {
    const type = await createAssetType({ code: code("no-schema-change"), name: "No Change", allowed_geom_types: ["Point"] });
    typeIds.push(type.id);

    const result = await updateAssetType(type.id, { name: "Renamed" });
    expect(result.schema_changed).toBe(false);
    expect(result.would_invalidate_count).toBe(0);
    expect(result.asset_type.schema_version).toBe(1);
    expect(result.asset_type.name).toBe("Renamed");
  });

  it("rejects a self-referencing parent_type_id", async () => {
    const type = await createAssetType({ code: code("self-parent"), name: "Self Parent", allowed_geom_types: ["Point"] });
    typeIds.push(type.id);
    await expect(updateAssetType(type.id, { parent_type_id: type.id })).rejects.toThrow(ValidationError);
  });
});

describe("deactivateAssetType", () => {
  it("sets is_active false instead of deleting the row", async () => {
    const type = await createAssetType({ code: code("deactivate"), name: "Deactivate Me", allowed_geom_types: ["Point"] });
    typeIds.push(type.id);

    const deactivated = await deactivateAssetType(type.id);
    expect(deactivated.is_active).toBe(false);

    const stillExists = await prisma.asset_types.findUnique({ where: { id: type.id } });
    expect(stillExists).not.toBeNull();
  });

  it("throws NotFoundError for a nonexistent id", async () => {
    await expect(deactivateAssetType("00000000-0000-0000-0000-000000000000")).rejects.toThrow(NotFoundError);
  });
});
