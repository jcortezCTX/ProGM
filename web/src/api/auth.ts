import { apiFetch } from "./client";
import type { CreateUserInput, LoginResponse, PublicUser, UserRole } from "./types";

export function login(email: string, password: string): Promise<LoginResponse> {
  return apiFetch("/auth/login", { method: "POST", body: JSON.stringify({ email, password }) });
}

export function logout(): Promise<void> {
  return apiFetch("/auth/logout", { method: "POST" });
}

export function getMe(): Promise<PublicUser> {
  return apiFetch("/auth/me");
}

export function listUsers(): Promise<PublicUser[]> {
  return apiFetch("/users");
}

export function createUser(input: CreateUserInput): Promise<PublicUser> {
  return apiFetch("/users", { method: "POST", body: JSON.stringify(input) });
}

export function updateUserRole(id: string, role: UserRole): Promise<PublicUser> {
  return apiFetch(`/users/${id}/role`, { method: "PATCH", body: JSON.stringify({ role }) });
}
