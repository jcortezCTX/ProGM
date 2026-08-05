import { z } from "zod";
import { buildListQuerySchema } from "./listQuery.js";

export const poursListQuerySchema = buildListQuerySchema(["pour_date", "created_at"] as const, {
  month: z
    .string()
    .regex(/^\d{4}-\d{2}$/)
    .optional(),
  structure_id: z.string().uuid().optional(),
  is_subcontractor: z.coerce.boolean().optional(),
  poured_by: z.string().min(1).optional(),
  pending_results: z.coerce.boolean().optional(),
});

const decimal = z.union([z.number(), z.string()]).nullable().optional();
const text = z.string().min(1).nullable().optional();
const date = z.string().min(1).nullable().optional();

export const createPourSchema = z.object({
  pour_date: z.string().min(1),
  location: z.string().min(1),
  structure_id: z.string().uuid().nullable().optional(),
  mix_design_id: z.string().uuid().nullable().optional(),
  design_strength_psi: z.coerce.number().int(),
  yds_required: decimal,
  yds_delivered: decimal,
  yds_installed: decimal,
  is_subcontractor: z.boolean().optional(),
  poured_by: text,
  invoice_number: text,
  invoice_total: decimal,
  notes: text,
  created_by: z.string().uuid().optional(),
});

// PATCH semantics: every field optional/nullable, matching the rest of this API.
export const updatePourSchema = z.object({
  pour_date: z.string().min(1).optional(),
  location: z.string().min(1).optional(),
  structure_id: z.string().uuid().nullable().optional(),
  mix_design_id: z.string().uuid().nullable().optional(),
  design_strength_psi: z.coerce.number().int().optional(),
  yds_required: decimal,
  yds_delivered: decimal,
  yds_installed: decimal,
  is_subcontractor: z.boolean().optional(),
  poured_by: text,
  invoice_number: text,
  invoice_total: decimal,
  notes: text,
});

export const sampleSchema = z.object({
  report_number: text,
  seven_day_psi: decimal,
  seven_day_entered_on: date,
  twenty_eight_day_psi: decimal,
  twenty_eight_day_entered_on: date,
  notes: text,
});

export const weeklyReportQuerySchema = z.object({
  weekEnding: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});

export const idParamSchema = z.object({
  id: z.string().uuid(),
});
