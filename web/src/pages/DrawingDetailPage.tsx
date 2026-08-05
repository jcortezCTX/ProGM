import { useEffect, useState, type FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import { ApiError } from "../api/client";
import { addRevision, getDrawing, updateDrawing } from "../api/drawings";
import { FileAttachments } from "../components/FileAttachments";
import type { AddRevisionInput, DrawingDetail, DrawingRevision, DrawingStatus } from "../api/types";

const STATUSES: DrawingStatus[] = ["draft", "in_review", "approved", "superseded"];

interface EditableForm {
  title: string;
  discipline: string;
  drawing_type: string;
  area: string;
  status: DrawingStatus;
}

function buildForm(drawing: DrawingDetail): EditableForm {
  return {
    title: drawing.title,
    discipline: drawing.discipline ?? "",
    drawing_type: drawing.drawing_type ?? "",
    area: drawing.area ?? "",
    status: drawing.status,
  };
}

export function DrawingDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [drawing, setDrawing] = useState<DrawingDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState<EditableForm | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  async function refresh() {
    if (!id) return;
    setLoading(true);
    try {
      const detail = await getDrawing(id);
      setDrawing(detail);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load drawing");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    if (drawing) setForm(buildForm(drawing));
  }, [drawing]);

  function updateForm(patch: Partial<EditableForm>) {
    setForm((f) => (f ? { ...f, ...patch } : f));
  }

  function handleCancel() {
    if (drawing) setForm(buildForm(drawing));
    setSaveError(null);
  }

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    if (!form || !id) return;
    setSaving(true);
    setSaveError(null);
    try {
      await updateDrawing(id, {
        title: form.title,
        discipline: form.discipline.trim() === "" ? null : form.discipline,
        drawing_type: form.drawing_type.trim() === "" ? null : form.drawing_type,
        area: form.area.trim() === "" ? null : form.area,
        status: form.status,
      });
      await refresh();
    } catch (err) {
      setSaveError(err instanceof ApiError ? err.message : "Failed to save drawing");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p>Loading…</p>;
  if (error) return <p className="error">{error}</p>;
  if (!drawing || !id || !form) return <p>Drawing not found.</p>;

  return (
    <div>
      <div className="detail-topbar">
        <nav className="detail-breadcrumb" aria-label="Breadcrumb">
          <Link to="/drawings">Drawings</Link>
          <span className="detail-breadcrumb-sep">&rsaquo;</span>
          <span>{drawing.title}</span>
        </nav>
        <div className="detail-meta">
          Drawing #: <strong>{drawing.drawing_number}</strong> &middot; Updated{" "}
          {new Date(drawing.updated_at).toLocaleString()}
        </div>
      </div>

      <form onSubmit={handleSave}>
        <div className="detail-title-bar">
          <input
            className="detail-title-input"
            value={form.title}
            onChange={(e) => updateForm({ title: e.target.value })}
            aria-label="Drawing title"
            required
          />
          <select
            value={form.status}
            onChange={(e) => updateForm({ status: e.target.value as DrawingStatus })}
            aria-label="Status"
          >
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s.replace("_", " ")}
              </option>
            ))}
          </select>
          <div className="detail-title-actions">
            <button type="button" className="button-secondary" onClick={handleCancel} disabled={saving}>
              Cancel
            </button>
            <button type="submit" disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </div>

        {saveError && <p className="error">{saveError}</p>}

        <div className="card detail-card">
          <h2>Drawing Info</h2>
          <label>
            Discipline
            <input value={form.discipline} onChange={(e) => updateForm({ discipline: e.target.value })} />
          </label>
          <label>
            Type
            <input value={form.drawing_type} onChange={(e) => updateForm({ drawing_type: e.target.value })} />
          </label>
          <label>
            Area
            <input value={form.area} onChange={(e) => updateForm({ area: e.target.value })} />
          </label>
        </div>
      </form>

      <section className="detail-section">
        <h2>Revisions</h2>
        <p className="muted">
          Revisions are append-only &mdash; adding a new revision never edits or removes an earlier one, and always
          becomes the drawing's current revision.
        </p>

        <AddRevisionForm
          existingCodes={drawing.revisions.map((r) => r.revision_code)}
          onSubmit={async (input) => {
            await addRevision(id, input);
            await refresh();
          }}
        />

        <div className="revision-list">
          {drawing.revisions.map((revision) => (
            <RevisionCard key={revision.id} revision={revision} isCurrent={revision.id === drawing.current_revision_id} />
          ))}
          {drawing.revisions.length === 0 && <p className="muted">No revisions yet.</p>}
        </div>
      </section>
    </div>
  );
}

function RevisionCard({ revision, isCurrent }: { revision: DrawingRevision; isCurrent: boolean }) {
  return (
    <div className="revision-card">
      <div className="revision-card-header">
        <span className="revision-card-code">Rev {revision.revision_code}</span>
        {isCurrent ? (
          <span className="badge-neutral badge-current">current</span>
        ) : (
          <span className="badge-neutral badge-superseded">superseded</span>
        )}
        <span className="revision-card-date">{new Date(revision.created_at).toLocaleString()}</span>
      </div>
      {revision.notes && <p className="revision-card-notes">{revision.notes}</p>}
      {revision.external_link && (
        <a className="revision-card-link" href={revision.external_link} target="_blank" rel="noreferrer">
          {revision.external_link}
        </a>
      )}
      <FileAttachments entityType="drawing_revision" entityId={revision.id} />
    </div>
  );
}

function AddRevisionForm({
  existingCodes,
  onSubmit,
}: {
  existingCodes: string[];
  onSubmit: (input: AddRevisionInput) => Promise<void>;
}) {
  const [revisionCode, setRevisionCode] = useState("");
  const [notes, setNotes] = useState("");
  const [externalLink, setExternalLink] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (existingCodes.includes(revisionCode.trim())) {
      setError(`Revision ${revisionCode} already exists`);
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit({
        revision_code: revisionCode,
        notes: notes || undefined,
        external_link: externalLink || undefined,
      });
      setRevisionCode("");
      setNotes("");
      setExternalLink("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to add revision");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="card card-wide" onSubmit={handleSubmit}>
      <div className="inline-fields">
        <label>
          Revision code
          <input
            value={revisionCode}
            onChange={(e) => setRevisionCode(e.target.value)}
            placeholder="e.g. A, B, R1"
            required
          />
        </label>
        <label>
          Link (Google Drive, Wasabi, etc.)
          <input
            value={externalLink}
            onChange={(e) => setExternalLink(e.target.value)}
            placeholder="https://…"
          />
        </label>
      </div>
      <label>
        Notes
        <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </label>
      {error && <p className="error">{error}</p>}
      <button type="submit" disabled={submitting}>
        {submitting ? "Saving…" : "Add revision"}
      </button>
    </form>
  );
}
