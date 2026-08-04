import { randomUUID } from "node:crypto";
import { mkdir, readFile as fsReadFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

// The one place that knows how attachment bytes are actually stored (see
// CLAUDE.md's "keep all [attachment] wiring in one module" rule - this table
// was built for SharePoint Graph API, now local disk, maybe Wasabi or Google
// Drive later). Every caller only ever sees `storage_key`, an opaque string
// this module assigns and reads back - swapping the backend later means
// reimplementing the three functions below, not touching any route/service.
const UPLOAD_ROOT = fileURLToPath(new URL("../../uploads/", import.meta.url));

function safeName(originalName: string): string {
  return originalName.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-100);
}

function resolvePath(storageKey: string): string {
  const fullPath = path.join(UPLOAD_ROOT, storageKey);
  if (!fullPath.startsWith(UPLOAD_ROOT)) {
    throw new Error(`invalid storage key: ${storageKey}`);
  }
  return fullPath;
}

export async function saveFile(
  entityType: string,
  entityId: string,
  file: { buffer: Buffer; originalName: string },
): Promise<{ storageKey: string; sizeBytes: number }> {
  const storageKey = path.posix.join(entityType, entityId, `${randomUUID()}-${safeName(file.originalName)}`);
  const fullPath = resolvePath(storageKey);
  await mkdir(path.dirname(fullPath), { recursive: true });
  await writeFile(fullPath, file.buffer);
  return { storageKey, sizeBytes: file.buffer.length };
}

export async function readFile(storageKey: string): Promise<Buffer> {
  return fsReadFile(resolvePath(storageKey));
}

export async function deleteFile(storageKey: string): Promise<void> {
  await rm(resolvePath(storageKey), { force: true });
}
