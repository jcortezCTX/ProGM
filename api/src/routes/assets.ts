import { Router } from "express";
import {
  assetsListQuerySchema,
  bulkCreateAssetsSchema,
  createAssetSchema,
  idParamSchema,
  replaceAttributesQuerySchema,
  siteIdParamSchema,
  updateAssetSchema,
  updateGeometrySchema,
} from "../validation/assets.js";
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
} from "../services/assetService.js";

// Site-scoped: list/create/bulk-create, mounted at /api/sites alongside
// routes/sites.ts's own router (concretePours.ts is this repo's existing
// precedent for two routers sharing one mount prefix).
export const siteAssetsRouter = Router();
// Id-scoped: everything that doesn't need the site in the URL, mounted at
// /api/assets.
export const assetsRouter = Router();

function handleError(res: import("express").Response, err: unknown) {
  if (err instanceof AttributeValidationError) {
    res.status(400).json({ error: err.message, fields: err.fields });
    return;
  }
  if (err instanceof NotFoundError) {
    res.status(404).json({ error: err.message });
    return;
  }
  if (err instanceof ValidationError) {
    res.status(400).json({ error: err.message });
    return;
  }
  if (err instanceof ConflictError) {
    res.status(409).json({ error: err.message });
    return;
  }
  console.error(err);
  res.status(500).json({ error: "internal server error" });
}

// attr.<key>=<value> filters have dynamic keys Zod can't express as a fixed
// shape - pulled directly off the raw query string here, everything else
// goes through assetsListQuerySchema.
function extractAttrFilters(query: Record<string, unknown>): Record<string, string> {
  const attr: Record<string, string> = {};
  for (const [key, value] of Object.entries(query)) {
    if (key.startsWith("attr.") && typeof value === "string" && key.length > 5) {
      attr[key.slice(5)] = value;
    }
  }
  return attr;
}

siteAssetsRouter.get("/:siteId/assets", async (req, res) => {
  const parsedSiteId = siteIdParamSchema.safeParse(req.params);
  if (!parsedSiteId.success) {
    res.status(400).json({ error: parsedSiteId.error.message });
    return;
  }
  const parsedQuery = assetsListQuerySchema.safeParse(req.query);
  if (!parsedQuery.success) {
    res.status(400).json({ error: parsedQuery.error.message });
    return;
  }
  const params = { ...parsedQuery.data, attr: extractAttrFilters(req.query as Record<string, unknown>) };
  try {
    if (params.format === "geojson") {
      res.json(await listAssetsAsGeoJson(parsedSiteId.data.siteId, params));
      return;
    }
    res.json(await listAssets(parsedSiteId.data.siteId, params));
  } catch (err) {
    handleError(res, err);
  }
});

siteAssetsRouter.post("/:siteId/assets", async (req, res) => {
  const parsedSiteId = siteIdParamSchema.safeParse(req.params);
  if (!parsedSiteId.success) {
    res.status(400).json({ error: parsedSiteId.error.message });
    return;
  }
  const parsedBody = createAssetSchema.safeParse(req.body);
  if (!parsedBody.success) {
    res.status(400).json({ error: parsedBody.error.message });
    return;
  }
  try {
    const asset = await createAsset(parsedSiteId.data.siteId, { ...parsedBody.data, created_by: req.user?.id });
    res.status(201).json(asset);
  } catch (err) {
    handleError(res, err);
  }
});

siteAssetsRouter.post("/:siteId/assets/bulk", async (req, res) => {
  const parsedSiteId = siteIdParamSchema.safeParse(req.params);
  if (!parsedSiteId.success) {
    res.status(400).json({ error: parsedSiteId.error.message });
    return;
  }
  const parsedBody = bulkCreateAssetsSchema.safeParse(req.body);
  if (!parsedBody.success) {
    res.status(400).json({ error: parsedBody.error.message });
    return;
  }
  try {
    const inputs = parsedBody.data.assets.map((a) => ({ ...a, created_by: req.user?.id }));
    const result = await bulkCreateAssets(parsedSiteId.data.siteId, inputs);
    res.status(207).json(result);
  } catch (err) {
    handleError(res, err);
  }
});

assetsRouter.get("/:id", async (req, res) => {
  const parsed = idParamSchema.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  try {
    res.json(await getAsset(parsed.data.id));
  } catch (err) {
    handleError(res, err);
  }
});

assetsRouter.patch("/:id", async (req, res) => {
  const parsedId = idParamSchema.safeParse(req.params);
  if (!parsedId.success) {
    res.status(400).json({ error: parsedId.error.message });
    return;
  }
  const parsedQuery = replaceAttributesQuerySchema.safeParse(req.query);
  if (!parsedQuery.success) {
    res.status(400).json({ error: parsedQuery.error.message });
    return;
  }
  const parsedBody = updateAssetSchema.safeParse(req.body);
  if (!parsedBody.success) {
    res.status(400).json({ error: parsedBody.error.message });
    return;
  }
  try {
    const asset = await updateAsset(
      parsedId.data.id,
      { ...parsedBody.data, updated_by: req.user?.id },
      { replaceAttributes: parsedQuery.data.replace_attributes === "true" },
    );
    res.json(asset);
  } catch (err) {
    handleError(res, err);
  }
});

assetsRouter.delete("/:id", async (req, res) => {
  const parsed = idParamSchema.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  try {
    await deleteAsset(parsed.data.id);
    res.status(204).send();
  } catch (err) {
    handleError(res, err);
  }
});

assetsRouter.post("/:id/geometry", async (req, res) => {
  const parsedId = idParamSchema.safeParse(req.params);
  if (!parsedId.success) {
    res.status(400).json({ error: parsedId.error.message });
    return;
  }
  const parsedBody = updateGeometrySchema.safeParse(req.body);
  if (!parsedBody.success) {
    res.status(400).json({ error: parsedBody.error.message });
    return;
  }
  try {
    res.json(await updateAssetGeometry(parsedId.data.id, parsedBody.data.geometry));
  } catch (err) {
    handleError(res, err);
  }
});
