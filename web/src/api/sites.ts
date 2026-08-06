import { apiFetch, buildQueryString } from "./client";
import type { CreateSiteInput, ListParams, ListResponse, Site } from "./types";

export type SiteSortField = "name" | "code" | "created_at";

export function listSites(params: ListParams<SiteSortField>): Promise<ListResponse<Site>> {
  return apiFetch(`/sites${buildQueryString(params)}`);
}

export function createSite(input: CreateSiteInput): Promise<Site> {
  return apiFetch("/sites", { method: "POST", body: JSON.stringify(input) });
}

export function getSite(id: string): Promise<Site> {
  return apiFetch(`/sites/${id}`);
}
