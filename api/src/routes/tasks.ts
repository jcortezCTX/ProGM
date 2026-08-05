import { Router } from "express";
import { createTaskSchema, idParamSchema, listTasksQuerySchema, updateTaskSchema } from "../validation/tasks.js";
import { NotFoundError, createTask, deleteTask, getTask, listTasks, updateTask } from "../services/taskService.js";

export const tasksRouter = Router();

function handleError(res: import("express").Response, err: unknown) {
  if (err instanceof NotFoundError) {
    res.status(404).json({ error: err.message });
    return;
  }
  console.error(err);
  res.status(500).json({ error: "internal server error" });
}

tasksRouter.get("/", async (req, res) => {
  const parsed = listTasksQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  try {
    res.json(await listTasks(parsed.data.list_id));
  } catch (err) {
    handleError(res, err);
  }
});

tasksRouter.post("/", async (req, res) => {
  const parsed = createTaskSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  try {
    const task = await createTask({ ...parsed.data, created_by: req.user?.id });
    res.status(201).json(task);
  } catch (err) {
    handleError(res, err);
  }
});

tasksRouter.get("/:id", async (req, res) => {
  const parsed = idParamSchema.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  try {
    res.json(await getTask(parsed.data.id));
  } catch (err) {
    handleError(res, err);
  }
});

tasksRouter.patch("/:id", async (req, res) => {
  const parsedId = idParamSchema.safeParse(req.params);
  if (!parsedId.success) {
    res.status(400).json({ error: parsedId.error.message });
    return;
  }
  const parsedBody = updateTaskSchema.safeParse(req.body);
  if (!parsedBody.success) {
    res.status(400).json({ error: parsedBody.error.message });
    return;
  }
  try {
    res.json(await updateTask(parsedId.data.id, parsedBody.data));
  } catch (err) {
    handleError(res, err);
  }
});

tasksRouter.delete("/:id", async (req, res) => {
  const parsed = idParamSchema.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  try {
    await deleteTask(parsed.data.id);
    res.status(204).send();
  } catch (err) {
    handleError(res, err);
  }
});
