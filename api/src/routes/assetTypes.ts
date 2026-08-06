import { Router } from "express";
import { requireRole } from "../middleware/auth.js";
import {
  assetTypesListQuerySchema,
  createAssetTypeSchema,
  idParamSchema,
  updateAssetTypeSchema,
} from "../validation/assetTypes.js";
import {
  ConflictError,
  NotFoundError,
  ValidationError,
  createAssetType,
  deactivateAssetType,
  getAssetType,
  listAssetTypes,
  updateAssetType,
} from "../services/assetTypeService.js";

export const assetTypesRouter = Router();

function handleError(res: import("express").Response, err: unknown) {
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

assetTypesRouter.get("/", async (req, res) => {
  const parsed = assetTypesListQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  try {
    res.json(await listAssetTypes(parsed.data));
  } catch (err) {
    handleError(res, err);
  }
});

assetTypesRouter.get("/:id", async (req, res) => {
  const parsed = idParamSchema.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  try {
    res.json(await getAssetType(parsed.data.id));
  } catch (err) {
    handleError(res, err);
  }
});

// manage-asset-types is a distinct permission from edit-asset (spec 7,
// "at minimum distinguish read, edit-asset, and manage-asset-types") -
// mutating the type registry that every asset's form/validation depends on
// is restricted to admin/manager, same tier as inventory's custom field
// defs would be if that admin path existed yet.
assetTypesRouter.post("/", requireRole("admin", "manager"), async (req, res) => {
  const parsed = createAssetTypeSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  try {
    const assetType = await createAssetType(parsed.data);
    res.status(201).json(assetType);
  } catch (err) {
    handleError(res, err);
  }
});

assetTypesRouter.patch("/:id", requireRole("admin", "manager"), async (req, res) => {
  const parsedId = idParamSchema.safeParse(req.params);
  if (!parsedId.success) {
    res.status(400).json({ error: parsedId.error.message });
    return;
  }
  const parsedBody = updateAssetTypeSchema.safeParse(req.body);
  if (!parsedBody.success) {
    res.status(400).json({ error: parsedBody.error.message });
    return;
  }
  try {
    res.json(await updateAssetType(parsedId.data.id, parsedBody.data));
  } catch (err) {
    handleError(res, err);
  }
});

assetTypesRouter.delete("/:id", requireRole("admin", "manager"), async (req, res) => {
  const parsed = idParamSchema.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  try {
    await deactivateAssetType(parsed.data.id);
    res.status(204).send();
  } catch (err) {
    handleError(res, err);
  }
});
