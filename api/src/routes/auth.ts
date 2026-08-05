import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { UnauthorizedError, login, logout } from "../services/authService.js";
import { loginSchema } from "../validation/auth.js";

export const authRouter = Router();

authRouter.post("/login", async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  try {
    const result = await login(parsed.data.email, parsed.data.password);
    res.json(result);
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      res.status(401).json({ error: err.message });
      return;
    }
    console.error(err);
    res.status(500).json({ error: "internal server error" });
  }
});

authRouter.post("/logout", requireAuth, async (req, res) => {
  const header = req.headers.authorization;
  const token = header!.slice("Bearer ".length);
  await logout(token);
  res.status(204).send();
});

authRouter.get("/me", requireAuth, (req, res) => {
  res.json(req.user);
});
