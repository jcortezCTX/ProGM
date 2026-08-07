import { apiFetch, buildQueryString } from "./client";
import type { CreateRequisitionInput, ListParams, ListResponse, Requisition, RequisitionDetail } from "./types";

export type RequisitionSortField = "requisition_number" | "supplier" | "created_at";

export function listRequisitions(
  params: ListParams<RequisitionSortField> = {},
): Promise<ListResponse<Requisition>> {
  return apiFetch(`/requisitions${buildQueryString(params)}`);
}

// mapWriteError on the backend surfaces both a 409 (already claimed by
// another requisition) and 404 (unknown log row id) - the caller displays
// whatever ApiError.message comes back.
export function createRequisition(input: CreateRequisitionInput): Promise<RequisitionDetail> {
  return apiFetch("/requisitions", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function getRequisition(id: string): Promise<RequisitionDetail> {
  return apiFetch(`/requisitions/${id}`);
}
