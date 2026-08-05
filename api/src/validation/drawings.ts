import { z } from "zod";
import { buildListQuerySchema } from "./listQuery.js";

const nullableText = z.string().min(1).nullable().optional();
const statusEnum = z.enum(["draft", "in_review", "approved", "superseded"]);

export const drawingsListQuerySchema = buildListQuerySchema([
  "drawing_number",
  "title",
  "status",
  "current_revision_code",
] as const);

export const createDrawingSchema = z.object({
  drawing_number: z.string().min(1),
  title: z.string().min(1),
  discipline: z.string().min(1).optional(),
  drawing_type: z.string().min(1).optional(),
  area: z.string().min(1).optional(),
  status: statusEnum.optional(),
});

export const updateDrawingSchema = z.object({
  title: z.string().min(1).optional(),
  discipline: nullableText,
  drawing_type: nullableText,
  area: nullableText,
  status: statusEnum.optional(),
});

export const addRevisionSchema = z.object({
  revision_code: z.string().min(1),
  notes: z.string().min(1).optional(),
  external_link: z.string().min(1).optional(),
});

export const idParamSchema = z.object({
  id: z.string().uuid(),
});
