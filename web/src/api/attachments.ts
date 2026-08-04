import { API_BASE_URL, ApiError, apiFetch } from "./client";
import type { Attachment, AttachmentEntityType } from "./types";

export function listAttachments(entityType: AttachmentEntityType, entityId: string): Promise<Attachment[]> {
  return apiFetch(`/attachments?entity_type=${entityType}&entity_id=${entityId}`);
}

// Bypasses apiFetch: uploads are multipart/form-data, not JSON, and the
// browser needs to set its own Content-Type (with boundary) for FormData.
export async function uploadAttachment(
  entityType: AttachmentEntityType,
  entityId: string,
  file: File,
): Promise<Attachment> {
  const form = new FormData();
  form.append("entity_type", entityType);
  form.append("entity_id", entityId);
  form.append("file", file);

  const res = await fetch(`${API_BASE_URL}/attachments`, { method: "POST", body: form });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new ApiError(res.status, body.error ?? res.statusText);
  }
  return res.json() as Promise<Attachment>;
}

export function deleteAttachment(id: string): Promise<void> {
  return apiFetch(`/attachments/${id}`, { method: "DELETE" });
}

export function attachmentFileUrl(id: string): string {
  return `${API_BASE_URL}/attachments/${id}/file`;
}
