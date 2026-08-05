import { useMemo } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import type { ListParams, ListResponse } from "../api/types";

type SortOrder = "asc" | "desc";

interface UseListQueryOptions<T, Sort extends string, F extends Record<string, string>> {
  // Cache-key namespace and URL-independent identity for this table.
  queryKeyBase: string;
  fetchPage: (params: ListParams<Sort> & Partial<F>) => Promise<ListResponse<T>>;
  defaultSort: Sort;
  defaultOrder?: SortOrder;
  // Query-string keys this table exposes as filters, e.g. ["status"].
  filterKeys?: (keyof F & string)[];
  limit?: number;
}

// Wraps useInfiniteQuery (cursor pagination) with useSearchParams (sort,
// order, q, and filters synced to the URL - shareable/bookmarkable/refresh
// -safe). Pagination itself is intentionally NOT URL-synced: a fresh load
// always starts at page 1, and the query key excludes the cursor, so any
// sort/filter/search change starts a brand-new infinite query rather than
// trying to resume mid cursor-chain.
export function useListQuery<T, Sort extends string, F extends Record<string, string> = Record<string, string>>(
  options: UseListQueryOptions<T, Sort, F>,
) {
  const { queryKeyBase, fetchPage, defaultSort, defaultOrder = "asc", filterKeys = [], limit = 50 } = options;
  const [searchParams, setSearchParams] = useSearchParams();

  const sort = (searchParams.get("sort") as Sort | null) ?? defaultSort;
  const order = (searchParams.get("order") as SortOrder | null) ?? defaultOrder;
  const q = searchParams.get("q") ?? "";

  const filters = useMemo(() => {
    const result = {} as Partial<F>;
    for (const key of filterKeys) {
      const value = searchParams.get(key);
      if (value) (result as Record<string, string>)[key] = value;
    }
    return result;
    // filterKeys is expected to be a stable array literal per page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, filterKeys.join(",")]);

  function updateParams(updates: Record<string, string | undefined>) {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        for (const [key, value] of Object.entries(updates)) {
          if (!value) next.delete(key);
          else next.set(key, value);
        }
        return next;
      },
      { replace: true },
    );
  }

  function setSort(field: Sort) {
    if (field === sort) {
      updateParams({ order: order === "asc" ? "desc" : "asc" });
    } else {
      updateParams({ sort: field, order: "asc" });
    }
  }

  function setQ(value: string) {
    updateParams({ q: value || undefined });
  }

  function setFilter(key: keyof F & string, value: string | undefined) {
    updateParams({ [key]: value });
  }

  const queryKey = [queryKeyBase, sort, order, q, filterKeys.map((k) => filters[k] ?? "").join("|")];

  const query = useInfiniteQuery({
    queryKey,
    queryFn: ({ pageParam }) =>
      fetchPage({
        cursor: pageParam,
        limit,
        sort,
        order,
        q: q || undefined,
        ...filters,
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => (lastPage.hasMore ? (lastPage.nextCursor ?? undefined) : undefined),
  });

  const rows = useMemo(() => query.data?.pages.flatMap((page) => page.data) ?? [], [query.data]);
  const hasMore = query.data?.pages.at(-1)?.hasMore ?? false;

  return {
    rows,
    hasMore,
    isLoading: query.isLoading,
    isFetchingNextPage: query.isFetchingNextPage,
    error: query.error,
    fetchNextPage: query.fetchNextPage,
    sort,
    order,
    setSort,
    q,
    setQ,
    filters,
    setFilter,
  };
}
