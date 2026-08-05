import { apiFetch, buildQueryString } from "./client";
import type {
  AddDeliveryLineItemInput,
  CreateDeliveryInput,
  Delivery,
  DeliveryDetail,
  DeliveryLineItem,
  DeliveryStatus,
  ListResponse,
  UpdateDeliveryInput,
} from "./types";

export type DeliverySortField = "report_number" | "received_date" | "status" | "requisition_number";

export interface ListDeliveriesParams {
  cursor?: string;
  limit?: number;
  sort?: DeliverySortField;
  order?: "asc" | "desc";
  q?: string;
  status?: DeliveryStatus;
}

export function listDeliveries(params: ListDeliveriesParams = {}): Promise<ListResponse<Delivery>> {
  return apiFetch(`/deliveries${buildQueryString(params)}`);
}

export function createDelivery(input: CreateDeliveryInput): Promise<Delivery> {
  return apiFetch("/deliveries", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function getDelivery(id: string): Promise<DeliveryDetail> {
  return apiFetch(`/deliveries/${id}`);
}

export function updateDelivery(id: string, input: UpdateDeliveryInput): Promise<Delivery> {
  return apiFetch(`/deliveries/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function addDeliveryLineItem(
  deliveryId: string,
  input: AddDeliveryLineItemInput,
): Promise<DeliveryLineItem> {
  return apiFetch(`/deliveries/${deliveryId}/line-items`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}
