import { apiFetch } from "./client";
import type {
  CreateCustomFieldDefInput,
  CreateItemInput,
  CreateTransactionInput,
  InventoryCustomFieldDef,
  InventoryItem,
  InventoryItemDetail,
  InventoryTag,
  InventoryTransaction,
  UpdateItemInput,
} from "./types";

export function listItems(): Promise<InventoryItem[]> {
  return apiFetch("/inventory/items");
}

export function createItem(input: CreateItemInput): Promise<InventoryItem> {
  return apiFetch("/inventory/items", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function getItem(id: string): Promise<InventoryItemDetail> {
  return apiFetch(`/inventory/items/${id}`);
}

export function updateItem(id: string, input: UpdateItemInput): Promise<InventoryItemDetail> {
  return apiFetch(`/inventory/items/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function getTransactionHistory(id: string): Promise<InventoryTransaction[]> {
  return apiFetch(`/inventory/items/${id}/transactions`);
}

export function recordTransaction(input: CreateTransactionInput): Promise<InventoryTransaction> {
  return apiFetch("/inventory/transactions", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function listTags(): Promise<InventoryTag[]> {
  return apiFetch("/inventory/tags");
}

export function listCustomFieldDefs(): Promise<InventoryCustomFieldDef[]> {
  return apiFetch("/inventory/custom-field-defs");
}

export function createCustomFieldDef(
  input: CreateCustomFieldDefInput,
): Promise<InventoryCustomFieldDef> {
  return apiFetch("/inventory/custom-field-defs", {
    method: "POST",
    body: JSON.stringify(input),
  });
}
