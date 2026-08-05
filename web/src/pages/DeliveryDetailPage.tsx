import { useEffect, useState, type FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import { ApiError } from "../api/client";
import { addDeliveryLineItem, getDelivery, updateDelivery } from "../api/deliveries";
import { getRequisition } from "../api/requisitions";
import { listItems } from "../api/inventory";
import type {
  AddDeliveryLineItemInput,
  DeliveryDetail,
  DeliveryLineDisposition,
  DeliveryStatus,
  InventoryItem,
  RequisitionDetail,
  RequisitionLineItem,
  UpdateDeliveryInput,
} from "../api/types";

const DISPOSITIONS: DeliveryLineDisposition[] = ["accept", "conditional_use", "reject"];

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

export function DeliveryDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [delivery, setDelivery] = useState<DeliveryDetail | null>(null);
  const [requisition, setRequisition] = useState<RequisitionDetail | null>(null);
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [qcForm, setQcForm] = useState<QcForm | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  async function refresh() {
    if (!id) return;
    setLoading(true);
    try {
      const detail = await getDelivery(id);
      setDelivery(detail);
      setRequisition(detail.requisition_id ? await getRequisition(detail.requisition_id) : null);
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
            <th>Shipment #</th>
            <th>Item</th>
            <th>Qty received</th>
            <th>Condition</th>
            <th>Properly marked</th>
            <th>Disposition</th>
          </tr>
        </thead>
        <tbody>
          {delivery.line_items.map((line) => (
            <tr key={line.id}>
              <td>{line.shipment_number ?? "—"}</td>
              <td>
                {line.item_sku} — {line.description ?? line.item_name}
              </td>
              <td>{line.quantity_received}</td>
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
              <td colSpan={6}>No line items recorded yet.</td>
            </tr>
          )}
        </tbody>
      </table>

      <AddLineItemForm
        items={items}
        requisitionLineItems={requisition?.line_items ?? null}
        onSubmit={async (input) => {
          await addDeliveryLineItem(id, input);
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

function AddLineItemForm({
  items,
  requisitionLineItems,
  onSubmit,
}: {
  items: InventoryItem[];
  requisitionLineItems: RequisitionLineItem[] | null;
  onSubmit: (input: AddDeliveryLineItemInput) => Promise<void>;
}) {
  const [requisitionLineItemId, setRequisitionLineItemId] = useState("");
  const [inventoryItemId, setInventoryItemId] = useState("");
  const [shipmentNumber, setShipmentNumber] = useState("");
  const [description, setDescription] = useState("");
  const [quantity, setQuantity] = useState("");
  const [condition, setCondition] = useState("GOOD");
  const [properlyMarked, setProperlyMarked] = useState(true);
  const [disposition, setDisposition] = useState<DeliveryLineDisposition>("accept");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleRequisitionLineChange(value: string) {
    setRequisitionLineItemId(value);
    const line = requisitionLineItems?.find((l) => l.id === value);
    if (line) {
      setInventoryItemId(line.inventory_item_id);
      if (!description) setDescription(line.description ?? line.item_name);
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit({
        requisition_line_item_id: requisitionLineItemId || undefined,
        inventory_item_id: inventoryItemId,
        shipment_number: shipmentNumber || undefined,
        description: description || undefined,
        quantity_received: quantity,
        condition: condition || undefined,
        properly_marked: properlyMarked,
        disposition,
      });
      setRequisitionLineItemId("");
      setInventoryItemId("");
      setShipmentNumber("");
      setDescription("");
      setQuantity("");
      setCondition("GOOD");
      setProperlyMarked(true);
      setDisposition("accept");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to add line item");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="card card-wide" onSubmit={handleSubmit}>
      <h2 style={{ margin: 0 }}>Add line item</h2>
      {requisitionLineItems && requisitionLineItems.length > 0 && (
        <label>
          Requisition line (optional — links this delivery to fulfillment tracking)
          <select value={requisitionLineItemId} onChange={(e) => handleRequisitionLineChange(e.target.value)}>
            <option value="">Not on requisition</option>
            {requisitionLineItems.map((line) => (
              <option key={line.id} value={line.id}>
                {line.item_sku} — {line.description ?? line.item_name} ({line.quantity_received} of{" "}
                {line.quantity_ordered} received)
              </option>
            ))}
          </select>
        </label>
      )}
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
      <p className="muted">
        Accept or conditional use posts a received transaction to inventory automatically. Reject posts nothing.
      </p>
      {error && <p className="error">{error}</p>}
      <button type="submit" disabled={submitting}>
        {submitting ? "Saving…" : "Add line item"}
      </button>
    </form>
  );
}
