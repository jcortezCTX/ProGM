import "dotenv/config";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { prisma } from "../src/lib/prisma.js";

// One-off load of the real company export at
// logs_samples/Drawing Release Log.csv into `drawings`, so Drawing Log
// launches with real data instead of an empty table (mirrors
// importMechanicalLog.ts).
const CSV_PATH = fileURLToPath(new URL("../../logs_samples/Drawing Release Log.csv", import.meta.url));

// Hand-rolled rather than a dependency: handles quoted fields with embedded
// commas, matching the parser already used for the Mechanical Log import.
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

// The source tracks "Submittal Status" (Submitted / Not Submitted), which
// doesn't line up 1:1 with the app's draft/in_review/approved/superseded
// lifecycle - "Submitted" is read as "sent out for review" (in_review),
// everything else (including blank) stays at the schema default (draft).
// No row in this export has a Rev Number, so nothing here is ever mapped to
// approved/superseded - those only happen once a real revision is added
// through the app.
function status(raw: string | undefined): "draft" | "in_review" {
  return raw?.trim() === "Submitted" ? "in_review" : "draft";
}

async function main() {
  const existing = await prisma.drawings.count();
  if (existing > 0) {
    console.log(`drawings already has ${existing} rows - skipping import.`);
    return;
  }

  const raw = readFileSync(CSV_PATH, "utf8");
  const [header, ...rows] = parseCsv(raw);
  const col = (name: string) => header.findIndex((h) => h.trim() === name);

  const idx = {
    dwgName: col("Dwg Name"),
    description: col("Drawing Description (For Title Block)"),
    discipline: col("Dicipling"),
    dwgType: col("DWG Type"),
    areaName: col("Area Name"),
    submittalStatus: col("Submittal Status"),
  };

  const records = rows
    .filter((r) => r.some((cell) => cell.trim() !== "") && text(r[idx.dwgName]) !== null)
    .map((r) => ({
      drawing_number: text(r[idx.dwgName])!,
      title: text(r[idx.description]) ?? text(r[idx.dwgName])!,
      discipline: text(r[idx.discipline]),
      drawing_type: text(r[idx.dwgType]),
      area: text(r[idx.areaName]),
      status: status(r[idx.submittalStatus]),
    }));

  const result = await prisma.drawings.createMany({ data: records });
  console.log(`Imported ${result.count} drawings from ${CSV_PATH}.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
