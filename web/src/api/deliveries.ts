import { apiFetch } from "./client";
import type {
  AddDeliveryLineItemInput,
  CreateDeliveryInput,
  Delivery,
  DeliveryDetail,
  DeliveryLineItem,
  UpdateDeliveryInput,
} from "./types";

export function listDeliveries(): Promise<Delivery[]> {
  return apiFetch("/deliveries");
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
