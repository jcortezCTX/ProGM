import { z } from "zod";
import { buildListQuerySchema } from "./listQuery.js";

export const pumpTruckRentalsListQuerySchema = buildListQuerySchema(["rental_date", "location", "created_at"] as const);

const decimal = z.union([z.number(), z.string()]).nullable().optional();
const text = z.string().min(1).nullable().optional();
const date = z.string().min(1).nullable().optional();

export const pumpTruckRentalSchema = z.object({
  rental_date: z.string().min(1).optional(),
  location: z.string().min(1).optional(),
  truck_size_requested: text,
  truck_size_sent: text,
  hours: decimal,
  invoice_number: text,
  amount: decimal,
  cubic_yards: decimal,
  date_approved: date,
  notes: text,
  created_by: z.string().uuid().optional(),
});

export const idParamSchema = z.object({
  id: z.string().uuid(),
});
