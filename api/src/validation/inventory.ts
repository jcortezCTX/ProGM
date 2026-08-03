import { z } from "zod";

const decimalString = z.union([z.number(), z.string()]).transform((v) => String(v));
const customFields = z.record(z.string(), z.unknown());
const tags = z.array(z.string().min(1));

export const createItemSchema = z.object({
  sku: z.string().min(1),
  name: z.string().min(1),
  description: z.string().min(1).optional(),
  unit: z.string().min(1).optional(),
  reorder_threshold: decimalString.optional(),
  price: decimalString.optional(),
  notes: z.string().min(1).optional(),
  barcode: z.string().min(1).optional(),
  product_link: z.string().min(1).optional(),
  custom_fields: customFields.optional(),
  tags: tags.optional(),
});

export const updateItemSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().min(1).nullable().optional(),
  unit: z.string().min(1).optional(),
  reorder_threshold: decimalString.optional(),
  price: decimalString.optional(),
  notes: z.string().min(1).nullable().optional(),
  barcode: z.string().min(1).nullable().optional(),
  product_link: z.string().min(1).nullable().optional(),
  custom_fields: customFields.optional(),
  tags: tags.optional(),
});

export const createCustomFieldDefSchema = z.object({
  field_key: z
    .string()
    .min(1)
    .regex(/^[a-z][a-z0-9_]*$/, "field_key must be lowercase snake_case"),
  label: z.string().min(1),
  field_type: z.enum(["text", "textarea", "number", "select", "checkbox"]),
  options: z.array(z.string().min(1)).optional(),
  sort_order: z.number().int().optional(),
});

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
