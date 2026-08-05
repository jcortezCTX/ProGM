import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { createItem, listItems, listTags, type InventorySortField } from "../api/inventory";
import { ApiError } from "../api/client";
import { ColumnPicker } from "../components/ColumnPicker";
import { DataTable } from "../components/DataTable";
import { SearchBox } from "../components/SearchBox";
import { useListQuery } from "../hooks/useListQuery";
import { useTableColumns, type ColumnDef } from "../hooks/useTableColumns";
import type { InventoryItem, InventoryTag } from "../api/types";

const COLUMNS: ColumnDef<InventoryItem>[] = [
  { key: "sku", label: "SKU", sortField: "sku", render: (item) => item.sku },
  {
    key: "name",
    label: "Name",
    sortField: "name",
    render: (item) => <Link to={`/inventory/${item.id}`}>{item.name}</Link>,
  },
  { key: "unit", label: "Unit", render: (item) => item.unit },
  {
    key: "quantity_on_hand",
    label: "Quantity on hand",
    sortField: "quantity_on_hand",
    render: (item) => (
      <>
        {item.quantity_on_hand}
        {item.low_stock && <span className="badge">low stock</span>}
      </>
    ),
  },
  { key: "reorder_threshold", label: "Reorder threshold", render: (item) => item.reorder_threshold },
  { key: "description", label: "Description", render: (item) => item.description ?? "—", defaultVisible: false },
  { key: "price", label: "Price", sortField: "price", render: (item) => `$${item.price}`, defaultVisible: false },
  { key: "total_value", label: "Total value", render: (item) => `$${item.total_value}`, defaultVisible: false },
  { key: "barcode", label: "Barcode", render: (item) => item.barcode ?? "—", defaultVisible: false },
  { key: "tags", label: "Tags", render: (item) => item.tags.join(", ") || "—", defaultVisible: false },
];

export function InventoryListPage() {
  const [tags, setTags] = useState<InventoryTag[]>([]);
  const [showForm, setShowForm] = useState(false);
  const { visibleColumns, visibleKeys, toggle, reset } = useTableColumns("inventory", COLUMNS);
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
    filters,
    setFilter,
  } = useListQuery<InventoryItem, InventorySortField, { tag: string; low_stock: "true" | "false" }>({
    queryKeyBase: "inventory",
    fetchPage: listItems,
    defaultSort: "name",
    filterKeys: ["tag", "low_stock"],
  });

  useEffect(() => {
    listTags()
      .then(setTags)
      .catch(() => setTags([]));
  }, []);

  // Only loaded rows are known client-side under infinite-scroll pagination
  // - these tiles describe what's currently loaded, not the full catalog.
  const loadedCount = rows.length;
  const loadedUnits = rows.reduce((sum, item) => sum + Number(item.quantity_on_hand), 0);
  const loadedLowStock = rows.filter((item) => item.low_stock).length;

  async function handleCreate(input: {
    sku: string;
    name: string;
    unit: string;
    reorder_threshold: string;
  }) {
    await createItem(input);
    setShowForm(false);
    await refetch();
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

      {error && (
        <p className="error">{error instanceof ApiError ? error.message : "Failed to load inventory items"}</p>
      )}
      {isLoading ? (
        <p>Loading…</p>
      ) : (
        <>
          <div className="stat-tiles">
            <div className="stat-tile">
              <span className="stat-value">{loadedCount}</span>
              <span className="stat-label">Loaded items</span>
            </div>
            <div className="stat-tile">
              <span className="stat-value">{loadedUnits}</span>
              <span className="stat-label">Units on hand (loaded)</span>
            </div>
            <div className="stat-tile alert">
              <span className="stat-value">{loadedLowStock}</span>
              <span className="stat-label">Low stock (loaded)</span>
            </div>
          </div>
          <div className="table-toolbar">
            <div className="table-toolbar-filters">
              <SearchBox value={q} onChange={setQ} placeholder="Search sku, name, description, barcode…" />
              <div className="filter-bar">
                <select value={filters.tag ?? ""} onChange={(e) => setFilter("tag", e.target.value || undefined)}>
                  <option value="">All tags</option>
                  {tags.map((t) => (
                    <option key={t.id} value={t.name}>
                      {t.name}
                    </option>
                  ))}
                </select>
                <select
                  value={filters.low_stock ?? ""}
                  onChange={(e) => setFilter("low_stock", e.target.value || undefined)}
                >
                  <option value="">All stock levels</option>
                  <option value="true">Low stock only</option>
                  <option value="false">Not low stock</option>
                </select>
              </div>
            </div>
            <ColumnPicker columns={COLUMNS} visibleKeys={visibleKeys} onToggle={toggle} onReset={reset} />
          </div>
          <DataTable
            visibleColumns={visibleColumns}
            rows={rows}
            rowKey={(item) => item.id}
            sort={sort}
            order={order}
            onSortChange={(field) => setSort(field as InventorySortField)}
            hasMore={hasMore}
            isFetchingNextPage={isFetchingNextPage}
            onLoadMore={() => fetchNextPage()}
            emptyMessage={q || filters.tag || filters.low_stock ? "No items match your filters." : "No inventory items yet."}
            rowClassName={(item) => (item.low_stock ? "low-stock" : undefined)}
          />
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
