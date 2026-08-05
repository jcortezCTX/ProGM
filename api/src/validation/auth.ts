import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const createUserSchema = z.object({
  email: z.string().email(),
  display_name: z.string().min(1),
  role: z.enum(["admin", "manager", "member"]),
  password: z.string().min(8),
});

export const updateUserRoleSchema = z.object({
  role: z.enum(["admin", "manager", "member"]),
});

export const idParamSchema = z.object({
  id: z.string().uuid(),
});
