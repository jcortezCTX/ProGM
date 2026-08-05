import { useEffect, useState, type FormEvent } from "react";
import { ApiError } from "../api/client";
import {
  createPumpTruckRental,
  deletePumpTruckRental,
  listPumpTruckRentals,
  updatePumpTruckRental,
} from "../api/concrete";
import type { PumpTruckRental } from "../api/types";
import { ConcreteNav } from "../components/ConcreteNav";

interface Form {
  rental_date: string;
  location: string;
  truck_size_requested: string;
  truck_size_sent: string;
  hours: string;
  invoice_number: string;
  amount: string;
  cubic_yards: string;
  date_approved: string;
  notes: string;
}

function emptyForm(): Form {
  return {
    rental_date: "",
    location: "",
    truck_size_requested: "",
    truck_size_sent: "",
    hours: "",
    invoice_number: "",
    amount: "",
    cubic_yards: "",
    date_approved: "",
    notes: "",
  };
}

function formFromRow(r: PumpTruckRental): Form {
  return {
    rental_date: r.rental_date.slice(0, 10),
    location: r.location,
    truck_size_requested: r.truck_size_requested ?? "",
    truck_size_sent: r.truck_size_sent ?? "",
    hours: r.hours ?? "",
    invoice_number: r.invoice_number ?? "",
    amount: r.amount ?? "",
    cubic_yards: r.cubic_yards ?? "",
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
    rental_date: f.rental_date,
    location: f.location,
    truck_size_requested: blank(f.truck_size_requested),
    truck_size_sent: blank(f.truck_size_sent),
    hours: blank(f.hours),
    invoice_number: blank(f.invoice_number),
    amount: blank(f.amount),
    cubic_yards: blank(f.cubic_yards),
    date_approved: blank(f.date_approved),
    notes: blank(f.notes),
  };
}

function Row({ row, onChanged }: { row: PumpTruckRental; onChanged: () => void }) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<Form>(formFromRow(row));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      await updatePumpTruckRental(row.id, toPayload(form));
      setEditing(false);
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!window.confirm("Delete this rental?")) return;
    try {
      await deletePumpTruckRental(row.id);
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to delete");
    }
  }

  if (!editing) {
    return (
      <tr>
        <td>{new Date(row.rental_date).toLocaleDateString()}</td>
        <td>{row.location}</td>
        <td>{row.truck_size_requested ?? "—"}</td>
        <td>{row.truck_size_sent ?? "—"}</td>
        <td>{row.hours ?? "—"}</td>
        <td>{row.cubic_yards ?? "—"}</td>
        <td>{row.amount ? `$${row.amount}` : "—"}</td>
        <td>{row.per_cy === null ? "—" : `$${row.per_cy.toFixed(2)}`}</td>
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
        <input type="date" value={form.rental_date} onChange={(e) => setForm({ ...form, rental_date: e.target.value })} />
      </td>
      <td>
        <input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} />
      </td>
      <td>
        <input
          value={form.truck_size_requested}
          onChange={(e) => setForm({ ...form, truck_size_requested: e.target.value })}
        />
      </td>
      <td>
        <input value={form.truck_size_sent} onChange={(e) => setForm({ ...form, truck_size_sent: e.target.value })} />
      </td>
      <td>
        <input type="number" step="any" value={form.hours} onChange={(e) => setForm({ ...form, hours: e.target.value })} />
      </td>
      <td>
        <input
          type="number"
          step="any"
          value={form.cubic_yards}
          onChange={(e) => setForm({ ...form, cubic_yards: e.target.value })}
        />
      </td>
      <td>
        <input type="number" step="any" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
      </td>
      <td>—</td>
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

export function ConcretePumpTruckPage() {
  const [rows, setRows] = useState<PumpTruckRental[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [newForm, setNewForm] = useState<Form>(emptyForm());
  const [addError, setAddError] = useState<string | null>(null);

  async function refresh() {
    setLoading(true);
    try {
      const res = await listPumpTruckRentals({ limit: 500, order: "desc" });
      setRows(res.data);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load pump truck rentals");
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
      await createPumpTruckRental(toPayload(newForm));
      setNewForm(emptyForm());
      setAdding(false);
      await refresh();
    } catch (err) {
      setAddError(err instanceof ApiError ? err.message : "Failed to add rental");
    }
  }

  return (
    <div>
      <div className="page-header">
        <h1>Concrete Log</h1>
      </div>
      <ConcreteNav />

      <div className="page-header">
        <h2>Pump Truck Tracking</h2>
        {!adding && (
          <button type="button" onClick={() => setAdding(true)}>
            Add rental
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
                <th>Date</th>
                <th>Location</th>
                <th>Size Requested</th>
                <th>Size Sent</th>
                <th>Hours</th>
                <th>Cubic Yards</th>
                <th>Amount</th>
                <th>$/CY</th>
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
                      value={newForm.rental_date}
                      onChange={(e) => setNewForm({ ...newForm, rental_date: e.target.value })}
                    />
                  </td>
                  <td>
                    <input value={newForm.location} onChange={(e) => setNewForm({ ...newForm, location: e.target.value })} />
                  </td>
                  <td>
                    <input
                      value={newForm.truck_size_requested}
                      onChange={(e) => setNewForm({ ...newForm, truck_size_requested: e.target.value })}
                    />
                  </td>
                  <td>
                    <input
                      value={newForm.truck_size_sent}
                      onChange={(e) => setNewForm({ ...newForm, truck_size_sent: e.target.value })}
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      step="any"
                      value={newForm.hours}
                      onChange={(e) => setNewForm({ ...newForm, hours: e.target.value })}
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      step="any"
                      value={newForm.cubic_yards}
                      onChange={(e) => setNewForm({ ...newForm, cubic_yards: e.target.value })}
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
                  <td>—</td>
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
                  <td colSpan={11}>No pump truck rentals recorded yet.</td>
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
