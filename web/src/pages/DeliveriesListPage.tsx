import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { createDelivery, listDeliveries } from "../api/deliveries";
import { listRequisitions } from "../api/requisitions";
import { ApiError } from "../api/client";
import type { CreateDeliveryInput, Delivery, Requisition } from "../api/types";

export function DeliveriesListPage() {
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [requisitions, setRequisitions] = useState<Requisition[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  async function refresh() {
    setLoading(true);
    try {
      setDeliveries(await listDeliveries());
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load deliveries");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
    listRequisitions()
      .then(setRequisitions)
      .catch(() => setRequisitions([]));
  }, []);

  async function handleCreate(input: CreateDeliveryInput) {
    const created = await createDelivery(input);
    setShowForm(false);
    await refresh();
    return created;
  }

  return (
    <div>
      <div className="page-header">
        <h1>Deliveries</h1>
        <div className="page-header-actions">
          <Link to="/requisitions" className="link-button">
            View requisitions
          </Link>
          <button type="button" onClick={() => setShowForm((v) => !v)}>
            {showForm ? "Cancel" : "New delivery"}
          </button>
        </div>
      </div>

      {showForm && <AddDeliveryForm requisitions={requisitions} onSubmit={handleCreate} />}

      {error && <p className="error">{error}</p>}
      {loading ? (
        <p>Loading…</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Report #</th>
              <th>Date</th>
              <th>Supplier</th>
              <th>Requisition</th>
              <th>Status</th>
              <th>Line items</th>
            </tr>
          </thead>
          <tbody>
            {deliveries.map((d) => (
              <tr key={d.id}>
                <td>
                  <Link to={`/deliveries/${d.id}`}>#{d.report_number}</Link>
                </td>
                <td>{new Date(d.received_date).toLocaleDateString()}</td>
                <td>{d.supplier ?? "—"}</td>
                <td>
                  {d.requisition_id ? (
                    <Link to={`/requisitions/${d.requisition_id}`}>{d.requisition_number}</Link>
                  ) : (
                    "—"
                  )}
                </td>
                <td>
                  <span className={`badge-neutral badge-status-${d.status}`}>{d.status}</span>
                </td>
                <td>{d.line_item_count}</td>
              </tr>
            ))}
            {deliveries.length === 0 && (
              <tr>
                <td colSpan={6}>No deliveries yet.</td>
              </tr>
            )}
          </tbody>
        </table>
      )}
    </div>
  );
}

function AddDeliveryForm({
  requisitions,
  onSubmit,
}: {
  requisitions: Requisition[];
  onSubmit: (input: CreateDeliveryInput) => Promise<Delivery>;
}) {
  const [requisitionId, setRequisitionId] = useState("");
  const [supplier, setSupplier] = useState("");
  const [billOfLadingNo, setBillOfLadingNo] = useState("");
  const [truckNumber, setTruckNumber] = useState("");
  const [receivedDate, setReceivedDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit({
        requisition_id: requisitionId || undefined,
        supplier: supplier || undefined,
        bill_of_lading_no: billOfLadingNo || undefined,
        truck_number: truckNumber || undefined,
        received_date: receivedDate || undefined,
      });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to create delivery");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="card" onSubmit={handleSubmit}>
      <label>
        Requisition (optional)
        <select value={requisitionId} onChange={(e) => setRequisitionId(e.target.value)}>
          <option value="">No requisition</option>
          {requisitions.map((req) => (
            <option key={req.id} value={req.id}>
              {req.requisition_number} {req.supplier ? `— ${req.supplier}` : ""}
            </option>
          ))}
        </select>
      </label>
      <label>
        Supplier
        <input value={supplier} onChange={(e) => setSupplier(e.target.value)} />
      </label>
      <label>
        Bill of lading #
        <input value={billOfLadingNo} onChange={(e) => setBillOfLadingNo(e.target.value)} />
      </label>
      <label>
        Truck #
        <input value={truckNumber} onChange={(e) => setTruckNumber(e.target.value)} />
      </label>
      <label>
        Received date
        <input type="date" value={receivedDate} onChange={(e) => setReceivedDate(e.target.value)} />
      </label>
      {error && <p className="error">{error}</p>}
      <button type="submit" disabled={submitting}>
        {submitting ? "Saving…" : "Create delivery"}
      </button>
    </form>
  );
}
