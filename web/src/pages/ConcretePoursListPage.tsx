import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ApiError } from "../api/client";
import { listPours, listStructures, type PourSortField } from "../api/concrete";
import type { ConcretePour, ConcreteStructure } from "../api/types";
import { ColumnPicker } from "../components/ColumnPicker";
import { ConcreteNav } from "../components/ConcreteNav";
import { DataTable } from "../components/DataTable";
import { SearchBox } from "../components/SearchBox";
import { useListQuery } from "../hooks/useListQuery";
import { useTableColumns, type ColumnDef } from "../hooks/useTableColumns";

function num(value: string | number | null): string {
  return value === null ? "—" : typeof value === "number" ? value.toLocaleString() : value;
}

function date(value: string): string {
  return new Date(value).toLocaleDateString();
}

function overdueBadges(pour: ConcretePour) {
  if (!pour.seven_day_overdue && !pour.twenty_eight_day_overdue) return null;
  return (
    <>
      {pour.seven_day_overdue && <span className="badge badge-overdue">7-day overdue</span>}
      {pour.twenty_eight_day_overdue && <span className="badge badge-overdue">28-day overdue</span>}
    </>
  );
}

const COLUMNS: ColumnDef<ConcretePour>[] = [
  {
    key: "pour_date",
    label: "Pour Date",
    sortField: "pour_date",
    render: (row) => <Link to={`/concrete/pours/${row.id}`}>{date(row.pour_date)}</Link>,
  },
  { key: "location", label: "Location", render: (row) => row.location },
  { key: "poured_by", label: "Poured By", render: (row) => row.poured_by ?? "—" },
  { key: "design_strength_psi", label: "Design PSI", render: (row) => row.design_strength_psi },
  { key: "yds_installed", label: "Yds Installed", render: (row) => num(row.yds_installed) },
  { key: "over_under_required", label: "Over/Under", render: (row) => num(row.over_under_required) },
  { key: "waste", label: "Waste", render: (row) => num(row.waste) },
  { key: "sample_count", label: "Samples", render: (row) => row.sample_count },
  { key: "seven_day_avg", label: "7-Day Avg", render: (row) => num(row.seven_day_avg) },
  { key: "twenty_eight_day_avg", label: "28-Day Avg", render: (row) => num(row.twenty_eight_day_avg) },
  { key: "overdue", label: "Overdue", render: overdueBadges },
  {
    key: "is_subcontractor",
    label: "Type",
    render: (row) => (row.is_subcontractor ? "Sub" : "Self-perform"),
    defaultVisible: false,
  },
  { key: "invoice_number", label: "Invoice #", render: (row) => row.invoice_number ?? "—", defaultVisible: false },
  { key: "notes", label: "Notes", render: (row) => row.notes ?? "—", defaultVisible: false },
];

export function ConcretePoursListPage() {
  const [structures, setStructures] = useState<ConcreteStructure[]>([]);

  useEffect(() => {
    listStructures({ limit: 500 })
      .then((res) => setStructures(res.data))
      .catch(() => {});
  }, []);

  const { visibleColumns, visibleKeys, toggle, reset } = useTableColumns("concrete-pours", COLUMNS);
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
    filters,
    setFilter,
  } = useListQuery<
    ConcretePour,
    PourSortField,
    { structure_id: string; is_subcontractor: string; pending_results: string }
  >({
    queryKeyBase: "concrete-pours",
    fetchPage: listPours,
    defaultSort: "pour_date",
    defaultOrder: "desc",
    filterKeys: ["structure_id", "is_subcontractor", "pending_results"],
  });

  const overdueCount = rows.filter((r) => r.seven_day_overdue || r.twenty_eight_day_overdue).length;

  return (
    <div>
      <div className="page-header">
        <h1>Concrete Log</h1>
        <Link to="/concrete/pours/new">
          <button type="button">Add pour</button>
        </Link>
      </div>
      <ConcreteNav />

      {error && <p className="error">{error instanceof ApiError ? error.message : "Failed to load pours"}</p>}
      {isLoading ? (
        <p>Loading…</p>
      ) : (
        <>
          <div className="stat-tiles">
            <div className="stat-tile">
              <span className="stat-value">{rows.length}</span>
              <span className="stat-label">Loaded pours</span>
            </div>
            <div className="stat-tile alert">
              <span className="stat-value">{overdueCount}</span>
              <span className="stat-label">Overdue (loaded)</span>
            </div>
          </div>

          <div className="table-toolbar">
            <div className="table-toolbar-filters">
              <SearchBox value={q} onChange={setQ} placeholder="Search location, poured by, invoice, notes…" />
              <select
                value={filters.structure_id ?? ""}
                onChange={(e) => setFilter("structure_id", e.target.value || undefined)}
              >
                <option value="">All structures</option>
                {structures.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
              <select
                value={filters.is_subcontractor ?? ""}
                onChange={(e) => setFilter("is_subcontractor", e.target.value || undefined)}
              >
                <option value="">Self-perform + Sub</option>
                <option value="false">Self-perform only</option>
                <option value="true">Sub only</option>
              </select>
              <label className="checkbox-filter">
                <input
                  type="checkbox"
                  checked={filters.pending_results === "true"}
                  onChange={(e) => setFilter("pending_results", e.target.checked ? "true" : undefined)}
                />
                Pending results only
              </label>
            </div>
            <ColumnPicker columns={COLUMNS} visibleKeys={visibleKeys} onToggle={toggle} onReset={reset} />
          </div>
          <DataTable
            visibleColumns={visibleColumns}
            rows={rows}
            rowKey={(row) => row.id}
            sort={sort}
            order={order}
            onSortChange={(field) => setSort(field as PourSortField)}
            hasMore={hasMore}
            isFetchingNextPage={isFetchingNextPage}
            onLoadMore={() => fetchNextPage()}
            emptyMessage={q ? "No pours match your search." : "No pours recorded yet."}
            rowClassName={(row) => (row.seven_day_overdue || row.twenty_eight_day_overdue ? "overdue" : undefined)}
          />
        </>
      )}
    </div>
  );
}
