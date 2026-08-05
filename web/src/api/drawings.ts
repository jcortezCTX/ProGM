import { apiFetch, buildQueryString } from "./client";
import type {
  AddRevisionInput,
  CreateDrawingInput,
  Drawing,
  DrawingDetail,
  DrawingRevision,
  ListParams,
  ListResponse,
  UpdateDrawingInput,
} from "./types";

export type DrawingSortField = "drawing_number" | "title" | "status" | "current_revision_code";

export function listDrawings(params: ListParams<DrawingSortField> = {}): Promise<ListResponse<Drawing>> {
  return apiFetch(`/drawings${buildQueryString(params)}`);
}

export function createDrawing(input: CreateDrawingInput): Promise<Drawing> {
  return apiFetch("/drawings", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function getDrawing(id: string): Promise<DrawingDetail> {
  return apiFetch(`/drawings/${id}`);
}

export function updateDrawing(id: string, input: UpdateDrawingInput): Promise<Drawing> {
  return apiFetch(`/drawings/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function addRevision(drawingId: string, input: AddRevisionInput): Promise<DrawingRevision> {
  return apiFetch(`/drawings/${drawingId}/revisions`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}
