import { useState, type FormEvent } from "react";
import { ApiError, type ApiFieldError } from "../api/client";
import { createAsset } from "../api/assets";
import type { AssetDetail, AssetStatus, AssetType, GeoJsonGeometry } from "../api/types";
import { AttributeForm } from "./AttributeForm";

const STATUSES: AssetStatus[] = [
  "planned",
  "under_construction",
  "active",
  "inactive",
  "out_of_service",
  "abandoned_in_place",
  "removed",
];

// Opened right after a shape is drawn on the map (spec 5.1: "On draw
// completion, open an asset form"). geometry is already computed by the
// caller (SiteMapPage), including the Polygon/LineString -> Multi* wrap
// when the asset type only allows the Multi form.
export function AssetFormPanel({
  siteId,
  assetType,
  geometry,
  onCancel,
  onCreated,
}: {
  siteId: string;
  assetType: AssetType;
  geometry: GeoJsonGeometry;
  onCancel: () => void;
  onCreated: (asset: AssetDetail) => void;
}) {
  const [tag, setTag] = useState("");
  const [name, setName] = useState("");
  const [status, setStatus] = useState<AssetStatus>("active");
  const [criticality, setCriticality] = useState("");
  const [description, setDescription] = useState("");
  const [attributes, setAttributes] = useState<Record<string, unknown>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<ApiFieldError[]>([]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setFieldErrors([]);
    try {
      const created = await createAsset(siteId, {
        asset_type_id: assetType.id,
        tag,
        name,
        status,
        criticality: criticality ? Number(criticality) : undefined,
        description: description || undefined,
        attributes,
        geometry,
      });
      onCreated(created);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
        setFieldErrors(err.fields ?? []);
      } else {
        setError("Failed to create asset");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="panel-overlay" onClick={onCancel}>
      <form className="panel" onClick={(e) => e.stopPropagation()} onSubmit={handleSubmit}>
        <div className="panel-header">
          <span>
            New {assetType.name} <span className="muted">({geometry.type})</span>
          </span>
          <button type="button" className="panel-close" onClick={onCancel} aria-label="Cancel">
            &times;
          </button>
        </div>

        {error && <p className="error">{error}</p>}
        {fieldErrors.length > 0 && (
          <ul className="error">
            {fieldErrors.map((f) => (
              <li key={f.path}>
                {f.path}: {f.message}
              </li>
            ))}
          </ul>
        )}

        <div className="property-rows">
          <div className="property-row">
            <span className="property-row-label">Tag *</span>
            <input value={tag} onChange={(e) => setTag(e.target.value)} placeholder="e.g. V-1042" required autoFocus />
          </div>
          <div className="property-row">
            <span className="property-row-label">Name *</span>
            <input value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div className="property-row">
            <span className="property-row-label">Status</span>
            <select value={status} onChange={(e) => setStatus(e.target.value as AssetStatus)}>
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s.replace(/_/g, " ")}
                </option>
              ))}
            </select>
          </div>
          <div className="property-row">
            <span className="property-row-label">Criticality (1-5)</span>
            <input
              type="number"
              min={1}
              max={5}
              value={criticality}
              onChange={(e) => setCriticality(e.target.value)}
            />
          </div>
        </div>

        <div className="detail-field">
          <span className="detail-field-heading">Description</span>
          <textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>

        <div className="detail-field">
          <span className="detail-field-heading">{assetType.name} attributes</span>
          <AttributeForm
            schema={assetType.attribute_schema}
            uiSchema={assetType.ui_schema}
            values={attributes}
            onChange={setAttributes}
          />
        </div>

        <div className="panel-footer">
          <button type="button" className="button-secondary" onClick={onCancel} disabled={submitting}>
            Cancel
          </button>
          <button type="submit" disabled={submitting}>
            {submitting ? "Saving…" : "Create asset"}
          </button>
        </div>
      </form>
    </div>
  );
}
