// Shared envelope for every cursor-paginated list endpoint.
export interface ListResponse<T> {
  data: T[];
  nextCursor: string | null;
  hasMore: boolean;
}

// Shared query params every list endpoint accepts; module-specific extra
// filters are added via an intersection type at the call site.
export interface ListParams<Sort extends string = string> {
  cursor?: string;
  limit?: number;
  sort?: Sort;
  order?: "asc" | "desc";
  q?: string;
}

// Temporary local login (see BUILD_PLAN.md) — replaced by Azure AD in Phase 3.
export type UserRole = "admin" | "manager" | "member";

export interface PublicUser {
  id: string;
  email: string;
  display_name: string;
  role: UserRole;
  has_password: boolean;
  created_at: string;
}

export interface LoginResponse {
  token: string;
  user: PublicUser;
}

export interface CreateUserInput {
  email: string;
  display_name: string;
  role: UserRole;
  password: string;
}

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

export type DrawingStatus = "draft" | "in_review" | "approved" | "superseded";

// current_revision_id is a convenience pointer only (CLAUDE.md rule 2) -
// drawing_revisions rows are append-only, never edited or deleted, so the
// full history in DrawingDetail.revisions is the source of truth.
export interface Drawing {
  id: string;
  drawing_number: string;
  title: string;
  discipline: string | null;
  drawing_type: string | null;
  area: string | null;
  status: DrawingStatus;
  current_revision_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  current_revision_code: string | null;
  revision_count: number;
}

export interface DrawingRevision {
  id: string;
  drawing_id: string;
  revision_code: string;
  notes: string | null;
  external_link: string | null;
  created_by: string | null;
  created_at: string;
}

export interface DrawingDetail {
  id: string;
  drawing_number: string;
  title: string;
  discipline: string | null;
  drawing_type: string | null;
  area: string | null;
  status: DrawingStatus;
  current_revision_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  revisions: DrawingRevision[];
}

export interface CreateDrawingInput {
  drawing_number: string;
  title: string;
  discipline?: string;
  drawing_type?: string;
  area?: string;
  status?: DrawingStatus;
}

// All fields optional - PATCH semantics.
export interface UpdateDrawingInput {
  title?: string;
  discipline?: string | null;
  drawing_type?: string | null;
  area?: string | null;
  status?: DrawingStatus;
}

export interface AddRevisionInput {
  revision_code: string;
  notes?: string;
  external_link?: string;
}

// Polymorphic - one table for every entity type (see db/schema.sql).
// storage_key/graph_drive_id/graph_item_id are backend-storage internals,
// never used directly by the frontend (use attachmentFileUrl() instead).
export type AttachmentEntityType = "inventory_item" | "delivery" | "drawing_revision" | "log_entry";

export interface Attachment {
  id: string;
  entity_type: AttachmentEntityType;
  entity_id: string;
  file_name: string;
  content_type: string | null;
  size_bytes: number | null;
  uploaded_by: string | null;
  created_at: string;
}

// One row per released tag/spool from the real "Mechanical Log" Excel export
// (logs_samples/Mechanical Log.csv) - a dedicated log, not linked to
// inventory_items or delivery_line_items. All fields are nullable: the
// source data itself is sparse (many rows have no tag number at all).
export interface MechanicalLogItem {
  id: string;
  release: string | null;
  supplier: string | null;
  review: string | null;
  tag_number: string | null;
  qty_released: string | null;
  unit: string | null;
  size: string | null;
  description: string | null;
  material: string | null;
  lining: string | null;
  coating: string | null;
  release_date: string | null;
  due_date: string | null;
  area: string | null;
  system: string | null;
  contract_dwg: string | null;
  system2: string | null;
  shop_dwg: string | null;
  delivered_qty: string | null;
  need_qty: string | null;
  received_on: string | null;
  received_by: string | null;
  storage_location: string | null;
  notes: string | null;
  estimate_cost: string | null;
  contract_unit_price: string | null;
  contract_extended_price: string | null;
  above_below: string | null;
  invoice_no: string | null;
  invoice_unit_price: string | null;
  invoice_extended_price: string | null;
  delta_invoice_contract: string | null;
  qty_invoiced_to_date: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

// Same shape for create and update (PATCH semantics: omit to leave
// unchanged, null to clear).
export type MechanicalLogItemInput = Partial<
  Omit<MechanicalLogItem, "id" | "created_by" | "created_at" | "updated_at">
>;

// ---- Concrete Log (see CONCRETE_LOG_SPEC.md) ----

export interface ConcreteSettings {
  id: string;
  job_number: string;
  job_name: string;
  start_date: string;
  total_est_cy: string | null;
  created_at: string;
  updated_at: string;
}

export type ConcreteSettingsInput = Partial<Omit<ConcreteSettings, "id" | "created_at" | "updated_at">>;

export interface ConcreteMixDesign {
  id: string;
  supplier: string;
  concrete_class: string | null;
  mix_type: string | null;
  mix_number: string;
  type_of_work: string | null;
  design_strength_psi: number | null;
  slump_range: string | null;
  air_range: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export type ConcreteMixDesignInput = Partial<Omit<ConcreteMixDesign, "id" | "created_at" | "updated_at">>;

export interface ConcreteStructure {
  id: string;
  name: string;
  est_cy: string | null;
  est_cost: string | null;
  created_at: string;
  updated_at: string;
}

export type ConcreteStructureInput = Partial<Omit<ConcreteStructure, "id" | "created_at" | "updated_at">>;

export type SampleResult = "pass" | "fail" | null;

export interface ConcreteSample {
  id: string;
  pour_id: string;
  report_number: string | null;
  seven_day_psi: string | null;
  seven_day_entered_on: string | null;
  twenty_eight_day_psi: string | null;
  twenty_eight_day_entered_on: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  // Derived - never sent on write.
  result: SampleResult;
  margin_above_design: number | null;
}

export type ConcreteSampleInput = Partial<
  Omit<ConcreteSample, "id" | "pour_id" | "created_at" | "updated_at" | "result" | "margin_above_design">
>;

export interface ConcretePour {
  id: string;
  pour_date: string;
  location: string;
  structure_id: string | null;
  mix_design_id: string | null;
  design_strength_psi: number;
  yds_required: string | null;
  yds_delivered: string | null;
  yds_installed: string | null;
  is_subcontractor: boolean;
  poured_by: string | null;
  invoice_number: string | null;
  invoice_total: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  // Derived - never sent on write.
  month: string;
  over_under_required: number | null;
  waste: number | null;
  sample_count: number;
  seven_day_avg: number | null;
  twenty_eight_day_avg: number | null;
  seven_day_overdue: boolean;
  twenty_eight_day_overdue: boolean;
  samples: ConcreteSample[];
}

export interface CreatePourInput {
  pour_date: string;
  location: string;
  structure_id?: string | null;
  mix_design_id?: string | null;
  design_strength_psi: number;
  yds_required?: string | null;
  yds_delivered?: string | null;
  yds_installed?: string | null;
  is_subcontractor?: boolean;
  poured_by?: string | null;
  invoice_number?: string | null;
  invoice_total?: string | null;
  notes?: string | null;
}

export type UpdatePourInput = Partial<CreatePourInput>;

export interface PumpTruckRental {
  id: string;
  rental_date: string;
  location: string;
  truck_size_requested: string | null;
  truck_size_sent: string | null;
  hours: string | null;
  invoice_number: string | null;
  amount: string | null;
  cubic_yards: string | null;
  date_approved: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  // Derived - never sent on write.
  per_cy: number | null;
}

export type PumpTruckRentalInput = Partial<
  Omit<PumpTruckRental, "id" | "created_by" | "created_at" | "updated_at" | "per_cy">
>;

export interface ConcreteCredit {
  id: string;
  date_received: string;
  amount: string;
  date_approved: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export type ConcreteCreditInput = Partial<Omit<ConcreteCredit, "id" | "created_by" | "created_at" | "updated_at">>;

export interface ConcreteSummaryStructureRow {
  id: string;
  name: string;
  est_cy: number | null;
  est_cost: number | null;
  jtd_yds: number;
  jtd_cost: number;
  diff_cy: number | null;
  diff_cost: number | null;
  est_rate: number | null;
  actual_rate: number | null;
}

export interface ConcreteSummary {
  total_cy_placed: number;
  total_est_cy: number | null;
  percent_complete: number | null;
  monthly: { month: string; cy: number }[];
  structures: ConcreteSummaryStructureRow[];
  pass_count: number;
  fail_count: number;
  pass_rate: number | null;
  avg_margin_above_design: number | null;
}

export interface WeeklyReportSample extends Omit<ConcreteSample, "pour_id"> {
  pour: { id: string; pour_date: string; location: string; design_strength_psi: number };
}

export interface WeeklyReport {
  week_start: string;
  week_ending: string;
  seven_day_results: WeeklyReportSample[];
  twenty_eight_day_results: WeeklyReportSample[];
  counts: {
    seven_day_results: number;
    twenty_eight_day_pass: number;
    twenty_eight_day_fail: number;
  };
}
