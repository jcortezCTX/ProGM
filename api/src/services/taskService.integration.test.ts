import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../lib/prisma.js";
import { NotFoundError as ListNotFoundError, createTaskList, deleteTaskList } from "./taskListService.js";
import { NotFoundError, createTask, deleteTask, getTask, listTasks, updateTask } from "./taskService.js";

const suffix = Date.now();
let userAId: string;
let userBId: string;
let listId: string;
let otherListId: string;

beforeAll(async () => {
  const userA = await prisma.users.create({
    data: { email: `test-task-a-${suffix}@example.com`, display_name: "Test Assignee A", role: "member" },
  });
  const userB = await prisma.users.create({
    data: { email: `test-task-b-${suffix}@example.com`, display_name: "Test Assignee B", role: "member" },
  });
  userAId = userA.id;
  userBId = userB.id;

  const list = await createTaskList({ name: `Test List ${suffix}` });
  listId = list.id;
  const otherList = await createTaskList({ name: `Test List Other ${suffix}` });
  otherListId = otherList.id;
});

afterAll(async () => {
  // Deleting the lists cascades their tasks and task_assignees rows.
  await prisma.task_lists.deleteMany({ where: { id: { in: [listId, otherListId] } } });
  await prisma.users.deleteMany({ where: { id: { in: [userAId, userBId] } } });
});

describe("createTask / listTasks", () => {
  it("assigns increasing sort_order within a list", async () => {
    const first = await createTask({ list_id: listId, title: "First" });
    const second = await createTask({ list_id: listId, title: "Second" });

    expect(second.sort_order).toBeGreaterThan(first.sort_order);

    const tasks = await listTasks(listId);
    expect(tasks.map((t) => t.title)).toEqual(["First", "Second"]);
  });

  it("creates task_assignees rows for assignee_ids and returns them nested", async () => {
    const task = await createTask({ list_id: listId, title: "Assigned", assignee_ids: [userAId, userBId] });
    expect(task.assignees).toHaveLength(2);
    expect(task.assignees.map((a) => a.role)).toEqual(["assignee", "assignee"]);
    expect(new Set(task.assignees.map((a) => a.user_id))).toEqual(new Set([userAId, userBId]));
  });

  it("rejects a task for a list that doesn't exist", async () => {
    await expect(createTask({ list_id: "00000000-0000-0000-0000-000000000000", title: "x" })).rejects.toThrow(
      NotFoundError,
    );
  });
});

describe("updateTask", () => {
  it("replaces the assignee set rather than appending to it", async () => {
    const task = await createTask({ list_id: listId, title: "Reassign me", assignee_ids: [userAId] });

    const updated = await updateTask(task.id, { assignee_ids: [userBId] });
    expect(updated.assignees.map((a) => a.user_id)).toEqual([userBId]);
  });

  it("clears all assignees when given an empty array", async () => {
    const task = await createTask({ list_id: listId, title: "Unassign me", assignee_ids: [userAId] });

    const updated = await updateTask(task.id, { assignee_ids: [] });
    expect(updated.assignees).toEqual([]);
  });

  it("moves a task to another list", async () => {
    const task = await createTask({ list_id: listId, title: "Move me" });

    const updated = await updateTask(task.id, { list_id: otherListId });
    expect(updated.list_id).toBe(otherListId);

    const originalListTasks = await listTasks(listId);
    expect(originalListTasks.find((t) => t.id === task.id)).toBeUndefined();
  });

  it("rejects moving a task to a list that doesn't exist", async () => {
    const task = await createTask({ list_id: listId, title: "Stay put" });
    await expect(updateTask(task.id, { list_id: "00000000-0000-0000-0000-000000000000" })).rejects.toThrow(
      NotFoundError,
    );
  });
});

describe("deleteTask", () => {
  it("removes the task and its task_assignees rows", async () => {
    const task = await createTask({ list_id: listId, title: "Delete me", assignee_ids: [userAId] });

    await deleteTask(task.id);

    await expect(getTask(task.id)).rejects.toThrow(NotFoundError);
    const assignees = await prisma.task_assignees.findMany({ where: { task_id: task.id } });
    expect(assignees).toHaveLength(0);
  });
});

describe("deleteTaskList permission (only creator or admin)", () => {
  it("blocks a non-creator, non-admin user", async () => {
    const list = await createTaskList({ name: `Perm Test ${suffix}`, created_by: userAId });
    await expect(deleteTaskList(list.id, { id: userBId, role: "member" })).rejects.toThrow(/creator or an admin/);
    await prisma.task_lists.delete({ where: { id: list.id } }); // cleanup since the delete above was blocked
  });

  it("allows an admin regardless of who created it", async () => {
    const list = await createTaskList({ name: `Perm Test Admin ${suffix}`, created_by: userAId });
    await deleteTaskList(list.id, { id: userBId, role: "admin" });
    await expect(prisma.task_lists.findUnique({ where: { id: list.id } })).resolves.toBeNull();
  });

  it("throws NotFoundError for a list that doesn't exist", async () => {
    await expect(
      deleteTaskList("00000000-0000-0000-0000-000000000000", { id: userAId, role: "admin" }),
    ).rejects.toThrow(ListNotFoundError);
  });
});
