import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ApiError } from "../api/client";
import { createMechanicalLogItem, getMechanicalLogItem, updateMechanicalLogItem } from "../api/mechanicalLog";
import { FulfillmentBar } from "../components/FulfillmentBar";
import type { MechanicalLogItemDetail, MechanicalLogItemInput } from "../api/types";

// Every field is a plain string in local form state (even dates/decimals) so
// the user can type freely and only round-trips to the API on Save - same
// approach as InventoryDetailPage.tsx, and same CLAUDE.md rule: never do
// float arithmetic on quantities/money, just pass the string through.
interface EditableForm {
  release: string;
  supplier: string;
  review: string;
  tag_number: string;
  qty_released: string;
  unit: string;
  size: string;
  description: string;
  material: string;
  lining: string;
  coating: string;
  release_date: string;
  due_date: string;
  area: string;
  system: string;
  contract_dwg: string;
  system2: string;
  shop_dwg: string;
  delivered_qty: string;
  need_qty: string;
  received_on: string;
  received_by: string;
  storage_location: string;
  notes: string;
  estimate_cost: string;
  contract_unit_price: string;
  contract_extended_price: string;
  above_below: string;
  invoice_no: string;
  invoice_unit_price: string;
  invoice_extended_price: string;
  delta_invoice_contract: string;
  qty_invoiced_to_date: string;
}

function str(value: string | null | undefined): string {
  return value ?? "";
}

function dateStr(value: string | null | undefined): string {
  return value ? value.slice(0, 10) : "";
}

function emptyForm(): EditableForm {
  return {
    release: "",
    supplier: "",
    review: "",
    tag_number: "",
    qty_released: "",
    unit: "",
    size: "",
    description: "",
    material: "",
    lining: "",
    coating: "",
    release_date: "",
    due_date: "",
    area: "",
    system: "",
    contract_dwg: "",
    system2: "",
    shop_dwg: "",
    delivered_qty: "",
    need_qty: "",
    received_on: "",
    received_by: "",
    storage_location: "",
    notes: "",
    estimate_cost: "",
    contract_unit_price: "",
    contract_extended_price: "",
    above_below: "",
    invoice_no: "",
    invoice_unit_price: "",
    invoice_extended_price: "",
    delta_invoice_contract: "",
    qty_invoiced_to_date: "",
  };
}

function buildForm(item: MechanicalLogItemDetail): EditableForm {
  return {
    release: str(item.release),
    supplier: str(item.supplier),
    review: str(item.review),
    tag_number: str(item.tag_number),
    qty_released: str(item.qty_released),
    unit: str(item.unit),
    size: str(item.size),
    description: str(item.description),
    material: str(item.material),
    lining: str(item.lining),
    coating: str(item.coating),
    release_date: dateStr(item.release_date),
    due_date: dateStr(item.due_date),
    area: str(item.area),
    system: str(item.system),
    contract_dwg: str(item.contract_dwg),
    system2: str(item.system2),
    shop_dwg: str(item.shop_dwg),
    delivered_qty: str(item.delivered_qty),
    need_qty: str(item.need_qty),
    received_on: dateStr(item.received_on),
    received_by: str(item.received_by),
    storage_location: str(item.storage_location),
    notes: str(item.notes),
    estimate_cost: str(item.estimate_cost),
    contract_unit_price: str(item.contract_unit_price),
    contract_extended_price: str(item.contract_extended_price),
    above_below: str(item.above_below),
    invoice_no: str(item.invoice_no),
    invoice_unit_price: str(item.invoice_unit_price),
    invoice_extended_price: str(item.invoice_extended_price),
    delta_invoice_contract: str(item.delta_invoice_contract),
    qty_invoiced_to_date: str(item.qty_invoiced_to_date),
  };
}

function nullIfBlank(value: string): string | null {
  const t = value.trim();
  return t === "" ? null : t;
}

function toPayload(form: EditableForm): MechanicalLogItemInput {
  const payload: Record<string, string | null> = {};
  for (const [key, value] of Object.entries(form)) {
    payload[key] = nullIfBlank(value);
  }
  return payload as MechanicalLogItemInput;
}

export function MechanicalLogDetailPage() {
  const { id } = useParams<{ id: string }>();
  const isNew = id === "new";
  const navigate = useNavigate();

  const [item, setItem] = useState<MechanicalLogItemDetail | null>(null);
  const [form, setForm] = useState<EditableForm>(emptyForm());
  const [loading, setLoading] = useState(!isNew);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  async function refresh() {
    if (isNew || !id) return;
    setLoading(true);
    try {
      const loaded = await getMechanicalLogItem(id);
      setItem(loaded);
      setForm(buildForm(loaded));
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load mechanical log entry");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  function updateForm(patch: Partial<EditableForm>) {
    setForm((f) => ({ ...f, ...patch }));
  }

  function handleCancel() {
    if (item) setForm(buildForm(item));
    setSaveError(null);
  }

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaveError(null);
    try {
      if (isNew) {
        const created = await createMechanicalLogItem(toPayload(form));
        navigate(`/mechanical-log/${created.id}`, { replace: true });
      } else if (id) {
        await updateMechanicalLogItem(id, toPayload(form));
        await refresh();
      }
    } catch (err) {
      setSaveError(err instanceof ApiError ? err.message : "Failed to save mechanical log entry");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p>Loading…</p>;
  if (error) return <p className="error">{error}</p>;
  if (!isNew && (!item || !id)) return <p>Mechanical log entry not found.</p>;

  return (
    <div>
      <div className="detail-topbar">
        <nav className="detail-breadcrumb" aria-label="Breadcrumb">
          <Link to="/mechanical-log">Mechanical Log</Link>
          <span className="detail-breadcrumb-sep">&rsaquo;</span>
          <span>{isNew ? "New entry" : form.description || form.tag_number || "Entry"}</span>
        </nav>
        {item && (
          <div className="detail-meta">
            Release: <strong>{item.release ?? "—"}</strong> &middot; Updated{" "}
            {new Date(item.updated_at).toLocaleString()}
          </div>
        )}
      </div>

      <form onSubmit={handleSave}>
        <div className="detail-title-bar">
          <input
            className="detail-title-input"
            value={form.description}
            onChange={(e) => updateForm({ description: e.target.value })}
            aria-label="Description"
            placeholder="Description"
          />
          <div className="detail-title-actions">
            <button type="button" className="button-secondary" onClick={handleCancel} disabled={saving}>
              Cancel
            </button>
            <button type="submit" disabled={saving}>
              {saving ? "Saving…" : isNew ? "Create entry" : "Save"}
            </button>
          </div>
        </div>

        {saveError && <p className="error">{saveError}</p>}

        <div className="detail-stats">
          <div className="detail-stat-card">
            <div className="detail-stat-label">
              <span>Qty Released</span>
              <input
                className="detail-unit-input"
                value={form.unit}
                onChange={(e) => updateForm({ unit: e.target.value })}
                aria-label="Unit"
                placeholder="unit"
              />
            </div>
            <input
              className="detail-stat-input"
              type="number"
              step="any"
              value={form.qty_released}
              onChange={(e) => updateForm({ qty_released: e.target.value })}
              aria-label="Qty released"
            />
          </div>

          <div className="detail-stat-card">
            <div className="detail-stat-label">
              <span>Delivered Qty</span>
            </div>
            <input
              className="detail-stat-input"
              type="number"
              step="any"
              value={form.delivered_qty}
              onChange={(e) => updateForm({ delivered_qty: e.target.value })}
              aria-label="Delivered quantity"
            />
          </div>

          <div className="detail-stat-card">
            <div className="detail-stat-label">
              <span>Need Qty</span>
            </div>
            <input
              className="detail-stat-input"
              type="number"
              step="any"
              value={form.need_qty}
              onChange={(e) => updateForm({ need_qty: e.target.value })}
              aria-label="Need quantity"
            />
          </div>

          <div className="detail-stat-card">
            <div className="detail-stat-label">
              <span>Contract Extended Price</span>
            </div>
            <div className="detail-input-prefix">
              <span>$</span>
              <input
                type="number"
                step="any"
                value={form.contract_extended_price}
                onChange={(e) => updateForm({ contract_extended_price: e.target.value })}
                aria-label="Contract extended price"
              />
            </div>
          </div>
        </div>

        <div className="detail-grid">
          <div className="detail-col">
            <div className="card detail-card">
              <h2>Release Details</h2>
              <label>
                Tag Number
                <input value={form.tag_number} onChange={(e) => updateForm({ tag_number: e.target.value })} />
              </label>
              <label>
                Release #
                <input value={form.release} onChange={(e) => updateForm({ release: e.target.value })} />
              </label>
              <label>
                Supplier
                <input value={form.supplier} onChange={(e) => updateForm({ supplier: e.target.value })} />
              </label>
              <label>
                Review
                <textarea rows={2} value={form.review} onChange={(e) => updateForm({ review: e.target.value })} />
              </label>
              <label>
                Size
                <input value={form.size} onChange={(e) => updateForm({ size: e.target.value })} />
              </label>
              <label>
                Material
                <input value={form.material} onChange={(e) => updateForm({ material: e.target.value })} />
              </label>
              <label>
                Lining
                <input value={form.lining} onChange={(e) => updateForm({ lining: e.target.value })} />
              </label>
              <label>
                Coating
                <input value={form.coating} onChange={(e) => updateForm({ coating: e.target.value })} />
              </label>
              <label>
                Release Date
                <input
                  type="date"
                  value={form.release_date}
                  onChange={(e) => updateForm({ release_date: e.target.value })}
                />
              </label>
              <label>
                Due Date
                <input type="date" value={form.due_date} onChange={(e) => updateForm({ due_date: e.target.value })} />
              </label>
            </div>

            <div className="card detail-card">
              <h2>Location &amp; Drawings</h2>
              <label>
                Area
                <input value={form.area} onChange={(e) => updateForm({ area: e.target.value })} />
              </label>
              <label>
                System
                <input value={form.system} onChange={(e) => updateForm({ system: e.target.value })} />
              </label>
              <label>
                System 2
                <input value={form.system2} onChange={(e) => updateForm({ system2: e.target.value })} />
              </label>
              <label>
                Contract Dwg
                <input value={form.contract_dwg} onChange={(e) => updateForm({ contract_dwg: e.target.value })} />
              </label>
              <label>
                Shop Dwg
                <input value={form.shop_dwg} onChange={(e) => updateForm({ shop_dwg: e.target.value })} />
              </label>
              <label>
                Storage Location
                <input
                  value={form.storage_location}
                  onChange={(e) => updateForm({ storage_location: e.target.value })}
                />
              </label>
            </div>
          </div>

          <div className="detail-col">
            <div className="card detail-card">
              <h2>Receiving</h2>
              <label>
                Received On
                <input
                  type="date"
                  value={form.received_on}
                  onChange={(e) => updateForm({ received_on: e.target.value })}
                />
              </label>
              <label>
                Received By
                <input value={form.received_by} onChange={(e) => updateForm({ received_by: e.target.value })} />
              </label>
              <label>
                Above / Below
                <input value={form.above_below} onChange={(e) => updateForm({ above_below: e.target.value })} />
              </label>
              <label>
                Notes
                <textarea rows={3} value={form.notes} onChange={(e) => updateForm({ notes: e.target.value })} />
              </label>
            </div>

            <div className="card detail-card">
              <h2>Pricing &amp; Invoicing</h2>
              <label>
                Estimate Cost
                <input
                  type="number"
                  step="any"
                  value={form.estimate_cost}
                  onChange={(e) => updateForm({ estimate_cost: e.target.value })}
                />
              </label>
              <label>
                Contract Unit Price
                <input
                  type="number"
                  step="any"
                  value={form.contract_unit_price}
                  onChange={(e) => updateForm({ contract_unit_price: e.target.value })}
                />
              </label>
              <label>
                Invoice No.
                <input value={form.invoice_no} onChange={(e) => updateForm({ invoice_no: e.target.value })} />
              </label>
              <label>
                Invoice Unit Price
                <input
                  type="number"
                  step="any"
                  value={form.invoice_unit_price}
                  onChange={(e) => updateForm({ invoice_unit_price: e.target.value })}
                />
              </label>
              <label>
                Invoice Extended Price
                <input
                  type="number"
                  step="any"
                  value={form.invoice_extended_price}
                  onChange={(e) => updateForm({ invoice_extended_price: e.target.value })}
                />
              </label>
              <label>
                Delta (Invoice-Contract)
                <input
                  type="number"
                  step="any"
                  value={form.delta_invoice_contract}
                  onChange={(e) => updateForm({ delta_invoice_contract: e.target.value })}
                />
              </label>
              <label>
                Qty Invoiced to Date
                <input
                  type="number"
                  step="any"
                  value={form.qty_invoiced_to_date}
                  onChange={(e) => updateForm({ qty_invoiced_to_date: e.target.value })}
                />
              </label>
            </div>
          </div>
        </div>
      </form>

      {/* Procurement panel (spec §7.2) - requisition, linked inventory item,
          and every delivery line that has hit this row. Purely derived
          display, nothing here is editable. */}
      {item && (
        <section className="detail-section">
          <h2>Procurement</h2>
          <div className="card card-wide">
            <div className="inline-fields">
              <div>
                <span className="detail-field-heading">Requisition</span>
                <p>
                  {item.requisition_id ? (
                    <Link to={`/requisitions/${item.requisition_id}`}>{item.requisition_number}</Link>
                  ) : (
                    "— (release: " + (item.release ?? "unreleased") + ")"
                  )}
                </p>
              </div>
              <div>
                <span className="detail-field-heading">Inventory item</span>
                <p>
                  {item.inventory_item_id ? (
                    <Link to={`/inventory/${item.inventory_item_id}`}>{item.item_sku}</Link>
                  ) : (
                    "Not yet received"
                  )}
                </p>
              </div>
              <div>
                <span className="detail-field-heading">Fulfillment</span>
                <FulfillmentBar ordered={item.qty_released ?? "0"} received={item.quantity_received} />
              </div>
            </div>
          </div>

          <table>
            <thead>
              <tr>
                <th>Report #</th>
                <th>Date received</th>
                <th>Qty received</th>
                <th>Disposition</th>
                <th>Note</th>
              </tr>
            </thead>
            <tbody>
              {item.delivery_lines.map((line) => (
                <tr key={line.id}>
                  <td>
                    <Link to={`/deliveries/${line.delivery_id}`}>#{line.report_number}</Link>
                  </td>
                  <td>{new Date(line.received_date).toLocaleDateString()}</td>
                  <td>{line.quantity_received}</td>
                  <td>
                    <span className={`badge-neutral badge-disposition-${line.disposition}`}>
                      {line.disposition.replace("_", " ")}
                    </span>
                  </td>
                  <td>{line.note ?? "—"}</td>
                </tr>
              ))}
              {item.delivery_lines.length === 0 && (
                <tr>
                  <td colSpan={5}>No deliveries have received against this row yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}
