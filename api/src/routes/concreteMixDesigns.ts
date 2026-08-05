import { Router } from "express";
import { idParamSchema, mixDesignSchema, mixDesignsListQuerySchema } from "../validation/concreteMixDesigns.js";
import {
  ConflictError,
  NotFoundError,
  createMixDesign,
  deleteMixDesign,
  getMixDesign,
  listMixDesigns,
  updateMixDesign,
} from "../services/concreteMixDesignService.js";

export const concreteMixDesignsRouter = Router();

function handleError(res: import("express").Response, err: unknown) {
  if (err instanceof NotFoundError) {
    res.status(404).json({ error: err.message });
    return;
  }
  if (err instanceof ConflictError) {
    res.status(409).json({ error: err.message });
    return;
  }
  console.error(err);
  res.status(500).json({ error: "internal server error" });
}

concreteMixDesignsRouter.get("/", async (req, res) => {
  const parsed = mixDesignsListQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  try {
    res.json(await listMixDesigns(parsed.data));
  } catch (err) {
    handleError(res, err);
  }
});

concreteMixDesignsRouter.post("/", async (req, res) => {
  const parsed = mixDesignSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  try {
    res.status(201).json(await createMixDesign(parsed.data));
  } catch (err) {
    handleError(res, err);
  }
});

concreteMixDesignsRouter.get("/:id", async (req, res) => {
  const parsed = idParamSchema.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  try {
    res.json(await getMixDesign(parsed.data.id));
  } catch (err) {
    handleError(res, err);
  }
});

concreteMixDesignsRouter.patch("/:id", async (req, res) => {
  const parsedId = idParamSchema.safeParse(req.params);
  if (!parsedId.success) {
    res.status(400).json({ error: parsedId.error.message });
    return;
  }
  const parsedBody = mixDesignSchema.safeParse(req.body);
  if (!parsedBody.success) {
    res.status(400).json({ error: parsedBody.error.message });
    return;
  }
  try {
    res.json(await updateMixDesign(parsedId.data.id, parsedBody.data));
  } catch (err) {
    handleError(res, err);
  }
});

concreteMixDesignsRouter.delete("/:id", async (req, res) => {
  const parsed = idParamSchema.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  try {
    await deleteMixDesign(parsed.data.id);
    res.status(204).end();
  } catch (err) {
    handleError(res, err);
  }
});
