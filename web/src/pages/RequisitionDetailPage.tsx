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

      <h2>Line items</h2>
      <table>
        <thead>
          <tr>
            <th>Item</th>
            <th>Description</th>
            <th>Qty ordered</th>
            <th>Fulfillment</th>
          </tr>
        </thead>
        <tbody>
          {requisition.line_items.map((line) => (
            <tr key={line.id}>
              <td>
                <Link to={`/inventory/${line.inventory_item_id}`}>
                  {line.item_sku} — {line.item_name}
                </Link>
              </td>
              <td>{line.description ?? "—"}</td>
              <td>{line.quantity_ordered}</td>
              <td>
                <FulfillmentBar ordered={line.quantity_ordered} received={line.quantity_received} />
              </td>
            </tr>
          ))}
          {requisition.line_items.length === 0 && (
            <tr>
              <td colSpan={4}>No line items on this requisition.</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
