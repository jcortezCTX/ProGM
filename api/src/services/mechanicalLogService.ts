import { prisma } from "../lib/prisma.js";

export class NotFoundError extends Error {}

type DecimalInput = string | number;

// Mirrors every column in logs_samples/Mechanical Log.csv - see the model
// comment in schema.prisma for why this is a dedicated table rather than
// routed through inventory_items or the generic custom-log engine.
export interface MechanicalLogItemInput {
  release?: string | null;
  supplier?: string | null;
  review?: string | null;
  tag_number?: string | null;
  qty_released?: DecimalInput | null;
  unit?: string | null;
  size?: string | null;
  description?: string | null;
  material?: string | null;
  lining?: string | null;
  coating?: string | null;
  release_date?: string | null;
  due_date?: string | null;
  area?: string | null;
  system?: string | null;
  contract_dwg?: string | null;
  system2?: string | null;
  shop_dwg?: string | null;
  delivered_qty?: DecimalInput | null;
  need_qty?: DecimalInput | null;
  received_on?: string | null;
  received_by?: string | null;
  storage_location?: string | null;
  notes?: string | null;
  estimate_cost?: DecimalInput | null;
  contract_unit_price?: DecimalInput | null;
  contract_extended_price?: DecimalInput | null;
  above_below?: string | null;
  invoice_no?: string | null;
  invoice_unit_price?: DecimalInput | null;
  invoice_extended_price?: DecimalInput | null;
  delta_invoice_contract?: DecimalInput | null;
  qty_invoiced_to_date?: DecimalInput | null;
  created_by?: string | null;
}

const DATE_FIELDS = ["release_date", "due_date", "received_on"] as const;

// PATCH semantics: a field only ends up in the write payload if the caller
// included the key at all, so omitting a field leaves it untouched while
// explicit `null` clears it. Date-shaped strings are converted to Date;
// everything else (including Decimal fields, which Prisma accepts as
// strings/numbers directly) passes through as-is.
function toWriteData(input: MechanicalLogItemInput) {
  const data: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (value === undefined) continue;
    if (value !== null && (DATE_FIELDS as readonly string[]).includes(key)) {
      data[key] = new Date(value as string);
    } else {
      data[key] = value;
    }
  }
  return data;
}

export async function listMechanicalLogItems() {
  return prisma.mechanical_log_items.findMany({
    orderBy: [{ tag_number: "asc" }, { created_at: "asc" }],
  });
}

export async function getMechanicalLogItem(id: string) {
  const item = await prisma.mechanical_log_items.findUnique({ where: { id } });
  if (!item) throw new NotFoundError(`Mechanical log item ${id} not found`);
  return item;
}

export async function createMechanicalLogItem(input: MechanicalLogItemInput) {
  return prisma.mechanical_log_items.create({ data: toWriteData(input) });
}

export async function updateMechanicalLogItem(id: string, input: MechanicalLogItemInput) {
  const existing = await prisma.mechanical_log_items.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError(`Mechanical log item ${id} not found`);

  return prisma.mechanical_log_items.update({ where: { id }, data: toWriteData(input) });
}
