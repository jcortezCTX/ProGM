import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ApiError } from "../api/client";
import { createActivity, deleteActivity, getActivity, listSections, updateActivity } from "../api/schedule";
import type { ScheduleActivityDetail, ScheduleActivityInput, ScheduleEntryMode, ScheduleSection } from "../api/types";
import { ScheduleNav } from "../components/ScheduleNav";

interface ActivityForm {
  section_id: string;
  code: string;
  description: string;
  crew: string;
  responsibility: string;
  notes: string;
  budget_mh: string;
  burned_mh: string;
  entry_mode: ScheduleEntryMode;
  start_date: string;
  end_date: string;
  duration_days: string;
  night_work: boolean;
  critical_path: boolean;
  shutdown: boolean;
}

function emptyForm(): ActivityForm {
  return {
    section_id: "",
    code: "",
    description: "",
    crew: "",
    responsibility: "",
    notes: "",
    budget_mh: "",
    burned_mh: "",
    entry_mode: "start_end",
    start_date: "",
    end_date: "",
    duration_days: "",
    night_work: false,
    critical_path: false,
    shutdown: false,
  };
}

function buildForm(a: ScheduleActivityDetail): ActivityForm {
  return {
    section_id: a.section_id,
    code: a.code ?? "",
    description: a.description,
    crew: a.crew ?? "",
    responsibility: a.responsibility ?? "",
    notes: a.notes ?? "",
    budget_mh: a.budget_mh ?? "",
    burned_mh: a.burned_mh ?? "",
    entry_mode: a.entry_mode,
    start_date: a.start_date ? a.start_date.slice(0, 10) : "",
    end_date: a.end_date ? a.end_date.slice(0, 10) : "",
    duration_days: a.duration_days !== null ? String(a.duration_days) : "",
    night_work: a.night_work,
    critical_path: a.critical_path,
    shutdown: a.shutdown,
  };
}

function blank(v: string): string | null {
  const t = v.trim();
  return t === "" ? null : t;
}

export function ScheduleActivityDetailPage() {
  const { id } = useParams<{ id: string }>();
  const isNew = id === "new";
  const navigate = useNavigate();

  const [activity, setActivity] = useState<ScheduleActivityDetail | null>(null);
  const [form, setForm] = useState<ActivityForm>(emptyForm());
  const [sections, setSections] = useState<ScheduleSection[]>([]);
  const [loading, setLoading] = useState(!isNew);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    listSections()
      .then((res) => setSections(res.data))
      .catch(() => {});
  }, []);

  async function refresh() {
    if (isNew || !id) return;
    setLoading(true);
    try {
      const loaded = await getActivity(id);
      setActivity(loaded);
      setForm(buildForm(loaded));
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load activity");
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
    const payload: ScheduleActivityInput = {
      section_id: form.section_id,
      code: blank(form.code),
      description: form.description,
      crew: blank(form.crew),
      responsibility: blank(form.responsibility),
      notes: blank(form.notes),
      budget_mh: blank(form.budget_mh),
      burned_mh: blank(form.burned_mh),
      entry_mode: form.entry_mode,
      start_date: blank(form.start_date),
      end_date: form.entry_mode === "start_end" ? blank(form.end_date) : null,
      duration_days: form.entry_mode === "start_duration" && form.duration_days ? Number(form.duration_days) : null,
      night_work: form.night_work,
      critical_path: form.critical_path,
      shutdown: form.shutdown,
    };
    try {
      if (isNew) {
        const created = await createActivity(payload);
        navigate(`/schedule/activities/${created.id}`, { replace: true });
      } else if (id) {
        await updateActivity(id, payload);
        await refresh();
      }
    } catch (err) {
      setSaveError(err instanceof ApiError ? err.message : "Failed to save activity");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!id || isNew) return;
    if (!window.confirm("Delete this activity?")) return;
    try {
      await deleteActivity(id);
      navigate("/schedule/activities", { replace: true });
    } catch (err) {
      setSaveError(err instanceof ApiError ? err.message : "Failed to delete activity");
    }
  }

  if (loading) return <p>Loading…</p>;
  if (error) return <p className="error">{error}</p>;
  if (!isNew && (!activity || !id)) return <p>Activity not found.</p>;

  return (
    <div>
      <div className="detail-topbar">
        <nav className="detail-breadcrumb" aria-label="Breadcrumb">
          <Link to="/schedule/activities">Activities</Link>
          <span className="detail-breadcrumb-sep">&rsaquo;</span>
          <span>{isNew ? "New activity" : form.description || "Activity"}</span>
        </nav>
        {activity && <div className="detail-meta">Updated {new Date(activity.updated_at).toLocaleString()}</div>}
      </div>
      <ScheduleNav />

      <form onSubmit={handleSave}>
        <div className="detail-title-bar">
          <input
            className="detail-title-input"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            aria-label="Description"
            placeholder="Work description"
            required
          />
          <div className="detail-title-actions">
            {!isNew && (
              <button type="button" className="button-secondary" onClick={handleDelete} disabled={saving}>
                Delete
              </button>
            )}
            <button type="submit" disabled={saving}>
              {saving ? "Saving…" : isNew ? "Create activity" : "Save"}
            </button>
          </div>
        </div>

        {saveError && <p className="error">{saveError}</p>}

        {activity && (
          <div className="stat-tiles">
            <div className="stat-tile">
              <span className="stat-value">{activity.days}</span>
              <span className="stat-label">Working Days</span>
            </div>
            <div className="stat-tile">
              <span className="stat-value">{activity.delta ?? "—"}</span>
              <span className="stat-label">Delta (MH)</span>
            </div>
            <div className="stat-tile">
              <span className="stat-value">{activity.first_day ? activity.first_day.slice(0, 10) : "—"}</span>
              <span className="stat-label">First Day</span>
            </div>
            <div className="stat-tile">
              <span className="stat-value">{activity.last_day ? activity.last_day.slice(0, 10) : "—"}</span>
              <span className="stat-label">Last Day</span>
            </div>
          </div>
        )}

        <div className="detail-grid">
          <div className="detail-col">
            <div className="card detail-card">
              <h2>Activity Details</h2>
              <label>
                Section
                <select
                  required
                  value={form.section_id}
                  onChange={(e) => setForm({ ...form, section_id: e.target.value })}
                >
                  <option value="">(choose a section)</option>
                  {sections.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Code
                <input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} />
              </label>
              <label>
                Crew
                <input value={form.crew} onChange={(e) => setForm({ ...form, crew: e.target.value })} />
              </label>
              <label>
                Responsibility
                <input
                  value={form.responsibility}
                  onChange={(e) => setForm({ ...form, responsibility: e.target.value })}
                />
              </label>
              <label>
                Notes
                <textarea rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
              </label>
              <label className="checkbox-filter">
                <input
                  type="checkbox"
                  checked={form.critical_path}
                  onChange={(e) => setForm({ ...form, critical_path: e.target.checked })}
                />
                Critical path
              </label>
              <label className="checkbox-filter">
                <input
                  type="checkbox"
                  checked={form.night_work}
                  onChange={(e) => setForm({ ...form, night_work: e.target.checked })}
                />
                Night work
              </label>
              <label className="checkbox-filter">
                <input
                  type="checkbox"
                  checked={form.shutdown}
                  onChange={(e) => setForm({ ...form, shutdown: e.target.checked })}
                />
                Shutdown
              </label>
            </div>

            <div className="card detail-card">
              <h2>Man-hours</h2>
              <label>
                Budget MH
                <input
                  type="number"
                  step="any"
                  value={form.budget_mh}
                  onChange={(e) => setForm({ ...form, budget_mh: e.target.value })}
                />
              </label>
              <label>
                Burned MH
                <input
                  type="number"
                  step="any"
                  value={form.burned_mh}
                  onChange={(e) => setForm({ ...form, burned_mh: e.target.value })}
                />
              </label>
            </div>
          </div>

          <div className="detail-col">
            <div className="card detail-card">
              <h2>Schedule</h2>
              <label>
                Entry mode
                <select
                  value={form.entry_mode}
                  onChange={(e) => setForm({ ...form, entry_mode: e.target.value as ScheduleEntryMode })}
                >
                  <option value="start_end">Start / End date</option>
                  <option value="start_duration">Start date / Duration</option>
                </select>
              </label>
              <label>
                Start date
                <input
                  type="date"
                  value={form.start_date}
                  onChange={(e) => setForm({ ...form, start_date: e.target.value })}
                />
              </label>
              {form.entry_mode === "start_end" ? (
                <label>
                  End date
                  <input
                    type="date"
                    value={form.end_date}
                    onChange={(e) => setForm({ ...form, end_date: e.target.value })}
                  />
                </label>
              ) : (
                <label>
                  Duration (working days)
                  <input
                    type="number"
                    min={1}
                    step={1}
                    value={form.duration_days}
                    onChange={(e) => setForm({ ...form, duration_days: e.target.value })}
                  />
                </label>
              )}
              <p className="muted">
                Leave start date empty to keep this activity unscheduled — it will not appear on the Gantt.
              </p>
            </div>

            {activity && activity.overrides.length > 0 && (
              <div className="card detail-card">
                <h2>Day Overrides</h2>
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Day</th>
                        <th>Kind</th>
                        <th>Crew Count</th>
                        <th>Marker</th>
                      </tr>
                    </thead>
                    <tbody>
                      {activity.overrides.map((o) => (
                        <tr key={o.day}>
                          <td>{o.day.slice(0, 10)}</td>
                          <td>{o.kind}</td>
                          <td>{o.crew_count ?? "—"}</td>
                          <td>{o.marker ?? "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="muted">Edit per-day overrides from the 6 Week Lookahead grid.</p>
              </div>
            )}
          </div>
        </div>
      </form>
    </div>
  );
}
