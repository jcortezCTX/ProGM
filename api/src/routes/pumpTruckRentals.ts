import { Router } from "express";
import { idParamSchema, pumpTruckRentalSchema, pumpTruckRentalsListQuerySchema } from "../validation/pumpTruckRentals.js";
import {
  NotFoundError,
  createPumpTruckRental,
  deletePumpTruckRental,
  getPumpTruckRental,
  listPumpTruckRentals,
  updatePumpTruckRental,
} from "../services/pumpTruckRentalService.js";

export const pumpTruckRentalsRouter = Router();

function handleError(res: import("express").Response, err: unknown) {
  if (err instanceof NotFoundError) {
    res.status(404).json({ error: err.message });
    return;
  }
  console.error(err);
  res.status(500).json({ error: "internal server error" });
}

pumpTruckRentalsRouter.get("/", async (req, res) => {
  const parsed = pumpTruckRentalsListQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  try {
    res.json(await listPumpTruckRentals(parsed.data));
  } catch (err) {
    handleError(res, err);
  }
});

pumpTruckRentalsRouter.post("/", async (req, res) => {
  const parsed = pumpTruckRentalSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  try {
    res.status(201).json(await createPumpTruckRental(parsed.data));
  } catch (err) {
    handleError(res, err);
  }
});

pumpTruckRentalsRouter.get("/:id", async (req, res) => {
  const parsed = idParamSchema.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  try {
    res.json(await getPumpTruckRental(parsed.data.id));
  } catch (err) {
    handleError(res, err);
  }
});

pumpTruckRentalsRouter.patch("/:id", async (req, res) => {
  const parsedId = idParamSchema.safeParse(req.params);
  if (!parsedId.success) {
    res.status(400).json({ error: parsedId.error.message });
    return;
  }
  const parsedBody = pumpTruckRentalSchema.safeParse(req.body);
  if (!parsedBody.success) {
    res.status(400).json({ error: parsedBody.error.message });
    return;
  }
  try {
    res.json(await updatePumpTruckRental(parsedId.data.id, parsedBody.data));
  } catch (err) {
    handleError(res, err);
  }
});

pumpTruckRentalsRouter.delete("/:id", async (req, res) => {
  const parsed = idParamSchema.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  try {
    await deletePumpTruckRental(parsed.data.id);
    res.status(204).end();
  } catch (err) {
    handleError(res, err);
  }
});
