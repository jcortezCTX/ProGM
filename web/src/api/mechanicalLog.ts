import { apiFetch, buildQueryString } from "./client";
import type { ListParams, ListResponse, MechanicalLogItem, MechanicalLogItemInput } from "./types";

export type MechanicalLogSortField = "tag_number" | "due_date" | "created_at";

export function listMechanicalLogItems(
  params: ListParams<MechanicalLogSortField> = {},
): Promise<ListResponse<MechanicalLogItem>> {
  return apiFetch(`/mechanical-log${buildQueryString(params)}`);
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
