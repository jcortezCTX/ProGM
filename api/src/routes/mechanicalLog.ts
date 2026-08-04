import { Router } from "express";
import { idParamSchema, mechanicalLogItemSchema } from "../validation/mechanicalLog.js";
import {
  NotFoundError,
  createMechanicalLogItem,
  getMechanicalLogItem,
  listMechanicalLogItems,
  updateMechanicalLogItem,
} from "../services/mechanicalLogService.js";

export const mechanicalLogRouter = Router();

function handleError(res: import("express").Response, err: unknown) {
  if (err instanceof NotFoundError) {
    res.status(404).json({ error: err.message });
    return;
  }
  console.error(err);
  res.status(500).json({ error: "internal server error" });
}

mechanicalLogRouter.get("/", async (_req, res) => {
  try {
    res.json(await listMechanicalLogItems());
  } catch (err) {
    handleError(res, err);
  }
});

mechanicalLogRouter.post("/", async (req, res) => {
  const parsed = mechanicalLogItemSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  try {
    const item = await createMechanicalLogItem(parsed.data);
    res.status(201).json(item);
  } catch (err) {
    handleError(res, err);
  }
});

mechanicalLogRouter.get("/:id", async (req, res) => {
  const parsed = idParamSchema.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  try {
    res.json(await getMechanicalLogItem(parsed.data.id));
  } catch (err) {
    handleError(res, err);
  }
});

mechanicalLogRouter.patch("/:id", async (req, res) => {
  const parsedId = idParamSchema.safeParse(req.params);
  if (!parsedId.success) {
    res.status(400).json({ error: parsedId.error.message });
    return;
  }
  const parsedBody = mechanicalLogItemSchema.safeParse(req.body);
  if (!parsedBody.success) {
    res.status(400).json({ error: parsedBody.error.message });
    return;
  }
  try {
    const item = await updateMechanicalLogItem(parsedId.data.id, parsedBody.data);
    res.json(item);
  } catch (err) {
    handleError(res, err);
  }
});
