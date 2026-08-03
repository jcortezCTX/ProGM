import { Router } from "express";
import {
  createItemSchema,
  createTransactionSchema,
  idParamSchema,
} from "../validation/inventory.js";
import {
  ConflictError,
  NotFoundError,
  ValidationError,
  createItem,
  getItem,
  getTransactionHistory,
  listItems,
  recordTransaction,
} from "../services/inventoryService.js";

export const inventoryRouter = Router();

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

inventoryRouter.get("/items", async (_req, res) => {
  try {
    const items = await listItems();
    res.json(items);
  } catch (err) {
    handleError(res, err);
  }
});

inventoryRouter.post("/items", async (req, res) => {
  const parsed = createItemSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  try {
    const item = await createItem(parsed.data);
    res.status(201).json(item);
  } catch (err) {
    handleError(res, err);
  }
});

inventoryRouter.get("/items/:id", async (req, res) => {
  const parsed = idParamSchema.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  try {
    const item = await getItem(parsed.data.id);
    res.json(item);
  } catch (err) {
    handleError(res, err);
  }
});

inventoryRouter.get("/items/:id/transactions", async (req, res) => {
  const parsed = idParamSchema.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  try {
    const transactions = await getTransactionHistory(parsed.data.id);
    res.json(transactions);
  } catch (err) {
    handleError(res, err);
  }
});

inventoryRouter.post("/transactions", async (req, res) => {
  const parsed = createTransactionSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  try {
    const transaction = await recordTransaction(parsed.data);
    res.status(201).json(transaction);
  } catch (err) {
    handleError(res, err);
  }
});
