import { useEffect, useState, type FormEvent } from "react";
import { ApiError } from "../api/client";
import {
  createHoliday,
  createSection,
  deleteHoliday,
  deleteSection,
  listHolidays,
  listSections,
  reorderSections,
  updateSection,
} from "../api/schedule";
import type { ScheduleHoliday, ScheduleSection } from "../api/types";
import { ScheduleNav } from "../components/ScheduleNav";

function SectionRow({
  section,
  isFirst,
  isLast,
  onChanged,
  onMove,
}: {
  section: ScheduleSection;
  isFirst: boolean;
  isLast: boolean;
  onChanged: () => void;
  onMove: (direction: "up" | "down") => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(section.name);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      await updateSection(section.id, { name });
      setEditing(false);
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!window.confirm(`Delete section "${section.name}"?`)) return;
    try {
      await deleteSection(section.id);
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to delete");
    }
  }

  return (
    <tr>
      <td>
        {editing ? (
          <input value={name} onChange={(e) => setName(e.target.value)} />
        ) : (
          section.name
        )}
      </td>
      <td className="row-actions">
        <button type="button" className="button-secondary" onClick={() => onMove("up")} disabled={isFirst}>
          Move up
        </button>
        <button type="button" className="button-secondary" onClick={() => onMove("down")} disabled={isLast}>
          Move down
        </button>
        {editing ? (
          <>
            <button type="button" onClick={save} disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </button>
            <button type="button" className="button-secondary" onClick={() => setEditing(false)} disabled={saving}>
              Cancel
            </button>
          </>
        ) : (
          <>
            <button type="button" className="button-secondary" onClick={() => setEditing(true)}>
              Rename
            </button>
            <button type="button" className="button-secondary" onClick={remove}>
              Delete
            </button>
          </>
        )}
        {error && <p className="error">{error}</p>}
      </td>
    </tr>
  );
}

export function ScheduleSettingsPage() {
  const [sections, setSections] = useState<ScheduleSection[]>([]);
  const [holidays, setHolidays] = useState<ScheduleHoliday[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [newSectionName, setNewSectionName] = useState("");
  const [addingSection, setAddingSection] = useState(false);
  const [sectionError, setSectionError] = useState<string | null>(null);

  const [newHoliday, setNewHoliday] = useState({ day: "", name: "" });
  const [addingHoliday, setAddingHoliday] = useState(false);
  const [holidayError, setHolidayError] = useState<string | null>(null);

  async function refresh() {
    setLoading(true);
    try {
      const [sectionRes, holidayRes] = await Promise.all([listSections(), listHolidays()]);
      setSections(sectionRes.data);
      setHolidays(holidayRes.data);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  async function handleAddSection(e: FormEvent) {
    e.preventDefault();
    setSectionError(null);
    try {
      await createSection({ name: newSectionName });
      setNewSectionName("");
      setAddingSection(false);
      await refresh();
    } catch (err) {
      setSectionError(err instanceof ApiError ? err.message : "Failed to add section");
    }
  }

  async function moveSection(id: string, direction: "up" | "down") {
    const ordered = [...sections].sort((a, b) => a.sort_order - b.sort_order);
    const index = ordered.findIndex((s) => s.id === id);
    const swapWith = direction === "up" ? index - 1 : index + 1;
    if (swapWith < 0 || swapWith >= ordered.length) return;
    [ordered[index], ordered[swapWith]] = [ordered[swapWith], ordered[index]];
    try {
      await reorderSections(ordered.map((s) => s.id));
      await refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to reorder sections");
    }
  }

  async function handleAddHoliday(e: FormEvent) {
    e.preventDefault();
    setHolidayError(null);
    try {
      await createHoliday(newHoliday);
      setNewHoliday({ day: "", name: "" });
      setAddingHoliday(false);
      await refresh();
    } catch (err) {
      setHolidayError(err instanceof ApiError ? err.message : "Failed to add holiday");
    }
  }

  async function handleDeleteHoliday(id: string) {
    if (!window.confirm("Delete this holiday?")) return;
    try {
      await deleteHoliday(id);
      await refresh();
    } catch (err) {
      setHolidayError(err instanceof ApiError ? err.message : "Failed to delete holiday");
    }
  }

  const orderedSections = [...sections].sort((a, b) => a.sort_order - b.sort_order);
  const orderedHolidays = [...holidays].sort((a, b) => a.day.localeCompare(b.day));

  return (
    <div>
      <div className="page-header">
        <h1>Schedule</h1>
      </div>
      <ScheduleNav />

      {error && <p className="error">{error}</p>}
      {loading ? (
        <p>Loading…</p>
      ) : (
        <>
          <div className="page-header">
            <h2>Sections</h2>
            {!addingSection && (
              <button type="button" onClick={() => setAddingSection(true)}>
                Add section
              </button>
            )}
          </div>
          {sectionError && <p className="error">{sectionError}</p>}
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {addingSection && (
                  <tr>
                    <td>
                      <input value={newSectionName} onChange={(e) => setNewSectionName(e.target.value)} />
                    </td>
                    <td className="row-actions">
                      <button type="button" onClick={handleAddSection}>
                        Add
                      </button>
                      <button type="button" className="button-secondary" onClick={() => setAddingSection(false)}>
                        Cancel
                      </button>
                    </td>
                  </tr>
                )}
                {orderedSections.map((s, i) => (
                  <SectionRow
                    key={s.id}
                    section={s}
                    isFirst={i === 0}
                    isLast={i === orderedSections.length - 1}
                    onChanged={refresh}
                    onMove={(direction) => moveSection(s.id, direction)}
                  />
                ))}
                {orderedSections.length === 0 && !addingSection && (
                  <tr>
                    <td colSpan={2}>No sections yet.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="page-header">
            <h2>Holidays</h2>
            {!addingHoliday && (
              <button type="button" onClick={() => setAddingHoliday(true)}>
                Add holiday
              </button>
            )}
          </div>
          {holidayError && <p className="error">{holidayError}</p>}
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Day</th>
                  <th>Name</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {addingHoliday && (
                  <tr>
                    <td>
                      <input
                        type="date"
                        value={newHoliday.day}
                        onChange={(e) => setNewHoliday({ ...newHoliday, day: e.target.value })}
                      />
                    </td>
                    <td>
                      <input
                        value={newHoliday.name}
                        onChange={(e) => setNewHoliday({ ...newHoliday, name: e.target.value })}
                        placeholder="e.g. County Holiday"
                      />
                    </td>
                    <td className="row-actions">
                      <button type="button" onClick={handleAddHoliday}>
                        Add
                      </button>
                      <button type="button" className="button-secondary" onClick={() => setAddingHoliday(false)}>
                        Cancel
                      </button>
                    </td>
                  </tr>
                )}
                {orderedHolidays.map((h) => (
                  <tr key={h.id}>
                    <td>{h.day.slice(0, 10)}</td>
                    <td>{h.name}</td>
                    <td className="row-actions">
                      <button type="button" className="button-secondary" onClick={() => handleDeleteHoliday(h.id)}>
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
                {orderedHolidays.length === 0 && !addingHoliday && (
                  <tr>
                    <td colSpan={3}>No holidays yet.</td>
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
