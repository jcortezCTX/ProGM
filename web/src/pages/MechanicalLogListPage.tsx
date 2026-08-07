import { Link } from "react-router-dom";
import { ApiError } from "../api/client";
import { listMechanicalLogItems, type MechanicalLogSortField } from "../api/mechanicalLog";
import { ColumnPicker } from "../components/ColumnPicker";
import { DataTable } from "../components/DataTable";
import { SearchBox } from "../components/SearchBox";
import { useListQuery } from "../hooks/useListQuery";
import { useTableColumns, type ColumnDef } from "../hooks/useTableColumns";
import type { MechanicalLogItemWithFulfillment } from "../api/types";

const FULFILLMENT_LABEL: Record<string, string> = {
  not_received: "Not received",
  partial: "Partial",
  complete: "Complete",
};

function money(value: string | null): string {
  return value === null ? "—" : `$${value}`;
}

function date(value: string | null): string {
  return value ? new Date(value).toLocaleDateString() : "—";
}

function text(value: string | null): string {
  return value ?? "—";
}

// The CSV this table is modeled on (logs_samples/Mechanical Log.csv) has 33
// data columns - far too many to show at once, which is exactly the case
// customizable columns exists for. A sensible working subset ships visible
// by default; the rest are one click away via the Columns picker.
const COLUMNS: ColumnDef<MechanicalLogItemWithFulfillment>[] = [
  {
    key: "tag_number",
    label: "Tag Number",
    sortField: "tag_number",
    render: (row) => <Link to={`/mechanical-log/${row.id}`}>{row.tag_number ?? "(no tag)"}</Link>,
  },
  { key: "description", label: "Description", render: (row) => text(row.description) },
  { key: "supplier", label: "Supplier", render: (row) => text(row.supplier) },
  { key: "qty_released", label: "Qty Released", render: (row) => text(row.qty_released) },
  { key: "unit", label: "Unit", render: (row) => text(row.unit) },
  // Chain-derived (MATERIAL_FLOW_SPEC.md), off by default so the historical
  // CSV-mirroring default view is unchanged.
  {
    key: "requisition_number",
    label: "Requisition",
    render: (row) =>
      row.requisition_number ? (
        <Link to={`/requisitions/${row.requisition_id}`}>{row.requisition_number}</Link>
      ) : (
        "—"
      ),
    defaultVisible: false,
  },
  {
    key: "fulfillment_status",
    label: "Fulfillment",
    render: (row) => (
      <span className={`badge-neutral badge-fulfillment-${row.fulfillment_status}`}>
        {FULFILLMENT_LABEL[row.fulfillment_status]}
      </span>
    ),
    defaultVisible: false,
  },
  { key: "delivered_qty", label: "Delivered Qty", render: (row) => text(row.delivered_qty) },
  { key: "need_qty", label: "Need Qty", render: (row) => text(row.need_qty) },
  { key: "due_date", label: "Due Date", sortField: "due_date", render: (row) => date(row.due_date) },
  { key: "storage_location", label: "Storage Location", render: (row) => text(row.storage_location) },
  { key: "review", label: "Review", render: (row) => text(row.review) },
  { key: "release", label: "Release", render: (row) => text(row.release), defaultVisible: false },
  { key: "size", label: "Size", render: (row) => text(row.size), defaultVisible: false },
  { key: "material", label: "Material", render: (row) => text(row.material), defaultVisible: false },
  { key: "lining", label: "Lining", render: (row) => text(row.lining), defaultVisible: false },
  { key: "coating", label: "Coating", render: (row) => text(row.coating), defaultVisible: false },
  { key: "release_date", label: "Release Date", render: (row) => date(row.release_date), defaultVisible: false },
  { key: "area", label: "Area", render: (row) => text(row.area), defaultVisible: false },
  { key: "system", label: "System", render: (row) => text(row.system), defaultVisible: false },
  { key: "system2", label: "System 2", render: (row) => text(row.system2), defaultVisible: false },
  { key: "contract_dwg", label: "Contract Dwg", render: (row) => text(row.contract_dwg), defaultVisible: false },
  { key: "shop_dwg", label: "Shop Dwg", render: (row) => text(row.shop_dwg), defaultVisible: false },
  { key: "received_on", label: "Received On", render: (row) => date(row.received_on), defaultVisible: false },
  { key: "received_by", label: "Received By", render: (row) => text(row.received_by), defaultVisible: false },
  { key: "notes", label: "Notes", render: (row) => text(row.notes), defaultVisible: false },
  { key: "estimate_cost", label: "Estimate Cost", render: (row) => money(row.estimate_cost), defaultVisible: false },
  {
    key: "contract_unit_price",
    label: "Contract Unit Price",
    render: (row) => money(row.contract_unit_price),
    defaultVisible: false,
  },
  {
    key: "contract_extended_price",
    label: "Contract Extended Price",
    render: (row) => money(row.contract_extended_price),
    defaultVisible: false,
  },
  { key: "above_below", label: "Above/Below", render: (row) => text(row.above_below), defaultVisible: false },
  { key: "invoice_no", label: "Invoice No.", render: (row) => text(row.invoice_no), defaultVisible: false },
  {
    key: "invoice_unit_price",
    label: "Invoice Unit Price",
    render: (row) => money(row.invoice_unit_price),
    defaultVisible: false,
  },
  {
    key: "invoice_extended_price",
    label: "Invoice Extended Price",
    render: (row) => money(row.invoice_extended_price),
    defaultVisible: false,
  },
  {
    key: "delta_invoice_contract",
    label: "Delta (Invoice-Contract)",
    render: (row) => money(row.delta_invoice_contract),
    defaultVisible: false,
  },
  {
    key: "qty_invoiced_to_date",
    label: "Qty Invoiced to Date",
    render: (row) => text(row.qty_invoiced_to_date),
    defaultVisible: false,
  },
];

export function MechanicalLogListPage() {
  const { visibleColumns, visibleKeys, toggle, reset } = useTableColumns("mechanical-log", COLUMNS);
  const {
    rows,
    hasMore,
    isLoading,
    isFetchingNextPage,
    error,
    fetchNextPage,
    sort,
    order,
    setSort,
    q,
    setQ,
  } = useListQuery<MechanicalLogItemWithFulfillment, MechanicalLogSortField>({
    queryKeyBase: "mechanical-log",
    fetchPage: listMechanicalLogItems,
    defaultSort: "tag_number",
  });

  // Only loaded rows are known client-side under infinite-scroll pagination
  // (the table may hold hundreds of entries) - these tiles describe what's
  // currently loaded, not the full table, so they're labeled accordingly.
  const loadedCount = rows.length;
  const stillNeededLoaded = rows.filter((r) => r.need_qty !== null && Number(r.need_qty) > 0).length;

  return (
    <div>
      <div className="page-header">
        <h1>Mechanical Log</h1>
        <Link to="/mechanical-log/new">
          <button type="button">Add entry</button>
        </Link>
      </div>

      {error && (
        <p className="error">{error instanceof ApiError ? error.message : "Failed to load mechanical log"}</p>
      )}
      {isLoading ? (
        <p>Loading…</p>
      ) : (
        <>
          <div className="stat-tiles">
            <div className="stat-tile">
              <span className="stat-value">{loadedCount}</span>
              <span className="stat-label">Loaded entries</span>
            </div>
            <div className="stat-tile alert">
              <span className="stat-value">{stillNeededLoaded}</span>
              <span className="stat-label">Still needed (loaded)</span>
            </div>
          </div>

          <div className="table-toolbar">
            <div className="table-toolbar-filters">
              <SearchBox value={q} onChange={setQ} placeholder="Search tag, description, supplier…" />
            </div>
            <ColumnPicker columns={COLUMNS} visibleKeys={visibleKeys} onToggle={toggle} onReset={reset} />
          </div>
          <DataTable
            visibleColumns={visibleColumns}
            rows={rows}
            rowKey={(row) => row.id}
            sort={sort}
            order={order}
            onSortChange={(field) => setSort(field as MechanicalLogSortField)}
            hasMore={hasMore}
            isFetchingNextPage={isFetchingNextPage}
            onLoadMore={() => fetchNextPage()}
            emptyMessage={q ? "No entries match your search." : "No mechanical log entries yet."}
          />
        </>
      )}
    </div>
  );
}
