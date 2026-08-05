import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { createDrawing, listDrawings } from "../api/drawings";
import { ApiError } from "../api/client";
import { ColumnPicker } from "../components/ColumnPicker";
import { useTableColumns, type ColumnDef } from "../hooks/useTableColumns";
import type { CreateDrawingInput, Drawing } from "../api/types";

const COLUMNS: ColumnDef<Drawing>[] = [
  {
    key: "drawing_number",
    label: "Drawing #",
    render: (d) => <Link to={`/drawings/${d.id}`}>{d.drawing_number}</Link>,
  },
  { key: "title", label: "Title", render: (d) => d.title },
  {
    key: "status",
    label: "Status",
    render: (d) => <span className={`badge-neutral badge-status-${d.status}`}>{d.status.replace("_", " ")}</span>,
  },
  { key: "current_revision_code", label: "Current Rev", render: (d) => d.current_revision_code ?? "—" },
  { key: "revision_count", label: "Revisions", render: (d) => d.revision_count },
  { key: "discipline", label: "Discipline", render: (d) => d.discipline ?? "—" },
  { key: "drawing_type", label: "Type", render: (d) => d.drawing_type ?? "—", defaultVisible: false },
  { key: "area", label: "Area", render: (d) => d.area ?? "—", defaultVisible: false },
  {
    key: "updated_at",
    label: "Updated",
    render: (d) => new Date(d.updated_at).toLocaleDateString(),
    defaultVisible: false,
  },
];

export function DrawingsListPage() {
  const [drawings, setDrawings] = useState<Drawing[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const { visibleColumns, visibleKeys, toggle, reset } = useTableColumns("drawings", COLUMNS);

  async function refresh() {
    setLoading(true);
    try {
      setDrawings(await listDrawings());
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load drawings");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  async function handleCreate(input: CreateDrawingInput) {
    await createDrawing(input);
    setShowForm(false);
    await refresh();
  }

  return (
    <div>
      <div className="page-header">
        <h1>Drawing Log</h1>
        <button type="button" onClick={() => setShowForm((v) => !v)}>
          {showForm ? "Cancel" : "Add drawing"}
        </button>
      </div>

      {showForm && <AddDrawingForm onSubmit={handleCreate} />}

      {error && <p className="error">{error}</p>}
      {loading ? (
        <p>Loading…</p>
      ) : (
        <>
          <div className="table-toolbar">
            <ColumnPicker columns={COLUMNS} visibleKeys={visibleKeys} onToggle={toggle} onReset={reset} />
          </div>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  {visibleColumns.map((col) => (
                    <th key={col.key}>{col.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {drawings.map((d) => (
                  <tr key={d.id}>
                    {visibleColumns.map((col) => (
                      <td key={col.key}>{col.render(d)}</td>
                    ))}
                  </tr>
                ))}
                {drawings.length === 0 && (
                  <tr>
                    <td colSpan={visibleColumns.length}>No drawings yet.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

function AddDrawingForm({ onSubmit }: { onSubmit: (input: CreateDrawingInput) => Promise<void> }) {
  const [drawingNumber, setDrawingNumber] = useState("");
  const [title, setTitle] = useState("");
  const [discipline, setDiscipline] = useState("");
  const [drawingType, setDrawingType] = useState("");
  const [area, setArea] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit({
        drawing_number: drawingNumber,
        title,
        discipline: discipline || undefined,
        drawing_type: drawingType || undefined,
        area: area || undefined,
      });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to create drawing");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="card" onSubmit={handleSubmit}>
      <label>
        Drawing #
        <input value={drawingNumber} onChange={(e) => setDrawingNumber(e.target.value)} required />
      </label>
      <label>
        Title
        <input value={title} onChange={(e) => setTitle(e.target.value)} required />
      </label>
      <label>
        Discipline
        <input value={discipline} onChange={(e) => setDiscipline(e.target.value)} placeholder="e.g. C, M, P, S" />
      </label>
      <label>
        Type
        <input value={drawingType} onChange={(e) => setDrawingType(e.target.value)} placeholder="e.g. 2D DWG, P3D" />
      </label>
      <label>
        Area
        <input value={area} onChange={(e) => setArea(e.target.value)} />
      </label>
      {error && <p className="error">{error}</p>}
      <button type="submit" disabled={submitting}>
        {submitting ? "Saving…" : "Save drawing"}
      </button>
    </form>
  );
}
