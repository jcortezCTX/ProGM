import { z } from "zod";

const decimal = z.union([z.number(), z.string()]).nullable().optional();
const text = z.string().min(1).nullable().optional();
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "must be an ISO date (YYYY-MM-DD)");

export const createActivitySchema = z.object({
  section_id: z.string().uuid(),
  code: text,
  description: z.string().min(1),
  crew: text,
  responsibility: text,
  notes: text,
  budget_mh: decimal,
  burned_mh: decimal,
  entry_mode: z.enum(["start_end", "start_duration"]),
  start_date: isoDate.nullable().optional(),
  end_date: isoDate.nullable().optional(),
  duration_days: z.coerce.number().int().positive().nullable().optional(),
  night_work: z.boolean().optional(),
  critical_path: z.boolean().optional(),
  shutdown: z.boolean().optional(),
  sort_order: z.coerce.number().int().optional(),
});

// PATCH semantics: every field optional, matching the rest of this API.
// Cross-field consistency between entry_mode/start_date/end_date/duration_days
// is a business rule enforced in the service layer (it needs the existing row
// to validate a partial update), not here - see scheduleActivityService.ts.
export const updateActivitySchema = createActivitySchema.partial();

export const activitiesListQuerySchema = z.object({
  section_id: z.string().uuid().optional(),
  responsibility: z.string().min(1).optional(),
  crew: z.string().min(1).optional(),
  night_work: z.coerce.boolean().optional(),
  critical_path: z.coerce.boolean().optional(),
  shutdown: z.coerce.boolean().optional(),
  scheduled_between: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2},\d{4}-\d{2}-\d{2}$/, "must be <from>,<to> as ISO dates")
    .optional(),
});

const dayOverrideOp = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("upsert"),
    day: isoDate,
    kind: z.enum(["add", "exclude"]),
    crew_count: z.coerce.number().int().min(0).nullable().optional(),
    marker: z.string().max(2).nullable().optional(),
  }),
  z.object({
    action: z.literal("remove"),
    day: isoDate,
  }),
]);

export const dayOverridesSchema = z.array(dayOverrideOp).min(1);

export const idParamSchema = z.object({
  id: z.string().uuid(),
});
