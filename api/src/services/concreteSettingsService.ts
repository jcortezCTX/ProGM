import { prisma } from "../lib/prisma.js";

export interface ConcreteSettingsInput {
  job_number?: string;
  job_name?: string;
  start_date?: string;
  total_est_cy?: string | number | null;
}

// Single-row settings: reads the first (only) row, or null if the import
// script / UI hasn't created it yet.
export async function getConcreteSettings() {
  return prisma.concrete_settings.findFirst({ orderBy: { created_at: "asc" } });
}

// Upserts the singleton row - creates it on first save, updates in place
// afterward. There is deliberately no separate create/update pair in the
// route layer since the UI only ever edits "the" settings row.
export async function saveConcreteSettings(input: ConcreteSettingsInput) {
  const existing = await getConcreteSettings();
  const data: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (value === undefined) continue;
    data[key] = key === "start_date" && value !== null ? new Date(value as string) : value;
  }

  if (!existing) {
    if (!input.job_number || !input.job_name || !input.start_date) {
      throw new Error("job_number, job_name, and start_date are required to create settings");
    }
    return prisma.concrete_settings.create({
      data: {
        job_number: input.job_number,
        job_name: input.job_name,
        start_date: new Date(input.start_date),
        total_est_cy: input.total_est_cy ?? null,
      },
    });
  }

  return prisma.concrete_settings.update({ where: { id: existing.id }, data });
}
