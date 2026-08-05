import { apiFetch } from "./client";
import type { PublicUser } from "./types";

export function listUsers(): Promise<PublicUser[]> {
  return apiFetch("/users");
}
