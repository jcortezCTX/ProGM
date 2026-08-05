import { useEffect, useState } from "react";
import { attachmentFileUrl, deleteAttachment, listAttachments, uploadAttachment } from "../api/attachments";
import { ApiError } from "../api/client";
import type { Attachment, AttachmentEntityType } from "../api/types";

const MAX_FILES = 8;

function formatSize(bytes: number | null): string {
  if (bytes === null) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// Non-image-specific counterpart to PhotoUpload.tsx - a plain filename/size
// list with a download link, for entities whose attachments aren't
// necessarily photos (drawing revisions: PDFs, scans, etc). Same backend
// (/api/attachments), same 8-file budget.
export function FileAttachments({
  entityType,
  entityId,
  accept = "application/pdf,image/jpeg,image/png,image/heic,image/heif",
}: {
  entityType: AttachmentEntityType;
  entityId: string;
  accept?: string;
}) {
  const [files, setFiles] = useState<Attachment[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    setLoading(true);
    try {
      setFiles(await listAttachments(entityType, entityId));
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load files");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entityType, entityId]);

  const atCapacity = files.length >= MAX_FILES;

  async function handleFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    setUploading(true);
    setError(null);
    try {
      let count = files.length;
      for (const file of Array.from(fileList)) {
        if (count >= MAX_FILES) {
          setError(`Maximum of ${MAX_FILES} files per item - some files were not uploaded`);
          break;
        }
        await uploadAttachment(entityType, entityId, file);
        count++;
      }
      await refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to upload file");
    } finally {
      setUploading(false);
    }
  }

  async function handleDelete(id: string) {
    try {
      await deleteAttachment(id);
      await refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to delete file");
    }
  }

  if (loading) return <p className="muted">Loading files&hellip;</p>;

  return (
    <div className="file-attachments">
      {files.length > 0 && (
        <ul className="file-list">
          {files.map((file) => (
            <li key={file.id} className="file-list-item">
              <a href={attachmentFileUrl(file.id)} target="_blank" rel="noreferrer">
                {file.file_name}
              </a>
              <span className="muted">{formatSize(file.size_bytes)}</span>
              <button
                type="button"
                className="file-list-remove"
                onClick={() => handleDelete(file.id)}
                aria-label={`Remove ${file.file_name}`}
              >
                &times;
              </button>
            </li>
          ))}
        </ul>
      )}

      {!atCapacity && (
        <label className="file-attachments-add">
          <input
            type="file"
            accept={accept}
            multiple
            onChange={(e) => handleFiles(e.target.files)}
            disabled={uploading}
          />
          <span>{uploading ? "Uploading…" : "+ Add file"}</span>
        </label>
      )}

      {error && <p className="error">{error}</p>}
    </div>
  );
}
