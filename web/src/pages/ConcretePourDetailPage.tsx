import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ApiError } from "../api/client";
import {
  addSample,
  createPour,
  deletePour,
  deleteSample,
  getPour,
  listMixDesigns,
  listStructures,
  updatePour,
  updateSample,
} from "../api/concrete";
import type { ConcreteMixDesign, ConcretePour, ConcreteSample, ConcreteStructure } from "../api/types";
import { ConcreteNav } from "../components/ConcreteNav";

interface PourForm {
  pour_date: string;
  location: string;
  structure_id: string;
  mix_design_id: string;
  design_strength_psi: string;
  yds_required: string;
  yds_delivered: string;
  yds_installed: string;
  is_subcontractor: boolean;
  poured_by: string;
  invoice_number: string;
  invoice_total: string;
  notes: string;
}

function emptyForm(): PourForm {
  return {
    pour_date: "",
    location: "",
    structure_id: "",
    mix_design_id: "",
    design_strength_psi: "",
    yds_required: "",
    yds_delivered: "",
    yds_installed: "",
    is_subcontractor: false,
    poured_by: "",
    invoice_number: "",
    invoice_total: "",
    notes: "",
  };
}

function buildForm(pour: ConcretePour): PourForm {
  return {
    pour_date: pour.pour_date.slice(0, 10),
    location: pour.location,
    structure_id: pour.structure_id ?? "",
    mix_design_id: pour.mix_design_id ?? "",
    design_strength_psi: String(pour.design_strength_psi),
    yds_required: pour.yds_required ?? "",
    yds_delivered: pour.yds_delivered ?? "",
    yds_installed: pour.yds_installed ?? "",
    is_subcontractor: pour.is_subcontractor,
    poured_by: pour.poured_by ?? "",
    invoice_number: pour.invoice_number ?? "",
    invoice_total: pour.invoice_total ?? "",
    notes: pour.notes ?? "",
  };
}

function blank(value: string): string | null {
  const t = value.trim();
  return t === "" ? null : t;
}

interface SampleForm {
  report_number: string;
  seven_day_psi: string;
  seven_day_entered_on: string;
  twenty_eight_day_psi: string;
  twenty_eight_day_entered_on: string;
  notes: string;
}

function emptySampleForm(): SampleForm {
  return {
    report_number: "",
    seven_day_psi: "",
    seven_day_entered_on: "",
    twenty_eight_day_psi: "",
    twenty_eight_day_entered_on: "",
    notes: "",
  };
}

function sampleFormFromRow(s: ConcreteSample): SampleForm {
  return {
    report_number: s.report_number ?? "",
    seven_day_psi: s.seven_day_psi ?? "",
    seven_day_entered_on: s.seven_day_entered_on?.slice(0, 10) ?? "",
    twenty_eight_day_psi: s.twenty_eight_day_psi ?? "",
    twenty_eight_day_entered_on: s.twenty_eight_day_entered_on?.slice(0, 10) ?? "",
    notes: s.notes ?? "",
  };
}

function sampleToPayload(form: SampleForm) {
  return {
    report_number: blank(form.report_number),
    seven_day_psi: blank(form.seven_day_psi),
    seven_day_entered_on: blank(form.seven_day_entered_on),
    twenty_eight_day_psi: blank(form.twenty_eight_day_psi),
    twenty_eight_day_entered_on: blank(form.twenty_eight_day_entered_on),
    notes: blank(form.notes),
  };
}

function ResultChip({ result }: { result: ConcreteSample["result"] }) {
  if (result === null) return <span className="badge-neutral">Pending</span>;
  return <span className={result === "pass" ? "badge-result-pass" : "badge-result-fail"}>{result}</span>;
}

function SampleRow({
  sample,
  onSaved,
  onDeleted,
}: {
  sample: ConcreteSample;
  onSaved: () => void;
  onDeleted: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<SampleForm>(sampleFormFromRow(sample));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      await updateSample(sample.id, sampleToPayload(form));
      setEditing(false);
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to save sample");
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!window.confirm("Delete this sample?")) return;
    try {
      await deleteSample(sample.id);
      onDeleted();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to delete sample");
    }
  }

  if (!editing) {
    return (
      <tr>
        <td>{sample.report_number ?? "—"}</td>
        <td>{sample.seven_day_psi ?? "—"}</td>
        <td>{sample.seven_day_entered_on ? sample.seven_day_entered_on.slice(0, 10) : "—"}</td>
        <td>{sample.twenty_eight_day_psi ?? "—"}</td>
        <td>{sample.twenty_eight_day_entered_on ? sample.twenty_eight_day_entered_on.slice(0, 10) : "—"}</td>
        <td>
          <ResultChip result={sample.result} />
        </td>
        <td>{sample.margin_above_design ?? "—"}</td>
        <td>{sample.notes ?? "—"}</td>
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
        <input value={form.report_number} onChange={(e) => setForm({ ...form, report_number: e.target.value })} />
      </td>
      <td>
        <input
          type="number"
          step="any"
          value={form.seven_day_psi}
          onChange={(e) => setForm({ ...form, seven_day_psi: e.target.value })}
        />
      </td>
      <td>
        <input
          type="date"
          value={form.seven_day_entered_on}
          onChange={(e) => setForm({ ...form, seven_day_entered_on: e.target.value })}
        />
      </td>
      <td>
        <input
          type="number"
          step="any"
          value={form.twenty_eight_day_psi}
          onChange={(e) => setForm({ ...form, twenty_eight_day_psi: e.target.value })}
        />
      </td>
      <td>
        <input
          type="date"
          value={form.twenty_eight_day_entered_on}
          onChange={(e) => setForm({ ...form, twenty_eight_day_entered_on: e.target.value })}
        />
      </td>
      <td colSpan={2}>
        <input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Notes" />
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

export function ConcretePourDetailPage() {
  const { id } = useParams<{ id: string }>();
  const isNew = id === "new";
  const navigate = useNavigate();

  const [pour, setPour] = useState<ConcretePour | null>(null);
  const [form, setForm] = useState<PourForm>(emptyForm());
  const [structures, setStructures] = useState<ConcreteStructure[]>([]);
  const [mixDesigns, setMixDesigns] = useState<ConcreteMixDesign[]>([]);
  const [loading, setLoading] = useState(!isNew);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [newSample, setNewSample] = useState<SampleForm>(emptySampleForm());
  const [addingSample, setAddingSample] = useState(false);
  const [sampleError, setSampleError] = useState<string | null>(null);

  useEffect(() => {
    listStructures({ limit: 500 })
      .then((res) => setStructures(res.data))
      .catch(() => {});
    listMixDesigns({ limit: 500 })
      .then((res) => setMixDesigns(res.data))
      .catch(() => {});
  }, []);

  async function refresh() {
    if (isNew || !id) return;
    setLoading(true);
    try {
      const loaded = await getPour(id);
      setPour(loaded);
      setForm(buildForm(loaded));
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load pour");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaveError(null);
    const payload = {
      pour_date: form.pour_date,
      location: form.location,
      structure_id: form.structure_id || null,
      mix_design_id: form.mix_design_id || null,
      design_strength_psi: Number(form.design_strength_psi),
      yds_required: blank(form.yds_required),
      yds_delivered: blank(form.yds_delivered),
      yds_installed: blank(form.yds_installed),
      is_subcontractor: form.is_subcontractor,
      poured_by: blank(form.poured_by),
      invoice_number: blank(form.invoice_number),
      invoice_total: blank(form.invoice_total),
      notes: blank(form.notes),
    };
    try {
      if (isNew) {
        const created = await createPour(payload);
        navigate(`/concrete/pours/${created.id}`, { replace: true });
      } else if (id) {
        await updatePour(id, payload);
        await refresh();
      }
    } catch (err) {
      setSaveError(err instanceof ApiError ? err.message : "Failed to save pour");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!id || isNew) return;
    if (!window.confirm("Delete this pour and all its samples?")) return;
    try {
      await deletePour(id);
      navigate("/concrete/pours", { replace: true });
    } catch (err) {
      setSaveError(err instanceof ApiError ? err.message : "Failed to delete pour");
    }
  }

  async function handleAddSample(e: FormEvent) {
    e.preventDefault();
    if (!id || isNew) return;
    setSampleError(null);
    try {
      await addSample(id, sampleToPayload(newSample));
      setNewSample(emptySampleForm());
      setAddingSample(false);
      await refresh();
    } catch (err) {
      setSampleError(err instanceof ApiError ? err.message : "Failed to add sample");
    }
  }

  if (loading) return <p>Loading…</p>;
  if (error) return <p className="error">{error}</p>;
  if (!isNew && (!pour || !id)) return <p>Pour not found.</p>;

  return (
    <div>
      <div className="detail-topbar">
        <nav className="detail-breadcrumb" aria-label="Breadcrumb">
          <Link to="/concrete/pours">Pours</Link>
          <span className="detail-breadcrumb-sep">&rsaquo;</span>
          <span>{isNew ? "New pour" : form.location || "Pour"}</span>
        </nav>
        {pour && <div className="detail-meta">Updated {new Date(pour.updated_at).toLocaleString()}</div>}
      </div>
      <ConcreteNav />

      <form onSubmit={handleSave}>
        <div className="detail-title-bar">
          <input
            className="detail-title-input"
            value={form.location}
            onChange={(e) => setForm({ ...form, location: e.target.value })}
            aria-label="Location"
            placeholder="Pour location"
          />
          <div className="detail-title-actions">
            {!isNew && (
              <button type="button" className="button-secondary" onClick={handleDelete} disabled={saving}>
                Delete
              </button>
            )}
            <button type="submit" disabled={saving}>
              {saving ? "Saving…" : isNew ? "Create pour" : "Save"}
            </button>
          </div>
        </div>

        {saveError && <p className="error">{saveError}</p>}

        {pour && (
          <div className="stat-tiles">
            <div className="stat-tile">
              <span className="stat-value">{pour.sample_count}</span>
              <span className="stat-label">Samples</span>
            </div>
            <div className="stat-tile">
              <span className="stat-value">{pour.seven_day_avg ?? "—"}</span>
              <span className="stat-label">7-Day Avg</span>
            </div>
            <div className="stat-tile">
              <span className="stat-value">{pour.twenty_eight_day_avg ?? "—"}</span>
              <span className="stat-label">28-Day Avg</span>
            </div>
            <div className="stat-tile">
              <span className="stat-value">{pour.over_under_required ?? "—"}</span>
              <span className="stat-label">Over/Under Required</span>
            </div>
            {(pour.seven_day_overdue || pour.twenty_eight_day_overdue) && (
              <div className="stat-tile alert">
                <span className="stat-value">
                  {[pour.seven_day_overdue && "7-day", pour.twenty_eight_day_overdue && "28-day"]
                    .filter(Boolean)
                    .join(" + ")}
                </span>
                <span className="stat-label">Overdue</span>
              </div>
            )}
          </div>
        )}

        <div className="detail-grid">
          <div className="detail-col">
            <div className="card detail-card">
              <h2>Pour Details</h2>
              <label>
                Pour Date
                <input
                  type="date"
                  required
                  value={form.pour_date}
                  onChange={(e) => setForm({ ...form, pour_date: e.target.value })}
                />
              </label>
              <label>
                Structure
                <select
                  value={form.structure_id}
                  onChange={(e) => setForm({ ...form, structure_id: e.target.value })}
                >
                  <option value="">(none)</option>
                  {structures.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Mix Design
                <select
                  value={form.mix_design_id}
                  onChange={(e) => setForm({ ...form, mix_design_id: e.target.value })}
                >
                  <option value="">(none)</option>
                  {mixDesigns.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.supplier} — {m.mix_number}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Design Strength (psi)
                <input
                  type="number"
                  required
                  value={form.design_strength_psi}
                  onChange={(e) => setForm({ ...form, design_strength_psi: e.target.value })}
                />
              </label>
              <label className="checkbox-filter">
                <input
                  type="checkbox"
                  checked={form.is_subcontractor}
                  onChange={(e) => setForm({ ...form, is_subcontractor: e.target.checked })}
                />
                Subcontractor pour
              </label>
              <label>
                Poured By
                <input value={form.poured_by} onChange={(e) => setForm({ ...form, poured_by: e.target.value })} />
              </label>
            </div>

            <div className="card detail-card">
              <h2>Yards</h2>
              <label>
                Yds Required
                <input
                  type="number"
                  step="any"
                  value={form.yds_required}
                  onChange={(e) => setForm({ ...form, yds_required: e.target.value })}
                />
              </label>
              <label>
                Yds Delivered
                <input
                  type="number"
                  step="any"
                  value={form.yds_delivered}
                  onChange={(e) => setForm({ ...form, yds_delivered: e.target.value })}
                />
              </label>
              <label>
                Yds Installed
                <input
                  type="number"
                  step="any"
                  value={form.yds_installed}
                  onChange={(e) => setForm({ ...form, yds_installed: e.target.value })}
                />
              </label>
            </div>
          </div>

          <div className="detail-col">
            <div className="card detail-card">
              <h2>Invoicing &amp; Notes</h2>
              <label>
                Invoice #
                <input
                  value={form.invoice_number}
                  onChange={(e) => setForm({ ...form, invoice_number: e.target.value })}
                />
              </label>
              <label>
                Invoice Total
                <input
                  type="number"
                  step="any"
                  value={form.invoice_total}
                  onChange={(e) => setForm({ ...form, invoice_total: e.target.value })}
                />
              </label>
              <label>
                Notes
                <textarea rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
              </label>
            </div>
          </div>
        </div>
      </form>

      {!isNew && pour && (
        <div className="card">
          <div className="page-header">
            <h2>Break Samples</h2>
            {!addingSample && (
              <button type="button" className="button-secondary" onClick={() => setAddingSample(true)}>
                Add sample
              </button>
            )}
          </div>

          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Report #</th>
                  <th>7-Day PSI</th>
                  <th>7-Day Entered</th>
                  <th>28-Day PSI</th>
                  <th>28-Day Entered</th>
                  <th>Result</th>
                  <th>Margin</th>
                  <th>Notes</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {addingSample && (
                  <tr>
                    <td>
                      <input
                        value={newSample.report_number}
                        onChange={(e) => setNewSample({ ...newSample, report_number: e.target.value })}
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        step="any"
                        value={newSample.seven_day_psi}
                        onChange={(e) => setNewSample({ ...newSample, seven_day_psi: e.target.value })}
                      />
                    </td>
                    <td>
                      <input
                        type="date"
                        value={newSample.seven_day_entered_on}
                        onChange={(e) => setNewSample({ ...newSample, seven_day_entered_on: e.target.value })}
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        step="any"
                        value={newSample.twenty_eight_day_psi}
                        onChange={(e) => setNewSample({ ...newSample, twenty_eight_day_psi: e.target.value })}
                      />
                    </td>
                    <td>
                      <input
                        type="date"
                        value={newSample.twenty_eight_day_entered_on}
                        onChange={(e) => setNewSample({ ...newSample, twenty_eight_day_entered_on: e.target.value })}
                      />
                    </td>
                    <td colSpan={2}>
                      <input
                        value={newSample.notes}
                        onChange={(e) => setNewSample({ ...newSample, notes: e.target.value })}
                        placeholder="Notes"
                      />
                    </td>
                    <td className="row-actions">
                      <button type="button" onClick={handleAddSample}>
                        Add
                      </button>
                      <button type="button" className="button-secondary" onClick={() => setAddingSample(false)}>
                        Cancel
                      </button>
                    </td>
                  </tr>
                )}
                {pour.samples.map((s) => (
                  <SampleRow key={s.id} sample={s} onSaved={refresh} onDeleted={refresh} />
                ))}
                {pour.samples.length === 0 && !addingSample && (
                  <tr>
                    <td colSpan={9}>No samples taken.</td>
                  </tr>
                )}
              </tbody>
              {pour.samples.length > 0 && (
                <tfoot>
                  <tr>
                    <td>
                      <strong>Averages</strong>
                    </td>
                    <td>
                      <strong>{pour.seven_day_avg ?? "—"}</strong>
                    </td>
                    <td></td>
                    <td>
                      <strong>{pour.twenty_eight_day_avg ?? "—"}</strong>
                    </td>
                    <td colSpan={5}></td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
          {sampleError && <p className="error">{sampleError}</p>}
        </div>
      )}
    </div>
  );
}
