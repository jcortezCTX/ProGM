import { useState } from "react";
import { ApiError } from "../api/client";
import { updateActivityDays } from "../api/schedule";
import type { ScheduleGanttCell } from "../api/types";

export function ScheduleDayCellEditor({
  activityId,
  activityLabel,
  date,
  dayOfWeek,
  cell,
  onClose,
  onSaved,
}: {
  activityId: string;
  activityLabel: string;
  date: string;
  dayOfWeek: string;
  cell: ScheduleGanttCell;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [crewCount, setCrewCount] = useState(cell.crew_count !== null ? String(cell.crew_count) : "");
  const [marker, setMarker] = useState(cell.marker ?? "");
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(action: "save" | "exclude" | "clear") {
    setSaving(action);
    setError(null);
    try {
      if (action === "clear") {
        await updateActivityDays(activityId, [{ action: "remove", day: date }]);
      } else if (action === "exclude") {
        await updateActivityDays(activityId, [{ action: "upsert", day: date, kind: "exclude" }]);
      } else {
        await updateActivityDays(activityId, [
          {
            action: "upsert",
            day: date,
            kind: "add",
            crew_count: crewCount.trim() === "" ? null : Number(crewCount),
            marker: marker.trim() === "" ? null : marker.trim(),
          },
        ]);
      }
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to save day override");
    } finally {
      setSaving(null);
    }
  }

  return (
    <div className="panel-overlay" onClick={onClose}>
      <div className="panel gantt-day-panel" onClick={(e) => e.stopPropagation()}>
        <div className="panel-header">
          <div>
            <strong>{activityLabel}</strong>
            <div className="muted">
              {dayOfWeek} {date}
            </div>
          </div>
          <button type="button" className="panel-close" onClick={onClose} aria-label="Close">
            &times;
          </button>
        </div>

        {error && <p className="error">{error}</p>}

        <div className="property-rows">
          <div className="property-row">
            <span className="property-row-label">Status</span>
            <span>{cell.scheduled ? "Scheduled" : "Not scheduled"}</span>
          </div>
          <div className="property-row">
            <span className="property-row-label">Crew count</span>
            <input
              type="number"
              min={0}
              step={1}
              value={crewCount}
              onChange={(e) => setCrewCount(e.target.value)}
            />
          </div>
          <div className="property-row">
            <span className="property-row-label">Marker</span>
            <input value={marker} maxLength={2} onChange={(e) => setMarker(e.target.value)} placeholder="P/I/X/…" />
          </div>
        </div>

        <div className="panel-footer row-actions">
          <button type="button" onClick={() => run("save")} disabled={saving !== null}>
            {saving === "save" ? "Saving…" : cell.scheduled ? "Save" : "Add this day"}
          </button>
          {cell.scheduled && (
            <button type="button" className="button-secondary" onClick={() => run("exclude")} disabled={saving !== null}>
              {saving === "exclude" ? "Excluding…" : "Exclude day"}
            </button>
          )}
          <button type="button" className="button-secondary" onClick={() => run("clear")} disabled={saving !== null}>
            {saving === "clear" ? "Clearing…" : "Clear override"}
          </button>
          <button type="button" className="button-secondary" onClick={onClose} disabled={saving !== null}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
