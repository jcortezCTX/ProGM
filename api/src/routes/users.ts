import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/auth.js";
import {
  ConflictError,
  NotFoundError,
  createUser,
  listUsers,
  updateUserRole,
} from "../services/authService.js";
import { createUserSchema, idParamSchema, updateUserRoleSchema } from "../validation/auth.js";

export const usersRouter = Router();

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

usersRouter.use(requireAuth);

// Open to any signed-in user (not just admins) - the Tasks module's
// assignee/watcher pickers need the directory. listUsers() only returns
// PublicUser fields, never password_hash, so this is safe to widen.
usersRouter.get("/", async (_req, res) => {
  try {
    res.json(await listUsers());
  } catch (err) {
    handleError(res, err);
  }
});

usersRouter.post("/", requireRole("admin"), async (req, res) => {
  const parsed = createUserSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  try {
    const user = await createUser(parsed.data);
    res.status(201).json(user);
  } catch (err) {
    handleError(res, err);
  }
});

usersRouter.patch("/:id/role", requireRole("admin"), async (req, res) => {
  const parsedId = idParamSchema.safeParse(req.params);
  if (!parsedId.success) {
    res.status(400).json({ error: parsedId.error.message });
    return;
  }
  const parsedBody = updateUserRoleSchema.safeParse(req.body);
  if (!parsedBody.success) {
    res.status(400).json({ error: parsedBody.error.message });
    return;
  }
  try {
    const user = await updateUserRole(parsedId.data.id, parsedBody.data.role);
    res.json(user);
  } catch (err) {
    handleError(res, err);
  }
});
