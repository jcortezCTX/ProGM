import { useEffect, useState, type FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import { ApiError } from "../api/client";
import { getItem, getTransactionHistory, recordTransaction } from "../api/inventory";
import type { InventoryItemDetail, InventoryTransaction, InventoryTransactionType } from "../api/types";

const TRANSACTION_TYPES: InventoryTransactionType[] = ["received", "issued", "delivered_out", "adjustment"];

export function InventoryDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [item, setItem] = useState<InventoryItemDetail | null>(null);
  const [history, setHistory] = useState<InventoryTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
  }, [id]);

  if (loading) return <p>Loading…</p>;
  if (error) return <p className="error">{error}</p>;
  if (!item || !id) return <p>Item not found.</p>;

  const lowStock = Number(item.quantity_on_hand) < Number(item.reorder_threshold);

  return (
    <div>
      <p>
        <Link to="/inventory">&larr; Back to inventory</Link>
      </p>
      <div className="page-header">
        <h1>
          {item.name} <span className="muted">({item.sku})</span>
        </h1>
      </div>

      <div className="card">
        <p>
          Total on hand: <strong>{item.quantity_on_hand}</strong> {item.unit}
          {lowStock && <span className="badge">low stock</span>}
        </p>
        <p className="muted">Reorder threshold: {item.reorder_threshold}</p>
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
          </tbody>
        </table>
      </div>

      <h2>Record a movement</h2>
      <RecordTransactionForm
        itemId={id}
        onSubmit={async (input) => {
          await recordTransaction(input);
          await refresh();
        }}
      />

      <h2>Transaction history</h2>
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
