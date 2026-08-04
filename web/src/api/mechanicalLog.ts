import { apiFetch } from "./client";
import type { MechanicalLogItem, MechanicalLogItemInput } from "./types";

export function listMechanicalLogItems(): Promise<MechanicalLogItem[]> {
  return apiFetch("/mechanical-log");
}

export function getMechanicalLogItem(id: string): Promise<MechanicalLogItem> {
  return apiFetch(`/mechanical-log/${id}`);
}

export function createMechanicalLogItem(input: MechanicalLogItemInput): Promise<MechanicalLogItem> {
  return apiFetch("/mechanical-log", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateMechanicalLogItem(
  id: string,
  input: MechanicalLogItemInput,
): Promise<MechanicalLogItem> {
  return apiFetch(`/mechanical-log/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}
