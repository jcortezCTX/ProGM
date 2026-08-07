import { apiFetch, buildQueryString } from "./client";
import type {
  Asset,
  AssetDetail,
  AssetFeatureCollection,
  AssetsListParams,
  BulkCreateAssetsResult,
  CreateAssetInput,
  GeoJsonGeometry,
  ListParams,
  ListResponse,
  UpdateAssetInput,
} from "./types";

export type AssetSortField = "tag" | "name" | "status" | "created_at";

export function listAssets(
  siteId: string,
  params: ListParams<AssetSortField> & AssetsListParams,
): Promise<ListResponse<Asset>> {
  return apiFetch(`/sites/${siteId}/assets${buildQueryString(params)}`);
}

// Un-paginated FeatureCollection for map rendering (spec 5.1's
// ?format=geojson) - callers are expected to scope this with bbox.
export function listAssetsAsGeoJson(
  siteId: string,
  params: AssetsListParams & { limit?: number } = {},
): Promise<AssetFeatureCollection> {
  return apiFetch(`/sites/${siteId}/assets${buildQueryString({ ...params, format: "geojson" })}`);
}

export function createAsset(siteId: string, input: CreateAssetInput): Promise<AssetDetail> {
  return apiFetch(`/sites/${siteId}/assets`, { method: "POST", body: JSON.stringify(input) });
}

export function bulkCreateAssets(siteId: string, assets: CreateAssetInput[]): Promise<BulkCreateAssetsResult> {
  return apiFetch(`/sites/${siteId}/assets/bulk`, { method: "POST", body: JSON.stringify({ assets }) });
}

export function getAsset(id: string): Promise<AssetDetail> {
  return apiFetch(`/assets/${id}`);
}

export function updateAsset(
  id: string,
  input: UpdateAssetInput,
  options: { replaceAttributes?: boolean } = {},
): Promise<AssetDetail> {
  const qs = options.replaceAttributes ? "?replace_attributes=true" : "";
  return apiFetch(`/assets/${id}${qs}`, { method: "PATCH", body: JSON.stringify(input) });
}

export function deleteAsset(id: string): Promise<void> {
  return apiFetch(`/assets/${id}`, { method: "DELETE" });
}

export function updateAssetGeometry(id: string, geometry: GeoJsonGeometry | null): Promise<AssetDetail> {
  return apiFetch(`/assets/${id}/geometry`, { method: "POST", body: JSON.stringify({ geometry }) });
}
