import { z } from "zod";

export const taskStatusEnum = z.enum(["to_do", "in_progress", "in_review", "complete"]);
export const taskPriorityEnum = z.enum(["urgent", "high", "normal", "low"]);
const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "must be an ISO date (YYYY-MM-DD)");
const nullableText = z.string().min(1).nullable().optional();

export const idParamSchema = z.object({
  id: z.string().uuid(),
});

export const createTaskListSchema = z.object({
  name: z.string().min(1),
  color: z.string().min(1).optional(),
});

export const updateTaskListSchema = z.object({
  name: z.string().min(1).optional(),
  color: nullableText,
  archived: z.boolean().optional(),
});

export const listTasksQuerySchema = z.object({
  list_id: z.string().uuid(),
});

export const createTaskSchema = z.object({
  list_id: z.string().uuid(),
  title: z.string().min(1),
  description: z.string().min(1).optional(),
  status: taskStatusEnum.optional(),
  priority: taskPriorityEnum.nullable().optional(),
  start_date: dateOnly.nullable().optional(),
  due_date: dateOnly.nullable().optional(),
  project: z.string().min(1).optional(),
  category: z.string().min(1).optional(),
  assignee_ids: z.array(z.string().uuid()).optional(),
});

export const updateTaskSchema = z.object({
  list_id: z.string().uuid().optional(),
  title: z.string().min(1).optional(),
  description: nullableText,
  status: taskStatusEnum.optional(),
  priority: taskPriorityEnum.nullable().optional(),
  start_date: dateOnly.nullable().optional(),
  due_date: dateOnly.nullable().optional(),
  project: nullableText,
  category: nullableText,
  assignee_ids: z.array(z.string().uuid()).optional(),
});
