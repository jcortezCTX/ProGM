import { useEffect, useState, type FormEvent } from "react";
import { ApiError } from "../api/client";
import { createMixDesign, deleteMixDesign, listMixDesigns, updateMixDesign } from "../api/concrete";
import type { ConcreteMixDesign } from "../api/types";
import { ConcreteNav } from "../components/ConcreteNav";

interface Form {
  supplier: string;
  concrete_class: string;
  mix_type: string;
  mix_number: string;
  type_of_work: string;
  design_strength_psi: string;
  slump_range: string;
  air_range: string;
  active: boolean;
}

function emptyForm(): Form {
  return {
    supplier: "",
    concrete_class: "",
    mix_type: "",
    mix_number: "",
    type_of_work: "",
    design_strength_psi: "",
    slump_range: "",
    air_range: "",
    active: true,
  };
}

function formFromRow(r: ConcreteMixDesign): Form {
  return {
    supplier: r.supplier,
    concrete_class: r.concrete_class ?? "",
    mix_type: r.mix_type ?? "",
    mix_number: r.mix_number,
    type_of_work: r.type_of_work ?? "",
    design_strength_psi: r.design_strength_psi === null ? "" : String(r.design_strength_psi),
    slump_range: r.slump_range ?? "",
    air_range: r.air_range ?? "",
    active: r.active,
  };
}

function blank(v: string): string | null {
  const t = v.trim();
  return t === "" ? null : t;
}

function toPayload(f: Form) {
  return {
    supplier: f.supplier,
    concrete_class: blank(f.concrete_class),
    mix_type: blank(f.mix_type),
    mix_number: f.mix_number,
    type_of_work: blank(f.type_of_work),
    design_strength_psi: f.design_strength_psi === "" ? null : Number(f.design_strength_psi),
    slump_range: blank(f.slump_range),
    air_range: blank(f.air_range),
    active: f.active,
  };
}

function Row({ row, onChanged }: { row: ConcreteMixDesign; onChanged: () => void }) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<Form>(formFromRow(row));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      await updateMixDesign(row.id, toPayload(form));
      setEditing(false);
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!window.confirm("Delete this mix design?")) return;
    try {
      await deleteMixDesign(row.id);
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to delete");
    }
  }

  if (!editing) {
    return (
      <tr>
        <td>{row.mix_number}</td>
        <td>{row.concrete_class ?? "—"}</td>
        <td>{row.mix_type ?? "—"}</td>
        <td>{row.type_of_work ?? "—"}</td>
        <td>{row.design_strength_psi ?? "—"}</td>
        <td>{row.slump_range ?? "—"}</td>
        <td>{row.air_range ?? "—"}</td>
        <td>{row.active ? "Active" : "Inactive"}</td>
        <td className="row-actions">
          <button type="button" className="button-secondary" onClick={() => setEditing(true)}>
            Edit
          </button>
          <button type="button" className="button-secondary" onClick={remove}>
            Delete
          </button>
        </td>
      </tr>
    );
  }

  return (
    <tr>
      <td>
        <input value={form.mix_number} onChange={(e) => setForm({ ...form, mix_number: e.target.value })} />
      </td>
      <td>
        <input value={form.concrete_class} onChange={(e) => setForm({ ...form, concrete_class: e.target.value })} />
      </td>
      <td>
        <input value={form.mix_type} onChange={(e) => setForm({ ...form, mix_type: e.target.value })} />
      </td>
      <td>
        <input value={form.type_of_work} onChange={(e) => setForm({ ...form, type_of_work: e.target.value })} />
      </td>
      <td>
        <input
          type="number"
          value={form.design_strength_psi}
          onChange={(e) => setForm({ ...form, design_strength_psi: e.target.value })}
        />
      </td>
      <td>
        <input value={form.slump_range} onChange={(e) => setForm({ ...form, slump_range: e.target.value })} />
      </td>
      <td>
        <input value={form.air_range} onChange={(e) => setForm({ ...form, air_range: e.target.value })} />
      </td>
      <td>
        <label className="checkbox-filter">
          <input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} />
          Active
        </label>
      </td>
      <td className="row-actions">
        <button type="button" onClick={save} disabled={saving}>
          {saving ? "Saving…" : "Save"}
        </button>
        <button type="button" className="button-secondary" onClick={() => setEditing(false)} disabled={saving}>
          Cancel
        </button>
        {error && <p className="error">{error}</p>}
      </td>
    </tr>
  );
}

export function ConcreteMixDesignsPage() {
  const [rows, setRows] = useState<ConcreteMixDesign[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [newForm, setNewForm] = useState<Form>(emptyForm());
  const [addError, setAddError] = useState<string | null>(null);

  async function refresh() {
    setLoading(true);
    try {
      const res = await listMixDesigns({ limit: 500, sort: "supplier", order: "asc" });
      setRows(res.data);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load mix designs");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  async function handleAdd(e: FormEvent) {
    e.preventDefault();
    setAddError(null);
    try {
      await createMixDesign(toPayload(newForm));
      setNewForm(emptyForm());
      setAdding(false);
      await refresh();
    } catch (err) {
      setAddError(err instanceof ApiError ? err.message : "Failed to add mix design");
    }
  }

  const bySupplier = new Map<string, ConcreteMixDesign[]>();
  for (const r of rows) {
    if (!bySupplier.has(r.supplier)) bySupplier.set(r.supplier, []);
    bySupplier.get(r.supplier)!.push(r);
  }

  return (
    <div>
      <div className="page-header">
        <h1>Concrete Log</h1>
      </div>
      <ConcreteNav />

      <div className="page-header">
        <h2>Mix Designs</h2>
        {!adding && (
          <button type="button" onClick={() => setAdding(true)}>
            Add mix design
          </button>
        )}
      </div>

      {error && <p className="error">{error}</p>}
      {addError && <p className="error">{addError}</p>}

      {adding && (
        <div className="card">
          <h3>New Mix Design</h3>
          <form onSubmit={handleAdd} className="inline-form">
            <label>
              Supplier
              <input required value={newForm.supplier} onChange={(e) => setNewForm({ ...newForm, supplier: e.target.value })} />
            </label>
            <label>
              Mix #
              <input
                required
                value={newForm.mix_number}
                onChange={(e) => setNewForm({ ...newForm, mix_number: e.target.value })}
              />
            </label>
            <label>
              Class
              <input
                value={newForm.concrete_class}
                onChange={(e) => setNewForm({ ...newForm, concrete_class: e.target.value })}
              />
            </label>
            <label>
              Type
              <input value={newForm.mix_type} onChange={(e) => setNewForm({ ...newForm, mix_type: e.target.value })} />
            </label>
            <label>
              Design PSI
              <input
                type="number"
                value={newForm.design_strength_psi}
                onChange={(e) => setNewForm({ ...newForm, design_strength_psi: e.target.value })}
              />
            </label>
            <div className="row-actions">
              <button type="submit">Add</button>
              <button type="button" className="button-secondary" onClick={() => setAdding(false)}>
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {loading ? (
        <p>Loading…</p>
      ) : (
        [...bySupplier.entries()].map(([supplier, group]) => (
          <div className="card" key={supplier}>
            <h3>{supplier}</h3>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Mix #</th>
                    <th>Class</th>
                    <th>Type</th>
                    <th>Type of Work</th>
                    <th>Design PSI</th>
                    <th>Slump</th>
                    <th>Air</th>
                    <th>Status</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {group.map((r) => (
                    <Row key={r.id} row={r} onChanged={refresh} />
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))
      )}
      {!loading && rows.length === 0 && <p>No mix designs yet.</p>}
    </div>
  );
}
