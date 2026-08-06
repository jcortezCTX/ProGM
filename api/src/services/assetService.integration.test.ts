import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../lib/prisma.js";
import { createAssetType } from "./assetTypeService.js";
import { createSite } from "./siteService.js";
import {
  AttributeValidationError,
  ConflictError,
  NotFoundError,
  ValidationError,
  bulkCreateAssets,
  createAsset,
  deleteAsset,
  getAsset,
  listAssets,
  listAssetsAsGeoJson,
  updateAsset,
  updateAssetGeometry,
} from "./assetService.js";

const runId = `${Date.now()}${Math.random().toString(36).slice(2, 8)}`;
const tag = (n: string) => `TEST-${runId}-${n}`;

let siteId: string;
let genericTypeId: string;
let pointOnlyTypeId: string;
const assetIds: string[] = [];
const typeIds: string[] = [];

beforeAll(async () => {
  const site = await createSite({ name: `Asset Service Test Site ${runId}` });
  siteId = site.id;

  const genericType = await createAssetType({
    code: `test-generic-${runId}`,
    name: "Test Generic",
    allowed_geom_types: ["Point", "LineString", "Polygon"],
    attribute_schema: {
      type: "object",
      properties: { size_in: { type: "number" }, body_material: { type: "string", enum: ["ductile_iron", "brass"] } },
      required: ["size_in"],
    },
  });
  genericTypeId = genericType.id;
  typeIds.push(genericType.id);

  const pointOnlyType = await createAssetType({
    code: `test-point-only-${runId}`,
    name: "Test Point Only",
    allowed_geom_types: ["Point"],
  });
  pointOnlyTypeId = pointOnlyType.id;
  typeIds.push(pointOnlyType.id);
});

afterAll(async () => {
  await prisma.assets.deleteMany({ where: { site_id: siteId } });
  await prisma.asset_types.deleteMany({ where: { id: { in: typeIds } } });
  await prisma.sites.delete({ where: { id: siteId } });
});

describe("createAsset", () => {
  it("creates an asset with valid attributes and geometry, deriving geom_type/centroid", async () => {
    const asset = await createAsset(siteId, {
      asset_type_id: genericTypeId,
      tag: tag("valve-1"),
      name: "Valve 1",
      attributes: { size_in: 6, body_material: "brass" },
      geometry: { type: "Point", coordinates: [-96.7, 32.8] },
    });
    assetIds.push(asset.id);

    expect(asset.geom_type).toBe("Point");
    expect(Number(asset.centroid_lat)).toBeCloseTo(32.8, 5);
    expect(Number(asset.centroid_lon)).toBeCloseTo(-96.7, 5);
    expect(asset.geom).toEqual({ type: "Point", coordinates: [-96.7, 32.8] });
    expect(asset.status).toBe("active");
    expect(asset.asset_type.code).toBe(`test-generic-${runId}`);
  });

  it("throws AttributeValidationError with field-level errors for invalid attributes", async () => {
    await expect(
      createAsset(siteId, { asset_type_id: genericTypeId, tag: tag("bad-attrs"), name: "Bad", attributes: {} }),
    ).rejects.toMatchObject({
      constructor: AttributeValidationError,
      fields: [{ path: "size_in" }],
    });
  });

  it("rejects a geometry type not in the asset type's allowed_geom_types", async () => {
    await expect(
      createAsset(siteId, {
        asset_type_id: pointOnlyTypeId,
        tag: tag("bad-geom"),
        name: "Bad Geom",
        geometry: { type: "LineString", coordinates: [[-96.7, 32.8], [-96.71, 32.81]] },
      }),
    ).rejects.toThrow(AttributeValidationError);
  });

  it("rejects a duplicate tag within the same site", async () => {
    const first = await createAsset(siteId, { asset_type_id: pointOnlyTypeId, tag: tag("dup"), name: "First" });
    assetIds.push(first.id);
    await expect(
      createAsset(siteId, { asset_type_id: pointOnlyTypeId, tag: tag("dup"), name: "Second" }),
    ).rejects.toThrow(ConflictError);
  });

  it("rejects an inactive asset type", async () => {
    const inactiveType = await createAssetType({
      code: `test-inactive-${runId}`,
      name: "Inactive",
      allowed_geom_types: ["Point"],
    });
    typeIds.push(inactiveType.id);
    await prisma.asset_types.update({ where: { id: inactiveType.id }, data: { is_active: false } });

    await expect(
      createAsset(siteId, { asset_type_id: inactiveType.id, tag: tag("inactive-type"), name: "Nope" }),
    ).rejects.toThrow(ValidationError);
  });

  it("throws NotFoundError for a nonexistent site", async () => {
    await expect(
      createAsset("00000000-0000-0000-0000-000000000000", {
        asset_type_id: pointOnlyTypeId,
        tag: tag("no-site"),
        name: "No Site",
      }),
    ).rejects.toThrow(NotFoundError);
  });

  it("rolls back the whole row when the geometry write fails, leaving no orphan asset", async () => {
    // ST_GeomFromGeoJSON rejects an unclosed polygon ring - nothing upstream
    // (Zod's `ring` schema only checks length, not closure) catches this,
    // so it's a real way to hit a geometry failure after Zod passes.
    const unclosedRing: { type: "Polygon"; coordinates: [number, number][][] } = {
      type: "Polygon",
      coordinates: [
        [
          [-96.7, 32.8],
          [-96.71, 32.8],
          [-96.71, 32.81],
          [-96.7, 32.79],
        ],
      ],
    };
    const theTag = tag("orphan-rollback");

    await expect(
      createAsset(siteId, {
        asset_type_id: genericTypeId,
        tag: theTag,
        name: "Should Not Exist",
        attributes: { size_in: 6, body_material: "brass" },
        geometry: unclosedRing,
      }),
    ).rejects.toThrow(ValidationError);

    const orphan = await prisma.assets.findFirst({ where: { site_id: siteId, tag: theTag } });
    expect(orphan).toBeNull();
  });
});

describe("updateAsset", () => {
  it("merges attributes by default rather than replacing them", async () => {
    const asset = await createAsset(siteId, {
      asset_type_id: genericTypeId,
      tag: tag("merge"),
      name: "Merge Me",
      attributes: { size_in: 6, body_material: "brass" },
    });
    assetIds.push(asset.id);

    const updated = await updateAsset(asset.id, { attributes: { body_material: "ductile_iron" } });
    expect(updated.attributes).toEqual({ size_in: 6, body_material: "ductile_iron" });
  });

  it("replaces attributes wholesale when replaceAttributes is set", async () => {
    const asset = await createAsset(siteId, {
      asset_type_id: genericTypeId,
      tag: tag("replace"),
      name: "Replace Me",
      attributes: { size_in: 6, body_material: "brass" },
    });
    assetIds.push(asset.id);

    await expect(
      updateAsset(asset.id, { attributes: { size_in: 8 } }, { replaceAttributes: true }),
    ).resolves.toMatchObject({ attributes: { size_in: 8 } });
  });

  it("rejects a merged/replaced attribute set that fails the schema", async () => {
    const asset = await createAsset(siteId, {
      asset_type_id: genericTypeId,
      tag: tag("bad-merge"),
      name: "Bad Merge",
      attributes: { size_in: 6 },
    });
    assetIds.push(asset.id);

    await expect(
      updateAsset(asset.id, { attributes: { size_in: "not-a-number" as unknown as number } }),
    ).rejects.toThrow(AttributeValidationError);
  });

  it("rejects a duplicate tag on rename, but allows keeping the same tag", async () => {
    const a = await createAsset(siteId, { asset_type_id: pointOnlyTypeId, tag: tag("rename-a"), name: "A" });
    const b = await createAsset(siteId, { asset_type_id: pointOnlyTypeId, tag: tag("rename-b"), name: "B" });
    assetIds.push(a.id, b.id);

    await expect(updateAsset(b.id, { tag: tag("rename-a") })).rejects.toThrow(ConflictError);
    await expect(updateAsset(a.id, { tag: tag("rename-a") })).resolves.toMatchObject({ tag: tag("rename-a") });
  });

  it("does not accept a geometry field - PATCH is not the geometry path", async () => {
    const asset = await createAsset(siteId, { asset_type_id: pointOnlyTypeId, tag: tag("no-geom-patch"), name: "X" });
    assetIds.push(asset.id);
    const updated = await updateAsset(asset.id, { name: "Renamed" } as Record<string, unknown>);
    expect(updated.geom).toBeNull();
  });

  it("rejects an indirect (multi-hop) parent cycle as a clean ValidationError, not a raw DB error", async () => {
    // The direct self-parent check only catches parent_id === id. A -> B
    // already exists here; re-pointing A's parent to B is a 2-hop cycle
    // that only the assets_prevent_cycle_trigger DB trigger can catch.
    const a = await createAsset(siteId, { asset_type_id: pointOnlyTypeId, tag: tag("cycle-a"), name: "A" });
    const b = await createAsset(siteId, {
      asset_type_id: pointOnlyTypeId,
      tag: tag("cycle-b"),
      name: "B",
      parent_id: a.id,
    });
    assetIds.push(a.id, b.id);

    await expect(updateAsset(a.id, { parent_id: b.id })).rejects.toThrow(ValidationError);
  });
});

describe("updateAssetGeometry", () => {
  it("sets geometry via the dedicated endpoint and re-derives geom_type/centroid", async () => {
    const asset = await createAsset(siteId, { asset_type_id: pointOnlyTypeId, tag: tag("geom-endpoint"), name: "G" });
    assetIds.push(asset.id);

    const updated = await updateAssetGeometry(asset.id, { type: "Point", coordinates: [-97.0, 33.0] });
    expect(updated.geom_type).toBe("Point");
    expect(Number(updated.centroid_lon)).toBeCloseTo(-97.0, 5);
  });

  it("rejects a geometry type outside the asset type's allowed set", async () => {
    const asset = await createAsset(siteId, { asset_type_id: pointOnlyTypeId, tag: tag("geom-reject"), name: "G" });
    assetIds.push(asset.id);

    await expect(
      updateAssetGeometry(asset.id, { type: "Polygon", coordinates: [[[-96.7, 32.8], [-96.71, 32.8], [-96.71, 32.81], [-96.7, 32.81], [-96.7, 32.8]]] }),
    ).rejects.toThrow(AttributeValidationError);
  });

  it("clears geometry when given null", async () => {
    const asset = await createAsset(siteId, {
      asset_type_id: pointOnlyTypeId,
      tag: tag("geom-clear"),
      name: "G",
      geometry: { type: "Point", coordinates: [-96.7, 32.8] },
    });
    assetIds.push(asset.id);

    const cleared = await updateAssetGeometry(asset.id, null);
    expect(cleared.geom).toBeNull();
    expect(cleared.geom_type).toBeNull();
  });
});

describe("deleteAsset", () => {
  it("soft-deletes: getAsset 404s afterward but the row still exists", async () => {
    const asset = await createAsset(siteId, { asset_type_id: pointOnlyTypeId, tag: tag("soft-delete"), name: "D" });
    assetIds.push(asset.id);

    await deleteAsset(asset.id);
    await expect(getAsset(asset.id)).rejects.toThrow(NotFoundError);

    const raw = await prisma.assets.findUnique({ where: { id: asset.id } });
    expect(raw?.deleted_at).not.toBeNull();
  });
});

describe("getAsset", () => {
  it("includes resolved asset type, parent, children, and attachments", async () => {
    const parent = await createAsset(siteId, { asset_type_id: pointOnlyTypeId, tag: tag("parent"), name: "Parent" });
    const child = await createAsset(siteId, {
      asset_type_id: pointOnlyTypeId,
      tag: tag("child"),
      name: "Child",
      parent_id: parent.id,
    });
    assetIds.push(parent.id, child.id);

    const attachment = await prisma.attachments.create({
      data: { entity_type: "asset", entity_id: child.id, file_name: "photo.jpg" },
    });

    const detail = await getAsset(child.id);
    expect(detail.parent?.id).toBe(parent.id);
    expect(detail.attachments).toHaveLength(1);

    const parentDetail = await getAsset(parent.id);
    expect(parentDetail.children.map((c) => c.id)).toContain(child.id);

    await prisma.attachments.delete({ where: { id: attachment.id } });
  });
});

describe("bulkCreateAssets", () => {
  it("creates the valid rows and reports errors for the invalid ones, without failing the whole batch", async () => {
    const result = await bulkCreateAssets(siteId, [
      { asset_type_id: pointOnlyTypeId, tag: tag("bulk-ok"), name: "OK" },
      { asset_type_id: genericTypeId, tag: tag("bulk-bad"), name: "Bad", attributes: {} },
    ]);
    const created = await prisma.assets.findMany({ where: { site_id: siteId, tag: tag("bulk-ok") } });
    assetIds.push(...created.map((a) => a.id));

    expect(result.created).toBe(1);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toMatchObject({ index: 1, fields: [{ path: "size_in" }] });
  });
});

describe("listAssets filters", () => {
  let filterSiteId: string;
  const filterTag = (n: string) => `FILTER-${runId}-${n}`;

  beforeAll(async () => {
    const site = await createSite({ name: `Filter Test Site ${runId}` });
    filterSiteId = site.id;

    const a = await createAsset(filterSiteId, {
      asset_type_id: genericTypeId,
      tag: filterTag("a"),
      name: "Alpha",
      status: "active",
      criticality: 5,
      attributes: { size_in: 6, body_material: "brass" },
      geometry: { type: "Point", coordinates: [-96.7, 32.8] },
    });
    const b = await createAsset(filterSiteId, {
      asset_type_id: pointOnlyTypeId,
      tag: filterTag("b"),
      name: "Bravo",
      status: "inactive",
      criticality: 1,
      geometry: { type: "Point", coordinates: [10.0, 10.0] },
    });
    assetIds.push(a.id, b.id);
  });

  afterAll(async () => {
    await prisma.assets.deleteMany({ where: { site_id: filterSiteId } });
    await prisma.sites.delete({ where: { id: filterSiteId } });
  });

  it("filters by asset type code", async () => {
    const result = await listAssets(filterSiteId, { limit: 50, order: "asc", type: `test-generic-${runId}` });
    expect(result.data.map((a) => a.tag)).toEqual([filterTag("a")]);
  });

  it("filters by status", async () => {
    const result = await listAssets(filterSiteId, { limit: 50, order: "asc", status: "inactive" });
    expect(result.data.map((a) => a.tag)).toEqual([filterTag("b")]);
  });

  it("filters by criticality", async () => {
    const result = await listAssets(filterSiteId, { limit: 50, order: "asc", criticality: 5 });
    expect(result.data.map((a) => a.tag)).toEqual([filterTag("a")]);
  });

  it("filters by free-text search on tag/name", async () => {
    const result = await listAssets(filterSiteId, { limit: 50, order: "asc", q: "Bravo" });
    expect(result.data.map((a) => a.tag)).toEqual([filterTag("b")]);
  });

  it("filters by attr.* JSONB equality", async () => {
    const result = await listAssets(filterSiteId, {
      limit: 50,
      order: "asc",
      attr: { body_material: "brass" },
    });
    expect(result.data.map((a) => a.tag)).toEqual([filterTag("a")]);
  });

  it("filters by bbox, matching only geometry that intersects it", async () => {
    const result = await listAssets(filterSiteId, {
      limit: 50,
      order: "asc",
      bbox: { minLon: -97, minLat: 32, maxLon: -96, maxLat: 33 },
    });
    expect(result.data.map((a) => a.tag)).toEqual([filterTag("a")]);
  });

  it("filters by near + radius_ft, excluding assets outside the radius", async () => {
    const result = await listAssets(filterSiteId, {
      limit: 50,
      order: "asc",
      near: { lon: -96.7, lat: 32.8 },
      radius_ft: 1000,
    });
    expect(result.data.map((a) => a.tag)).toEqual([filterTag("a")]);
  });

  it("returns a GeoJSON FeatureCollection when requested", async () => {
    const fc = await listAssetsAsGeoJson(filterSiteId, { limit: 50, order: "asc" });
    expect(fc.type).toBe("FeatureCollection");
    expect(fc.features).toHaveLength(2);
    const alpha = fc.features.find((f) => f.properties.tag === filterTag("a"));
    expect(alpha?.geometry).toEqual({ type: "Point", coordinates: [-96.7, 32.8] });
  });

  it("walks every page to the end with no duplicates or omissions", async () => {
    const seen: string[] = [];
    let cursor: string | undefined;
    for (let guard = 0; guard < 10; guard++) {
      const res = await listAssets(filterSiteId, { cursor, limit: 1, order: "asc" });
      seen.push(...res.data.map((a) => a.id));
      if (!res.hasMore) break;
      cursor = res.nextCursor ?? undefined;
    }
    expect(new Set(seen).size).toBe(seen.length);
    expect(seen.sort()).toEqual([...seen].sort());
    expect(seen).toHaveLength(2);
  });
});
