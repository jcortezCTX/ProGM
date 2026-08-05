import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { createRequisition, listRequisitions, type RequisitionSortField } from "../api/requisitions";
import { listItems } from "../api/inventory";
import { ApiError } from "../api/client";
import { ColumnPicker } from "../components/ColumnPicker";
import { DataTable } from "../components/DataTable";
import { FulfillmentBar } from "../components/FulfillmentBar";
import { SearchBox } from "../components/SearchBox";
import { useListQuery } from "../hooks/useListQuery";
import { useTableColumns, type ColumnDef } from "../hooks/useTableColumns";
import type { CreateRequisitionLineItemInput, InventoryItem, Requisition } from "../api/types";

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

interface LineItemRow {
  inventory_item_id: string;
  description: string;
  quantity_ordered: string;
}

function emptyRow(): LineItemRow {
  return { inventory_item_id: "", description: "", quantity_ordered: "" };
}

export function RequisitionsListPage() {
  const [items, setItems] = useState<InventoryItem[]>([]);
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

  useEffect(() => {
    listItems()
      .then(setItems)
      .catch(() => setItems([]));
  }, []);

  async function handleCreate(input: {
    requisition_number: string;
    supplier: string;
    notes: string;
    line_items: CreateRequisitionLineItemInput[];
  }) {
    await createRequisition({
      requisition_number: input.requisition_number,
      supplier: input.supplier || undefined,
      notes: input.notes || undefined,
      line_items: input.line_items.length > 0 ? input.line_items : undefined,
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

      {showForm && <AddRequisitionForm items={items} onSubmit={handleCreate} />}

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

function AddRequisitionForm({
  items,
  onSubmit,
}: {
  items: InventoryItem[];
  onSubmit: (input: {
    requisition_number: string;
    supplier: string;
    notes: string;
    line_items: CreateRequisitionLineItemInput[];
  }) => Promise<void>;
}) {
  const [requisitionNumber, setRequisitionNumber] = useState("");
  const [supplier, setSupplier] = useState("");
  const [notes, setNotes] = useState("");
  const [rows, setRows] = useState<LineItemRow[]>([emptyRow()]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function updateRow(index: number, patch: Partial<LineItemRow>) {
    setRows((r) => r.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  function addRow() {
    setRows((r) => [...r, emptyRow()]);
  }

  function removeRow(index: number) {
    setRows((r) => r.filter((_, i) => i !== index));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const lineItems: CreateRequisitionLineItemInput[] = rows
        .filter((row) => row.inventory_item_id && row.quantity_ordered)
        .map((row) => ({
          inventory_item_id: row.inventory_item_id,
          description: row.description || undefined,
          quantity_ordered: row.quantity_ordered,
        }));
      await onSubmit({ requisition_number: requisitionNumber, supplier, notes, line_items: lineItems });
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

      <div className="line-item-builder">
        <span className="detail-field-heading">Expected line items</span>
        {rows.map((row, index) => (
          <div className="line-item-row" key={index}>
            <label>
              Item
              <select
                value={row.inventory_item_id}
                onChange={(e) => updateRow(index, { inventory_item_id: e.target.value })}
              >
                <option value="">Select item…</option>
                {items.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.sku} — {item.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Description
              <input value={row.description} onChange={(e) => updateRow(index, { description: e.target.value })} />
            </label>
            <label>
              Qty ordered
              <input
                type="number"
                step="any"
                min="0"
                value={row.quantity_ordered}
                onChange={(e) => updateRow(index, { quantity_ordered: e.target.value })}
              />
            </label>
            <button
              type="button"
              className="button-secondary"
              onClick={() => removeRow(index)}
              disabled={rows.length === 1}
            >
              Remove
            </button>
          </div>
        ))}
        <button type="button" className="button-secondary" onClick={addRow}>
          Add line
        </button>
      </div>

      {error && <p className="error">{error}</p>}
      <button type="submit" disabled={submitting}>
        {submitting ? "Saving…" : "Save requisition"}
      </button>
    </form>
  );
}
