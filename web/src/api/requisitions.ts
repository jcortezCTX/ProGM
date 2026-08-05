import { apiFetch, buildQueryString } from "./client";
import type { CreateRequisitionInput, ListParams, ListResponse, Requisition, RequisitionDetail } from "./types";

export type RequisitionSortField = "requisition_number" | "supplier" | "created_at";

export function listRequisitions(
  params: ListParams<RequisitionSortField> = {},
): Promise<ListResponse<Requisition>> {
  return apiFetch(`/requisitions${buildQueryString(params)}`);
}

export function createRequisition(input: CreateRequisitionInput): Promise<RequisitionDetail> {
  return apiFetch("/requisitions", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function getRequisition(id: string): Promise<RequisitionDetail> {
  return apiFetch(`/requisitions/${id}`);
}
