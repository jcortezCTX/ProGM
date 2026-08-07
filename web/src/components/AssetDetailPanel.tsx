import { useEffect, useState } from "react";
import { ApiError } from "../api/client";
import { deleteAsset, getAsset, updateAsset } from "../api/assets";
import type { AssetDetail, AssetStatus, AssetType } from "../api/types";
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

// Geometry editing itself is owned by SiteMapPage (it holds the Leaflet
// layer refs) - this panel only surfaces the controls and reports back
// through onStartEditGeometry/onSaveGeometry/onCancelEditGeometry, same
// division of labor as everything else here: Leaflet stays imperative and
// centralized, this panel stays a plain presentational+API-calling
// component like TaskDetailPanel.
export function AssetDetailPanel({
  assetId,
  assetType,
  isEditingGeometry,
  onClose,
  onChanged,
  onDeleted,
  onStartEditGeometry,
  onSaveGeometry,
  onCancelEditGeometry,
}: {
  assetId: string;
  assetType: AssetType | undefined;
  isEditingGeometry: boolean;
  onClose: () => void;
  onChanged: () => void;
  onDeleted: () => void;
  onStartEditGeometry: () => void;
  onSaveGeometry: () => Promise<void>;
  onCancelEditGeometry: () => void;
}) {
  const [asset, setAsset] = useState<AssetDetail | null>(null);
  const [name, setName] = useState("");
  const [tag, setTag] = useState("");
  const [description, setDescription] = useState("");
  const [criticality, setCriticality] = useState("");
  const [attributes, setAttributes] = useState<Record<string, unknown>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    getAsset(assetId)
      .then((a) => {
        setAsset(a);
        setName(a.name);
        setTag(a.tag);
        setDescription(a.description ?? "");
        setCriticality(a.criticality ? String(a.criticality) : "");
        setAttributes(a.attributes);
        setError(null);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load asset"))
      .finally(() => setLoading(false));
  }, [assetId]);

  async function save(input: Parameters<typeof updateAsset>[1]) {
    if (!asset) return;
    setSaving(true);
    try {
      const updated = await updateAsset(asset.id, input);
      setAsset(updated);
      setError(null);
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to save changes");
    } finally {
      setSaving(false);
    }
  }

  async function saveAttributes() {
    // Full re-submission, not a merge: the form already reflects every
    // current attribute (blank = cleared), so replace_attributes=true is
    // the only way "clearing a field" actually drops the key rather than
    // being silently ignored by the default merge-PATCH.
    if (!asset) return;
    setSaving(true);
    try {
      const updated = await updateAsset(asset.id, { attributes }, { replaceAttributes: true });
      setAsset(updated);
      setError(null);
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to save attributes");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!asset || !window.confirm(`Delete "${asset.tag} — ${asset.name}"?`)) return;
    try {
      await deleteAsset(asset.id);
      onDeleted();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to delete asset");
    }
  }

  return (
    <div
      className={isEditingGeometry ? "panel-overlay panel-overlay-passthrough" : "panel-overlay"}
      onClick={isEditingGeometry ? undefined : onClose}
    >
      <div className="panel" onClick={(e) => e.stopPropagation()}>
        <div className="panel-header">
          <input
            className="detail-title-input"
            value={tag}
            onChange={(e) => setTag(e.target.value)}
            onBlur={() => asset && tag.trim() && tag !== asset.tag && save({ tag: tag.trim() })}
            aria-label="Asset tag"
            disabled={loading}
          />
          <button type="button" className="panel-close" onClick={onClose} aria-label="Close">
            &times;
          </button>
        </div>

        {error && <p className="error">{error}</p>}

        {loading || !asset ? (
          <p>Loading…</p>
        ) : (
          <>
            <div className="property-rows">
              <div className="property-row">
                <span className="property-row-label">Name</span>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onBlur={() => name.trim() && name !== asset.name && save({ name: name.trim() })}
                />
              </div>
              <div className="property-row">
                <span className="property-row-label">Type</span>
                <span>{asset.asset_type.name}</span>
              </div>
              <div className="property-row">
                <span className="property-row-label">Status</span>
                <select value={asset.status} onChange={(e) => save({ status: e.target.value as AssetStatus })}>
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
                  onBlur={() => save({ criticality: criticality ? Number(criticality) : null })}
                />
              </div>
              <div className="property-row">
                <span className="property-row-label">Geometry</span>
                <span>{asset.geom_type ?? "not placed"}</span>
              </div>
              {asset.parent && (
                <div className="property-row">
                  <span className="property-row-label">Parent</span>
                  <span>
                    {asset.parent.tag} — {asset.parent.name}
                  </span>
                </div>
              )}
              {asset.children.length > 0 && (
                <div className="property-row">
                  <span className="property-row-label">Children</span>
                  <span>{asset.children.map((c) => c.tag).join(", ")}</span>
                </div>
              )}
            </div>

            <div className="detail-field">
              <span className="detail-field-heading">Description</span>
              <textarea
                rows={2}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                onBlur={() =>
                  description !== (asset.description ?? "") && save({ description: description.trim() || null })
                }
              />
            </div>

            {assetType && (
              <div className="detail-field">
                <span className="detail-field-heading">{assetType.name} attributes</span>
                <AttributeForm
                  schema={assetType.attribute_schema}
                  uiSchema={assetType.ui_schema}
                  values={attributes}
                  onChange={setAttributes}
                />
                <button type="button" className="button-secondary" onClick={saveAttributes} disabled={saving}>
                  Save attributes
                </button>
              </div>
            )}

            {asset.attachments.length > 0 && (
              <div className="detail-field">
                <span className="detail-field-heading">Attachments</span>
                <ul>
                  {asset.attachments.map((a) => (
                    <li key={a.id}>{a.file_name}</li>
                  ))}
                </ul>
              </div>
            )}

            <div className="panel-footer">
              <button type="button" className="button-secondary" onClick={handleDelete} disabled={saving}>
                Delete asset
              </button>
              {isEditingGeometry ? (
                <>
                  <button type="button" className="button-secondary" onClick={onCancelEditGeometry}>
                    Cancel move
                  </button>
                  <button type="button" onClick={() => void onSaveGeometry()}>
                    Save position
                  </button>
                </>
              ) : (
                <button type="button" className="button-secondary" onClick={onStartEditGeometry} disabled={!asset.geom}>
                  Move on map
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
