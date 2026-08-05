import { Router } from "express";
import { idParamSchema, structureSchema, structuresListQuerySchema } from "../validation/concreteStructures.js";
import {
  ConflictError,
  NotFoundError,
  createStructure,
  deleteStructure,
  getStructure,
  listStructures,
  updateStructure,
} from "../services/concreteStructureService.js";

export const concreteStructuresRouter = Router();

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

concreteStructuresRouter.get("/", async (req, res) => {
  const parsed = structuresListQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  try {
    res.json(await listStructures(parsed.data));
  } catch (err) {
    handleError(res, err);
  }
});

concreteStructuresRouter.post("/", async (req, res) => {
  const parsed = structureSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  try {
    res.status(201).json(await createStructure(parsed.data));
  } catch (err) {
    handleError(res, err);
  }
});

concreteStructuresRouter.get("/:id", async (req, res) => {
  const parsed = idParamSchema.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  try {
    res.json(await getStructure(parsed.data.id));
  } catch (err) {
    handleError(res, err);
  }
});

concreteStructuresRouter.patch("/:id", async (req, res) => {
  const parsedId = idParamSchema.safeParse(req.params);
  if (!parsedId.success) {
    res.status(400).json({ error: parsedId.error.message });
    return;
  }
  const parsedBody = structureSchema.safeParse(req.body);
  if (!parsedBody.success) {
    res.status(400).json({ error: parsedBody.error.message });
    return;
  }
  try {
    res.json(await updateStructure(parsedId.data.id, parsedBody.data));
  } catch (err) {
    handleError(res, err);
  }
});

concreteStructuresRouter.delete("/:id", async (req, res) => {
  const parsed = idParamSchema.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  try {
    await deleteStructure(parsed.data.id);
    res.status(204).end();
  } catch (err) {
    handleError(res, err);
  }
});
