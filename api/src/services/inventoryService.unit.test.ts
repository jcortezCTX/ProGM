import { describe, expect, it } from "vitest";
import { Prisma } from "../generated/prisma/client.js";
import { _internal } from "./inventoryService.js";

const { signedQuantity, totalStock } = _internal;

describe("signedQuantity", () => {
  it("keeps received positive", () => {
    expect(signedQuantity("received", 50).toString()).toBe("50");
  });

  it("negates issued", () => {
    expect(signedQuantity("issued", 50).toString()).toBe("-50");
  });

  it("negates delivered_out", () => {
    expect(signedQuantity("delivered_out", 12.5).toString()).toBe("-12.5");
  });

  it("normalizes a negative magnitude for issued to still be negative", () => {
    expect(signedQuantity("issued", -50).toString()).toBe("-50");
  });

  it("passes a positive adjustment through as-is", () => {
    expect(signedQuantity("adjustment", 7).toString()).toBe("7");
  });

  it("passes a negative adjustment through as-is", () => {
    expect(signedQuantity("adjustment", -7).toString()).toBe("-7");
  });
});

describe("totalStock", () => {
  it("sums rows across locations, treating null as zero", () => {
    const rows = [
      { quantity_on_hand: new Prisma.Decimal(10) },
      { quantity_on_hand: new Prisma.Decimal(-3) },
      { quantity_on_hand: null },
    ];
    expect(totalStock(rows).toString()).toBe("7");
  });
});
