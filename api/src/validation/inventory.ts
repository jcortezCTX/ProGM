import { z } from "zod";

export const createItemSchema = z.object({
  sku: z.string().min(1),
  name: z.string().min(1),
  description: z.string().min(1).optional(),
  unit: z.string().min(1).optional(),
  reorder_threshold: z.union([z.number(), z.string()]).optional(),
});

const decimalString = z.union([z.number(), z.string()]).transform((v) => String(v));

export const createTransactionSchema = z
  .object({
    item_id: z.string().uuid(),
    type: z.enum(["received", "issued", "adjustment", "delivered_out"]),
    quantity: decimalString,
    location: z.string().min(1).optional(),
    note: z.string().min(1).optional(),
    created_by: z.string().uuid().optional(),
  })
  .refine(
    (body) => body.type === "adjustment" || Number(body.quantity) > 0,
    {
      message: "quantity must be a positive number for received/issued/delivered_out; use adjustment for signed corrections",
      path: ["quantity"],
    },
  )
  .refine((body) => Number(body.quantity) !== 0, {
    message: "quantity must not be zero",
    path: ["quantity"],
  });

export const idParamSchema = z.object({
  id: z.string().uuid(),
});
