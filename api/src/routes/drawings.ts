import { Router } from "express";
import { addRevisionSchema, createDrawingSchema, idParamSchema, updateDrawingSchema } from "../validation/drawings.js";
import {
  ConflictError,
  NotFoundError,
  addRevision,
  createDrawing,
  getDrawing,
  listDrawings,
  updateDrawing,
} from "../services/drawingService.js";

export const drawingsRouter = Router();

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

drawingsRouter.get("/", async (_req, res) => {
  try {
    res.json(await listDrawings());
  } catch (err) {
    handleError(res, err);
  }
});

drawingsRouter.post("/", async (req, res) => {
  const parsed = createDrawingSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  try {
    const drawing = await createDrawing(parsed.data);
    res.status(201).json(drawing);
  } catch (err) {
    handleError(res, err);
  }
});

drawingsRouter.get("/:id", async (req, res) => {
  const parsed = idParamSchema.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  try {
    res.json(await getDrawing(parsed.data.id));
  } catch (err) {
    handleError(res, err);
  }
});

drawingsRouter.patch("/:id", async (req, res) => {
  const parsedId = idParamSchema.safeParse(req.params);
  if (!parsedId.success) {
    res.status(400).json({ error: parsedId.error.message });
    return;
  }
  const parsedBody = updateDrawingSchema.safeParse(req.body);
  if (!parsedBody.success) {
    res.status(400).json({ error: parsedBody.error.message });
    return;
  }
  try {
    res.json(await updateDrawing(parsedId.data.id, parsedBody.data));
  } catch (err) {
    handleError(res, err);
  }
});

drawingsRouter.post("/:id/revisions", async (req, res) => {
  const parsedId = idParamSchema.safeParse(req.params);
  if (!parsedId.success) {
    res.status(400).json({ error: parsedId.error.message });
    return;
  }
  const parsedBody = addRevisionSchema.safeParse(req.body);
  if (!parsedBody.success) {
    res.status(400).json({ error: parsedBody.error.message });
    return;
  }
  try {
    const revision = await addRevision(parsedId.data.id, parsedBody.data);
    res.status(201).json(revision);
  } catch (err) {
    handleError(res, err);
  }
});
