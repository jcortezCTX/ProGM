import { useEffect, useState, type FormEvent, type KeyboardEvent } from "react";
import { Link, useParams } from "react-router-dom";
import { ApiError } from "../api/client";
import {
  getItem,
  getTransactionHistory,
  listCustomFieldDefs,
  listTags,
  recordTransaction,
  updateItem,
} from "../api/inventory";
import type {
  InventoryCustomFieldDef,
  InventoryItemDetail,
  InventoryTransaction,
  InventoryTransactionType,
} from "../api/types";

const TRANSACTION_TYPES: InventoryTransactionType[] = ["received", "issued", "delivered_out", "adjustment"];

// The editable fields of an item, mirrored into local state so the user can
// type freely and only persist on Save. Money/quantity fields stay strings
// end to end (CLAUDE.md: never float-arithmetic them, just round-trip).
interface EditableForm {
  name: string;
  unit: string;
  reorder_threshold: string;
  price: string;
  notes: string;
  barcode: string;
  product_link: string;
  tags: string[];
  custom_fields: Record<string, unknown>;
}

function buildForm(item: InventoryItemDetail): EditableForm {
  return {
    name: item.name,
    unit: item.unit,
    reorder_threshold: item.reorder_threshold,
    price: item.price,
    notes: item.notes ?? "",
    barcode: item.barcode ?? "",
    product_link: item.product_link ?? "",
    tags: [...item.tags],
    custom_fields: { ...item.custom_fields },
  };
}

// custom_fields values are `unknown` on the wire (schema-less by design, see
// CLAUDE.md rule 3) — these narrow them for display without ever parsing
// numeric custom fields to a real number (they're just number-shaped text).
function fieldString(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value);
}

function fieldBoolean(value: unknown): boolean {
  return value === true;
}

export function InventoryDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [item, setItem] = useState<InventoryItemDetail | null>(null);
  const [history, setHistory] = useState<InventoryTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [defs, setDefs] = useState<InventoryCustomFieldDef[]>([]);
  const [defsError, setDefsError] = useState<string | null>(null);
  const [tagOptions, setTagOptions] = useState<string[]>([]);

  const [form, setForm] = useState<EditableForm | null>(null);
  const [tagInput, setTagInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  async function refresh() {
    if (!id) return;
    setLoading(true);
    try {
      const [itemDetail, transactions] = await Promise.all([getItem(id), getTransactionHistory(id)]);
      setItem(itemDetail);
      setHistory(transactions);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load item");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    if (item) setForm(buildForm(item));
  }, [item]);

  useEffect(() => {
    listCustomFieldDefs()
      .then(setDefs)
      .catch((err) => setDefsError(err instanceof ApiError ? err.message : "Failed to load custom fields"));
    // Tag autocomplete is a non-critical enhancement — a failure here just
    // means the datalist is empty, so it degrades quietly instead of
    // blocking the page with an error banner.
    listTags()
      .then((tags) => setTagOptions(tags.map((t) => t.name)))
      .catch(() => setTagOptions([]));
  }, []);

  function updateForm(patch: Partial<EditableForm>) {
    setForm((f) => (f ? { ...f, ...patch } : f));
  }

  function updateCustomField(key: string, value: unknown) {
    setForm((f) => (f ? { ...f, custom_fields: { ...f.custom_fields, [key]: value } } : f));
  }

  function addTag(raw: string) {
    const tag = raw.trim();
    if (!tag) return;
    setForm((f) => (f && !f.tags.includes(tag) ? { ...f, tags: [...f.tags, tag] } : f));
    setTagInput("");
  }

  function removeTag(tag: string) {
    setForm((f) => (f ? { ...f, tags: f.tags.filter((t) => t !== tag) } : f));
  }

  function handleTagKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      addTag(tagInput);
    }
  }

  function handleCancel() {
    if (item) setForm(buildForm(item));
    setTagInput("");
    setSaveError(null);
  }

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    if (!form || !id) return;
    setSaving(true);
    setSaveError(null);
    try {
      await updateItem(id, {
        name: form.name,
        unit: form.unit,
        reorder_threshold: form.reorder_threshold,
        price: form.price,
        notes: form.notes.trim() === "" ? null : form.notes,
        barcode: form.barcode.trim() === "" ? null : form.barcode,
        product_link: form.product_link.trim() === "" ? null : form.product_link,
        tags: form.tags,
        custom_fields: form.custom_fields,
      });
      await refresh();
    } catch (err) {
      setSaveError(err instanceof ApiError ? err.message : "Failed to save item");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p>Loading…</p>;
  if (error) return <p className="error">{error}</p>;
  if (!item || !id || !form) return <p>Item not found.</p>;

  const lowStock = Number(item.quantity_on_hand) < Number(item.reorder_threshold);

  return (
    <div>
      <div className="detail-topbar">
        <nav className="detail-breadcrumb" aria-label="Breadcrumb">
          <Link to="/inventory">Inventory</Link>
          <span className="detail-breadcrumb-sep">&rsaquo;</span>
          <span>{item.name}</span>
        </nav>
        <div className="detail-meta">
          SKU: <strong>{item.sku}</strong> &middot; Updated {new Date(item.updated_at).toLocaleString()}
        </div>
      </div>

      <form onSubmit={handleSave}>
        <div className="detail-title-bar">
          <input
            className="detail-title-input"
            value={form.name}
            onChange={(e) => updateForm({ name: e.target.value })}
            aria-label="Item name"
            required
          />
          <div className="detail-title-actions">
            <button type="button" className="button-secondary" onClick={handleCancel} disabled={saving}>
              Cancel
            </button>
            <button type="submit" disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </div>

        {saveError && <p className="error">{saveError}</p>}

        <div className="detail-stats">
          <div className="detail-stat-card">
            <div className="detail-stat-label">
              <span>Quantity</span>
              <input
                className="detail-unit-input"
                value={form.unit}
                onChange={(e) => updateForm({ unit: e.target.value })}
                aria-label="Unit"
              />
            </div>
            <div className="detail-stat-value">
              {item.quantity_on_hand}
              {lowStock && <span className="badge">low stock</span>}
            </div>
            <a className="detail-stat-link" href="#stock-movements">
              Adjust stock &rarr;
            </a>
          </div>

          <div className="detail-stat-card">
            <div className="detail-stat-label">
              <span>Min Level ({form.unit || item.unit})</span>
            </div>
            <input
              className="detail-stat-input"
              type="number"
              step="any"
              value={form.reorder_threshold}
              onChange={(e) => updateForm({ reorder_threshold: e.target.value })}
            />
          </div>

          <div className="detail-stat-card">
            <div className="detail-stat-label">
              <span>Price</span>
            </div>
            <div className="detail-input-prefix">
              <span>$</span>
              <input
                type="number"
                step="any"
                value={form.price}
                onChange={(e) => updateForm({ price: e.target.value })}
              />
            </div>
          </div>

          <div className="detail-stat-card">
            <div className="detail-stat-label">
              <span>Total value</span>
            </div>
            <div className="detail-stat-readonly">${item.total_value}</div>
            <span className="muted">Computed automatically from price &times; quantity</span>
          </div>
        </div>

        <div className="detail-grid">
          <div className="detail-col">
            <div className="card detail-card">
              <h2>Product Information</h2>
              <div className="detail-photo-placeholder">
                <p>Photo upload</p>
                <p className="muted">Max 8 photos, 30 MB total (JPG, PNG, HEIC) &mdash; coming soon</p>
              </div>

              <div className="detail-field">
                <span className="detail-field-heading">Tags</span>
                <div className="detail-tags">
                  {form.tags.map((tag) => (
                    <span className="detail-tag-chip" key={tag}>
                      {tag}
                      <button
                        type="button"
                        className="detail-tag-remove"
                        onClick={() => removeTag(tag)}
                        aria-label={`Remove tag ${tag}`}
                      >
                        &times;
                      </button>
                    </span>
                  ))}
                </div>
                <input
                  list="inventory-tag-options"
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={handleTagKeyDown}
                  onBlur={() => addTag(tagInput)}
                  placeholder="Add tag and press Enter"
                />
                <datalist id="inventory-tag-options">
                  {tagOptions
                    .filter((t) => !form.tags.includes(t))
                    .map((t) => (
                      <option key={t} value={t} />
                    ))}
                </datalist>
              </div>

              <label>
                Notes
                <textarea
                  rows={3}
                  value={form.notes}
                  onChange={(e) => updateForm({ notes: e.target.value })}
                />
              </label>

              <label>
                Product link
                <input
                  value={form.product_link}
                  onChange={(e) => updateForm({ product_link: e.target.value })}
                  placeholder="Add link here"
                />
              </label>
            </div>

            <div className="card detail-card">
              <h2>QR &amp; Barcode</h2>
              <p className="muted">
                You can use QR codes or barcodes to track the inventory of your products or assets.
              </p>
              <label>
                Barcode
                <input
                  value={form.barcode}
                  onChange={(e) => updateForm({ barcode: e.target.value })}
                  placeholder="Add a barcode value"
                />
              </label>
            </div>
          </div>

          <div className="detail-col">
            <div className="card detail-card">
              <h2>Custom Fields</h2>
              {defsError && <p className="error">{defsError}</p>}
              {defs.length === 0 && !defsError && <p className="muted">No custom fields configured.</p>}
              <div className="custom-fields-list">
                {defs.map((def) => (
                  <div className="custom-field-row" key={def.id}>
                    {def.field_type === "checkbox" ? (
                      <div className="custom-field-checkbox-row">
                        <input
                          type="checkbox"
                          id={`cf-${def.id}`}
                          checked={fieldBoolean(form.custom_fields[def.field_key])}
                          onChange={(e) => updateCustomField(def.field_key, e.target.checked)}
                        />
                        <label htmlFor={`cf-${def.id}`} className="custom-field-label">
                          {def.label}
                        </label>
                      </div>
                    ) : (
                      <>
                        <span className="custom-field-label">{def.label}</span>
                        {def.field_type === "textarea" && (
                          <textarea
                            rows={2}
                            value={fieldString(form.custom_fields[def.field_key])}
                            onChange={(e) => updateCustomField(def.field_key, e.target.value)}
                          />
                        )}
                        {def.field_type === "text" && (
                          <input
                            type="text"
                            value={fieldString(form.custom_fields[def.field_key])}
                            onChange={(e) => updateCustomField(def.field_key, e.target.value)}
                          />
                        )}
                        {def.field_type === "number" && (
                          <input
                            type="number"
                            step="any"
                            value={fieldString(form.custom_fields[def.field_key])}
                            onChange={(e) => updateCustomField(def.field_key, e.target.value)}
                          />
                        )}
                        {def.field_type === "select" && (
                          <select
                            value={fieldString(form.custom_fields[def.field_key])}
                            onChange={(e) => updateCustomField(def.field_key, e.target.value)}
                          >
                            <option value="">&mdash;</option>
                            {(def.options ?? []).map((option) => (
                              <option key={option} value={option}>
                                {option}
                              </option>
                            ))}
                          </select>
                        )}
                      </>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </form>

      <section id="stock-movements" className="detail-section">
        <h2>Stock Movements</h2>
        <p className="muted">
          Stock on hand is derived from transaction history, never stored directly &mdash; record receipts,
          issues, deliveries, and adjustments below rather than editing quantity directly.
        </p>

        <p>
          <strong>Stock by location</strong>
        </p>
        <table>
          <thead>
            <tr>
              <th>Location</th>
              <th>Quantity on hand</th>
            </tr>
          </thead>
          <tbody>
            {item.stock_by_location.map((row) => (
              <tr key={row.location}>
                <td>{row.location}</td>
                <td>{row.quantity_on_hand}</td>
              </tr>
            ))}
            {item.stock_by_location.length === 0 && (
              <tr>
                <td colSpan={2}>No stock recorded yet.</td>
              </tr>
            )}
          </tbody>
        </table>

        <RecordTransactionForm
          itemId={id}
          onSubmit={async (input) => {
            await recordTransaction(input);
            await refresh();
          }}
        />

        <p>
          <strong>Transaction history</strong>
        </p>
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Type</th>
              <th>Quantity</th>
              <th>Location</th>
              <th>Note</th>
            </tr>
          </thead>
          <tbody>
            {history.map((t) => (
              <tr key={t.id}>
                <td>{new Date(t.created_at).toLocaleString()}</td>
                <td>{t.type}</td>
                <td>{t.quantity}</td>
                <td>{t.location}</td>
                <td>{t.note ?? ""}</td>
              </tr>
            ))}
            {history.length === 0 && (
              <tr>
                <td colSpan={5}>No transactions yet.</td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}

function RecordTransactionForm({
  itemId,
  onSubmit,
}: {
  itemId: string;
  onSubmit: (input: {
    item_id: string;
    type: InventoryTransactionType;
    quantity: string;
    location: string;
    note?: string;
  }) => Promise<void>;
}) {
  const [type, setType] = useState<InventoryTransactionType>("received");
  const [quantity, setQuantity] = useState("");
  const [location, setLocation] = useState("main");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit({ item_id: itemId, type, quantity, location, note: note || undefined });
      setQuantity("");
      setNote("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to record transaction");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="card" onSubmit={handleSubmit}>
      <label>
        Type
        <select value={type} onChange={(e) => setType(e.target.value as InventoryTransactionType)}>
          {TRANSACTION_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </label>
      <label>
        Quantity {type === "adjustment" ? "(signed, e.g. -5)" : "(positive)"}
        <input
          type="number"
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
          step="any"
          required
        />
      </label>
      <label>
        Location
        <input value={location} onChange={(e) => setLocation(e.target.value)} required />
      </label>
      <label>
        Note
        <input value={note} onChange={(e) => setNote(e.target.value)} />
      </label>
      {error && <p className="error">{error}</p>}
      <button type="submit" disabled={submitting}>
        {submitting ? "Saving…" : "Record movement"}
      </button>
    </form>
  );
}
