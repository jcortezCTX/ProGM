import { Router } from "express";
import {
  createCustomFieldDefSchema,
  createItemSchema,
  createTransactionSchema,
  idParamSchema,
  itemsListQuerySchema,
  updateItemSchema,
} from "../validation/inventory.js";
import {
  ConflictError,
  NotFoundError,
  ValidationError,
  createCustomFieldDef,
  createItem,
  getItem,
  getTransactionHistory,
  listCustomFieldDefs,
  listItems,
  listTags,
  recordTransaction,
  updateItem,
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

inventoryRouter.get("/items", async (req, res) => {
  const parsed = itemsListQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  try {
    res.json(await listItems(parsed.data));
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

inventoryRouter.patch("/items/:id", async (req, res) => {
  const parsedId = idParamSchema.safeParse(req.params);
  if (!parsedId.success) {
    res.status(400).json({ error: parsedId.error.message });
    return;
  }
  const parsedBody = updateItemSchema.safeParse(req.body);
  if (!parsedBody.success) {
    res.status(400).json({ error: parsedBody.error.message });
    return;
  }
  try {
    const item = await updateItem(parsedId.data.id, parsedBody.data);
    res.json(item);
  } catch (err) {
    handleError(res, err);
  }
});

inventoryRouter.get("/tags", async (_req, res) => {
  try {
    res.json(await listTags());
  } catch (err) {
    handleError(res, err);
  }
});

inventoryRouter.get("/custom-field-defs", async (_req, res) => {
  try {
    res.json(await listCustomFieldDefs());
  } catch (err) {
    handleError(res, err);
  }
});

inventoryRouter.post("/custom-field-defs", async (req, res) => {
  const parsed = createCustomFieldDefSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  try {
    const def = await createCustomFieldDef(parsed.data);
    res.status(201).json(def);
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
