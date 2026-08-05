import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { createDrawing, listDrawings, type DrawingSortField } from "../api/drawings";
import { ApiError } from "../api/client";
import { ColumnPicker } from "../components/ColumnPicker";
import { DataTable } from "../components/DataTable";
import { SearchBox } from "../components/SearchBox";
import { useListQuery } from "../hooks/useListQuery";
import { useTableColumns, type ColumnDef } from "../hooks/useTableColumns";
import type { CreateDrawingInput, Drawing } from "../api/types";

const COLUMNS: ColumnDef<Drawing>[] = [
  {
    key: "drawing_number",
    label: "Drawing #",
    sortField: "drawing_number",
    render: (d) => <Link to={`/drawings/${d.id}`}>{d.drawing_number}</Link>,
  },
  { key: "title", label: "Title", sortField: "title", render: (d) => d.title },
  {
    key: "status",
    label: "Status",
    sortField: "status",
    render: (d) => <span className={`badge-neutral badge-status-${d.status}`}>{d.status.replace("_", " ")}</span>,
  },
  {
    key: "current_revision_code",
    label: "Current Rev",
    sortField: "current_revision_code",
    render: (d) => d.current_revision_code ?? "—",
  },
  // Not sortable: revision_count is a _count aggregate, not a plain column -
  // seeking on it would need the same raw-SQL treatment as Inventory stock,
  // deferred until actually needed (see the table-enhancements plan).
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
  const [showForm, setShowForm] = useState(false);
  const { visibleColumns, visibleKeys, toggle, reset } = useTableColumns("drawings", COLUMNS);
  const {
    rows,
    hasMore,
    isLoading,
    isFetchingNextPage,
    error,
    fetchNextPage,
    refetch,
    sort,
    order,
    setSort,
    q,
    setQ,
  } = useListQuery<Drawing, DrawingSortField>({
    queryKeyBase: "drawings",
    fetchPage: listDrawings,
    defaultSort: "drawing_number",
  });

  async function handleCreate(input: CreateDrawingInput) {
    await createDrawing(input);
    setShowForm(false);
    await refetch();
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

      {error && (
        <p className="error">{error instanceof ApiError ? error.message : "Failed to load drawings"}</p>
      )}
      {isLoading ? (
        <p>Loading…</p>
      ) : (
        <>
          <div className="table-toolbar">
            <div className="table-toolbar-filters">
              <SearchBox value={q} onChange={setQ} placeholder="Search drawing #, title, discipline…" />
            </div>
            <ColumnPicker columns={COLUMNS} visibleKeys={visibleKeys} onToggle={toggle} onReset={reset} />
          </div>
          <DataTable
            visibleColumns={visibleColumns}
            rows={rows}
            rowKey={(d) => d.id}
            sort={sort}
            order={order}
            onSortChange={(field) => setSort(field as DrawingSortField)}
            hasMore={hasMore}
            isFetchingNextPage={isFetchingNextPage}
            onLoadMore={() => fetchNextPage()}
            emptyMessage={q ? "No drawings match your search." : "No drawings yet."}
          />
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
