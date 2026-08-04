import { useEffect, useRef, useState } from "react";
import { attachmentFileUrl, deleteAttachment, listAttachments, uploadAttachment } from "../api/attachments";
import { ApiError } from "../api/client";
import type { Attachment, AttachmentEntityType } from "../api/types";

const MAX_FILES = 8;
const MAX_TOTAL_BYTES = 30 * 1024 * 1024;
const ACCEPTED_TYPES = "image/jpeg,image/png,image/heic,image/heif";

// Self-contained: loads/uploads/deletes its own attachments given just an
// entity reference, so it drops into any entity's detail page unchanged.
// Backed by local disk for now (api/src/lib/attachmentStorage.ts) - moving
// to Wasabi/Google Drive later is a backend-only change, nothing here.
export function PhotoUpload({ entityType, entityId }: { entityType: AttachmentEntityType; entityId: string }) {
  const [photos, setPhotos] = useState<Attachment[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function refresh() {
    setLoading(true);
    try {
      setPhotos(await listAttachments(entityType, entityId));
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load photos");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entityType, entityId]);

  const totalBytes = photos.reduce((sum, p) => sum + (p.size_bytes ?? 0), 0);
  const atCapacity = photos.length >= MAX_FILES;

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(true);
    setError(null);
    try {
      let count = photos.length;
      for (const file of Array.from(files)) {
        if (count >= MAX_FILES) {
          setError(`Maximum of ${MAX_FILES} photos per item - some files were not uploaded`);
          break;
        }
        await uploadAttachment(entityType, entityId, file);
        count++;
      }
      await refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to upload photo");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function handleDelete(id: string) {
    try {
      await deleteAttachment(id);
      await refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to delete photo");
    }
  }

  return (
    <div className="photo-upload">
      {photos.length > 0 && (
        <div className="photo-grid">
          {photos.map((photo) => (
            <div className="photo-thumb" key={photo.id}>
              <img src={attachmentFileUrl(photo.id)} alt={photo.file_name} />
              <button
                type="button"
                className="photo-thumb-remove"
                onClick={() => handleDelete(photo.id)}
                aria-label={`Remove ${photo.file_name}`}
              >
                &times;
              </button>
            </div>
          ))}
        </div>
      )}

      {!loading && !atCapacity && (
        <label className="photo-upload-dropzone">
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPTED_TYPES}
            multiple
            onChange={(e) => handleFiles(e.target.files)}
            disabled={uploading}
          />
          <p>{uploading ? "Uploading…" : "Add photos"}</p>
        </label>
      )}

      <p className="muted">
        {photos.length} of {MAX_FILES} photos &middot; {(totalBytes / (1024 * 1024)).toFixed(1)} of{" "}
        {(MAX_TOTAL_BYTES / (1024 * 1024)).toFixed(0)} MB &middot; JPG, PNG, HEIC
      </p>

      {error && <p className="error">{error}</p>}
    </div>
  );
}
