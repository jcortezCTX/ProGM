import type { ColumnDef } from "../hooks/useTableColumns";

interface DataTableProps<T> {
  visibleColumns: ColumnDef<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  sort: string;
  order: "asc" | "desc";
  onSortChange: (field: string) => void;
  hasMore: boolean;
  isFetchingNextPage: boolean;
  onLoadMore: () => void;
  emptyMessage: string;
  rowClassName?: (row: T) => string | undefined;
}

// Generic sortable-header table shell shared by every list page. Column
// *visibility* stays owned by useTableColumns/ColumnPicker (passed in as
// visibleColumns) - this component only adds sort headers and pagination.
export function DataTable<T>({
  visibleColumns,
  rows,
  rowKey,
  sort,
  order,
  onSortChange,
  hasMore,
  isFetchingNextPage,
  onLoadMore,
  emptyMessage,
  rowClassName,
}: DataTableProps<T>) {
  return (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            {visibleColumns.map((col) => {
              if (!col.sortField) {
                return <th key={col.key}>{col.label}</th>;
              }
              const active = col.sortField === sort;
              return (
                <th key={col.key}>
                  <button
                    type="button"
                    className="sortable-header"
                    onClick={() => onSortChange(col.sortField!)}
                    aria-sort={active ? (order === "asc" ? "ascending" : "descending") : "none"}
                  >
                    {col.label}
                    {active && <span className="sort-indicator">{order === "asc" ? " ▲" : " ▼"}</span>}
                  </button>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={rowKey(row)} className={rowClassName?.(row)}>
              {visibleColumns.map((col) => (
                <td key={col.key}>{col.render(row)}</td>
              ))}
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={visibleColumns.length}>{emptyMessage}</td>
            </tr>
          )}
        </tbody>
      </table>
      {hasMore && (
        <div className="load-more-row">
          <button
            type="button"
            className="button-secondary load-more-button"
            onClick={onLoadMore}
            disabled={isFetchingNextPage}
          >
            {isFetchingNextPage ? "Loading…" : "Load more"}
          </button>
        </div>
      )}
    </div>
  );
}
