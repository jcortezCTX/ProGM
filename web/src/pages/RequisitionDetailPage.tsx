import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ApiError } from "../api/client";
import { getRequisition } from "../api/requisitions";
import { FulfillmentBar } from "../components/FulfillmentBar";
import type { RequisitionDetail } from "../api/types";

export function RequisitionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [requisition, setRequisition] = useState<RequisitionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    getRequisition(id)
      .then((r) => {
        setRequisition(r);
        setError(null);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load requisition"))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <p>Loading…</p>;
  if (error) return <p className="error">{error}</p>;
  if (!requisition) return <p>Requisition not found.</p>;

  return (
    <div>
      <div className="detail-topbar">
        <nav className="detail-breadcrumb" aria-label="Breadcrumb">
          <Link to="/requisitions">Requisitions</Link>
          <span className="detail-breadcrumb-sep">&rsaquo;</span>
          <span>{requisition.requisition_number}</span>
        </nav>
        <div className="detail-meta">
          Updated {new Date(requisition.updated_at).toLocaleString()}
        </div>
      </div>

      <div className="card card-wide">
        <h2>Requisition {requisition.requisition_number}</h2>
        <div className="inline-fields">
          <div>
            <span className="detail-field-heading">Supplier</span>
            <p>{requisition.supplier ?? "—"}</p>
          </div>
          <div>
            <span className="detail-field-heading">Created</span>
            <p>{new Date(requisition.created_at).toLocaleDateString()}</p>
          </div>
        </div>
        {requisition.notes && (
          <div>
            <span className="detail-field-heading">Notes</span>
            <p>{requisition.notes}</p>
          </div>
        )}
      </div>

      <div className="stat-tiles">
        <div className="stat-tile">
          <span className="stat-value">{requisition.quantity_ordered}</span>
          <span className="stat-label">Ordered</span>
        </div>
        <div className="stat-tile">
          <span className="stat-value">{requisition.quantity_received}</span>
          <span className="stat-label">Received</span>
        </div>
        <div className="stat-tile alert">
          <span className="stat-value">{requisition.quantity_outstanding}</span>
          <span className="stat-label">Outstanding</span>
        </div>
      </div>

      {/* A requisition's line items ARE its Mechanical Log rows - Release IS
          the requisition number (spec §3.2), so there is no separate
          quantity_ordered here beyond what each log row carries. */}
      <h2>Line items (Mechanical Log)</h2>
      <table>
        <thead>
          <tr>
            <th>Tag</th>
            <th>Description</th>
            <th>Inventory item</th>
            <th>Qty released</th>
            <th>Fulfillment</th>
          </tr>
        </thead>
        <tbody>
          {requisition.line_items.map((line) => (
            <tr key={line.id}>
              <td>
                <Link to={`/mechanical-log/${line.id}`}>{line.tag_number ?? "(no tag)"}</Link>
              </td>
              <td>{line.description ?? "—"}</td>
              <td>
                {line.item_sku && line.inventory_item_id ? (
                  <Link to={`/inventory/${line.inventory_item_id}`}>{line.item_sku}</Link>
                ) : (
                  <span className="muted">not yet received</span>
                )}
              </td>
              <td>
                {line.qty_released ?? "0"} {line.unit}
              </td>
              <td>
                <FulfillmentBar ordered={line.qty_released ?? "0"} received={line.quantity_received} />
              </td>
            </tr>
          ))}
          {requisition.line_items.length === 0 && (
            <tr>
              <td colSpan={5}>No Mechanical Log rows are claimed by this requisition yet.</td>
            </tr>
          )}
        </tbody>
      </table>

      <h2>Deliveries</h2>
      <table>
        <thead>
          <tr>
            <th>Report #</th>
            <th>Date received</th>
            <th>Status</th>
            <th>Supplier</th>
          </tr>
        </thead>
        <tbody>
          {requisition.deliveries.map((d) => (
            <tr key={d.id}>
              <td>
                <Link to={`/deliveries/${d.id}`}>#{d.report_number}</Link>
              </td>
              <td>{new Date(d.received_date).toLocaleDateString()}</td>
              <td>
                <span className={`badge-neutral badge-status-${d.status}`}>{d.status}</span>
              </td>
              <td>{d.supplier ?? "—"}</td>
            </tr>
          ))}
          {requisition.deliveries.length === 0 && (
            <tr>
              <td colSpan={4}>No deliveries against this requisition yet.</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
