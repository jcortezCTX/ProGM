import { prisma } from "../lib/prisma.js";
import { combineWhere, decodeCursor, keysetWhere, paginate, type CursorPayload } from "../lib/listQuery.js";

export class NotFoundError extends Error {}
export class ConflictError extends Error {}

export type DrawingStatus = "draft" | "in_review" | "approved" | "superseded";

type DrawingSortField = "drawing_number" | "title" | "status" | "current_revision_code";

export interface ListDrawingsParams {
  cursor?: string;
  limit: number;
  sort?: DrawingSortField;
  order: "asc" | "desc";
  q?: string;
}

// Free-text search spans the fields someone would type a fragment of when
// looking for a drawing, not every column.
const SEARCH_FIELDS = ["drawing_number", "title", "discipline", "drawing_type", "area"] as const;

const CURRENT_REVISION_RELATION = "drawing_revisions_drawings_current_revision_idTodrawing_revisions";

// current_revision_code isn't a column on `drawings` - it's revision_code on
// the related drawing_revisions row - so it needs its own keyset shape
// rather than the flat-column keysetWhere helper. A drawing with no
// revisions yet (current_revision_id null) sorts as a null value, using the
// same nulls-last(asc)/nulls-first(desc) convention as every other nullable
// sort field (see lib/listQuery.ts).
function currentRevisionCodeWhere(order: "asc" | "desc", cursor: CursorPayload | null): Record<string, unknown> {
  if (!cursor) return {};
  const cmp = order === "asc" ? "gt" : "lt";

  if (cursor.v === null) {
    return order === "asc"
      ? { current_revision_id: null, id: { gt: cursor.id } }
      : {
          OR: [
            { drawing_revisions_drawings_current_revision_idTodrawing_revisions: { isNot: null } },
            { current_revision_id: null, id: { lt: cursor.id } },
          ],
        };
  }

  return {
    OR: [
      { drawing_revisions_drawings_current_revision_idTodrawing_revisions: { revision_code: { [cmp]: cursor.v } } },
      {
        drawing_revisions_drawings_current_revision_idTodrawing_revisions: { revision_code: cursor.v },
        id: { [cmp]: cursor.id },
      },
      ...(order === "asc" ? [{ current_revision_id: null }] : []),
    ],
  };
}

function cursorValue(row: Record<string, unknown>, sortField: DrawingSortField): string | number | null {
  if (sortField === "current_revision_code") {
    const relation = row[CURRENT_REVISION_RELATION] as { revision_code: string } | null;
    return relation?.revision_code ?? null;
  }
  const raw = row[sortField];
  if (raw instanceof Date) return raw.toISOString();
  if (typeof raw === "string" || typeof raw === "number") return raw;
  return null;
}

export interface CreateDrawingInput {
  drawing_number: string;
  title: string;
  discipline?: string | null;
  drawing_type?: string | null;
  area?: string | null;
  status?: DrawingStatus;
  created_by?: string | null;
}

export async function createDrawing(input: CreateDrawingInput) {
  const existing = await prisma.drawings.findUnique({ where: { drawing_number: input.drawing_number } });
  if (existing) throw new ConflictError(`Drawing number ${input.drawing_number} already exists`);

  return prisma.drawings.create({
    data: {
      drawing_number: input.drawing_number,
      title: input.title,
      discipline: input.discipline ?? null,
      drawing_type: input.drawing_type ?? null,
      area: input.area ?? null,
      status: input.status ?? "draft",
      created_by: input.created_by ?? null,
    },
  });
}

export async function listDrawings(params: ListDrawingsParams) {
  const sortField = params.sort ?? "drawing_number";
  const cursor = decodeCursor(params.cursor);
  const isRelationSort = sortField === "current_revision_code";

  const where = combineWhere(
    isRelationSort ? currentRevisionCodeWhere(params.order, cursor) : keysetWhere(sortField, params.order, cursor),
    params.q
      ? { OR: SEARCH_FIELDS.map((field) => ({ [field]: { contains: params.q, mode: "insensitive" } })) }
      : {},
  );

  const orderBy = isRelationSort
    ? [
        { drawing_revisions_drawings_current_revision_idTodrawing_revisions: { revision_code: params.order } },
        { id: params.order },
      ]
    : [{ [sortField]: params.order }, { id: params.order }];

  const rows = await prisma.drawings.findMany({
    where,
    orderBy,
    take: params.limit + 1,
    include: {
      drawing_revisions_drawings_current_revision_idTodrawing_revisions: true,
      _count: { select: { drawing_revisions_drawing_revisions_drawing_idTodrawings: true } },
    },
  });

  const { page, hasMore, nextCursor } = paginate(rows, params.limit, (row) => ({
    v: cursorValue(row, sortField),
    id: row.id,
  }));

  const data = page.map(({ drawing_revisions_drawings_current_revision_idTodrawing_revisions, _count, ...rest }) => ({
    ...rest,
    current_revision_code: drawing_revisions_drawings_current_revision_idTodrawing_revisions?.revision_code ?? null,
    revision_count: _count.drawing_revisions_drawing_revisions_drawing_idTodrawings,
  }));

  return { data, hasMore, nextCursor };
}

export async function getDrawing(id: string) {
  const drawing = await prisma.drawings.findUnique({
    where: { id },
    include: {
      drawing_revisions_drawing_revisions_drawing_idTodrawings: { orderBy: { created_at: "desc" } },
    },
  });
  if (!drawing) throw new NotFoundError(`Drawing ${id} not found`);

  const { drawing_revisions_drawing_revisions_drawing_idTodrawings, ...rest } = drawing;
  return {
    ...rest,
    revisions: drawing_revisions_drawing_revisions_drawing_idTodrawings,
  };
}

export interface UpdateDrawingInput {
  title?: string;
  discipline?: string | null;
  drawing_type?: string | null;
  area?: string | null;
  status?: DrawingStatus;
}

export async function updateDrawing(id: string, input: UpdateDrawingInput) {
  const existing = await prisma.drawings.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError(`Drawing ${id} not found`);

  return prisma.drawings.update({ where: { id }, data: input });
}

export interface AddRevisionInput {
  revision_code: string;
  notes?: string | null;
  external_link?: string | null;
  created_by?: string | null;
}

// Append-only (CLAUDE.md rule 2): the only way a drawing_revisions row gets
// created, and it's never edited or deleted afterward. current_revision_id
// is just a convenience pointer - updated in the same transaction as the
// insert so it never points at a revision that failed to write.
export async function addRevision(drawingId: string, input: AddRevisionInput) {
  const drawing = await prisma.drawings.findUnique({ where: { id: drawingId } });
  if (!drawing) throw new NotFoundError(`Drawing ${drawingId} not found`);

  const existingRevision = await prisma.drawing_revisions.findUnique({
    where: { drawing_id_revision_code: { drawing_id: drawingId, revision_code: input.revision_code } },
  });
  if (existingRevision) {
    throw new ConflictError(`Revision ${input.revision_code} already exists for this drawing`);
  }

  return prisma.$transaction(async (tx) => {
    const revision = await tx.drawing_revisions.create({
      data: {
        drawing_id: drawingId,
        revision_code: input.revision_code,
        notes: input.notes ?? null,
        external_link: input.external_link ?? null,
        created_by: input.created_by ?? null,
      },
    });
    await tx.drawings.update({ where: { id: drawingId }, data: { current_revision_id: revision.id } });
    return revision;
  });
}
