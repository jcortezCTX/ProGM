import "dotenv/config";
import { fileURLToPath } from "node:url";
import XLSX from "xlsx";
import { prisma } from "../src/lib/prisma.js";

// One-off load of the real company workbook at
// logs_samples/AWWTF - Concrete Log (Weekly Report + Trends).xlsx into
// concrete_settings/concrete_mix_designs/concrete_structures/concrete_pours/
// concrete_samples/pump_truck_rentals/concrete_credits. See
// CONCRETE_LOG_SPEC.md for the sheet-to-table mapping and the two
// structural fixes (pour sheets merge into one table; samples become child
// rows instead of wide "Sample #N" columns).
const XLSX_PATH = fileURLToPath(
  new URL("../../logs_samples/AWWTF - Concrete Log (Weekly Report + Trends).xlsx", import.meta.url),
);

function text(raw: unknown): string | null {
  const t = typeof raw === "string" ? raw.trim() : raw != null ? String(raw).trim() : "";
  return t ? t : null;
}

function isBlankOrNA(raw: unknown): boolean {
  const t = typeof raw === "string" ? raw.trim().toUpperCase() : "";
  return t === "" || t === "NA";
}

// "$655.71 " -> "655.71", "$(1,789.06)" -> "-1789.06", "" -> null
function money(raw: unknown): string | null {
  const t = typeof raw === "string" ? raw.trim() : "";
  if (!t || t === "$-" || t === "-") return null;
  const negative = t.includes("(");
  const cleaned = t.replace(/[^0-9.]/g, "");
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isNaN(n) ? null : String(negative ? -n : n);
}

function qty(raw: unknown): string | null {
  const t = typeof raw === "string" ? raw.trim().replace(/,/g, "") : "";
  if (!t) return null;
  const n = Number(t);
  return Number.isNaN(n) ? null : String(n);
}

function psi(raw: unknown): number | null {
  const t = typeof raw === "string" ? raw.trim().replace(/,/g, "") : "";
  if (!t) return null;
  const n = Number.parseInt(t, 10);
  return Number.isNaN(n) ? null : n;
}

// M/D/YYYY or M/D/YY (both appear in this workbook).
function date(raw: unknown): Date | null {
  const t = typeof raw === "string" ? raw.trim() : "";
  if (!t) return null;
  const m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (!m) return null;
  const [, mo, d, yRaw] = m;
  const year = yRaw.length === 2 ? 2000 + Number(yRaw) : Number(yRaw);
  const dt = new Date(Date.UTC(year, Number(mo) - 1, Number(d)));
  return Number.isNaN(dt.getTime()) ? null : dt;
}

function sheetRows(wb: XLSX.WorkBook, name: string): unknown[][] {
  const ws = wb.Sheets[name];
  if (!ws) throw new Error(`sheet "${name}" not found`);
  return XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: "" }) as unknown[][];
}

interface MixDesignRow {
  supplier: string;
  concrete_class: string | null;
  mix_type: string | null;
  mix_number: string;
  type_of_work: string | null;
  design_strength_psi: number | null;
  slump_range: string | null;
  air_range: string | null;
}

// Generic block parser rather than hardcoded row ranges: the real workbook
// has 4 supplier blocks (Garney-CEMEX, Baker-Quickcrete, Menard-Maschmeyer
// Concrete, Cogburn-Titan American), not the 2 used as illustrative
// examples in CONCRETE_LOG_SPEC.md, and blocks vary in column count (1-7
// mixes). A block header is a row whose col0 is non-blank and is
// immediately followed by a "Concrete Class" label row.
function parseMixDesignBlocks(rows: unknown[][]): MixDesignRow[] {
  const designs: MixDesignRow[] = [];
  for (let i = 0; i < rows.length - 1; i++) {
    const header = text(rows[i]?.[0]);
    if (!header || text(rows[i + 1]?.[0]) !== "Concrete Class") continue;

    const classRow = rows[i + 1];
    const typeRow = rows[i + 2];
    const mixRow = rows[i + 3];
    const workRow = rows[i + 4];
    const strengthRow = rows[i + 5];
    const slumpRow = rows[i + 6];
    const airRow = rows[i + 7];

    const colCount = Math.max(classRow.length, typeRow?.length ?? 0, mixRow?.length ?? 0);
    for (let c = 1; c < colCount; c++) {
      const mixNumber = text(mixRow?.[c]);
      if (!mixNumber) continue;
      designs.push({
        supplier: header,
        concrete_class: text(classRow?.[c]),
        mix_type: text(typeRow?.[c]),
        mix_number: mixNumber,
        type_of_work: text(workRow?.[c]),
        design_strength_psi: psi(strengthRow?.[c]),
        slump_range: text(slumpRow?.[c]),
        air_range: text(airRow?.[c]),
      });
    }
  }
  return designs;
}

interface ParsedSample {
  report_number: string | null;
  seven_day_psi: string | null;
  seven_day_entered_on: Date | null;
  twenty_eight_day_psi: string | null;
  twenty_eight_day_entered_on: Date | null;
}

interface ParsedPour {
  pour_date: Date;
  location: string;
  structureName: string | null;
  mixNumber: string | null;
  design_strength_psi: number;
  yds_required: string | null;
  yds_delivered: string | null;
  yds_installed: string | null;
  is_subcontractor: boolean;
  poured_by: string | null;
  invoice_number: string | null;
  invoice_total: string | null;
  notes: string | null;
  samples: ParsedSample[];
}

// "Concrete Pour Summary" - Garney self-perform pours. Data starts row 8
// (index 7) and runs until the pour-date column goes blank. Sample groups:
// cols O/P, Q/R, S/T, U/V (indices 14/15, 16/17, 18/19, 20/21) are samples
// 1-4 (7-day/28-day); Y/Z (24/25) are the entered-on dates, applied to
// every sample present in the row. 'NA'/'No Samples Taken' -> zero samples,
// note kept on the pour.
function parseSelfPerformPours(rows: unknown[][]): ParsedPour[] {
  const pours: ParsedPour[] = [];
  for (let i = 7; i < rows.length; i++) {
    const row = rows[i];
    const pourDate = date(row[1]);
    if (!pourDate) continue;

    const notesCol = text(row[13]);
    const isNoSamples = notesCol === "No Samples Taken" || notesCol === null;
    const reportNumbers = isNoSamples ? [] : (notesCol as string).split(",").map((s) => s.trim());
    const sevenDayEntered = date(row[24]);
    const twentyEightDayEntered = date(row[25]);

    const samples: ParsedSample[] = [];
    const slots: [number, number][] = [
      [14, 15],
      [16, 17],
      [18, 19],
      [20, 21],
    ];
    for (const [sevenCol, twentyEightCol] of slots) {
      if (isBlankOrNA(row[sevenCol]) && isBlankOrNA(row[twentyEightCol])) continue;
      samples.push({
        report_number: reportNumbers[samples.length] ?? null,
        seven_day_psi: qty(row[sevenCol]),
        seven_day_entered_on: isBlankOrNA(row[sevenCol]) ? null : sevenDayEntered,
        twenty_eight_day_psi: qty(row[twentyEightCol]),
        twenty_eight_day_entered_on: isBlankOrNA(row[twentyEightCol]) ? null : twentyEightDayEntered,
      });
    }

    pours.push({
      pour_date: pourDate,
      location: text(row[2]) ?? "(unspecified)",
      structureName: text(row[3]),
      mixNumber: text(row[4]),
      design_strength_psi: psi(row[5]) ?? 0,
      yds_required: qty(row[6]),
      yds_delivered: qty(row[7]),
      yds_installed: qty(row[8]),
      is_subcontractor: false,
      poured_by: text(row[10]),
      invoice_number: text(row[11]),
      invoice_total: money(row[12]),
      notes: isNoSamples && notesCol ? notesCol : null,
      samples,
    });
  }
  return pours;
}

// "Concrete Pour Summary - Subs" - one row per sample. Group rows sharing
// (pour_date, location, mix #) into a single pour with N samples. Sample
// values in cols M/N (12/13), entered-on in W/X (22/23), report number in
// the Notes column (11).
function parseSubPours(rows: unknown[][]): ParsedPour[] {
  const groups = new Map<string, ParsedPour>();
  const order: string[] = [];

  for (let i = 7; i < rows.length; i++) {
    const row = rows[i];
    const pourDate = date(row[1]);
    if (!pourDate) continue;

    const location = text(row[2]) ?? "(unspecified)";
    const mixNumber = text(row[4]);
    const key = `${pourDate.toISOString()}|${location}|${mixNumber ?? ""}`;

    let pour = groups.get(key);
    if (!pour) {
      pour = {
        pour_date: pourDate,
        location,
        structureName: text(row[3]),
        mixNumber,
        design_strength_psi: psi(row[5]) ?? 0,
        yds_required: qty(row[6]),
        yds_delivered: qty(row[7]),
        yds_installed: qty(row[8]),
        is_subcontractor: true,
        poured_by: text(row[10]),
        invoice_number: null,
        invoice_total: null,
        notes: null,
        samples: [],
      };
      groups.set(key, pour);
      order.push(key);
    }

    if (isBlankOrNA(row[12]) && isBlankOrNA(row[13])) continue;
    pour.samples.push({
      report_number: text(row[11]),
      seven_day_psi: qty(row[12]),
      seven_day_entered_on: isBlankOrNA(row[12]) ? null : date(row[22]),
      twenty_eight_day_psi: qty(row[13]),
      twenty_eight_day_entered_on: isBlankOrNA(row[13]) ? null : date(row[23]),
    });
  }

  return order.map((k) => groups.get(k)!);
}

interface ParsedPumpTruckRental {
  rental_date: Date;
  location: string;
  truck_size_requested: string | null;
  truck_size_sent: string | null;
  hours: string | null;
  invoice_number: string | null;
  amount: string | null;
  cubic_yards: string | null;
  date_approved: Date | null;
  notes: string | null;
}

function parsePumpTruckRentals(rows: unknown[][]): ParsedPumpTruckRental[] {
  const out: ParsedPumpTruckRental[] = [];
  for (let i = 3; i < rows.length; i++) {
    const row = rows[i];
    const rentalDate = date(row[0]);
    if (!rentalDate) continue;
    out.push({
      rental_date: rentalDate,
      location: text(row[1]) ?? "(unspecified)",
      truck_size_requested: text(row[2]),
      truck_size_sent: text(row[3]),
      hours: qty(row[4]),
      invoice_number: text(row[5]),
      amount: money(row[6]),
      cubic_yards: qty(row[7]),
      date_approved: date(row[9]),
      notes: text(row[10]),
    });
  }
  return out;
}

interface ParsedCredit {
  date_received: Date;
  amount: string;
  date_approved: Date | null;
  notes: string | null;
}

function parseCredits(rows: unknown[][]): ParsedCredit[] {
  const out: ParsedCredit[] = [];
  for (let i = 3; i < rows.length; i++) {
    const row = rows[i];
    const received = date(row[0]);
    const amount = money(row[1]);
    if (!received || amount === null) continue;
    out.push({ date_received: received, amount, date_approved: date(row[2]), notes: text(row[3]) });
  }
  return out;
}

async function main() {
  const existingPours = await prisma.concrete_pours.count();
  if (existingPours > 0) {
    console.log(`concrete_pours already has ${existingPours} rows - skipping import.`);
    return;
  }

  const wb = XLSX.readFile(XLSX_PATH);

  // ---- Mix designs ----
  const mixDesignRows = parseMixDesignBlocks(sheetRows(wb, "Mix Designs"));
  const mixDesignIdByKey = new Map<string, string>();
  for (const d of mixDesignRows) {
    const row = await prisma.concrete_mix_designs.upsert({
      where: { supplier_mix_number: { supplier: d.supplier, mix_number: d.mix_number } },
      create: d,
      update: d,
    });
    mixDesignIdByKey.set(`${d.supplier}|${d.mix_number}`, row.id);
    mixDesignIdByKey.set(d.mix_number, row.id); // fallback lookup by mix number alone
  }

  // ---- Structures ----
  const structureIdByName = new Map<string, string>();
  async function structureId(name: string | null): Promise<string | null> {
    if (!name) return null;
    const cached = structureIdByName.get(name);
    if (cached) return cached;
    const row = await prisma.concrete_structures.upsert({ where: { name }, create: { name }, update: {} });
    structureIdByName.set(name, row.id);
    return row.id;
  }

  // Pour rows reference mix numbers absent from the Mix Designs sheet
  // (1602011, 1588170, ... per CONCRETE_LOG_SPEC.md) - upsert them as
  // minimal placeholder rows under the pouring company as a stand-in
  // supplier, since the real supplier isn't recoverable from the pour row.
  async function mixDesignId(mixNumber: string | null, designStrengthPsi: number, fallbackSupplier: string): Promise<string | null> {
    if (!mixNumber) return null;
    const byNumber = mixDesignIdByKey.get(mixNumber);
    if (byNumber) return byNumber;
    const row = await prisma.concrete_mix_designs.upsert({
      where: { supplier_mix_number: { supplier: fallbackSupplier, mix_number: mixNumber } },
      create: { supplier: fallbackSupplier, mix_number: mixNumber, design_strength_psi: designStrengthPsi },
      update: {},
    });
    mixDesignIdByKey.set(mixNumber, row.id);
    return row.id;
  }

  // ---- Pours ----
  const selfPerformPours = parseSelfPerformPours(sheetRows(wb, "Concrete Pour Summary"));
  const subPours = parseSubPours(sheetRows(wb, "Concrete Pour Summary - Subs"));
  const allPours = [...selfPerformPours, ...subPours];

  let pourCount = 0;
  let sampleCount = 0;
  let totalInstalledSelfPerform = 0;
  let totalInstalledSubs = 0;

  for (const p of allPours) {
    const structure_id = await structureId(p.structureName);
    const mix_design_id = await mixDesignId(p.mixNumber, p.design_strength_psi, p.poured_by ?? "Unknown");

    const pour = await prisma.concrete_pours.create({
      data: {
        pour_date: p.pour_date,
        location: p.location,
        structure_id,
        mix_design_id,
        design_strength_psi: p.design_strength_psi,
        yds_required: p.yds_required,
        yds_delivered: p.yds_delivered,
        yds_installed: p.yds_installed,
        is_subcontractor: p.is_subcontractor,
        poured_by: p.poured_by,
        invoice_number: p.invoice_number,
        invoice_total: p.invoice_total,
        notes: p.notes,
      },
    });
    pourCount++;
    if (p.is_subcontractor) totalInstalledSubs += Number(p.yds_installed ?? 0);
    else totalInstalledSelfPerform += Number(p.yds_installed ?? 0);

    if (p.samples.length > 0) {
      await prisma.concrete_samples.createMany({
        data: p.samples.map((s) => ({ ...s, pour_id: pour.id })),
      });
      sampleCount += p.samples.length;
    }
  }

  // ---- Pump truck rentals ----
  const rentals = parsePumpTruckRentals(sheetRows(wb, "Pump Truck"));
  if (rentals.length > 0) {
    await prisma.pump_truck_rentals.createMany({ data: rentals });
  }

  // ---- Concrete credits ----
  const credits = parseCredits(sheetRows(wb, "Concrete Credits"));
  if (credits.length > 0) {
    await prisma.concrete_credits.createMany({ data: credits });
  }

  // ---- Settings ----
  const summaryRows = sheetRows(wb, "Summary Sheet");
  const jobLine = text(summaryRows[0]?.[1]) ?? "";
  const [jobNumber, ...jobNameParts] = jobLine.split(" ");
  const startDate = date(summaryRows[1]?.[1]);
  const pourSummaryRows = sheetRows(wb, "Concrete Pour Summary");
  const totalEstCy = qty(pourSummaryRows[1]?.[4]) ?? "13006";

  const existingSettings = await prisma.concrete_settings.findFirst();
  if (!existingSettings && jobNumber && startDate) {
    await prisma.concrete_settings.create({
      data: {
        job_number: jobNumber,
        job_name: jobNameParts.join(" ") || jobLine,
        start_date: startDate,
        total_est_cy: totalEstCy,
      },
    });
  }

  // ---- Reconciliation summary ----
  const selfPerformSheetTotal = qty(pourSummaryRows[2]?.[4]);
  const subsSheetTotal = qty(sheetRows(wb, "Concrete Pour Summary - Subs")[2]?.[4]);

  console.log("--- Concrete Log import summary ---");
  console.log(`Mix designs: ${mixDesignRows.length} parsed from sheet blocks`);
  console.log(`Structures: ${structureIdByName.size} upserted`);
  console.log(`Pours: ${pourCount} (${selfPerformPours.length} self-perform, ${subPours.length} sub)`);
  console.log(`Samples: ${sampleCount}`);
  console.log(`Pump truck rentals: ${rentals.length}`);
  console.log(`Concrete credits: ${credits.length}`);
  console.log(
    `Self-perform CY installed: imported ${totalInstalledSelfPerform} vs sheet "Total CY Placed" ${selfPerformSheetTotal ?? "?"}` +
      (String(totalInstalledSelfPerform) === selfPerformSheetTotal ? " (match)" : " (MISMATCH - review)"),
  );
  console.log(
    `Sub CY installed: imported ${totalInstalledSubs} vs sheet "Total CY Placed" ${subsSheetTotal ?? "?"}` +
      (String(totalInstalledSubs) === subsSheetTotal ? " (match)" : " (MISMATCH - review)"),
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
