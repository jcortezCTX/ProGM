import { prisma } from "../lib/prisma.js";
import { deleteFile, saveFile } from "../lib/attachmentStorage.js";

export class NotFoundError extends Error {}
export class ValidationError extends Error {}

export type EntityType = "inventory_item" | "delivery" | "drawing_revision" | "log_entry";

// Matches the limits already promised by the item detail page's photo
// upload copy ("Max 8 photos, 30 MB total").
const MAX_FILES_PER_ENTITY = 8;
const MAX_TOTAL_BYTES = 30 * 1024 * 1024;

export interface CreateAttachmentInput {
  entity_type: EntityType;
  entity_id: string;
  file: { buffer: Buffer; originalName: string; mimeType: string };
  uploaded_by?: string | null;
}

export async function listAttachments(entityType: string, entityId: string) {
  return prisma.attachments.findMany({
    where: { entity_type: entityType, entity_id: entityId },
    orderBy: { created_at: "asc" },
  });
}

export async function createAttachment(input: CreateAttachmentInput) {
  const existingCount = await prisma.attachments.count({
    where: { entity_type: input.entity_type, entity_id: input.entity_id },
  });
  if (existingCount >= MAX_FILES_PER_ENTITY) {
    throw new ValidationError(`Maximum of ${MAX_FILES_PER_ENTITY} photos per item`);
  }

  const existingTotal = await prisma.attachments.aggregate({
    where: { entity_type: input.entity_type, entity_id: input.entity_id },
    _sum: { size_bytes: true },
  });
  const currentTotal = existingTotal._sum.size_bytes ?? 0;
  if (currentTotal + input.file.buffer.length > MAX_TOTAL_BYTES) {
    throw new ValidationError("Uploading this file would exceed the 30 MB total photo budget for this item");
  }

  const { storageKey, sizeBytes } = await saveFile(input.entity_type, input.entity_id, input.file);
  return prisma.attachments.create({
    data: {
      entity_type: input.entity_type,
      entity_id: input.entity_id,
      file_name: input.file.originalName,
      content_type: input.file.mimeType,
      size_bytes: sizeBytes,
      storage_key: storageKey,
      uploaded_by: input.uploaded_by ?? null,
    },
  });
}

export async function getAttachment(id: string) {
  const attachment = await prisma.attachments.findUnique({ where: { id } });
  if (!attachment) throw new NotFoundError(`Attachment ${id} not found`);
  return attachment;
}

export async function deleteAttachment(id: string) {
  const attachment = await prisma.attachments.findUnique({ where: { id } });
  if (!attachment) throw new NotFoundError(`Attachment ${id} not found`);
  if (attachment.storage_key) await deleteFile(attachment.storage_key);
  await prisma.attachments.delete({ where: { id } });
}
