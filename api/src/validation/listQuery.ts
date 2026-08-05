import { z } from "zod";

// Shared query-string contract for every paginated list endpoint. Each
// route supplies its own sortable-field tuple and (optional) extra filter
// shape; the cursor/limit/sort/order/q envelope is identical everywhere.
// eslint-disable-next-line @typescript-eslint/ban-types -- `{}` here means
// "no extra filter properties", not "any non-nullish value".
export function buildListQuerySchema<Sort extends readonly [string, ...string[]], Filter extends z.ZodRawShape = {}>(
  sortableFields: Sort,
  filterShape: Filter = {} as Filter,
) {
  return z.object({
    cursor: z.string().min(1).optional(),
    // Capped well above the ~50-row table page size so unbounded-picker
    // callers (e.g. a requisition/inventory-item <select>, per the
    // table-enhancements plan) can request a large single page via this
    // same endpoint instead of needing a separate unbounded route.
    limit: z.coerce.number().int().min(1).max(1000).default(50),
    sort: z.enum(sortableFields).optional(),
    order: z.enum(["asc", "desc"]).default("asc"),
    // An empty ?q= (e.g. a cleared search box) means "no search", not a
    // validation error - treat it the same as the param being absent.
    q: z.preprocess(
      (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
      z.string().min(1).optional(),
    ),
    ...filterShape,
  });
}
