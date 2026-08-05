import { Router } from "express";
import { concreteSettingsSchema } from "../validation/concreteSettings.js";
import { getConcreteSettings, saveConcreteSettings } from "../services/concreteSettingsService.js";

export const concreteSettingsRouter = Router();

concreteSettingsRouter.get("/", async (_req, res) => {
  try {
    res.json(await getConcreteSettings());
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "internal server error" });
  }
});

concreteSettingsRouter.put("/", async (req, res) => {
  const parsed = concreteSettingsSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  try {
    res.json(await saveConcreteSettings(parsed.data));
  } catch (err) {
    if (err instanceof Error) {
      res.status(400).json({ error: err.message });
      return;
    }
    console.error(err);
    res.status(500).json({ error: "internal server error" });
  }
});
