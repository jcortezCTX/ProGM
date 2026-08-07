import { Router } from "express";
import {
  addDeliveryLineItemSchema,
  createDeliverySchema,
  deliveriesListQuerySchema,
  idParamSchema,
  lineItemIdParamSchema,
  updateDeliveryLineItemSchema,
  updateDeliverySchema,
} from "../validation/deliveries.js";
import {
  ConflictError,
  NotFoundError,
  ValidationError,
  addDeliveryLineItem,
  createDelivery,
  deleteDeliveryLineItem,
  getDelivery,
  listDeliveries,
  updateDelivery,
  updateDeliveryLineItem,
} from "../services/deliveryService.js";

export const deliveriesRouter = Router();

function handleError(res: import("express").Response, err: unknown) {
  if (err instanceof NotFoundError) {
    res.status(404).json({ error: err.message });
    return;
  }
  // Receiving a log row onto a delivery for a different requisition (§5.2).
  if (err instanceof ConflictError) {
    res.status(409).json({ error: err.message });
    return;
  }
  if (err instanceof ValidationError) {
    res.status(400).json({ error: err.message });
    return;
  }
  console.error(err);
  res.status(500).json({ error: "internal server error" });
}

deliveriesRouter.get("/", async (req, res) => {
  const parsed = deliveriesListQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  try {
    res.json(await listDeliveries(parsed.data));
  } catch (err) {
    handleError(res, err);
  }
});

deliveriesRouter.post("/", async (req, res) => {
  const parsed = createDeliverySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  try {
    const delivery = await createDelivery(parsed.data);
    res.status(201).json(delivery);
  } catch (err) {
    handleError(res, err);
  }
});

deliveriesRouter.get("/:id", async (req, res) => {
  const parsed = idParamSchema.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  try {
    const delivery = await getDelivery(parsed.data.id);
    res.json(delivery);
  } catch (err) {
    handleError(res, err);
  }
});

deliveriesRouter.patch("/:id", async (req, res) => {
  const parsedId = idParamSchema.safeParse(req.params);
  if (!parsedId.success) {
    res.status(400).json({ error: parsedId.error.message });
    return;
  }
  const parsedBody = updateDeliverySchema.safeParse(req.body);
  if (!parsedBody.success) {
    res.status(400).json({ error: parsedBody.error.message });
    return;
  }
  try {
    const delivery = await updateDelivery(parsedId.data.id, parsedBody.data);
    res.json(delivery);
  } catch (err) {
    handleError(res, err);
  }
});

deliveriesRouter.post("/:id/line-items", async (req, res) => {
  const parsedId = idParamSchema.safeParse(req.params);
  if (!parsedId.success) {
    res.status(400).json({ error: parsedId.error.message });
    return;
  }
  const parsedBody = addDeliveryLineItemSchema.safeParse(req.body);
  if (!parsedBody.success) {
    res.status(400).json({ error: parsedBody.error.message });
    return;
  }
  try {
    const result = await addDeliveryLineItem(parsedId.data.id, parsedBody.data);
    res.status(201).json(result);
  } catch (err) {
    handleError(res, err);
  }
});

deliveriesRouter.patch("/:id/line-items/:lineItemId", async (req, res) => {
  const parsedId = lineItemIdParamSchema.safeParse(req.params);
  if (!parsedId.success) {
    res.status(400).json({ error: parsedId.error.message });
    return;
  }
  const parsedBody = updateDeliveryLineItemSchema.safeParse(req.body);
  if (!parsedBody.success) {
    res.status(400).json({ error: parsedBody.error.message });
    return;
  }
  try {
    res.json(await updateDeliveryLineItem(parsedId.data.lineItemId, parsedBody.data));
  } catch (err) {
    handleError(res, err);
  }
});

deliveriesRouter.delete("/:id/line-items/:lineItemId", async (req, res) => {
  const parsedId = lineItemIdParamSchema.safeParse(req.params);
  if (!parsedId.success) {
    res.status(400).json({ error: parsedId.error.message });
    return;
  }
  try {
    await deleteDeliveryLineItem(parsedId.data.lineItemId);
    res.status(204).end();
  } catch (err) {
    handleError(res, err);
  }
});
