import { apiFetch } from "./client";
import type { CreateTaskInput, Task, UpdateTaskInput } from "./types";

export function listTasks(listId: string): Promise<Task[]> {
  return apiFetch(`/tasks?list_id=${listId}`);
}

export function createTask(input: CreateTaskInput): Promise<Task> {
  return apiFetch("/tasks", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function getTask(id: string): Promise<Task> {
  return apiFetch(`/tasks/${id}`);
}

export function updateTask(id: string, input: UpdateTaskInput): Promise<Task> {
  return apiFetch(`/tasks/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function deleteTask(id: string): Promise<void> {
  return apiFetch(`/tasks/${id}`, { method: "DELETE" });
}
