import { Router } from "express";
import { createTaskListSchema, idParamSchema, updateTaskListSchema } from "../validation/tasks.js";
import {
  ForbiddenError,
  NotFoundError,
  createTaskList,
  deleteTaskList,
  listTaskLists,
  updateTaskList,
} from "../services/taskListService.js";

export const taskListsRouter = Router();

function handleError(res: import("express").Response, err: unknown) {
  if (err instanceof NotFoundError) {
    res.status(404).json({ error: err.message });
    return;
  }
  if (err instanceof ForbiddenError) {
    res.status(403).json({ error: err.message });
    return;
  }
  console.error(err);
  res.status(500).json({ error: "internal server error" });
}

taskListsRouter.get("/", async (req, res) => {
  try {
    res.json(await listTaskLists(req.query.include_archived === "true"));
  } catch (err) {
    handleError(res, err);
  }
});

taskListsRouter.post("/", async (req, res) => {
  const parsed = createTaskListSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  try {
    const list = await createTaskList({ ...parsed.data, created_by: req.user?.id });
    res.status(201).json(list);
  } catch (err) {
    handleError(res, err);
  }
});

taskListsRouter.patch("/:id", async (req, res) => {
  const parsedId = idParamSchema.safeParse(req.params);
  if (!parsedId.success) {
    res.status(400).json({ error: parsedId.error.message });
    return;
  }
  const parsedBody = updateTaskListSchema.safeParse(req.body);
  if (!parsedBody.success) {
    res.status(400).json({ error: parsedBody.error.message });
    return;
  }
  try {
    res.json(await updateTaskList(parsedId.data.id, parsedBody.data));
  } catch (err) {
    handleError(res, err);
  }
});

taskListsRouter.delete("/:id", async (req, res) => {
  const parsedId = idParamSchema.safeParse(req.params);
  if (!parsedId.success) {
    res.status(400).json({ error: parsedId.error.message });
    return;
  }
  try {
    await deleteTaskList(parsedId.data.id, req.user!);
    res.status(204).send();
  } catch (err) {
    handleError(res, err);
  }
});
