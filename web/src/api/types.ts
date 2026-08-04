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

// A requisition is an internal ID for an order sent to a vendor. It's
// typically fulfilled across many partial deliveries over time, not one
// truck — quantity_received here is derived (summed from accepted/
// conditional_use delivery line items), never stored.
export interface Requisition {
  id: string;
  requisition_number: string;
  supplier: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  line_item_count: number;
  quantity_ordered: string;
  quantity_received: string;
}

export interface RequisitionLineItem {
  id: string;
  requisition_id: string;
  inventory_item_id: string;
  description: string | null;
  quantity_ordered: string;
  created_at: string;
  item_sku: string;
  item_name: string;
  quantity_received: string;
}

export interface RequisitionDetail {
  id: string;
  requisition_number: string;
  supplier: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  line_items: RequisitionLineItem[];
}

export interface CreateRequisitionLineItemInput {
  inventory_item_id: string;
  description?: string;
  quantity_ordered: string;
}

export interface CreateRequisitionInput {
  requisition_number: string;
  supplier?: string;
  notes?: string;
  line_items?: CreateRequisitionLineItemInput[];
}

export type DeliveryStatus = "open" | "closed";
export type DeliveryLineDisposition = "accept" | "conditional_use" | "reject";

// A receiving report: one truck/shipment arriving on site, inspected against
// a requisition (optional — material can arrive unlinked to any requisition).
export interface Delivery {
  id: string;
  report_number: number;
  requisition_id: string | null;
  requisition_number: string | null;
  supplier: string | null;
  bill_of_lading_no: string | null;
  truck_number: string | null;
  received_date: string;
  status: DeliveryStatus;
  accepted_by_supervision: boolean;
  received_in_good_condition: boolean;
  conforms_to_specifications: boolean;
  qc_notes: string | null;
  accepted_by: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  line_item_count: number;
}

export interface DeliveryLineItem {
  id: string;
  delivery_id: string;
  requisition_line_item_id: string | null;
  inventory_item_id: string;
  shipment_number: string | null;
  description: string | null;
  quantity_received: string;
  condition: string | null;
  properly_marked: boolean | null;
  disposition: DeliveryLineDisposition;
  note: string | null;
  created_at: string;
  item_sku: string;
  item_name: string;
}

export interface DeliveryDetail {
  id: string;
  report_number: number;
  requisition_id: string | null;
  requisition_number: string | null;
  supplier: string | null;
  bill_of_lading_no: string | null;
  truck_number: string | null;
  received_date: string;
  status: DeliveryStatus;
  accepted_by_supervision: boolean;
  received_in_good_condition: boolean;
  conforms_to_specifications: boolean;
  qc_notes: string | null;
  accepted_by: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  line_items: DeliveryLineItem[];
}

export interface CreateDeliveryInput {
  requisition_id?: string;
  supplier?: string;
  bill_of_lading_no?: string;
  truck_number?: string;
  received_date?: string;
}

// All fields optional — PATCH semantics.
export interface UpdateDeliveryInput {
  status?: DeliveryStatus;
  accepted_by_supervision?: boolean;
  received_in_good_condition?: boolean;
  conforms_to_specifications?: boolean;
  qc_notes?: string | null;
  accepted_by?: string | null;
}

export interface AddDeliveryLineItemInput {
  requisition_line_item_id?: string;
  inventory_item_id: string;
  shipment_number?: string;
  description?: string;
  quantity_received: string;
  condition?: string;
  properly_marked?: boolean;
  disposition: DeliveryLineDisposition;
  note?: string;
  location?: string;
}
