import { Router } from "express";
import { createRequisitionSchema, idParamSchema, requisitionsListQuerySchema } from "../validation/requisitions.js";
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

requisitionsRouter.get("/", async (req, res) => {
  const parsed = requisitionsListQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  try {
    res.json(await listRequisitions(parsed.data));
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
    const created = await createRequisition(parsed.data);
    // Re-fetch through getRequisition so the response shape matches
    // GET /:id exactly (item_sku/item_name/quantity_received enrichment),
    // instead of returning the raw create payload's different shape.
    const requisition = await getRequisition(created.id);
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
