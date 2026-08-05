import { prisma } from "../lib/prisma.js";

export class NotFoundError extends Error {}
export class ForbiddenError extends Error {}

export interface CreateTaskListInput {
  name: string;
  color?: string | null;
  created_by?: string | null;
}

export async function listTaskLists(includeArchived: boolean) {
  return prisma.task_lists.findMany({
    where: includeArchived ? undefined : { archived: false },
    orderBy: { created_at: "asc" },
  });
}

export async function createTaskList(input: CreateTaskListInput) {
  return prisma.task_lists.create({
    data: {
      name: input.name,
      color: input.color ?? null,
      created_by: input.created_by ?? null,
    },
  });
}

export interface UpdateTaskListInput {
  name?: string;
  color?: string | null;
  archived?: boolean;
}

export async function updateTaskList(id: string, input: UpdateTaskListInput) {
  const existing = await prisma.task_lists.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError(`List ${id} not found`);

  return prisma.task_lists.update({ where: { id }, data: input });
}

// Only the creator or an admin may delete a List (CLAUDE.md-style permission
// rule kept out of the generic auth middleware since it's per-resource).
export async function deleteTaskList(id: string, actor: { id: string; role: string }) {
  const existing = await prisma.task_lists.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError(`List ${id} not found`);
  if (existing.created_by !== actor.id && actor.role !== "admin") {
    throw new ForbiddenError("only the list's creator or an admin can delete it");
  }

  await prisma.task_lists.delete({ where: { id } });
}
