import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { createDelivery, listDeliveries, type DeliverySortField } from "../api/deliveries";
import { listRequisitions } from "../api/requisitions";
import { ApiError } from "../api/client";
import { ColumnPicker } from "../components/ColumnPicker";
import { DataTable } from "../components/DataTable";
import { SearchBox } from "../components/SearchBox";
import { useListQuery } from "../hooks/useListQuery";
import { useTableColumns, type ColumnDef } from "../hooks/useTableColumns";
import type { CreateDeliveryInput, Delivery, DeliveryStatus, Requisition } from "../api/types";

const COLUMNS: ColumnDef<Delivery>[] = [
  {
    key: "report_number",
    label: "Report #",
    sortField: "report_number",
    render: (d) => <Link to={`/deliveries/${d.id}`}>#{d.report_number}</Link>,
  },
  {
    key: "received_date",
    label: "Date",
    sortField: "received_date",
    render: (d) => new Date(d.received_date).toLocaleDateString(),
  },
  { key: "supplier", label: "Supplier", render: (d) => d.supplier ?? "—" },
  {
    key: "requisition",
    label: "Requisition",
    sortField: "requisition_number",
    render: (d) =>
      d.requisition_id ? <Link to={`/requisitions/${d.requisition_id}`}>{d.requisition_number}</Link> : "—",
  },
  {
    key: "status",
    label: "Status",
    sortField: "status",
    render: (d) => <span className={`badge-neutral badge-status-${d.status}`}>{d.status}</span>,
  },
  // Not sortable: line_item_count is a _count aggregate, not a plain column.
  { key: "line_item_count", label: "Line items", render: (d) => d.line_item_count },
  { key: "bill_of_lading_no", label: "Bill of lading #", render: (d) => d.bill_of_lading_no ?? "—", defaultVisible: false },
  { key: "truck_number", label: "Truck #", render: (d) => d.truck_number ?? "—", defaultVisible: false },
  { key: "accepted_by", label: "Accepted by", render: (d) => d.accepted_by ?? "—", defaultVisible: false },
];

export function DeliveriesListPage() {
  const [requisitions, setRequisitions] = useState<Requisition[]>([]);
  const [showForm, setShowForm] = useState(false);
  const { visibleColumns, visibleKeys, toggle, reset } = useTableColumns("deliveries", COLUMNS);
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
  } = useListQuery<Delivery, DeliverySortField, { status: DeliveryStatus }>({
    queryKeyBase: "deliveries",
    fetchPage: listDeliveries,
    defaultSort: "report_number",
    defaultOrder: "desc",
    filterKeys: ["status"],
  });

  useEffect(() => {
    // Picker, not a paginated table - a large fixed limit stands in for a
    // dedicated unbounded endpoint (see the table-enhancements plan).
    listRequisitions({ limit: 500 })
      .then((res) => setRequisitions(res.data))
      .catch(() => setRequisitions([]));
  }, []);

  async function handleCreate(input: CreateDeliveryInput) {
    const created = await createDelivery(input);
    setShowForm(false);
    await refetch();
    return created;
  }

  return (
    <div>
      <div className="page-header">
        <h1>Deliveries</h1>
        <div className="page-header-actions">
          <Link to="/requisitions" className="link-button">
            View requisitions
          </Link>
          <button type="button" onClick={() => setShowForm((v) => !v)}>
            {showForm ? "Cancel" : "New delivery"}
          </button>
        </div>
      </div>

      {showForm && <AddDeliveryForm requisitions={requisitions} onSubmit={handleCreate} />}

      {error && (
        <p className="error">{error instanceof ApiError ? error.message : "Failed to load deliveries"}</p>
      )}
      {isLoading ? (
        <p>Loading…</p>
      ) : (
        <>
          <div className="table-toolbar">
            <div className="table-toolbar-filters">
              <SearchBox value={q} onChange={setQ} placeholder="Search supplier, bill of lading, truck #…" />
              <div className="filter-bar">
                <select
                  value={filters.status ?? ""}
                  onChange={(e) => setFilter("status", (e.target.value as DeliveryStatus) || undefined)}
                >
                  <option value="">All statuses</option>
                  <option value="open">Open</option>
                  <option value="closed">Closed</option>
                </select>
              </div>
            </div>
            <ColumnPicker columns={COLUMNS} visibleKeys={visibleKeys} onToggle={toggle} onReset={reset} />
          </div>
          <DataTable
            visibleColumns={visibleColumns}
            rows={rows}
            rowKey={(d) => d.id}
            sort={sort}
            order={order}
            onSortChange={(field) => setSort(field as DeliverySortField)}
            hasMore={hasMore}
            isFetchingNextPage={isFetchingNextPage}
            onLoadMore={() => fetchNextPage()}
            emptyMessage={q || filters.status ? "No deliveries match your filters." : "No deliveries yet."}
          />
        </>
      )}
    </div>
  );
}

function AddDeliveryForm({
  requisitions,
  onSubmit,
}: {
  requisitions: Requisition[];
  onSubmit: (input: CreateDeliveryInput) => Promise<Delivery>;
}) {
  const [requisitionId, setRequisitionId] = useState("");
  const [supplier, setSupplier] = useState("");
  const [billOfLadingNo, setBillOfLadingNo] = useState("");
  const [truckNumber, setTruckNumber] = useState("");
  const [receivedDate, setReceivedDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit({
        requisition_id: requisitionId || undefined,
        supplier: supplier || undefined,
        bill_of_lading_no: billOfLadingNo || undefined,
        truck_number: truckNumber || undefined,
        received_date: receivedDate || undefined,
      });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to create delivery");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="card" onSubmit={handleSubmit}>
      <label>
        Requisition (optional)
        <select value={requisitionId} onChange={(e) => setRequisitionId(e.target.value)}>
          <option value="">No requisition</option>
          {requisitions.map((req) => (
            <option key={req.id} value={req.id}>
              {req.requisition_number} {req.supplier ? `— ${req.supplier}` : ""}
            </option>
          ))}
        </select>
      </label>
      <label>
        Supplier
        <input value={supplier} onChange={(e) => setSupplier(e.target.value)} />
      </label>
      <label>
        Bill of lading #
        <input value={billOfLadingNo} onChange={(e) => setBillOfLadingNo(e.target.value)} />
      </label>
      <label>
        Truck #
        <input value={truckNumber} onChange={(e) => setTruckNumber(e.target.value)} />
      </label>
      <label>
        Received date
        <input type="date" value={receivedDate} onChange={(e) => setReceivedDate(e.target.value)} />
      </label>
      {error && <p className="error">{error}</p>}
      <button type="submit" disabled={submitting}>
        {submitting ? "Saving…" : "Create delivery"}
      </button>
    </form>
  );
}
