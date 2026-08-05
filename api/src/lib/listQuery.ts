export type SortOrder = "asc" | "desc";

export interface CursorPayload {
  v: string | number | null;
  id: string;
}

export function encodeCursor(payload: CursorPayload): string {
  return Buffer.from(JSON.stringify(payload)).toString("base64url");
}

// Never throws - a malformed/tampered cursor is treated as "start from the
// beginning" (returns null) rather than surfacing as a 500 to the client.
export function decodeCursor(raw: string | undefined): CursorPayload | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as unknown;
    if (typeof parsed !== "object" || parsed === null) return null;
    const { v, id } = parsed as Record<string, unknown>;
    if (typeof id !== "string") return null;
    if (v === null || typeof v === "string" || typeof v === "number") return { v, id };
    return null;
  } catch {
    return null;
  }
}

// Builds a Prisma `where` fragment implementing keyset ("seek") pagination:
// rows strictly after the cursor in (sortField, id) order, where id is the
// tie-breaker for non-unique sort values. Every caller must also order by
// [{ [sortField]: order }, { id: order }] for this to page correctly, and
// must not pass an explicit Prisma `nulls` sort option - the null-handling
// below assumes Postgres's default (ASC sorts nulls last, DESC sorts nulls
// first), matching what a plain `ORDER BY field ASC/DESC` produces.
//
// Returned as `Record<string, unknown>` (not `any`, per project convention)
// because this is spread into each model's Prisma `where` input, whose
// exact shape differs per model - Prisma still validates the final object
// at the call site.
export function keysetWhere(
  sortField: string,
  order: SortOrder,
  cursor: CursorPayload | null,
): Record<string, unknown> {
  if (!cursor) return {};
  const cmp = order === "asc" ? "gt" : "lt";

  if (cursor.v === null) {
    return order === "asc"
      ? { [sortField]: null, id: { gt: cursor.id } }
      : { OR: [{ [sortField]: { not: null } }, { [sortField]: null, id: { lt: cursor.id } }] };
  }

  return {
    OR: [
      { [sortField]: { [cmp]: cursor.v } },
      { [sortField]: cursor.v, id: { [cmp]: cursor.id } },
      // Nulls sort after every non-null value under ASC (Postgres default),
      // so once we're past a non-null cursor, remaining null rows are next.
      ...(order === "asc" ? [{ [sortField]: null }] : []),
    ],
  };
}

// Combines independent `where` fragments (keyset predicate, search, filters)
// with implicit AND, skipping empty ones rather than emitting `AND: [{}]`
// noise. Each service builds its `where` from this instead of hand-nesting
// OR/AND, which gets error-prone once a keyset OR-fragment and a search
// OR-fragment need to coexist.
export function combineWhere(...conditions: Record<string, unknown>[]): Record<string, unknown> {
  const nonEmpty = conditions.filter((c) => Object.keys(c).length > 0);
  if (nonEmpty.length === 0) return {};
  if (nonEmpty.length === 1) return nonEmpty[0];
  return { AND: nonEmpty };
}

export interface PaginatedResult<T> {
  page: T[];
  hasMore: boolean;
  nextCursor: string | null;
}

// Given rows fetched with `take: limit + 1`, slices off the lookahead row
// and uses it to compute hasMore/nextCursor.
export function paginate<T>(
  rows: T[],
  limit: number,
  cursorOf: (row: T) => CursorPayload,
): PaginatedResult<T> {
  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore ? encodeCursor(cursorOf(page[page.length - 1])) : null;
  return { page, hasMore, nextCursor };
}
