import { apiFetch, buildQueryString } from "./client";
import type {
  AssetType,
  CreateAssetTypeInput,
  ListParams,
  ListResponse,
  UpdateAssetTypeInput,
  UpdateAssetTypeResult,
} from "./types";

export type AssetTypeSortField = "code" | "name" | "category" | "created_at";

export function listAssetTypes(
  params: ListParams<AssetTypeSortField> & { is_active?: "true" | "false" },
): Promise<ListResponse<AssetType>> {
  return apiFetch(`/asset-types${buildQueryString(params)}`);
}

export function createAssetType(input: CreateAssetTypeInput): Promise<AssetType> {
  return apiFetch("/asset-types", { method: "POST", body: JSON.stringify(input) });
}

export function getAssetType(id: string): Promise<AssetType> {
  return apiFetch(`/asset-types/${id}`);
}

export function updateAssetType(id: string, input: UpdateAssetTypeInput): Promise<UpdateAssetTypeResult> {
  return apiFetch(`/asset-types/${id}`, { method: "PATCH", body: JSON.stringify(input) });
}

export function deactivateAssetType(id: string): Promise<void> {
  return apiFetch(`/asset-types/${id}`, { method: "DELETE" });
}
