import { Router } from "express";
import { idParamSchema, reorderSectionsSchema, sectionSchema, updateSectionSchema } from "../validation/scheduleSections.js";
import {
  ConflictError,
  NotFoundError,
  createSection,
  deleteSection,
  getSection,
  listSections,
  reorderSections,
  updateSection,
} from "../services/scheduleSectionService.js";

export const scheduleSectionsRouter = Router();

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

scheduleSectionsRouter.get("/", async (_req, res) => {
  try {
    res.json({ data: await listSections() });
  } catch (err) {
    handleError(res, err);
  }
});

scheduleSectionsRouter.post("/", async (req, res) => {
  const parsed = sectionSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  try {
    res.status(201).json(await createSection(parsed.data));
  } catch (err) {
    handleError(res, err);
  }
});

// Must be registered before "/:id" so "order" isn't parsed as an id.
scheduleSectionsRouter.put("/order", async (req, res) => {
  const parsed = reorderSectionsSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  try {
    res.json({ data: await reorderSections(parsed.data) });
  } catch (err) {
    handleError(res, err);
  }
});

scheduleSectionsRouter.get("/:id", async (req, res) => {
  const parsed = idParamSchema.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  try {
    res.json(await getSection(parsed.data.id));
  } catch (err) {
    handleError(res, err);
  }
});

scheduleSectionsRouter.patch("/:id", async (req, res) => {
  const parsedId = idParamSchema.safeParse(req.params);
  if (!parsedId.success) {
    res.status(400).json({ error: parsedId.error.message });
    return;
  }
  const parsedBody = updateSectionSchema.safeParse(req.body);
  if (!parsedBody.success) {
    res.status(400).json({ error: parsedBody.error.message });
    return;
  }
  try {
    res.json(await updateSection(parsedId.data.id, parsedBody.data));
  } catch (err) {
    handleError(res, err);
  }
});

scheduleSectionsRouter.delete("/:id", async (req, res) => {
  const parsed = idParamSchema.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  try {
    await deleteSection(parsed.data.id);
    res.status(204).end();
  } catch (err) {
    handleError(res, err);
  }
});
