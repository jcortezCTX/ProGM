import { apiFetch } from "./client";
import type { CreateTaskListInput, TaskList, UpdateTaskListInput } from "./types";

export function listTaskLists(): Promise<TaskList[]> {
  return apiFetch("/task-lists");
}

export function createTaskList(input: CreateTaskListInput): Promise<TaskList> {
  return apiFetch("/task-lists", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateTaskList(id: string, input: UpdateTaskListInput): Promise<TaskList> {
  return apiFetch(`/task-lists/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function deleteTaskList(id: string): Promise<void> {
  return apiFetch(`/task-lists/${id}`, { method: "DELETE" });
}
