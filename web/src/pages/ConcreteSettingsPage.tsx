import { useEffect, useState, type FormEvent } from "react";
import { ApiError } from "../api/client";
import { createStructure, deleteStructure, getConcreteSettings, listStructures, saveConcreteSettings, updateStructure } from "../api/concrete";
import type { ConcreteSettings, ConcreteStructure } from "../api/types";
import { ConcreteNav } from "../components/ConcreteNav";

function blank(v: string): string | null {
  const t = v.trim();
  return t === "" ? null : t;
}

interface SettingsForm {
  job_number: string;
  job_name: string;
  start_date: string;
  total_est_cy: string;
}

function settingsFormFromRow(s: ConcreteSettings | null): SettingsForm {
  return {
    job_number: s?.job_number ?? "",
    job_name: s?.job_name ?? "",
    start_date: s?.start_date.slice(0, 10) ?? "",
    total_est_cy: s?.total_est_cy ?? "",
  };
}

interface StructureForm {
  name: string;
  est_cy: string;
  est_cost: string;
}

function emptyStructureForm(): StructureForm {
  return { name: "", est_cy: "", est_cost: "" };
}

function structureFormFromRow(s: ConcreteStructure): StructureForm {
  return { name: s.name, est_cy: s.est_cy ?? "", est_cost: s.est_cost ?? "" };
}

function StructureRow({ row, onChanged }: { row: ConcreteStructure; onChanged: () => void }) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<StructureForm>(structureFormFromRow(row));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      await updateStructure(row.id, { name: form.name, est_cy: blank(form.est_cy), est_cost: blank(form.est_cost) });
      setEditing(false);
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!window.confirm("Delete this structure?")) return;
    try {
      await deleteStructure(row.id);
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to delete");
    }
  }

  if (!editing) {
    return (
      <tr>
        <td>{row.name}</td>
        <td>{row.est_cy ?? "—"}</td>
        <td>{row.est_cost ? `$${row.est_cost}` : "—"}</td>
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
        <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
      </td>
      <td>
        <input type="number" step="any" value={form.est_cy} onChange={(e) => setForm({ ...form, est_cy: e.target.value })} />
      </td>
      <td>
        <input
          type="number"
          step="any"
          value={form.est_cost}
          onChange={(e) => setForm({ ...form, est_cost: e.target.value })}
        />
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

export function ConcreteSettingsPage() {
  const [settings, setSettings] = useState<ConcreteSettings | null>(null);
  const [settingsForm, setSettingsForm] = useState<SettingsForm>(settingsFormFromRow(null));
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsError, setSettingsError] = useState<string | null>(null);

  const [structures, setStructures] = useState<ConcreteStructure[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [newForm, setNewForm] = useState<StructureForm>(emptyStructureForm());
  const [addError, setAddError] = useState<string | null>(null);

  async function refresh() {
    setLoading(true);
    try {
      const [s, structRes] = await Promise.all([getConcreteSettings(), listStructures({ limit: 500 })]);
      setSettings(s);
      setSettingsForm(settingsFormFromRow(s));
      setStructures(structRes.data);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load settings");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  async function handleSaveSettings(e: FormEvent) {
    e.preventDefault();
    setSavingSettings(true);
    setSettingsError(null);
    try {
      const saved = await saveConcreteSettings({
        job_number: settingsForm.job_number,
        job_name: settingsForm.job_name,
        start_date: settingsForm.start_date,
        total_est_cy: blank(settingsForm.total_est_cy),
      });
      setSettings(saved);
    } catch (err) {
      setSettingsError(err instanceof ApiError ? err.message : "Failed to save settings");
    } finally {
      setSavingSettings(false);
    }
  }

  async function handleAddStructure(e: FormEvent) {
    e.preventDefault();
    setAddError(null);
    try {
      await createStructure({ name: newForm.name, est_cy: blank(newForm.est_cy), est_cost: blank(newForm.est_cost) });
      setNewForm(emptyStructureForm());
      setAdding(false);
      await refresh();
    } catch (err) {
      setAddError(err instanceof ApiError ? err.message : "Failed to add structure");
    }
  }

  return (
    <div>
      <div className="page-header">
        <h1>Concrete Log</h1>
      </div>
      <ConcreteNav />

      {error && <p className="error">{error}</p>}
      {loading ? (
        <p>Loading…</p>
      ) : (
        <>
          <div className="card">
            <h2>Job Settings</h2>
            <form onSubmit={handleSaveSettings} className="inline-form">
              <label>
                Job Number
                <input
                  required
                  value={settingsForm.job_number}
                  onChange={(e) => setSettingsForm({ ...settingsForm, job_number: e.target.value })}
                />
              </label>
              <label>
                Job Name
                <input
                  required
                  value={settingsForm.job_name}
                  onChange={(e) => setSettingsForm({ ...settingsForm, job_name: e.target.value })}
                />
              </label>
              <label>
                Start Date
                <input
                  type="date"
                  required
                  value={settingsForm.start_date}
                  onChange={(e) => setSettingsForm({ ...settingsForm, start_date: e.target.value })}
                />
              </label>
              <label>
                Total Est. CY
                <input
                  type="number"
                  step="any"
                  value={settingsForm.total_est_cy}
                  onChange={(e) => setSettingsForm({ ...settingsForm, total_est_cy: e.target.value })}
                />
              </label>
              <div className="row-actions">
                <button type="submit" disabled={savingSettings}>
                  {savingSettings ? "Saving…" : settings ? "Save" : "Create settings"}
                </button>
              </div>
            </form>
            {settingsError && <p className="error">{settingsError}</p>}
          </div>

          <div className="page-header">
            <h2>Structures</h2>
            {!adding && (
              <button type="button" onClick={() => setAdding(true)}>
                Add structure
              </button>
            )}
          </div>
          {addError && <p className="error">{addError}</p>}
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Est. CY</th>
                  <th>Est. Cost</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {adding && (
                  <tr>
                    <td>
                      <input value={newForm.name} onChange={(e) => setNewForm({ ...newForm, name: e.target.value })} />
                    </td>
                    <td>
                      <input
                        type="number"
                        step="any"
                        value={newForm.est_cy}
                        onChange={(e) => setNewForm({ ...newForm, est_cy: e.target.value })}
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        step="any"
                        value={newForm.est_cost}
                        onChange={(e) => setNewForm({ ...newForm, est_cost: e.target.value })}
                      />
                    </td>
                    <td className="row-actions">
                      <button type="button" onClick={handleAddStructure}>
                        Add
                      </button>
                      <button type="button" className="button-secondary" onClick={() => setAdding(false)}>
                        Cancel
                      </button>
                    </td>
                  </tr>
                )}
                {structures.map((s) => (
                  <StructureRow key={s.id} row={s} onChanged={refresh} />
                ))}
                {structures.length === 0 && !adding && (
                  <tr>
                    <td colSpan={4}>No structures yet.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
