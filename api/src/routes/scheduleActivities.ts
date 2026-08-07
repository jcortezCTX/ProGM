import { Router } from "express";
import {
  activitiesListQuerySchema,
  createActivitySchema,
  dayOverridesSchema,
  idParamSchema,
  updateActivitySchema,
} from "../validation/scheduleActivities.js";
import {
  NotFoundError,
  ValidationError,
  createActivity,
  deleteActivity,
  getActivity,
  listActivities,
  updateActivity,
  upsertActivityDays,
} from "../services/scheduleActivityService.js";

export const scheduleActivitiesRouter = Router();

function handleError(res: import("express").Response, err: unknown) {
  if (err instanceof NotFoundError) {
    res.status(404).json({ error: err.message });
    return;
  }
  if (err instanceof ValidationError) {
    res.status(400).json({ error: err.message });
    return;
  }
  console.error(err);
  res.status(500).json({ error: "internal server error" });
}

scheduleActivitiesRouter.get("/", async (req, res) => {
  const parsed = activitiesListQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { scheduled_between, ...rest } = parsed.data;
  let scheduledBetween: { from: string; to: string } | undefined;
  if (scheduled_between) {
    const [from, to] = scheduled_between.split(",");
    scheduledBetween = { from, to };
  }
  try {
    const data = await listActivities({ ...rest, scheduled_between: scheduledBetween });
    res.json({ data });
  } catch (err) {
    handleError(res, err);
  }
});

scheduleActivitiesRouter.post("/", async (req, res) => {
  const parsed = createActivitySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  try {
    res.status(201).json(await createActivity(parsed.data));
  } catch (err) {
    handleError(res, err);
  }
});

scheduleActivitiesRouter.get("/:id", async (req, res) => {
  const parsed = idParamSchema.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  try {
    res.json(await getActivity(parsed.data.id));
  } catch (err) {
    handleError(res, err);
  }
});

scheduleActivitiesRouter.patch("/:id", async (req, res) => {
  const parsedId = idParamSchema.safeParse(req.params);
  if (!parsedId.success) {
    res.status(400).json({ error: parsedId.error.message });
    return;
  }
  const parsedBody = updateActivitySchema.safeParse(req.body);
  if (!parsedBody.success) {
    res.status(400).json({ error: parsedBody.error.message });
    return;
  }
  try {
    res.json(await updateActivity(parsedId.data.id, parsedBody.data));
  } catch (err) {
    handleError(res, err);
  }
});

scheduleActivitiesRouter.delete("/:id", async (req, res) => {
  const parsed = idParamSchema.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  try {
    await deleteActivity(parsed.data.id);
    res.status(204).end();
  } catch (err) {
    handleError(res, err);
  }
});

scheduleActivitiesRouter.put("/:id/days", async (req, res) => {
  const parsedId = idParamSchema.safeParse(req.params);
  if (!parsedId.success) {
    res.status(400).json({ error: parsedId.error.message });
    return;
  }
  const parsedBody = dayOverridesSchema.safeParse(req.body);
  if (!parsedBody.success) {
    res.status(400).json({ error: parsedBody.error.message });
    return;
  }
  try {
    res.json(await upsertActivityDays(parsedId.data.id, parsedBody.data));
  } catch (err) {
    handleError(res, err);
  }
});
