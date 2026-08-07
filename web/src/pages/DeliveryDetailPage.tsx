import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import { ApiError } from "../api/client";
import { addDeliveryLineItem, getDelivery, updateDelivery } from "../api/deliveries";
import { listMechanicalLogItems } from "../api/mechanicalLog";
import { listItems } from "../api/inventory";
import type {
  AddDeliveryLineItemInput,
  AddDeliveryLineItemResult,
  DeliveryDetail,
  DeliveryLineDisposition,
  DeliveryStatus,
  InventoryItem,
  MechanicalLogItemWithFulfillment,
  UpdateDeliveryInput,
} from "../api/types";

const DISPOSITIONS: DeliveryLineDisposition[] = ["accept", "conditional_use", "reject"];

const FULFILLMENT_LABEL: Record<string, string> = {
  not_received: "Not received",
  partial: "Partial",
  complete: "Complete",
};

// The report-level QC fields, mirrored into local state so edits only
// persist on Save (same pattern as InventoryDetailPage's EditableForm).
interface QcForm {
  status: DeliveryStatus;
  accepted_by_supervision: boolean;
  received_in_good_condition: boolean;
  conforms_to_specifications: boolean;
  qc_notes: string;
  accepted_by: string;
}

function buildQcForm(delivery: DeliveryDetail): QcForm {
  return {
    status: delivery.status,
    accepted_by_supervision: delivery.accepted_by_supervision,
    received_in_good_condition: delivery.received_in_good_condition,
    conforms_to_specifications: delivery.conforms_to_specifications,
    qc_notes: delivery.qc_notes ?? "",
    accepted_by: delivery.accepted_by ?? "",
  };
}

// The receiving screen has to tell the user which of the two happened per
// row (spec §7.1) - kept per-line-item-id so it survives the refresh() that
// follows a save.
interface ReceiptOutcome {
  message: string;
  warning: boolean;
}

export function DeliveryDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [delivery, setDelivery] = useState<DeliveryDetail | null>(null);
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [outcomes, setOutcomes] = useState<ReceiptOutcome[]>([]);

  const [qcForm, setQcForm] = useState<QcForm | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  async function refresh() {
    if (!id) return;
    setLoading(true);
    try {
      const detail = await getDelivery(id);
      setDelivery(detail);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load delivery");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
    // Picker, not a paginated table - a large fixed limit stands in for a
    // dedicated unbounded endpoint (see the table-enhancements plan).
    listItems({ limit: 500 })
      .then((res) => setItems(res.data))
      .catch(() => setItems([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    if (delivery) setQcForm(buildQcForm(delivery));
  }, [delivery]);

  function updateQcForm(patch: Partial<QcForm>) {
    setQcForm((f) => (f ? { ...f, ...patch } : f));
  }

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    if (!qcForm || !id) return;
    setSaving(true);
    setSaveError(null);
    try {
      const input: UpdateDeliveryInput = {
        status: qcForm.status,
        accepted_by_supervision: qcForm.accepted_by_supervision,
        received_in_good_condition: qcForm.received_in_good_condition,
        conforms_to_specifications: qcForm.conforms_to_specifications,
        qc_notes: qcForm.qc_notes.trim() === "" ? null : qcForm.qc_notes,
        accepted_by: qcForm.accepted_by.trim() === "" ? null : qcForm.accepted_by,
      };
      await updateDelivery(id, input);
      await refresh();
    } catch (err) {
      setSaveError(err instanceof ApiError ? err.message : "Failed to save delivery");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p>Loading…</p>;
  if (error) return <p className="error">{error}</p>;
  if (!delivery || !id || !qcForm) return <p>Delivery not found.</p>;

  return (
    <div>
      <div className="detail-topbar">
        <nav className="detail-breadcrumb" aria-label="Breadcrumb">
          <Link to="/deliveries">Deliveries</Link>
          <span className="detail-breadcrumb-sep">&rsaquo;</span>
          <span>Report #{delivery.report_number}</span>
        </nav>
        <div className="detail-meta">
          Updated {new Date(delivery.updated_at).toLocaleString()}
        </div>
      </div>

      <div className="card card-wide">
        <div className="page-header" style={{ marginBottom: 0 }}>
          <h2 style={{ margin: 0 }}>Report #{delivery.report_number}</h2>
          <span className={`badge-neutral badge-status-${delivery.status}`}>{delivery.status}</span>
        </div>
        <div className="inline-fields">
          <div>
            <span className="detail-field-heading">Requisition</span>
            <p>
              {delivery.requisition_id ? (
                <Link to={`/requisitions/${delivery.requisition_id}`}>{delivery.requisition_number}</Link>
              ) : (
                "—"
              )}
            </p>
          </div>
          <div>
            <span className="detail-field-heading">Supplier</span>
            <p>{delivery.supplier ?? "—"}</p>
          </div>
          <div>
            <span className="detail-field-heading">Bill of lading #</span>
            <p>{delivery.bill_of_lading_no ?? "—"}</p>
          </div>
          <div>
            <span className="detail-field-heading">Truck #</span>
            <p>{delivery.truck_number ?? "—"}</p>
          </div>
          <div>
            <span className="detail-field-heading">Date received</span>
            <p>{new Date(delivery.received_date).toLocaleDateString()}</p>
          </div>
        </div>
      </div>

      <h2>Line items</h2>
      <table>
        <thead>
          <tr>
            <th>Tag / Item</th>
            <th>Qty received</th>
            <th>Condition</th>
            <th>Properly marked</th>
            <th>Disposition</th>
          </tr>
        </thead>
        <tbody>
          {delivery.line_items.map((line) => (
            <tr key={line.id}>
              <td>
                {line.mechanical_log_item_id ? (
                  <Link to={`/mechanical-log/${line.mechanical_log_item_id}`}>
                    {line.tag_number ?? "(no tag)"}
                  </Link>
                ) : (
                  <span className="muted">off-log</span>
                )}{" "}
                — {line.item_sku} — {line.description ?? line.log_description ?? line.item_name}
              </td>
              <td>
                {line.quantity_received} {line.item_unit}
              </td>
              <td>{line.condition ?? "—"}</td>
              <td>{line.properly_marked === null ? "—" : line.properly_marked ? "Yes" : "No"}</td>
              <td>
                <span className={`badge-neutral badge-disposition-${line.disposition}`}>
                  {line.disposition.replace("_", " ")}
                </span>
              </td>
            </tr>
          ))}
          {delivery.line_items.length === 0 && (
            <tr>
              <td colSpan={5}>No line items recorded yet.</td>
            </tr>
          )}
        </tbody>
      </table>

      {outcomes.length > 0 && (
        <div className="card card-wide">
          {outcomes.map((o, i) => (
            <p key={i} className={o.warning ? "warning-banner" : "receipt-outcome"}>
              {o.message}
            </p>
          ))}
        </div>
      )}

      <AddFromMechanicalLog
        deliveryId={id}
        requisitionId={delivery.requisition_id}
        onSaved={async (results) => {
          setOutcomes(
            results.map(({ result, tag }) => ({
              message: result.inventory_item_created
                ? `Created inventory item ${result.inventory_item.sku}${tag ? ` (from ${tag})` : ""}`
                : `Updated stock: ${result.inventory_item.sku} → ${result.quantity_on_hand} ${result.inventory_item.unit}`,
              warning: result.warning === "over_received",
            })),
          );
          await refresh();
        }}
      />

      <AddOffLogItemForm
        items={items}
        onSubmit={async (input) => {
          await addDeliveryLineItem(id, input);
          setOutcomes([]);
          await refresh();
        }}
      />

      <h2>Receiving quality control</h2>
      <form className="card card-wide" onSubmit={handleSave}>
        <div className="checkbox-row">
          <input
            type="checkbox"
            id="accepted_by_supervision"
            checked={qcForm.accepted_by_supervision}
            onChange={(e) => updateQcForm({ accepted_by_supervision: e.target.checked })}
          />
          <label htmlFor="accepted_by_supervision">Items have been accepted by me or under my supervision</label>
        </div>
        <div className="checkbox-row">
          <input
            type="checkbox"
            id="received_in_good_condition"
            checked={qcForm.received_in_good_condition}
            onChange={(e) => updateQcForm({ received_in_good_condition: e.target.checked })}
          />
          <label htmlFor="received_in_good_condition">Received in apparent good condition except as noted</label>
        </div>
        <div className="checkbox-row">
          <input
            type="checkbox"
            id="conforms_to_specifications"
            checked={qcForm.conforms_to_specifications}
            onChange={(e) => updateQcForm({ conforms_to_specifications: e.target.checked })}
          />
          <label htmlFor="conforms_to_specifications">
            Conforms to contract specifications except as noted herein or on supporting documents
          </label>
        </div>
        <label>
          QC notes
          <textarea rows={3} value={qcForm.qc_notes} onChange={(e) => updateQcForm({ qc_notes: e.target.value })} />
        </label>
        <label>
          Accepted by (project representative)
          <input value={qcForm.accepted_by} onChange={(e) => updateQcForm({ accepted_by: e.target.value })} />
        </label>
        <label>
          Status
          <select
            value={qcForm.status}
            onChange={(e) => updateQcForm({ status: e.target.value as DeliveryStatus })}
          >
            <option value="open">Open</option>
            <option value="closed">Closed</option>
          </select>
        </label>
        {saveError && <p className="error">{saveError}</p>}
        <button type="submit" disabled={saving}>
          {saving ? "Saving…" : "Save"}
        </button>
      </form>
    </div>
  );
}

// Per-row entry the receiver fills in once a Mechanical Log row is selected.
interface SelectionState {
  quantity: string;
  disposition: DeliveryLineDisposition;
  condition: string;
  properlyMarked: boolean;
  note: string;
}

function defaultSelection(outstanding: string): SelectionState {
  return { quantity: outstanding, disposition: "accept", condition: "GOOD", properlyMarked: true, note: "" };
}

/**
 * The screen the whole material-flow change exists to enable (spec §7.1).
 *
 * Defaults to the delivery's own requisition; a toggle widens the search to
 * the whole Mechanical Log for the ~10% of receipts that were never on it.
 * Rows already fully received are shown greyed, not hidden - hiding them
 * would make over-receipt look like missing data.
 */
function AddFromMechanicalLog({
  deliveryId,
  requisitionId,
  onSaved,
}: {
  deliveryId: string;
  requisitionId: string | null;
  onSaved: (results: { result: AddDeliveryLineItemResult; tag: string | null }[]) => Promise<void>;
}) {
  const [widen, setWiden] = useState(!requisitionId);
  const [search, setSearch] = useState("");
  const [rows, setRows] = useState<MechanicalLogItemWithFulfillment[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Map<string, SelectionState>>(new Map());
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setLoadError(null);
    listMechanicalLogItems({
      q: search || undefined,
      requisition_id: widen || !requisitionId ? undefined : requisitionId,
      limit: 200,
    })
      .then((res) => setRows(res.data))
      .catch((err) => setLoadError(err instanceof ApiError ? err.message : "Failed to load mechanical log"))
      .finally(() => setLoading(false));
  }, [search, widen, requisitionId]);

  function toggleRow(row: MechanicalLogItemWithFulfillment) {
    setSelected((prev) => {
      const next = new Map(prev);
      if (next.has(row.id)) {
        next.delete(row.id);
      } else {
        next.set(row.id, defaultSelection(row.quantity_outstanding));
      }
      return next;
    });
  }

  function updateSelection(id: string, patch: Partial<SelectionState>) {
    setSelected((prev) => {
      const next = new Map(prev);
      const existing = next.get(id);
      if (existing) next.set(id, { ...existing, ...patch });
      return next;
    });
  }

  const selectedRows = useMemo(() => rows.filter((r) => selected.has(r.id)), [rows, selected]);

  async function handleSave() {
    setSaving(true);
    setSaveError(null);
    try {
      const results: { result: AddDeliveryLineItemResult; tag: string | null }[] = [];
      // Posted one at a time (spec §7.1: "Save posts one line per
      // selection") so a mid-batch failure leaves the earlier, already-saved
      // lines in place rather than needing an all-or-nothing rollback here -
      // each addDeliveryLineItem call is already atomic on its own.
      for (const row of selectedRows) {
        const sel = selected.get(row.id)!;
        const input: AddDeliveryLineItemInput = {
          mechanical_log_item_id: row.id,
          quantity_received: sel.quantity,
          disposition: sel.disposition,
          condition: sel.condition || undefined,
          properly_marked: sel.properlyMarked,
          note: sel.note || undefined,
        };
        const result = await addDeliveryLineItem(deliveryId, input);
        results.push({ result, tag: row.tag_number });
      }
      setSelected(new Map());
      await onSaved(results);
    } catch (err) {
      setSaveError(err instanceof ApiError ? err.message : "Failed to save selected line items");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="card card-wide">
      <h2 style={{ margin: 0 }}>Add items from Mechanical Log</h2>
      <div className="table-toolbar">
        <div className="table-toolbar-filters">
          <input
            placeholder="Search tag, description, size, material, area, system…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        {requisitionId && (
          <label className="checkbox-row" style={{ margin: 0 }}>
            <input type="checkbox" checked={widen} onChange={(e) => setWiden(e.target.checked)} />
            Widen to whole Mechanical Log (escape hatch for off-requisition receipts)
          </label>
        )}
      </div>

      {loadError && <p className="error">{loadError}</p>}
      {loading ? (
        <p>Loading…</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th></th>
              <th>Tag</th>
              <th>Description</th>
              <th>Released</th>
              <th>Received</th>
              <th>Outstanding</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const complete = row.fulfillment_status === "complete";
              return (
                <tr key={row.id} className={complete ? "muted" : undefined}>
                  <td>
                    <input type="checkbox" checked={selected.has(row.id)} onChange={() => toggleRow(row)} />
                  </td>
                  <td>{row.tag_number ?? "(no tag)"}</td>
                  <td>{row.description ?? "—"}</td>
                  <td>
                    {row.qty_released ?? "0"} {row.unit}
                  </td>
                  <td>{row.quantity_received}</td>
                  <td>{row.quantity_outstanding}</td>
                  <td>
                    <span className={`badge-neutral badge-fulfillment-${row.fulfillment_status}`}>
                      {FULFILLMENT_LABEL[row.fulfillment_status]}
                    </span>
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={7}>No mechanical log rows match.</td>
              </tr>
            )}
          </tbody>
        </table>
      )}

      {selectedRows.length > 0 && (
        <div className="line-item-builder">
          <span className="detail-field-heading">Receiving details for selected rows</span>
          {selectedRows.map((row) => {
            const sel = selected.get(row.id)!;
            return (
              <div className="line-item-row" key={row.id}>
                <span>
                  {row.tag_number ?? "(no tag)"} — {row.description ?? "—"}
                </span>
                <label>
                  Qty received
                  <input
                    type="number"
                    step="any"
                    min="0"
                    value={sel.quantity}
                    onChange={(e) => updateSelection(row.id, { quantity: e.target.value })}
                    required
                  />
                </label>
                <label>
                  Disposition
                  <select
                    value={sel.disposition}
                    onChange={(e) =>
                      updateSelection(row.id, { disposition: e.target.value as DeliveryLineDisposition })
                    }
                  >
                    {DISPOSITIONS.map((d) => (
                      <option key={d} value={d}>
                        {d.replace("_", " ")}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Condition
                  <input
                    value={sel.condition}
                    onChange={(e) => updateSelection(row.id, { condition: e.target.value })}
                  />
                </label>
                <label className="checkbox-row">
                  <input
                    type="checkbox"
                    checked={sel.properlyMarked}
                    onChange={(e) => updateSelection(row.id, { properlyMarked: e.target.checked })}
                  />
                  Properly marked
                </label>
                <label>
                  Note
                  <input value={sel.note} onChange={(e) => updateSelection(row.id, { note: e.target.value })} />
                </label>
              </div>
            );
          })}
          <p className="muted">
            Accept or conditional use posts a received transaction to inventory automatically and creates the
            inventory item if it doesn&rsquo;t exist yet. Reject posts nothing. Over-receipt is allowed and
            flagged, not blocked.
          </p>
          {saveError && <p className="error">{saveError}</p>}
          <button type="button" onClick={handleSave} disabled={saving}>
            {saving ? "Saving…" : `Save ${selectedRows.length} line item${selectedRows.length === 1 ? "" : "s"}`}
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * Secondary path for the ~10% of receipts that were never on the Mechanical
 * Log - picks straight from Inventory (spec §7.1).
 */
function AddOffLogItemForm({
  items,
  onSubmit,
}: {
  items: InventoryItem[];
  onSubmit: (input: AddDeliveryLineItemInput) => Promise<void>;
}) {
  const [inventoryItemId, setInventoryItemId] = useState("");
  const [shipmentNumber, setShipmentNumber] = useState("");
  const [description, setDescription] = useState("");
  const [quantity, setQuantity] = useState("");
  const [condition, setCondition] = useState("GOOD");
  const [properlyMarked, setProperlyMarked] = useState(true);
  const [disposition, setDisposition] = useState<DeliveryLineDisposition>("accept");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit({
        inventory_item_id: inventoryItemId,
        shipment_number: shipmentNumber || undefined,
        description: description || undefined,
        quantity_received: quantity,
        condition: condition || undefined,
        properly_marked: properlyMarked,
        disposition,
      });
      setInventoryItemId("");
      setShipmentNumber("");
      setDescription("");
      setQuantity("");
      setCondition("GOOD");
      setProperlyMarked(true);
      setDisposition("accept");
      setExpanded(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to add line item");
    } finally {
      setSubmitting(false);
    }
  }

  if (!expanded) {
    return (
      <button type="button" className="button-secondary" onClick={() => setExpanded(true)}>
        Add off-log item
      </button>
    );
  }

  return (
    <form className="card card-wide" onSubmit={handleSubmit}>
      <h2 style={{ margin: 0 }}>Add off-log item</h2>
      <p className="muted">
        For material that was never on the Mechanical Log. Receives straight against an existing Inventory item.
      </p>
      <label>
        Item
        <select value={inventoryItemId} onChange={(e) => setInventoryItemId(e.target.value)} required>
          <option value="">Select item…</option>
          {items.map((item) => (
            <option key={item.id} value={item.id}>
              {item.sku} — {item.name}
            </option>
          ))}
        </select>
      </label>
      <div className="inline-fields">
        <label>
          Shipment #
          <input value={shipmentNumber} onChange={(e) => setShipmentNumber(e.target.value)} />
        </label>
        <label>
          Qty received
          <input
            type="number"
            step="any"
            min="0"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            required
          />
        </label>
      </div>
      <label>
        Description
        <input value={description} onChange={(e) => setDescription(e.target.value)} />
      </label>
      <div className="inline-fields">
        <label>
          Condition
          <input value={condition} onChange={(e) => setCondition(e.target.value)} />
        </label>
        <label>
          Disposition
          <select
            value={disposition}
            onChange={(e) => setDisposition(e.target.value as DeliveryLineDisposition)}
          >
            {DISPOSITIONS.map((d) => (
              <option key={d} value={d}>
                {d.replace("_", " ")}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="checkbox-row">
        <input
          type="checkbox"
          id="properly_marked"
          checked={properlyMarked}
          onChange={(e) => setProperlyMarked(e.target.checked)}
        />
        <label htmlFor="properly_marked">Manufacturer&rsquo;s label/tag properly affixed</label>
      </div>
      {error && <p className="error">{error}</p>}
      <div className="inline-fields">
        <button type="submit" disabled={submitting}>
          {submitting ? "Saving…" : "Add line item"}
        </button>
        <button type="button" className="button-secondary" onClick={() => setExpanded(false)} disabled={submitting}>
          Cancel
        </button>
      </div>
    </form>
  );
}
