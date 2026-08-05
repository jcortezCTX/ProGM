import { useEffect, useState, type FormEvent } from "react";
import { ApiError } from "../api/client";
import { createConcreteCredit, deleteConcreteCredit, listConcreteCredits, updateConcreteCredit } from "../api/concrete";
import type { ConcreteCredit } from "../api/types";
import { ConcreteNav } from "../components/ConcreteNav";

interface Form {
  date_received: string;
  amount: string;
  date_approved: string;
  notes: string;
}

function emptyForm(): Form {
  return { date_received: "", amount: "", date_approved: "", notes: "" };
}

function formFromRow(r: ConcreteCredit): Form {
  return {
    date_received: r.date_received.slice(0, 10),
    amount: r.amount,
    date_approved: r.date_approved?.slice(0, 10) ?? "",
    notes: r.notes ?? "",
  };
}

function blank(v: string): string | null {
  const t = v.trim();
  return t === "" ? null : t;
}

function toPayload(f: Form) {
  return {
    date_received: f.date_received,
    amount: f.amount,
    date_approved: blank(f.date_approved),
    notes: blank(f.notes),
  };
}

function Row({ row, onChanged }: { row: ConcreteCredit; onChanged: () => void }) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<Form>(formFromRow(row));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      await updateConcreteCredit(row.id, toPayload(form));
      setEditing(false);
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!window.confirm("Delete this credit?")) return;
    try {
      await deleteConcreteCredit(row.id);
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to delete");
    }
  }

  if (!editing) {
    return (
      <tr>
        <td>{new Date(row.date_received).toLocaleDateString()}</td>
        <td>${row.amount}</td>
        <td>{row.date_approved ? new Date(row.date_approved).toLocaleDateString() : "—"}</td>
        <td>{row.notes ?? "—"}</td>
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
        <input
          type="date"
          value={form.date_received}
          onChange={(e) => setForm({ ...form, date_received: e.target.value })}
        />
      </td>
      <td>
        <input type="number" step="any" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
      </td>
      <td>
        <input
          type="date"
          value={form.date_approved}
          onChange={(e) => setForm({ ...form, date_approved: e.target.value })}
        />
      </td>
      <td>
        <input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
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

export function ConcreteCreditsPage() {
  const [rows, setRows] = useState<ConcreteCredit[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [newForm, setNewForm] = useState<Form>(emptyForm());
  const [addError, setAddError] = useState<string | null>(null);

  async function refresh() {
    setLoading(true);
    try {
      const res = await listConcreteCredits({ limit: 500, order: "desc" });
      setRows(res.data);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load credits");
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
      await createConcreteCredit(toPayload(newForm));
      setNewForm(emptyForm());
      setAdding(false);
      await refresh();
    } catch (err) {
      setAddError(err instanceof ApiError ? err.message : "Failed to add credit");
    }
  }

  return (
    <div>
      <div className="page-header">
        <h1>Concrete Log</h1>
      </div>
      <ConcreteNav />

      <div className="page-header">
        <h2>Concrete Credits</h2>
        {!adding && (
          <button type="button" onClick={() => setAdding(true)}>
            Add credit
          </button>
        )}
      </div>

      {error && <p className="error">{error}</p>}
      {loading ? (
        <p>Loading…</p>
      ) : (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Date Received</th>
                <th>Amount</th>
                <th>Date Approved</th>
                <th>Notes</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {adding && (
                <tr>
                  <td>
                    <input
                      type="date"
                      value={newForm.date_received}
                      onChange={(e) => setNewForm({ ...newForm, date_received: e.target.value })}
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      step="any"
                      value={newForm.amount}
                      onChange={(e) => setNewForm({ ...newForm, amount: e.target.value })}
                    />
                  </td>
                  <td>
                    <input
                      type="date"
                      value={newForm.date_approved}
                      onChange={(e) => setNewForm({ ...newForm, date_approved: e.target.value })}
                    />
                  </td>
                  <td>
                    <input value={newForm.notes} onChange={(e) => setNewForm({ ...newForm, notes: e.target.value })} />
                  </td>
                  <td className="row-actions">
                    <button type="button" onClick={handleAdd}>
                      Add
                    </button>
                    <button type="button" className="button-secondary" onClick={() => setAdding(false)}>
                      Cancel
                    </button>
                  </td>
                </tr>
              )}
              {rows.map((r) => (
                <Row key={r.id} row={r} onChanged={refresh} />
              ))}
              {rows.length === 0 && !adding && (
                <tr>
                  <td colSpan={5}>No credits recorded yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
      {addError && <p className="error">{addError}</p>}
    </div>
  );
}
