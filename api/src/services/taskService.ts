import { prisma } from "../lib/prisma.js";

export class NotFoundError extends Error {}

export type TaskStatus = "to_do" | "in_progress" | "in_review" | "complete";
export type TaskPriority = "urgent" | "high" | "normal" | "low";

const assigneeInclude = {
  task_assignees: {
    include: { users: { select: { id: true, display_name: true, email: true } } },
  },
} as const;

function toDate(value: string | null | undefined): Date | null | undefined {
  if (value === undefined) return undefined;
  return value === null ? null : new Date(value);
}

// Flattens the join-table shape into a plain assignees array grouped by role
// (role: 'assignee' now, 'watcher' arrives with Phase 2) so callers don't
// need to know about the underlying task_assignees table.
function toTaskDto<T extends { task_assignees: { user_id: string; role: string; users: { id: string; display_name: string; email: string } }[] }>(
  task: T,
) {
  const { task_assignees, ...rest } = task;
  return {
    ...rest,
    assignees: task_assignees.map((a) => ({
      user_id: a.user_id,
      role: a.role,
      display_name: a.users.display_name,
      email: a.users.email,
    })),
  };
}

export async function listTasks(listId: string) {
  const tasks = await prisma.tasks.findMany({
    where: { list_id: listId },
    orderBy: { sort_order: "asc" },
    include: assigneeInclude,
  });
  return tasks.map(toTaskDto);
}

export async function getTask(id: string) {
  const task = await prisma.tasks.findUnique({ where: { id }, include: assigneeInclude });
  if (!task) throw new NotFoundError(`Task ${id} not found`);
  return toTaskDto(task);
}

export interface CreateTaskInput {
  list_id: string;
  title: string;
  description?: string | null;
  status?: TaskStatus;
  priority?: TaskPriority | null;
  start_date?: string | null;
  due_date?: string | null;
  project?: string | null;
  category?: string | null;
  assignee_ids?: string[];
  created_by?: string | null;
}

export async function createTask(input: CreateTaskInput) {
  const list = await prisma.task_lists.findUnique({ where: { id: input.list_id } });
  if (!list) throw new NotFoundError(`List ${input.list_id} not found`);

  const last = await prisma.tasks.findFirst({
    where: { list_id: input.list_id },
    orderBy: { sort_order: "desc" },
    select: { sort_order: true },
  });

  const task = await prisma.tasks.create({
    data: {
      list_id: input.list_id,
      title: input.title,
      description: input.description ?? null,
      status: input.status ?? "to_do",
      priority: input.priority ?? null,
      start_date: toDate(input.start_date) ?? null,
      due_date: toDate(input.due_date) ?? null,
      project: input.project ?? null,
      category: input.category ?? null,
      sort_order: (last?.sort_order ?? -1) + 1,
      created_by: input.created_by ?? null,
      task_assignees: input.assignee_ids
        ? { createMany: { data: input.assignee_ids.map((user_id) => ({ user_id, role: "assignee" as const })) } }
        : undefined,
    },
    include: assigneeInclude,
  });
  return toTaskDto(task);
}

export interface UpdateTaskInput {
  list_id?: string;
  title?: string;
  description?: string | null;
  status?: TaskStatus;
  priority?: TaskPriority | null;
  start_date?: string | null;
  due_date?: string | null;
  project?: string | null;
  category?: string | null;
  assignee_ids?: string[];
}

export async function updateTask(id: string, input: UpdateTaskInput) {
  const existing = await prisma.tasks.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError(`Task ${id} not found`);

  if (input.list_id) {
    const list = await prisma.task_lists.findUnique({ where: { id: input.list_id } });
    if (!list) throw new NotFoundError(`List ${input.list_id} not found`);
  }

  const { assignee_ids, start_date, due_date, ...rest } = input;

  await prisma.$transaction(async (tx) => {
    await tx.tasks.update({
      where: { id },
      data: { ...rest, start_date: toDate(start_date), due_date: toDate(due_date) },
    });

    if (assignee_ids) {
      await tx.task_assignees.deleteMany({ where: { task_id: id, role: "assignee" } });
      if (assignee_ids.length > 0) {
        await tx.task_assignees.createMany({
          data: assignee_ids.map((user_id) => ({ task_id: id, user_id, role: "assignee" as const })),
        });
      }
    }
  });

  return getTask(id);
}

// Cascades to task_assignees/task_comments via FK ON DELETE CASCADE.
export async function deleteTask(id: string) {
  const existing = await prisma.tasks.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError(`Task ${id} not found`);
  await prisma.tasks.delete({ where: { id } });
}
