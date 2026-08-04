import { apiFetch } from "./client";
import type { CreateRequisitionInput, Requisition, RequisitionDetail } from "./types";

export function listRequisitions(): Promise<Requisition[]> {
  return apiFetch("/requisitions");
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
