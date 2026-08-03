import { apiFetch } from "./client";
import type {
  CreateItemInput,
  CreateTransactionInput,
  InventoryItem,
  InventoryItemDetail,
  InventoryTransaction,
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

export function getTransactionHistory(id: string): Promise<InventoryTransaction[]> {
  return apiFetch(`/inventory/items/${id}/transactions`);
}

export function recordTransaction(input: CreateTransactionInput): Promise<InventoryTransaction> {
  return apiFetch("/inventory/transactions", {
    method: "POST",
    body: JSON.stringify(input),
  });
}
