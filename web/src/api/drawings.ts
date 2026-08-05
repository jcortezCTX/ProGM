import { apiFetch } from "./client";
import type {
  AddRevisionInput,
  CreateDrawingInput,
  Drawing,
  DrawingDetail,
  DrawingRevision,
  UpdateDrawingInput,
} from "./types";

export function listDrawings(): Promise<Drawing[]> {
  return apiFetch("/drawings");
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
