import { useEffect, useState, type FormEvent } from "react";
import { ApiError } from "../api/client";
import { createAssetType, deactivateAssetType, listAssetTypes } from "../api/assetTypes";
import type { AssetGeomType, AssetType, CreateAssetTypeInput } from "../api/types";
import { useAuth } from "../auth/AuthContext";

const GEOM_TYPES: AssetGeomType[] = ["Point", "LineString", "Polygon", "MultiPolygon", "MultiLineString"];
const DEFAULT_SCHEMA = '{\n  "type": "object",\n  "properties": {}\n}';

export function AssetTypesPage() {
  const { user } = useAuth();
  const canManage = user?.role === "admin" || user?.role === "manager";

  const [types, setTypes] = useState<AssetType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const res = await listAssetTypes({ limit: 200, sort: "code", order: "asc" });
      setTypes(res.data);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load asset types");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleCreate(input: CreateAssetTypeInput) {
    await createAssetType(input);
    setShowForm(false);
    await load();
  }

  async function handleDeactivate(id: string) {
    if (!window.confirm("Deactivate this asset type? Existing assets keep it, but it won't be selectable for new ones."))
      return;
    await deactivateAssetType(id);
    await load();
  }

  return (
    <div>
      <div className="page-header">
        <h1>Asset Types</h1>
        {canManage && (
          <button type="button" onClick={() => setShowForm((v) => !v)}>
            {showForm ? "Cancel" : "Add asset type"}
          </button>
        )}
      </div>

      {showForm && <AddAssetTypeForm onSubmit={handleCreate} />}

      {error && <p className="error">{error}</p>}
      {loading ? (
        <p>Loading…</p>
      ) : types.length === 0 ? (
        <p>No asset types yet.</p>
      ) : (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Code</th>
                <th>Name</th>
                <th>Category</th>
                <th>Allowed geometry</th>
                <th>Schema v.</th>
                <th>Status</th>
                {canManage && <th />}
              </tr>
            </thead>
            <tbody>
              {types.map((t) => (
                <tr key={t.id}>
                  <td>{t.code}</td>
                  <td>{t.name}</td>
                  <td>{t.category ?? "—"}</td>
                  <td>{t.allowed_geom_types.join(", ")}</td>
                  <td>{t.schema_version}</td>
                  <td>
                    <span className={`badge-neutral ${t.is_active ? "badge-status-active" : "badge-status-inactive"}`}>
                      {t.is_active ? "active" : "inactive"}
                    </span>
                  </td>
                  {canManage && (
                    <td>
                      {t.is_active && (
                        <button type="button" className="button-secondary" onClick={() => handleDeactivate(t.id)}>
                          Deactivate
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function AddAssetTypeForm({ onSubmit }: { onSubmit: (input: CreateAssetTypeInput) => Promise<void> }) {
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [geomTypes, setGeomTypes] = useState<Set<AssetGeomType>>(new Set());
  const [schemaText, setSchemaText] = useState(DEFAULT_SCHEMA);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggleGeomType(g: AssetGeomType) {
    setGeomTypes((prev) => {
      const next = new Set(prev);
      if (next.has(g)) next.delete(g);
      else next.add(g);
      return next;
    });
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (geomTypes.size === 0) {
      setError("Select at least one allowed geometry type.");
      return;
    }

    let attribute_schema: Record<string, unknown>;
    try {
      attribute_schema = JSON.parse(schemaText);
    } catch {
      setError("attribute_schema is not valid JSON.");
      return;
    }

    setSubmitting(true);
    try {
      await onSubmit({
        code,
        name,
        category: category || undefined,
        allowed_geom_types: [...geomTypes],
        attribute_schema,
      });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to create asset type");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="card" onSubmit={handleSubmit}>
      <label>
        Code
        <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="e.g. valve_gate" required />
      </label>
      <label>
        Name
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Gate Valve" required />
      </label>
      <label>
        Category
        <input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="e.g. Mechanical" />
      </label>

      <fieldset>
        <legend>Allowed geometry on the map</legend>
        {GEOM_TYPES.map((g) => (
          <div className="checkbox-row" key={g}>
            <input
              id={`geom-${g}`}
              type="checkbox"
              checked={geomTypes.has(g)}
              onChange={() => toggleGeomType(g)}
            />
            <label htmlFor={`geom-${g}`}>{g}</label>
          </div>
        ))}
      </fieldset>

      <label>
        Attribute schema (JSON Schema)
        <textarea rows={8} value={schemaText} onChange={(e) => setSchemaText(e.target.value)} spellCheck={false} />
      </label>

      {error && <p className="error">{error}</p>}
      <button type="submit" disabled={submitting}>
        {submitting ? "Saving…" : "Save asset type"}
      </button>
    </form>
  );
}
