import { Router } from "express";
import { ganttQuerySchema } from "../validation/scheduleGantt.js";
import { getGantt } from "../services/scheduleGanttService.js";

export const scheduleGanttRouter = Router();

scheduleGanttRouter.get("/", async (req, res) => {
  const parsed = ganttQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  try {
    res.json(await getGantt(parsed.data));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "internal server error" });
  }
});
