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

export interface MechanicalLogSource {
  id: string;
  tag_number: string | null;
  description: string | null;
  release: string | null;
  qty_released: string | null;
  requisition_id: string | null;
  requisition_number: string | null;
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
  // The Mechanical Log rows that claimed this item (spec §7.4) - can be
  // several: the same tag legitimately recurs across releases and they
  // converge on one inventory item (invariant §8.5).
  mechanical_log_sources: MechanicalLogSource[];
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

// Derived receipt status for a Mechanical Log row (MATERIAL_FLOW_SPEC.md
// §4.3) - never stored, computed server-side from accepted/conditional_use
// delivery lines against qty_released.
export type FulfillmentStatus = "not_received" | "partial" | "complete";

// A requisition is cut from the Mechanical Log - Release number IS the
// requisition number (spec §2). It's typically fulfilled across many partial
// deliveries over time, not one truck. quantity_ordered/quantity_received
// here are derived (rolled up from the requisition's Mechanical Log rows),
// never stored.
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

// A requisition's line items ARE its Mechanical Log rows (spec §3.2) - there
// is no separate requisition_line_items entity anymore.
export interface RequisitionLineItem {
  id: string;
  tag_number: string | null;
  description: string | null;
  qty_released: string | null;
  unit: string | null;
  inventory_item_id: string | null;
  item_sku: string | null;
  item_name: string | null;
  quantity_received: string;
  quantity_outstanding: string;
  fulfillment_status: FulfillmentStatus;
}

// The raw delivery row, not the list-endpoint's enriched Delivery (no
// requisition_number/line_item_count - those are computed by listDeliveries,
// not by getRequisition's nested include).
export interface RequisitionDeliverySummary {
  id: string;
  report_number: number;
  requisition_id: string | null;
  supplier: string | null;
  bill_of_lading_no: string | null;
  truck_number: string | null;
  received_date: string;
  status: DeliveryStatus;
  created_at: string;
  updated_at: string;
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
  deliveries: RequisitionDeliverySummary[];
  quantity_ordered: string;
  quantity_received: string;
  quantity_outstanding: string;
  fulfillment_status: FulfillmentStatus;
}

// requisition_number stays free-text, never coerced to an integer (spec
// §5.1). A requisition claims existing Mechanical Log rows rather than being
// given its own ordered quantities.
export interface CreateRequisitionInput {
  requisition_number: string;
  supplier?: string;
  notes?: string;
  mechanical_log_item_ids?: string[];
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
  mechanical_log_item_id: string | null;
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
  item_unit: string;
  // Present only when mechanical_log_item_id is set - the ~10% of off-log
  // receipts have none of these (spec §3.1).
  tag_number: string | null;
  log_description: string | null;
  qty_released: string | null;
  // The LOG ROW's cumulative totals across every delivery line that has hit
  // it - not this line's own `quantity_received` above, which is why it's
  // nested rather than flattened onto the line.
  log_fulfillment: {
    quantity_received: string;
    quantity_outstanding: string;
    fulfillment_status: FulfillmentStatus;
  } | null;
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

// Receiving is normally driven off the Mechanical Log; inventory_item_id is
// the escape hatch for the ~10% of material that was never on it (spec §5.2).
export interface AddDeliveryLineItemInput {
  mechanical_log_item_id?: string;
  inventory_item_id?: string;
  shipment_number?: string;
  description?: string;
  quantity_received: string;
  condition?: string;
  properly_marked?: boolean;
  disposition: DeliveryLineDisposition;
  note?: string;
  location?: string;
}

// What the receiving screen needs to tell the user which of the two
// happened - "Created inventory item ABC-123" vs. "Updated stock: ABC-123 ->
// 78 LF" (spec §7.1) - plus the over-receipt warning, which is informational
// rather than blocking.
export interface AddDeliveryLineItemResult {
  line_item: DeliveryLineItem;
  inventory_item: { id: string; sku: string; name: string; unit: string };
  inventory_item_created: boolean;
  quantity_on_hand: string;
  warning: "over_received" | null;
  ordered: string | null;
  received_to_date: string | null;
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
export type AttachmentEntityType = "inventory_item" | "delivery" | "drawing_revision" | "log_entry" | "asset";

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
// (logs_samples/Mechanical Log.csv). This is the HEAD of the material chain
// (MATERIAL_FLOW_SPEC.md): requisitions are cut from it (Release IS the
// requisition number) and deliveries receive against it. All source-CSV
// fields are nullable: the data itself is sparse (many rows have no tag
// number at all). delivered_qty/need_qty/received_on/received_by are frozen
// import history - the live numbers are quantity_received/quantity_outstanding/
// fulfillment_status below, from the Delivery Log.
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
  // Nullable forever - blank/EMAIL/Hold releases stay unclaimed (spec §3.3).
  requisition_id: string | null;
  // Null until first receipt, then claimed once by the receiving service and
  // not user-editable (spec §4.1).
  inventory_item_id: string | null;
}

// Fields the list/detail endpoints add on top of the raw row - all derived,
// never stored (spec §4.3).
export interface MechanicalLogItemWithFulfillment extends MechanicalLogItem {
  requisition_number: string | null;
  item_sku: string | null;
  quantity_received: string;
  quantity_outstanding: string;
  fulfillment_status: FulfillmentStatus;
}

export interface MechanicalLogDeliveryLine {
  id: string;
  delivery_id: string;
  report_number: number;
  received_date: string;
  quantity_received: string;
  disposition: DeliveryLineDisposition;
  note: string | null;
}

// Detail view adds the Procurement panel data (spec §7.2): the requisition
// this row was released on, the item it resolved to, and every delivery
// line that has hit it.
export interface MechanicalLogItemDetail extends MechanicalLogItemWithFulfillment {
  item_name: string | null;
  delivery_lines: MechanicalLogDeliveryLine[];
}

// Same shape for create and update (PATCH semantics: omit to leave
// unchanged, null to clear). inventory_item_id is intentionally absent - not
// user-editable in v1.
export type MechanicalLogItemInput = Partial<
  Omit<
    MechanicalLogItem,
    "id" | "created_by" | "created_at" | "updated_at" | "inventory_item_id"
  >
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

// ============================================================
// Task Management — Lists + Tasks (Phase 1: core CRUD).
// Subtasks/checklists/watchers/attachments (Phase 2) and the
// activity feed/comments/@mentions/notifications (Phase 3) land later,
// per ccowork/TASK_MODULE_SPEC.md's phased build plan.
// ============================================================

export interface TaskList {
  id: string;
  name: string;
  color: string | null;
  archived: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateTaskListInput {
  name: string;
  color?: string;
}

export interface UpdateTaskListInput {
  name?: string;
  color?: string | null;
  archived?: boolean;
}

export type TaskStatus = "to_do" | "in_progress" | "in_review" | "complete";
export type TaskPriority = "urgent" | "high" | "normal" | "low";

// role is always "assignee" until Phase 2 adds watchers.
export interface TaskAssignee {
  user_id: string;
  role: "assignee" | "watcher";
  display_name: string;
  email: string;
}

export interface Task {
  id: string;
  list_id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority | null;
  start_date: string | null;
  due_date: string | null;
  project: string | null;
  category: string | null;
  sort_order: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  assignees: TaskAssignee[];
}

export interface CreateTaskInput {
  list_id: string;
  title: string;
  description?: string;
  status?: TaskStatus;
  priority?: TaskPriority | null;
  start_date?: string | null;
  due_date?: string | null;
  project?: string;
  category?: string;
  assignee_ids?: string[];
}

// All fields optional - PATCH semantics.
export interface UpdateTaskInput {
  list_id?: string;
  title?: string;
  description?: string | null;
  status?: TaskStatus;
  priority?: TaskPriority | null;
  start_date?: string | null;
  due_date?: string | null;
  project?: string | null;
  category?: string | null;
  assignee_ids?: string[];
}

// ── Asset Tracking ──────────────────────────────────────────────────────

export interface Site {
  id: string;
  name: string;
  code: string | null;
  description: string | null;
  default_zoom: number | null;
  timezone: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateSiteInput {
  name: string;
  code?: string;
  description?: string;
  timezone?: string;
  default_zoom?: number;
}

export type AssetGeomType = "Point" | "LineString" | "Polygon" | "MultiPolygon" | "MultiLineString";

// Decimal columns (Prisma.Decimal) serialize as strings over JSON, not
// numbers - every one of these fields needs Number(...) before arithmetic
// or passing to a map library.
export interface AssetType {
  id: string;
  code: string;
  name: string;
  category: string | null;
  parent_type_id: string | null;
  allowed_geom_types: AssetGeomType[];
  attribute_schema: Record<string, unknown>;
  ui_schema: Record<string, unknown> | null;
  default_useful_life_years: number | null;
  icon: string | null;
  color: string | null;
  schema_version: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateAssetTypeInput {
  code: string;
  name: string;
  category?: string;
  parent_type_id?: string;
  allowed_geom_types: AssetGeomType[];
  attribute_schema?: Record<string, unknown>;
  ui_schema?: Record<string, unknown>;
  default_useful_life_years?: number;
  icon?: string;
  color?: string;
}

export interface UpdateAssetTypeInput {
  name?: string;
  category?: string | null;
  parent_type_id?: string | null;
  allowed_geom_types?: AssetGeomType[];
  attribute_schema?: Record<string, unknown>;
  ui_schema?: Record<string, unknown> | null;
  default_useful_life_years?: number | null;
  icon?: string | null;
  color?: string | null;
  is_active?: boolean;
}

export interface UpdateAssetTypeResult {
  asset_type: AssetType;
  schema_changed: boolean;
  would_invalidate_count: number;
}

export type GeoJsonGeometry =
  | { type: "Point"; coordinates: [number, number] }
  | { type: "LineString"; coordinates: [number, number][] }
  | { type: "Polygon"; coordinates: [number, number][][] }
  | { type: "MultiPolygon"; coordinates: [number, number][][][] }
  | { type: "MultiLineString"; coordinates: [number, number][][] };

export type AssetStatus =
  | "planned"
  | "under_construction"
  | "active"
  | "inactive"
  | "out_of_service"
  | "abandoned_in_place"
  | "removed";

export type AssetSource = "field_gps" | "as_built" | "digitized" | "import";

export interface AssetSummary {
  id: string;
  tag: string;
  name: string;
  status: AssetStatus;
}

export interface Asset {
  id: string;
  site_id: string;
  asset_type_id: string;
  parent_id: string | null;
  tag: string;
  name: string;
  description: string | null;
  geom_type: AssetGeomType | null;
  centroid_lat: string | null;
  centroid_lon: string | null;
  elevation_ft: string | null;
  depth_below_grade_ft: string | null;
  floor_level: string | null;
  layout_id: string | null;
  status: AssetStatus;
  condition_rating: number | null;
  condition_assessed_on: string | null;
  criticality: number | null;
  manufacturer: string | null;
  model: string | null;
  serial_number: string | null;
  install_date: string | null;
  in_service_date: string | null;
  expected_life_years: number | null;
  replacement_cost: string | null;
  acquisition_cost: string | null;
  owner_dept: string | null;
  attributes: Record<string, unknown>;
  source: AssetSource | null;
  accuracy_ft: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  geom: GeoJsonGeometry | null;
  asset_type: { id: string; code: string; name: string };
}

export interface AssetDetail extends Asset {
  parent: AssetSummary | null;
  children: AssetSummary[];
  attachments: Attachment[];
}

export interface AssetFeatureCollection {
  type: "FeatureCollection";
  features: { type: "Feature"; geometry: GeoJsonGeometry | null; properties: Asset }[];
}

export interface CreateAssetInput {
  asset_type_id: string;
  parent_id?: string;
  tag: string;
  name: string;
  description?: string;
  geometry?: GeoJsonGeometry;
  elevation_ft?: number;
  depth_below_grade_ft?: number;
  floor_level?: string;
  layout_id?: string;
  status?: AssetStatus;
  condition_rating?: number;
  condition_assessed_on?: string;
  criticality?: number;
  manufacturer?: string;
  model?: string;
  serial_number?: string;
  install_date?: string;
  in_service_date?: string;
  expected_life_years?: number;
  replacement_cost?: number;
  acquisition_cost?: number;
  owner_dept?: string;
  attributes?: Record<string, unknown>;
  source?: AssetSource;
  accuracy_ft?: number;
}

// All fields optional/nullable - PATCH semantics. No `geometry` field: the
// backend's dedicated POST /assets/:id/geometry endpoint owns geometry
// edits so they don't round-trip the whole record (spec 5.1).
export interface UpdateAssetInput {
  asset_type_id?: string;
  parent_id?: string | null;
  tag?: string;
  name?: string;
  description?: string | null;
  elevation_ft?: number | null;
  depth_below_grade_ft?: number | null;
  floor_level?: string | null;
  layout_id?: string | null;
  status?: AssetStatus;
  condition_rating?: number | null;
  condition_assessed_on?: string | null;
  criticality?: number | null;
  manufacturer?: string | null;
  model?: string | null;
  serial_number?: string | null;
  install_date?: string | null;
  in_service_date?: string | null;
  expected_life_years?: number | null;
  replacement_cost?: number | null;
  acquisition_cost?: number | null;
  owner_dept?: string | null;
  attributes?: Record<string, unknown>;
  source?: AssetSource | null;
  accuracy_ft?: number | null;
}

export interface AssetsListParams {
  type?: string;
  status?: AssetStatus;
  criticality?: number;
  parent_id?: string;
  bbox?: string;
}

export interface BulkCreateAssetsResult {
  created: number;
  errors: { index: number; error: string; fields?: { path: string; message: string }[] }[];
}

// ---- Schedule (6 Week Lookahead) ----
// No pagination here - the API is intentionally unpaginated (a bounded
// ~180-row dataset), so these responses are plain arrays, not ListResponse.

export interface ScheduleSection {
  id: string;
  name: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface ScheduleSectionInput {
  name: string;
  sort_order?: number;
}

export type ScheduleEntryMode = "start_end" | "start_duration";

export interface ScheduleActivity {
  id: string;
  section_id: string;
  code: string | null;
  description: string;
  crew: string | null;
  responsibility: string | null;
  notes: string | null;
  budget_mh: string | null;
  burned_mh: string | null;
  entry_mode: ScheduleEntryMode;
  start_date: string | null;
  end_date: string | null;
  duration_days: number | null;
  night_work: boolean;
  critical_path: boolean;
  shutdown: boolean;
  sort_order: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  // Derived, read-only - never edit these client-side.
  first_day: string | null;
  last_day: string | null;
  days: number;
  delta: string | null;
}

export type ScheduleDayOverrideKind = "add" | "exclude";

// No surrogate id - the DB primary key is the composite (activity_id, day),
// per schedule_activity_days in schema.prisma. Use `day` as the React key.
export interface ScheduleDayOverride {
  activity_id: string;
  day: string;
  kind: ScheduleDayOverrideKind;
  crew_count: number | null;
  marker: string | null;
}

export interface ScheduleActivityDetail extends ScheduleActivity {
  overrides: ScheduleDayOverride[];
}

export interface ScheduleActivityInput {
  section_id?: string;
  code?: string | null;
  description?: string;
  crew?: string | null;
  responsibility?: string | null;
  notes?: string | null;
  budget_mh?: string | number | null;
  burned_mh?: string | number | null;
  entry_mode?: ScheduleEntryMode;
  start_date?: string | null;
  end_date?: string | null;
  duration_days?: number | null;
  night_work?: boolean;
  critical_path?: boolean;
  shutdown?: boolean;
  sort_order?: number;
}

export interface ScheduleActivityFilters {
  section_id?: string;
  responsibility?: string;
  crew?: string;
  night_work?: boolean;
  critical_path?: boolean;
  shutdown?: boolean;
  scheduled_between?: string;
}

export type ScheduleDayOverrideOp =
  | { action: "upsert"; day: string; kind: ScheduleDayOverrideKind; crew_count?: number | null; marker?: string | null }
  | { action: "remove"; day: string };

export interface ScheduleHoliday {
  id: string;
  day: string;
  name: string;
  created_at: string;
  updated_at: string;
}

export interface ScheduleHolidayInput {
  day: string;
  name: string;
}

export interface ScheduleGanttDay {
  date: string;
  day_of_week: "Sun" | "Mon" | "Tue" | "Wed" | "Thu" | "Fri" | "Sat";
  is_weekend: boolean;
  holiday_name: string | null;
}

export interface ScheduleGanttCell {
  date: string;
  scheduled: boolean;
  crew_count: number | null;
  marker: string | null;
}

export interface ScheduleGanttActivity {
  id: string;
  code: string | null;
  crew: string | null;
  description: string;
  responsibility: string | null;
  section_id: string;
  night_work: boolean;
  critical_path: boolean;
  shutdown: boolean;
  cells: ScheduleGanttCell[];
}

export interface ScheduleGanttSection {
  id: string;
  name: string;
  sort_order: number;
  activities: ScheduleGanttActivity[];
}

export interface ScheduleGanttResponse {
  window: { start: string; weeks: number; days: ScheduleGanttDay[] };
  sections: ScheduleGanttSection[];
  crew_totals: { date: string; total: number }[];
}
