import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "../lib/prisma.js";
import { createPumpTruckRental } from "./pumpTruckRentalService.js";

const runId = Date.now();
const marker = `MARK${runId}`;
const ids: string[] = [];

afterAll(async () => {
  await prisma.pump_truck_rentals.deleteMany({ where: { id: { in: ids } } });
});

describe("pump truck rental $/CY derivation", () => {
  it("computes amount / cubic_yards when both are present", async () => {
    const row = await createPumpTruckRental({
      rental_date: "2026-06-01",
      location: `Test ${marker}`,
      amount: 250,
      cubic_yards: 100,
    });
    ids.push(row.id);
    expect(row.per_cy).toBe(2.5);
  });

  it("is null when cubic_yards is null", async () => {
    const row = await createPumpTruckRental({
      rental_date: "2026-06-01",
      location: `Test ${marker}`,
      amount: 250,
      cubic_yards: null,
    });
    ids.push(row.id);
    expect(row.per_cy).toBeNull();
  });

  it("is null when cubic_yards is zero (not Infinity/NaN)", async () => {
    const row = await createPumpTruckRental({
      rental_date: "2026-06-01",
      location: `Test ${marker}`,
      amount: 250,
      cubic_yards: 0,
    });
    ids.push(row.id);
    expect(row.per_cy).toBeNull();
  });

  it("is null when amount is null", async () => {
    const row = await createPumpTruckRental({
      rental_date: "2026-06-01",
      location: `Test ${marker}`,
      amount: null,
      cubic_yards: 100,
    });
    ids.push(row.id);
    expect(row.per_cy).toBeNull();
  });
});
