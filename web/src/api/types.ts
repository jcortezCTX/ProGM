// Decimal/NUMERIC columns come over the wire as strings — never parsed to
// float here, only ever displayed or round-tripped as form input values.

export interface InventoryItem {
  id: string;
  sku: string;
  name: string;
  description: string | null;
  unit: string;
  reorder_threshold: string;
  price: string;
  notes: string | null;
  barcode: string | null;
  product_link: string | null;
  custom_fields: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  quantity_on_hand: string;
  total_value: string;
  low_stock: boolean;
  tags: string[];
}

export interface InventoryItemDetail {
  id: string;
  sku: string;
  name: string;
  description: string | null;
  unit: string;
  reorder_threshold: string;
  price: string;
  notes: string | null;
  barcode: string | null;
  product_link: string | null;
  custom_fields: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  quantity_on_hand: string;
  total_value: string;
  stock_by_location: { location: string; quantity_on_hand: string }[];
  tags: string[];
}

export type InventoryTransactionType = "received" | "issued" | "adjustment" | "delivered_out";

export interface InventoryTransaction {
  id: string;
  item_id: string;
  type: InventoryTransactionType;
  quantity: string;
  location: string;
  note: string | null;
  created_by: string | null;
  created_at: string;
}

export interface CreateItemInput {
  sku: string;
  name: string;
  description?: string;
  unit?: string;
  reorder_threshold?: string;
  price?: string;
  notes?: string;
  barcode?: string;
  product_link?: string;
  custom_fields?: Record<string, unknown>;
  tags?: string[];
}

// All fields optional — PATCH semantics. custom_fields is shallow-merged into
// the existing value server-side, not replaced; tags, if provided, replace
// the item's full tag set.
export interface UpdateItemInput {
  name?: string;
  description?: string | null;
  unit?: string;
  reorder_threshold?: string;
  price?: string;
  notes?: string | null;
  barcode?: string | null;
  product_link?: string | null;
  custom_fields?: Record<string, unknown>;
  tags?: string[];
}

export interface CreateTransactionInput {
  item_id: string;
  type: InventoryTransactionType;
  quantity: string;
  location?: string;
  note?: string;
}

export interface InventoryTag {
  id: string;
  name: string;
  created_at: string;
}

export type InventoryCustomFieldType = "text" | "textarea" | "number" | "select" | "checkbox";

export interface InventoryCustomFieldDef {
  id: string;
  field_key: string;
  label: string;
  field_type: InventoryCustomFieldType;
  options: string[] | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface CreateCustomFieldDefInput {
  field_key: string;
  label: string;
  field_type: InventoryCustomFieldType;
  options?: string[];
  sort_order?: number;
}
