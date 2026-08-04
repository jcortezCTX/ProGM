import "dotenv/config";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { prisma } from "../src/lib/prisma.js";

// One-off load of the real company export at logs_samples/Mechanical Log.csv
// into mechanical_log_items, so the module launches with real data instead
// of an empty table. Excel exported this as Windows-1252 (curly quotes,
// em-dashes in Notes), not UTF-8 - decoding as UTF-8 throws.
const CSV_PATH = fileURLToPath(new URL("../../logs_samples/Mechanical Log.csv", import.meta.url));

// Hand-rolled rather than a dependency: handles quoted fields with embedded
// commas/newlines (several Notes cells span multiple lines) and doubled-quote
// escaping, which a naive split(',') / split('\n') can't.
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
      continue;
    }
    if (c === '"') inQuotes = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\r") {
      // ignore, \n below ends the row
    } else if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

function text(raw: string | undefined): string | null {
  const t = raw?.trim();
  return t ? t : null;
}

// "$37,103.14" -> "37103.14", "$(1,789.06)" -> "-1789.06", "$-" -> null
function money(raw: string | undefined): string | null {
  const t = raw?.trim();
  if (!t || t === "$-" || t === "-") return null;
  const negative = t.includes("(");
  const cleaned = t.replace(/[^0-9.]/g, "");
  if (!cleaned) return null;
  const n = Number(cleaned);
  if (Number.isNaN(n)) return null;
  return String(negative ? -n : n);
}

function qty(raw: string | undefined): string | null {
  const t = raw?.trim().replace(/,/g, "");
  if (!t) return null;
  const n = Number(t);
  return Number.isNaN(n) ? null : String(n);
}

// M/D/YYYY or M/D/YY; a handful of cells in the source have stray garbage
// (e.g. a lone "```") which just falls through to null rather than throwing.
function date(raw: string | undefined): Date | null {
  const t = raw?.trim();
  if (!t) return null;
  const m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (!m) return null;
  const [, mo, d, yRaw] = m;
  const year = yRaw.length === 2 ? 2000 + Number(yRaw) : Number(yRaw);
  const dt = new Date(Date.UTC(year, Number(mo) - 1, Number(d)));
  return Number.isNaN(dt.getTime()) ? null : dt;
}

async function main() {
  const existing = await prisma.mechanical_log_items.count();
  if (existing > 0) {
    console.log(`mechanical_log_items already has ${existing} rows - skipping import.`);
    return;
  }

  const raw = readFileSync(CSV_PATH);
  const csvText = new TextDecoder("windows-1252").decode(raw);
  const [header, ...rows] = parseCsv(csvText);
  const col = (name: string) => header.findIndex((h) => h.trim() === name);

  const idx = {
    release: col("Release"),
    supplier: col("Supplier"),
    review: col("Review"),
    tag_number: col("Tag Number"),
    qty_released: col("QTY Released"),
    unit: col("Unit"),
    size: col("Size"),
    description: col("Description"),
    material: col("Material"),
    lining: col("Lining"),
    coating: col("Coating"),
    release_date: col("Release Date"),
    due_date: col("Due Date"),
    area: col("Area"),
    system: col("System"),
    contract_dwg: col("Contract Dwg"),
    system2: col("System2"),
    shop_dwg: col("Shop Dwg"),
    delivered_qty: col("Delivered QTY"),
    need_qty: col("Need QTY"),
    received_on: col("Received On"),
    received_by: col("Received By"),
    storage_location: col("Storage Location"),
    notes: col("Notes"),
    estimate_cost: col("Estimate Cost"),
    contract_unit_price: col("Contract Unit Price"),
    contract_extended_price: col("Contract Extended Price"),
    above_below: col("Above/Below"),
    invoice_no: col("Invoice No."),
    invoice_unit_price: col("Invoice Unit Price"),
    invoice_extended_price: col("Invoice Extended Price"),
    delta_invoice_contract: col("Delta (Invoice-Contract)"),
    qty_invoiced_to_date: col("QTY Invoiced to Date"),
  };

  const records = rows
    .filter((r) => r.some((cell) => cell.trim() !== ""))
    .map((r) => ({
      release: text(r[idx.release]),
      supplier: text(r[idx.supplier]),
      review: text(r[idx.review]),
      tag_number: text(r[idx.tag_number]),
      qty_released: qty(r[idx.qty_released]),
      unit: text(r[idx.unit]),
      size: text(r[idx.size]),
      description: text(r[idx.description]),
      material: text(r[idx.material]),
      lining: text(r[idx.lining]),
      coating: text(r[idx.coating]),
      release_date: date(r[idx.release_date]),
      due_date: date(r[idx.due_date]),
      area: text(r[idx.area]),
      system: text(r[idx.system]),
      contract_dwg: text(r[idx.contract_dwg]),
      system2: text(r[idx.system2]),
      shop_dwg: text(r[idx.shop_dwg]),
      delivered_qty: qty(r[idx.delivered_qty]),
      need_qty: qty(r[idx.need_qty]),
      received_on: date(r[idx.received_on]),
      received_by: text(r[idx.received_by]),
      storage_location: text(r[idx.storage_location]),
      notes: text(r[idx.notes]),
      estimate_cost: money(r[idx.estimate_cost]),
      contract_unit_price: money(r[idx.contract_unit_price]),
      contract_extended_price: money(r[idx.contract_extended_price]),
      above_below: text(r[idx.above_below]),
      invoice_no: text(r[idx.invoice_no]),
      invoice_unit_price: money(r[idx.invoice_unit_price]),
      invoice_extended_price: money(r[idx.invoice_extended_price]),
      delta_invoice_contract: money(r[idx.delta_invoice_contract]),
      qty_invoiced_to_date: qty(r[idx.qty_invoiced_to_date]),
    }));

  const result = await prisma.mechanical_log_items.createMany({ data: records });
  console.log(`Imported ${result.count} mechanical log rows from ${CSV_PATH}.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
