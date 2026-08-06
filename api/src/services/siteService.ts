import { prisma } from "../lib/prisma.js";
import { combineWhere, decodeCursor, keysetWhere, paginate } from "../lib/listQuery.js";

export class NotFoundError extends Error {}
export class ConflictError extends Error {}

type SiteSortField = "name" | "code" | "created_at";

export interface ListSitesParams {
  cursor?: string;
  limit: number;
  sort?: SiteSortField;
  order: "asc" | "desc";
  q?: string;
}

// Boundary/default_center (map-opening geometry) aren't wired up yet - this
// is deliberately the minimum needed for a site to exist so assets have
// somewhere to attach to; site_layouts and site geometry come with the map
// UI stage.
const SEARCH_FIELDS = ["name", "code", "description"] as const;

function cursorValue(row: { name: string; code: string | null; created_at: Date }, sortField: SiteSortField) {
  if (sortField === "created_at") return row.created_at.toISOString();
  return row[sortField];
}

export async function listSites(params: ListSitesParams) {
  const sortField = params.sort ?? "name";
  const cursor = decodeCursor(params.cursor);

  const where = combineWhere(
    keysetWhere(sortField, params.order, cursor, { nullable: sortField === "code" }),
    params.q
      ? { OR: SEARCH_FIELDS.map((field) => ({ [field]: { contains: params.q, mode: "insensitive" as const } })) }
      : {},
  );

  const rows = await prisma.sites.findMany({
    where,
    orderBy: [{ [sortField]: params.order }, { id: params.order }],
    take: params.limit + 1,
  });

  const { page, hasMore, nextCursor } = paginate(rows, params.limit, (row) => ({
    v: cursorValue(row, sortField),
    id: row.id,
  }));
  return { data: page, hasMore, nextCursor };
}

export interface CreateSiteInput {
  name: string;
  code?: string;
  description?: string;
  timezone?: string;
  default_zoom?: number;
  created_by?: string | null;
}

export async function createSite(input: CreateSiteInput) {
  if (input.code) {
    const existing = await prisma.sites.findUnique({ where: { code: input.code } });
    if (existing) throw new ConflictError(`Site code ${input.code} already exists`);
  }

  return prisma.sites.create({
    data: {
      name: input.name,
      code: input.code ?? null,
      description: input.description ?? null,
      timezone: input.timezone ?? null,
      default_zoom: input.default_zoom ?? null,
      created_by: input.created_by ?? null,
    },
  });
}

export async function getSite(id: string) {
  const site = await prisma.sites.findUnique({ where: { id } });
  if (!site) throw new NotFoundError(`Site ${id} not found`);
  return site;
}
