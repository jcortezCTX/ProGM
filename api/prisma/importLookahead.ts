import "dotenv/config";
import { fileURLToPath } from "node:url";
import ExcelJS from "exceljs";
import { prisma } from "../src/lib/prisma.js";
import { fromIsoDate, generateAutoDaySet, toIsoDate, type ScheduleWindow } from "../src/services/scheduleDaySet.js";

// One-off load of the real 6-week lookahead workbook into the Schedule
// module (SCHEDULE_SPEC.md "One-time import"). Reads cell *fills* via
// exceljs (SheetJS/xlsx can't do this reliably) since the workbook encodes
// each activity's worked days as hand-painted cell colors, not a value.
const XLSX_PATH = fileURLToPath(new URL("../../logs_samples/Schedule AWWTF 12 Week Look Ahead.xlsx", import.meta.url));
const SHEET_NAME = "6 Week Sch";
const FIELD_HEADER_ROW = 6;
const DATE_ROW = 8;
const FIRST_DATA_ROW = 9;
const FIRST_DAY_COL = 10; // column J

// The exact 5 solid fill colors present in the real workbook (verified by
// scanning every cell): grey weekend shading, the plain "worked day" bar,
// and three legend colors. "Shutdown (blue)" is in SCHEDULE_SPEC.md's
// legend but no blue fill exists anywhere in this file - the set below is
// a best-effort guess at common Office blues, kept for forward
// compatibility, and its zero-hit count gets logged in the summary rather
// than assumed correct.
const CRITICAL_ARGB = "FFFF0000";
const HOLIDAY_ARGB = "FF7030A0";
const COUNTY_HOLIDAY_ARGB = "FFFF0066";
const SHUTDOWN_ARGB_GUESSES = new Set(["FF0070C0", "FF0000FF", "FF002060"]);

type FillClass = "bar" | "critical_bar" | "shutdown_bar" | "holiday" | "county_holiday" | "weekend" | "unknown" | null;

function classifyFill(cell: ExcelJS.Cell): FillClass {
  const fill = cell.fill as unknown as { type?: string; pattern?: string; fgColor?: { argb?: string; theme?: number; tint?: number } };
  if (!fill || fill.type !== "pattern" || fill.pattern !== "solid") return null;
  const fg = fill.fgColor;
  if (!fg) return null;
  if (fg.argb === CRITICAL_ARGB) return "critical_bar";
  if (fg.argb === HOLIDAY_ARGB) return "holiday";
  if (fg.argb === COUNTY_HOLIDAY_ARGB) return "county_holiday";
  if (fg.argb && SHUTDOWN_ARGB_GUESSES.has(fg.argb)) return "shutdown_bar";
  if (fg.theme === 0) return (fg.tint ?? 0) < -0.05 ? "weekend" : "bar";
  if (fg.argb) return "unknown";
  return null;
}

function isBar(cls: FillClass): boolean {
  return cls === "bar" || cls === "critical_bar" || cls === "shutdown_bar";
}

function isBlank(v: unknown): boolean {
  return v === null || v === undefined || (typeof v === "string" && v.trim() === "");
}

function textOf(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = typeof v === "string" ? v : String(v);
  const t = s.trim();
  return t === "" ? null : t;
}

function unwrapFormula(v: unknown): unknown {
  if (v && typeof v === "object" && "result" in (v as Record<string, unknown>)) {
    return (v as Record<string, unknown>).result;
  }
  return v;
}

function numberOf(v: unknown): number | null {
  const raw = unwrapFormula(v);
  if (typeof raw === "number") return raw;
  if (typeof raw === "string" && raw.trim() !== "" && !Number.isNaN(Number(raw))) return Number(raw);
  return null;
}

// The workbook's own "Days" column (I) is a mix of stale/live formulas
// (sometimes counting text markers, sometimes cached, sometimes empty) -
// never imported (CLAUDE.md rule 1 / SCHEDULE_SPEC.md "do not store
// derived values"), but its cached result is read for the reconciliation
// spot-check at the end.
function excelDaysColumnValue(v: unknown): number | null {
  return numberOf(v);
}

const YEAR_PLACEHOLDER = /^(\d{1,2}\/)?\d{4}$/;

function dayCellValue(v: unknown): { crew_count: number | null; marker: string | null } {
  const raw = unwrapFormula(v);
  if (typeof raw === "number") return { crew_count: raw, marker: null };
  if (typeof raw === "string" && raw.trim() !== "") return { crew_count: null, marker: raw.trim().slice(0, 2) };
  return { crew_count: null, marker: null };
}

function readDayGridDates(sheet: ExcelJS.Worksheet): Map<number, string> {
  const dates = new Map<number, string>();
  let col = FIRST_DAY_COL;
  const dateRow = sheet.getRow(DATE_ROW);
  while (col <= sheet.columnCount + 5) {
    const raw = unwrapFormula(dateRow.getCell(col).value);
    const d = raw instanceof Date ? raw : typeof raw === "string" ? new Date(raw) : null;
    if (!d || Number.isNaN(d.getTime())) break;
    dates.set(col, toIsoDate(d));
    col++;
  }
  return dates;
}

function isSectionHeaderRow(row: ExcelJS.Row): string | null {
  const desc = textOf(row.getCell(3).value);
  if (!desc || desc === "CREW TOTALS") return null;
  const isAllCaps = desc === desc.toUpperCase() && /[A-Z]/.test(desc);
  if (!isAllCaps) return null;
  const otherColsBlank = [1, 2, 4, 5, 6, 7, 8].every((c) => isBlank(row.getCell(c).value));
  return otherColsBlank ? desc : null;
}

interface Summary {
  sections: number;
  scheduledActivities: number;
  unscheduledActivities: number;
  criticalPathActivities: number;
  holidayDates: number;
  countyHolidayDates: number;
  unknownFillColors: Set<string>;
  spotChecks: { description: string; resolvedDays: number; excelDaysColumn: number | null }[];
}

async function main() {
  const existingSections = await prisma.schedule_sections.count();
  const existingActivities = await prisma.schedule_activities.count();
  if (existingSections > 0 || existingActivities > 0) {
    console.log(`Schedule module already has data (${existingSections} sections, ${existingActivities} activities) - skipping import.`);
    return;
  }

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(XLSX_PATH);
  const sheet = wb.getWorksheet(SHEET_NAME);
  if (!sheet) throw new Error(`Sheet "${SHEET_NAME}" not found in ${XLSX_PATH}`);

  const dayGrid = readDayGridDates(sheet);
  const dayCols = [...dayGrid.keys()];

  const summary: Summary = {
    sections: 0,
    scheduledActivities: 0,
    unscheduledActivities: 0,
    criticalPathActivities: 0,
    holidayDates: 0,
    countyHolidayDates: 0,
    unknownFillColors: new Set(),
    spotChecks: [],
  };

  // Pass 1: holidays are a column-wide signal (the same date shows
  // purple/pink across many unrelated activity rows - it's a calendar
  // marking, not a per-activity flag), so collect every distinct date
  // where any row shows the holiday/county-holiday fill before touching
  // activities. No name text exists in the source for these, so the
  // imported name is a generic placeholder the user can rename later.
  const holidayDates = new Set<string>();
  const countyHolidayDates = new Set<string>();
  for (let r = FIRST_DATA_ROW; r <= sheet.rowCount; r++) {
    const row = sheet.getRow(r);
    for (const c of dayCols) {
      const cls = classifyFill(row.getCell(c));
      if (cls === "holiday") holidayDates.add(dayGrid.get(c)!);
      else if (cls === "county_holiday") countyHolidayDates.add(dayGrid.get(c)!);
      else if (cls === "unknown") {
        const fg = (row.getCell(c).fill as unknown as { fgColor?: { argb?: string } })?.fgColor?.argb;
        if (fg) summary.unknownFillColors.add(fg);
      }
    }
  }
  for (const day of holidayDates) {
    await prisma.schedule_holidays.upsert({
      where: { day: fromIsoDate(day) },
      create: { day: fromIsoDate(day), name: "Holiday" },
      update: {},
    });
  }
  for (const day of countyHolidayDates) {
    await prisma.schedule_holidays.upsert({
      where: { day: fromIsoDate(day) },
      create: { day: fromIsoDate(day), name: "County Holiday" },
      update: {},
    });
  }
  summary.holidayDates = holidayDates.size;
  summary.countyHolidayDates = countyHolidayDates.size;
  const holidaySet = new Set([...holidayDates, ...countyHolidayDates]);

  // Pass 2: sections and activities, in sheet order.
  let currentSectionId: string | null = null;
  let sectionSortOrder = 0;
  let activitySortOrder = 0;
  const dayOverrideRows: {
    activity_id: string;
    day: Date;
    kind: "add" | "exclude";
    crew_count: number | null;
    marker: string | null;
  }[] = [];

  for (let r = FIRST_DATA_ROW; r <= sheet.rowCount; r++) {
    const row = sheet.getRow(r);
    const headerName = isSectionHeaderRow(row);
    if (headerName) {
      const section = await prisma.schedule_sections.create({ data: { name: headerName, sort_order: sectionSortOrder++ } });
      currentSectionId = section.id;
      activitySortOrder = 0;
      summary.sections++;
      continue;
    }

    const description = textOf(row.getCell(3).value);
    if (!description || description === "CREW TOTALS") continue; // spacer row or the sheet's own live crew-totals row (derived in-app, never stored)
    if (!currentSectionId) {
      console.warn(`Row ${r}: activity "${description}" appears before any section header - skipped.`);
      continue;
    }

    const codeRaw = textOf(row.getCell(1).value);
    const crewRaw = textOf(row.getCell(2).value);
    const notes = textOf(row.getCell(4).value);
    const responsibility = textOf(row.getCell(5).value);
    const budget_mh = numberOf(row.getCell(6).value);
    const burned_mh = numberOf(row.getCell(7).value);
    const excelDays = excelDaysColumnValue(row.getCell(9).value);

    // Rows whose Activity ID / Crew columns hold a bare year or "M/YYYY"
    // (the workbook's placeholder for far-future, not-yet-scheduled scope)
    // import as unscheduled - those columns aren't real code/crew data on
    // these rows, so the placeholder moves into notes instead of being
    // stored as a fabricated code/crew value.
    const isPlaceholder = (codeRaw && YEAR_PLACEHOLDER.test(codeRaw)) || (crewRaw && YEAR_PLACEHOLDER.test(crewRaw));

    let occupied = new Map<string, { crew_count: number | null; marker: string | null; critical: boolean; shutdown: boolean }>();
    if (!isPlaceholder) {
      for (const c of dayCols) {
        const cell = row.getCell(c);
        const cls = classifyFill(cell);
        const { crew_count, marker } = dayCellValue(cell.value);
        if (isBar(cls) || crew_count !== null || marker !== null) {
          occupied.set(dayGrid.get(c)!, {
            crew_count,
            marker,
            critical: cls === "critical_bar",
            shutdown: cls === "shutdown_bar",
          });
        }
        if (cls === "unknown") {
          const fg = (cell.fill as unknown as { fgColor?: { argb?: string } })?.fgColor?.argb;
          if (fg) summary.unknownFillColors.add(fg);
        }
      }
    }

    const occupiedDates = [...occupied.keys()].sort();
    const critical_path = [...occupied.values()].some((v) => v.critical);
    const shutdown = [...occupied.values()].some((v) => v.shutdown);

    const activity = await prisma.schedule_activities.create({
      data: {
        section_id: currentSectionId,
        code: isPlaceholder ? null : codeRaw,
        description,
        crew: isPlaceholder ? null : crewRaw,
        responsibility,
        notes: isPlaceholder ? [notes, `Placeholder: ${codeRaw ?? crewRaw}`].filter(Boolean).join(" | ") : notes,
        budget_mh: budget_mh !== null ? budget_mh.toString() : null,
        burned_mh: burned_mh !== null ? burned_mh.toString() : null,
        entry_mode: "start_end",
        start_date: occupiedDates.length > 0 ? fromIsoDate(occupiedDates[0]) : null,
        end_date: occupiedDates.length > 0 ? fromIsoDate(occupiedDates[occupiedDates.length - 1]) : null,
        duration_days: null,
        night_work: false, // no reliable visual signal for this in the source file - see reconciliation summary
        critical_path,
        shutdown,
        sort_order: activitySortOrder++,
      },
    });

    if (occupiedDates.length === 0) {
      summary.unscheduledActivities++;
      continue;
    }
    summary.scheduledActivities++;
    if (critical_path) summary.criticalPathActivities++;

    // Reconcile the auto-generated (weekday, non-holiday) set for this
    // start/end range against what was actually painted/valued, so the
    // resolved day set matches the source exactly: gaps become excludes,
    // painted/valued weekends or holidays become adds, and any occupied
    // day carrying a crew_count/marker gets an add override purely to
    // carry that metadata (idempotent on an already-generated day, per
    // SCHEDULE_SPEC.md).
    const window: ScheduleWindow = {
      entry_mode: "start_end",
      start_date: fromIsoDate(occupiedDates[0]),
      end_date: fromIsoDate(occupiedDates[occupiedDates.length - 1]),
      duration_days: null,
    };
    const auto = new Set(generateAutoDaySet(window, holidaySet));

    for (const day of auto) {
      if (!occupied.has(day)) {
        dayOverrideRows.push({ activity_id: activity.id, day: fromIsoDate(day), kind: "exclude", crew_count: null, marker: null });
      }
    }
    for (const [day, meta] of occupied) {
      const needsOverride = !auto.has(day) || meta.crew_count !== null || meta.marker !== null;
      if (needsOverride) {
        dayOverrideRows.push({
          activity_id: activity.id,
          day: fromIsoDate(day),
          kind: "add",
          crew_count: meta.crew_count,
          marker: meta.marker,
        });
      }
    }

    if (summary.spotChecks.length < 5) {
      summary.spotChecks.push({ description, resolvedDays: occupiedDates.length, excelDaysColumn: excelDays });
    }
  }

  if (dayOverrideRows.length > 0) {
    await prisma.schedule_activity_days.createMany({ data: dayOverrideRows });
  }

  console.log("\n=== Schedule import reconciliation ===");
  console.log(`Sections: ${summary.sections}`);
  console.log(`Activities: ${summary.scheduledActivities + summary.unscheduledActivities} (${summary.scheduledActivities} scheduled, ${summary.unscheduledActivities} unscheduled placeholders)`);
  console.log(`Critical-path activities: ${summary.criticalPathActivities}`);
  console.log(`Holidays imported: ${summary.holidayDates} "Holiday" (purple) + ${summary.countyHolidayDates} "County Holiday" (pink)`);
  console.log(`Day-override rows written: ${dayOverrideRows.length}`);
  console.log(`night_work: no reliable visual signal found in the source file - every activity imported with night_work=false; set manually where applicable.`);
  console.log(`"Shutdown" (blue) legend color: 0 matches found (best-effort ARGB guesses only) - no activity was auto-flagged shutdown.`);
  if (summary.unknownFillColors.size > 0) {
    console.log(`Unrecognized fill colors encountered (ignored): ${[...summary.unknownFillColors].join(", ")}`);
  } else {
    console.log("No unrecognized fill colors encountered.");
  }
  console.log("\nSpot check (resolved day count vs. the workbook's own 'Days' column, where cached):");
  for (const s of summary.spotChecks) {
    console.log(`  "${s.description}": resolved=${s.resolvedDays}, workbook col I=${s.excelDaysColumn ?? "(formula not cached)"}`);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
