import { apiFetch, buildQueryString } from "./client";
import type {
  AddDeliveryLineItemInput,
  AddDeliveryLineItemResult,
  CreateDeliveryInput,
  Delivery,
  DeliveryDetail,
  DeliveryLineItem,
  DeliveryLineDisposition,
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
): Promise<AddDeliveryLineItemResult> {
  return apiFetch(`/deliveries/${deliveryId}/line-items`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export interface UpdateDeliveryLineItemInput {
  quantity_received?: string;
  disposition?: DeliveryLineDisposition;
  condition?: string | null;
  properly_marked?: boolean | null;
  note?: string | null;
  location?: string;
}

export function updateDeliveryLineItem(
  deliveryId: string,
  lineItemId: string,
  input: UpdateDeliveryLineItemInput,
): Promise<DeliveryLineItem> {
  return apiFetch(`/deliveries/${deliveryId}/line-items/${lineItemId}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function deleteDeliveryLineItem(deliveryId: string, lineItemId: string): Promise<void> {
  return apiFetch(`/deliveries/${deliveryId}/line-items/${lineItemId}`, { method: "DELETE" });
}
