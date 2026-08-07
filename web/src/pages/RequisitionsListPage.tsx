import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { createRequisition, listRequisitions, type RequisitionSortField } from "../api/requisitions";
import { listMechanicalLogItems } from "../api/mechanicalLog";
import { ApiError } from "../api/client";
import { ColumnPicker } from "../components/ColumnPicker";
import { DataTable } from "../components/DataTable";
import { FulfillmentBar } from "../components/FulfillmentBar";
import { SearchBox } from "../components/SearchBox";
import { useListQuery } from "../hooks/useListQuery";
import { useTableColumns, type ColumnDef } from "../hooks/useTableColumns";
import type { MechanicalLogItemWithFulfillment, Requisition } from "../api/types";

const COLUMNS: ColumnDef<Requisition>[] = [
  {
    key: "requisition_number",
    label: "Requisition #",
    sortField: "requisition_number",
    render: (req) => <Link to={`/requisitions/${req.id}`}>{req.requisition_number}</Link>,
  },
  { key: "supplier", label: "Supplier", sortField: "supplier", render: (req) => req.supplier ?? "—" },
  // Not sortable: line_item_count/quantity_ordered/quantity_received are
  // derived (a count plus a JS-side reduction over fulfillment), not plain
  // columns - seeking on them would need the same raw-SQL treatment as
  // Inventory's derived stock, deferred until actually needed.
  { key: "line_item_count", label: "Line items", render: (req) => req.line_item_count },
  {
    key: "fulfillment",
    label: "Fulfillment",
    render: (req) => <FulfillmentBar ordered={req.quantity_ordered} received={req.quantity_received} />,
  },
  { key: "quantity_ordered", label: "Qty ordered", render: (req) => req.quantity_ordered, defaultVisible: false },
  { key: "quantity_received", label: "Qty received", render: (req) => req.quantity_received, defaultVisible: false },
  { key: "notes", label: "Notes", render: (req) => req.notes ?? "—", defaultVisible: false },
  {
    key: "created_at",
    label: "Created",
    sortField: "created_at",
    render: (req) => new Date(req.created_at).toLocaleDateString(),
    defaultVisible: false,
  },
];

export function RequisitionsListPage() {
  const [showForm, setShowForm] = useState(false);
  const { visibleColumns, visibleKeys, toggle, reset } = useTableColumns("requisitions", COLUMNS);
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
  } = useListQuery<Requisition, RequisitionSortField>({
    queryKeyBase: "requisitions",
    fetchPage: listRequisitions,
    defaultSort: "created_at",
    defaultOrder: "desc",
  });

  async function handleCreate(input: { requisition_number: string; supplier: string; notes: string; logItemIds: string[] }) {
    await createRequisition({
      requisition_number: input.requisition_number,
      supplier: input.supplier || undefined,
      notes: input.notes || undefined,
      mechanical_log_item_ids: input.logItemIds.length > 0 ? input.logItemIds : undefined,
    });
    setShowForm(false);
    await refetch();
  }

  return (
    <div>
      <div className="page-header">
        <h1>Requisitions</h1>
        <button type="button" onClick={() => setShowForm((v) => !v)}>
          {showForm ? "Cancel" : "New requisition"}
        </button>
      </div>

      {showForm && <AddRequisitionForm onSubmit={handleCreate} />}

      {error && (
        <p className="error">{error instanceof ApiError ? error.message : "Failed to load requisitions"}</p>
      )}
      {isLoading ? (
        <p>Loading…</p>
      ) : (
        <>
          <div className="table-toolbar">
            <div className="table-toolbar-filters">
              <SearchBox value={q} onChange={setQ} placeholder="Search requisition #, supplier, notes…" />
            </div>
            <ColumnPicker columns={COLUMNS} visibleKeys={visibleKeys} onToggle={toggle} onReset={reset} />
          </div>
          <DataTable
            visibleColumns={visibleColumns}
            rows={rows}
            rowKey={(req) => req.id}
            sort={sort}
            order={order}
            onSortChange={(field) => setSort(field as RequisitionSortField)}
            hasMore={hasMore}
            isFetchingNextPage={isFetchingNextPage}
            onLoadMore={() => fetchNextPage()}
            emptyMessage={q ? "No requisitions match your search." : "No requisitions yet."}
          />
        </>
      )}
    </div>
  );
}

/**
 * A requisition's line items ARE the Mechanical Log rows it claims (spec
 * §3.2) - so creating one means picking unreleased rows off the log, not
 * typing in inventory items and quantities. Auto-creating a requisition just
 * from typing a new release number is explicitly out of scope (§10) - this
 * is the deliberate, explicit path.
 */
function AddRequisitionForm({
  onSubmit,
}: {
  onSubmit: (input: { requisition_number: string; supplier: string; notes: string; logItemIds: string[] }) => Promise<void>;
}) {
  const [requisitionNumber, setRequisitionNumber] = useState("");
  const [supplier, setSupplier] = useState("");
  const [notes, setNotes] = useState("");
  const [search, setSearch] = useState("");
  const [rows, setRows] = useState<MechanicalLogItemWithFulfillment[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    listMechanicalLogItems({ q: search || undefined, unreleased: true, limit: 200 })
      .then((res) => setRows(res.data))
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  }, [search]);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit({ requisition_number: requisitionNumber, supplier, notes, logItemIds: [...selected] });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to create requisition");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="card card-wide" onSubmit={handleSubmit}>
      <div className="inline-fields">
        <label>
          Requisition #
          <input value={requisitionNumber} onChange={(e) => setRequisitionNumber(e.target.value)} required />
        </label>
        <label>
          Supplier
          <input value={supplier} onChange={(e) => setSupplier(e.target.value)} />
        </label>
      </div>
      <label>
        Notes
        <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </label>

      <span className="detail-field-heading">
        Mechanical Log rows to release ({selected.size} selected) — only rows not already on a requisition are
        shown
      </span>
      <input
        placeholder="Search tag, description, supplier, material…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      {loading ? (
        <p>Loading…</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th></th>
              <th>Tag</th>
              <th>Description</th>
              <th>Supplier</th>
              <th>Qty released</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td>
                  <input type="checkbox" checked={selected.has(row.id)} onChange={() => toggle(row.id)} />
                </td>
                <td>{row.tag_number ?? "(no tag)"}</td>
                <td>{row.description ?? "—"}</td>
                <td>{row.supplier ?? "—"}</td>
                <td>
                  {row.qty_released ?? "0"} {row.unit}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={5}>No unreleased mechanical log rows match.</td>
              </tr>
            )}
          </tbody>
        </table>
      )}

      {error && <p className="error">{error}</p>}
      <button type="submit" disabled={submitting}>
        {submitting ? "Saving…" : "Save requisition"}
      </button>
    </form>
  );
}
