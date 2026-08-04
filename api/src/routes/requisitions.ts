import { Router } from "express";
import { createRequisitionSchema, idParamSchema } from "../validation/requisitions.js";
import {
  ConflictError,
  NotFoundError,
  createRequisition,
  getRequisition,
  listRequisitions,
} from "../services/requisitionService.js";

export const requisitionsRouter = Router();

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

requisitionsRouter.get("/", async (_req, res) => {
  try {
    res.json(await listRequisitions());
  } catch (err) {
    handleError(res, err);
  }
});

requisitionsRouter.post("/", async (req, res) => {
  const parsed = createRequisitionSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  try {
    const requisition = await createRequisition(parsed.data);
    res.status(201).json(requisition);
  } catch (err) {
    handleError(res, err);
  }
});

requisitionsRouter.get("/:id", async (req, res) => {
  const parsed = idParamSchema.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  try {
    const requisition = await getRequisition(parsed.data.id);
    res.json(requisition);
  } catch (err) {
    handleError(res, err);
  }
});
