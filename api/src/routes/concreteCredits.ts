import { Router } from "express";
import { concreteCreditSchema, concreteCreditsListQuerySchema, idParamSchema } from "../validation/concreteCredits.js";
import {
  NotFoundError,
  createConcreteCredit,
  deleteConcreteCredit,
  getConcreteCredit,
  listConcreteCredits,
  updateConcreteCredit,
} from "../services/concreteCreditService.js";

export const concreteCreditsRouter = Router();

function handleError(res: import("express").Response, err: unknown) {
  if (err instanceof NotFoundError) {
    res.status(404).json({ error: err.message });
    return;
  }
  console.error(err);
  res.status(500).json({ error: "internal server error" });
}

concreteCreditsRouter.get("/", async (req, res) => {
  const parsed = concreteCreditsListQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  try {
    res.json(await listConcreteCredits(parsed.data));
  } catch (err) {
    handleError(res, err);
  }
});

concreteCreditsRouter.post("/", async (req, res) => {
  const parsed = concreteCreditSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  try {
    res.status(201).json(await createConcreteCredit(parsed.data));
  } catch (err) {
    handleError(res, err);
  }
});

concreteCreditsRouter.get("/:id", async (req, res) => {
  const parsed = idParamSchema.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  try {
    res.json(await getConcreteCredit(parsed.data.id));
  } catch (err) {
    handleError(res, err);
  }
});

concreteCreditsRouter.patch("/:id", async (req, res) => {
  const parsedId = idParamSchema.safeParse(req.params);
  if (!parsedId.success) {
    res.status(400).json({ error: parsedId.error.message });
    return;
  }
  const parsedBody = concreteCreditSchema.safeParse(req.body);
  if (!parsedBody.success) {
    res.status(400).json({ error: parsedBody.error.message });
    return;
  }
  try {
    res.json(await updateConcreteCredit(parsedId.data.id, parsedBody.data));
  } catch (err) {
    handleError(res, err);
  }
});

concreteCreditsRouter.delete("/:id", async (req, res) => {
  const parsed = idParamSchema.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  try {
    await deleteConcreteCredit(parsed.data.id);
    res.status(204).end();
  } catch (err) {
    handleError(res, err);
  }
});
