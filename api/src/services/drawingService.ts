import { prisma } from "../lib/prisma.js";

export class NotFoundError extends Error {}
export class ConflictError extends Error {}

export type DrawingStatus = "draft" | "in_review" | "approved" | "superseded";

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

export async function listDrawings() {
  const drawings = await prisma.drawings.findMany({
    orderBy: { drawing_number: "asc" },
    include: {
      drawing_revisions_drawings_current_revision_idTodrawing_revisions: true,
      _count: { select: { drawing_revisions_drawing_revisions_drawing_idTodrawings: true } },
    },
  });
  return drawings.map(({ drawing_revisions_drawings_current_revision_idTodrawing_revisions, _count, ...rest }) => ({
    ...rest,
    current_revision_code: drawing_revisions_drawings_current_revision_idTodrawing_revisions?.revision_code ?? null,
    revision_count: _count.drawing_revisions_drawing_revisions_drawing_idTodrawings,
  }));
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
