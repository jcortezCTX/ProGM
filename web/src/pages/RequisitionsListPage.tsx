import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { createRequisition, listRequisitions } from "../api/requisitions";
import { listItems } from "../api/inventory";
import { ApiError } from "../api/client";
import { FulfillmentBar } from "../components/FulfillmentBar";
import type { CreateRequisitionLineItemInput, InventoryItem, Requisition } from "../api/types";

interface LineItemRow {
  inventory_item_id: string;
  description: string;
  quantity_ordered: string;
}

function emptyRow(): LineItemRow {
  return { inventory_item_id: "", description: "", quantity_ordered: "" };
}

export function RequisitionsListPage() {
  const [requisitions, setRequisitions] = useState<Requisition[]>([]);
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  async function refresh() {
    setLoading(true);
    try {
      setRequisitions(await listRequisitions());
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load requisitions");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
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
    await refresh();
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

      {error && <p className="error">{error}</p>}
      {loading ? (
        <p>Loading…</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Requisition #</th>
              <th>Supplier</th>
              <th>Line items</th>
              <th>Fulfillment</th>
            </tr>
          </thead>
          <tbody>
            {requisitions.map((req) => (
              <tr key={req.id}>
                <td>
                  <Link to={`/requisitions/${req.id}`}>{req.requisition_number}</Link>
                </td>
                <td>{req.supplier ?? "—"}</td>
                <td>{req.line_item_count}</td>
                <td>
                  <FulfillmentBar ordered={req.quantity_ordered} received={req.quantity_received} />
                </td>
              </tr>
            ))}
            {requisitions.length === 0 && (
              <tr>
                <td colSpan={4}>No requisitions yet.</td>
              </tr>
            )}
          </tbody>
        </table>
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
