import { apiFetch, buildQueryString } from "./client";
import type {
  ListParams,
  ListResponse,
  MechanicalLogItemDetail,
  MechanicalLogItemInput,
  MechanicalLogItemWithFulfillment,
} from "./types";

export type MechanicalLogSortField = "tag_number" | "due_date" | "created_at";

// The receiving picker (spec §7.1) defaults to the delivery's own
// requisition and widens from there via `unreleased`/omitting requisition_id.
export interface ListMechanicalLogItemsParams extends ListParams<MechanicalLogSortField> {
  requisition_id?: string;
  unreleased?: boolean;
}

export function listMechanicalLogItems(
  params: ListMechanicalLogItemsParams = {},
): Promise<ListResponse<MechanicalLogItemWithFulfillment>> {
  return apiFetch(`/mechanical-log${buildQueryString(params)}`);
}

export function getMechanicalLogItem(id: string): Promise<MechanicalLogItemDetail> {
  return apiFetch(`/mechanical-log/${id}`);
}

export function createMechanicalLogItem(input: MechanicalLogItemInput): Promise<MechanicalLogItemWithFulfillment> {
  return apiFetch("/mechanical-log", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateMechanicalLogItem(
  id: string,
  input: MechanicalLogItemInput,
): Promise<MechanicalLogItemWithFulfillment> {
  return apiFetch(`/mechanical-log/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}
