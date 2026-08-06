import { Router } from "express";
import { createSiteSchema, idParamSchema, sitesListQuerySchema } from "../validation/sites.js";
import { ConflictError, NotFoundError, createSite, getSite, listSites } from "../services/siteService.js";

export const sitesRouter = Router();

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

sitesRouter.get("/", async (req, res) => {
  const parsed = sitesListQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  try {
    res.json(await listSites(parsed.data));
  } catch (err) {
    handleError(res, err);
  }
});

sitesRouter.post("/", async (req, res) => {
  const parsed = createSiteSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  try {
    const site = await createSite({ ...parsed.data, created_by: req.user?.id });
    res.status(201).json(site);
  } catch (err) {
    handleError(res, err);
  }
});

sitesRouter.get("/:id", async (req, res) => {
  const parsed = idParamSchema.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  try {
    res.json(await getSite(parsed.data.id));
  } catch (err) {
    handleError(res, err);
  }
});
