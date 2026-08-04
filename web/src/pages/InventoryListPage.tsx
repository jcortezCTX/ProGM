import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { createItem, listItems } from "../api/inventory";
import { ApiError } from "../api/client";
import { ColumnPicker } from "../components/ColumnPicker";
import { useTableColumns, type ColumnDef } from "../hooks/useTableColumns";
import type { InventoryItem } from "../api/types";

const COLUMNS: ColumnDef<InventoryItem>[] = [
  { key: "sku", label: "SKU", render: (item) => item.sku },
  {
    key: "name",
    label: "Name",
    render: (item) => <Link to={`/inventory/${item.id}`}>{item.name}</Link>,
  },
  { key: "unit", label: "Unit", render: (item) => item.unit },
  {
    key: "quantity_on_hand",
    label: "Quantity on hand",
    render: (item) => (
      <>
        {item.quantity_on_hand}
        {item.low_stock && <span className="badge">low stock</span>}
      </>
    ),
  },
  { key: "reorder_threshold", label: "Reorder threshold", render: (item) => item.reorder_threshold },
  { key: "description", label: "Description", render: (item) => item.description ?? "—", defaultVisible: false },
  { key: "price", label: "Price", render: (item) => `$${item.price}`, defaultVisible: false },
  { key: "total_value", label: "Total value", render: (item) => `$${item.total_value}`, defaultVisible: false },
  { key: "barcode", label: "Barcode", render: (item) => item.barcode ?? "—", defaultVisible: false },
  { key: "tags", label: "Tags", render: (item) => item.tags.join(", ") || "—", defaultVisible: false },
];

export function InventoryListPage() {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const { visibleColumns, visibleKeys, toggle, reset } = useTableColumns("inventory", COLUMNS);

  async function refresh() {
    setLoading(true);
    try {
      setItems(await listItems());
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load inventory items");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  async function handleCreate(input: {
    sku: string;
    name: string;
    unit: string;
    reorder_threshold: string;
  }) {
    await createItem(input);
    setShowForm(false);
    await refresh();
  }

  return (
    <div>
      <div className="page-header">
        <h1>Inventory</h1>
        <button type="button" onClick={() => setShowForm((v) => !v)}>
          {showForm ? "Cancel" : "Add item"}
        </button>
      </div>

      {showForm && <AddItemForm onSubmit={handleCreate} />}

      {error && <p className="error">{error}</p>}
      {loading ? (
        <p>Loading…</p>
      ) : (
        <>
          <div className="stat-tiles">
            <div className="stat-tile">
              <span className="stat-value">{items.length}</span>
              <span className="stat-label">Total items</span>
            </div>
            <div className="stat-tile">
              <span className="stat-value">
                {items.reduce((sum, item) => sum + Number(item.quantity_on_hand), 0)}
              </span>
              <span className="stat-label">Units on hand</span>
            </div>
            <div className="stat-tile alert">
              <span className="stat-value">{items.filter((item) => item.low_stock).length}</span>
              <span className="stat-label">Low stock</span>
            </div>
          </div>
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
                {items.map((item) => (
                  <tr key={item.id} className={item.low_stock ? "low-stock" : ""}>
                    {visibleColumns.map((col) => (
                      <td key={col.key}>{col.render(item)}</td>
                    ))}
                  </tr>
                ))}
                {items.length === 0 && (
                  <tr>
                    <td colSpan={visibleColumns.length}>No inventory items yet.</td>
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

function AddItemForm({
  onSubmit,
}: {
  onSubmit: (input: { sku: string; name: string; unit: string; reorder_threshold: string }) => Promise<void>;
}) {
  const [sku, setSku] = useState("");
  const [name, setName] = useState("");
  const [unit, setUnit] = useState("each");
  const [reorderThreshold, setReorderThreshold] = useState("0");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit({ sku, name, unit, reorder_threshold: reorderThreshold });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to create item");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="card" onSubmit={handleSubmit}>
      <label>
        SKU
        <input value={sku} onChange={(e) => setSku(e.target.value)} required />
      </label>
      <label>
        Name
        <input value={name} onChange={(e) => setName(e.target.value)} required />
      </label>
      <label>
        Unit
        <input value={unit} onChange={(e) => setUnit(e.target.value)} required />
      </label>
      <label>
        Reorder threshold
        <input
          type="number"
          value={reorderThreshold}
          onChange={(e) => setReorderThreshold(e.target.value)}
          min="0"
          step="any"
        />
      </label>
      {error && <p className="error">{error}</p>}
      <button type="submit" disabled={submitting}>
        {submitting ? "Saving…" : "Save item"}
      </button>
    </form>
  );
}
