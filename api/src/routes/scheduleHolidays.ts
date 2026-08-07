import { Router } from "express";
import { holidaySchema, idParamSchema } from "../validation/scheduleHolidays.js";
import { ConflictError, NotFoundError, createHoliday, deleteHoliday, listHolidays } from "../services/scheduleHolidayService.js";

export const scheduleHolidaysRouter = Router();

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

scheduleHolidaysRouter.get("/", async (_req, res) => {
  try {
    res.json({ data: await listHolidays() });
  } catch (err) {
    handleError(res, err);
  }
});

scheduleHolidaysRouter.post("/", async (req, res) => {
  const parsed = holidaySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  try {
    res.status(201).json(await createHoliday(parsed.data));
  } catch (err) {
    handleError(res, err);
  }
});

scheduleHolidaysRouter.delete("/:id", async (req, res) => {
  const parsed = idParamSchema.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  try {
    await deleteHoliday(parsed.data.id);
    res.status(204).end();
  } catch (err) {
    handleError(res, err);
  }
});
