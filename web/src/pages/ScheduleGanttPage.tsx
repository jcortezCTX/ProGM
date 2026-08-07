import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ApiError } from "../api/client";
import { downloadGanttPdf, getGantt, listActivities } from "../api/schedule";
import type { ScheduleGanttActivity, ScheduleGanttCell, ScheduleGanttDay, ScheduleGanttResponse } from "../api/types";
import { ScheduleDayCellEditor } from "../components/ScheduleDayCellEditor";
import { ScheduleNav } from "../components/ScheduleNav";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function addDaysIso(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return new Date(d.getTime() + days * MS_PER_DAY).toISOString().slice(0, 10);
}

function formatShort(iso: string): string {
  const [, m, d] = iso.split("-");
  return `${m}/${d}`;
}

interface FrozenCol {
  key: string;
  label: string;
  width: number;
}

const FROZEN_COLS: FrozenCol[] = [
  { key: "code", label: "Code", width: 72 },
  { key: "crew", label: "Crew", width: 110 },
  { key: "description", label: "Description", width: 250 },
  { key: "responsibility", label: "Responsibility", width: 130 },
  { key: "days", label: "Days", width: 56 },
];

const DAY_COL_WIDTH = 34;

function frozenLeft(index: number): number {
  let left = 0;
  for (let i = 0; i < index; i++) left += FROZEN_COLS[i].width;
  return left;
}

function dayClassName(day: ScheduleGanttDay): string {
  const classes = ["gantt-day-cell"];
  if (day.holiday_name) classes.push("gantt-holiday");
  else if (day.is_weekend) classes.push("gantt-weekend");
  return classes.join(" ");
}

function cellClassName(cell: ScheduleGanttCell, activity: ScheduleGanttActivity, day: ScheduleGanttDay): string {
  const classes = ["gantt-cell"];
  if (day.holiday_name) classes.push("gantt-holiday");
  else if (day.is_weekend) classes.push("gantt-weekend");
  if (cell.scheduled) {
    classes.push("gantt-scheduled");
    if (activity.critical_path) classes.push("gantt-flag-critical");
    if (activity.shutdown) classes.push("gantt-flag-shutdown");
    if (activity.night_work) classes.push("gantt-flag-night");
  }
  return classes.join(" ");
}

interface EditorState {
  activityId: string;
  activityLabel: string;
  date: string;
  dayOfWeek: string;
  cell: ScheduleGanttCell;
}

export function ScheduleGanttPage() {
  const [data, setData] = useState<ScheduleGanttResponse | null>(null);
  const [requestedStart, setRequestedStart] = useState<string | undefined>(undefined);
  const [daysByActivity, setDaysByActivity] = useState<Map<string, number>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const load = useCallback((start: string | undefined) => {
    setLoading(true);
    getGantt({ start })
      .then((res) => {
        setData(res);
        setError(null);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load the 6 week lookahead"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load(requestedStart);
  }, [requestedStart, load]);

  useEffect(() => {
    // Reuses the Activities endpoint's server-computed `days` field for the
    // Gantt's frozen "Days" column - the gantt payload itself only carries
    // per-window cells, not the activity's total working-day duration, and
    // that derivation must never happen client-side (see CLAUDE.md).
    listActivities()
      .then((res) => setDaysByActivity(new Map(res.data.map((a) => [a.id, a.days]))))
      .catch(() => {});
  }, []);

  function refetch() {
    load(data ? data.window.start : requestedStart);
  }

  function goToWeek(direction: -1 | 1) {
    const base = data?.window.start ?? requestedStart ?? new Date().toISOString().slice(0, 10);
    setRequestedStart(addDaysIso(base, direction * 7));
  }

  function goToday() {
    setRequestedStart(undefined);
  }

  function exportPdf() {
    if (!data) return;
    setExporting(true);
    setExportError(null);
    // Exports the window currently on screen, not the requested start - those
    // differ whenever the API snapped the start back to its Sunday.
    downloadGanttPdf({ start: data.window.start, weeks: data.window.weeks })
      .catch((err) => setExportError(err instanceof ApiError ? err.message : "Failed to export the PDF"))
      .finally(() => setExporting(false));
  }

  const weeks = useMemo(() => {
    if (!data) return [];
    const chunks: ScheduleGanttDay[][] = [];
    for (let i = 0; i < data.window.days.length; i += 7) {
      chunks.push(data.window.days.slice(i, i + 7));
    }
    return chunks;
  }, [data]);

  const totalCols = FROZEN_COLS.length + (data?.window.days.length ?? 0);

  return (
    <div>
      <div className="page-header">
        <h1>Schedule</h1>
      </div>
      <ScheduleNav />

      {error && <p className="error">{error}</p>}

      <div className="gantt-toolbar print-hide">
        <div className="gantt-toolbar-nav">
          <button type="button" className="button-secondary" onClick={() => goToWeek(-1)}>
            &#9664; Prior week
          </button>
          <button type="button" className="button-secondary" onClick={goToday}>
            Current week
          </button>
          <button type="button" className="button-secondary" onClick={() => goToWeek(1)}>
            Next week &#9654;
          </button>
        </div>
        <div className="gantt-toolbar-nav">
          {data && (
            <span className="muted">
              {data.window.start} — {addDaysIso(data.window.start, data.window.weeks * 7 - 1)}
            </span>
          )}
          <button type="button" onClick={exportPdf} disabled={!data || exporting}>
            {exporting ? "Generating PDF…" : "Export PDF"}
          </button>
        </div>
      </div>

      {exportError && <p className="error print-hide">{exportError}</p>}

      <div className="gantt-legend">
        <span className="gantt-legend-item">
          <span className="gantt-legend-swatch gantt-flag-critical" /> Critical path
        </span>
        <span className="gantt-legend-item">
          <span className="gantt-legend-swatch gantt-flag-night" /> Night work
        </span>
        <span className="gantt-legend-item">
          <span className="gantt-legend-swatch gantt-flag-shutdown" /> Shutdown
        </span>
        <span className="gantt-legend-item">
          <span className="gantt-legend-swatch gantt-weekend" /> Weekend
        </span>
        <span className="gantt-legend-item">
          <span className="gantt-legend-swatch gantt-holiday" /> Holiday
        </span>
      </div>

      {loading && !data ? (
        <p>Loading…</p>
      ) : (
        data && (
          <div className="gantt-scroll">
            <table className="gantt-table">
              <thead>
                <tr>
                  {FROZEN_COLS.map((col, i) => (
                    <th
                      key={col.key}
                      rowSpan={2}
                      className="gantt-frozen-col gantt-frozen-header"
                      style={{ left: frozenLeft(i), width: col.width, minWidth: col.width }}
                    >
                      {col.label}
                    </th>
                  ))}
                  {weeks.map((week) => (
                    <th key={week[0].date} colSpan={week.length} className="gantt-week-header">
                      Week of {formatShort(week[0].date)}
                    </th>
                  ))}
                </tr>
                <tr>
                  {data.window.days.map((day) => (
                    <th key={day.date} className={dayClassName(day)} style={{ width: DAY_COL_WIDTH, minWidth: DAY_COL_WIDTH }}>
                      <div className="gantt-day-header-dow">{day.day_of_week}</div>
                      <div className="gantt-day-header-date">{formatShort(day.date)}</div>
                      {day.holiday_name && <div className="gantt-day-header-holiday">{day.holiday_name}</div>}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr className="gantt-totals-row">
                  {FROZEN_COLS.map((col, i) => (
                    <td
                      key={col.key}
                      className="gantt-frozen-col gantt-frozen-cell"
                      style={{ left: frozenLeft(i), width: col.width, minWidth: col.width }}
                    >
                      {i === 0 ? "CREW TOTALS" : ""}
                    </td>
                  ))}
                  {data.crew_totals.map((t, idx) => (
                    <td key={t.date} className={`gantt-total-cell ${dayClassName(data.window.days[idx])}`}>
                      {t.total > 0 ? t.total : ""}
                    </td>
                  ))}
                </tr>

                {data.sections.map((section) => (
                  <Fragment key={section.id}>
                    {section.activities.length > 0 && (
                      <tr key={`section-${section.id}`} className="gantt-section-row">
                        <td colSpan={totalCols}>{section.name}</td>
                      </tr>
                    )}
                    {section.activities.map((activity) => (
                      <tr key={activity.id}>
                        <td
                          className="gantt-frozen-col gantt-frozen-cell"
                          style={{ left: frozenLeft(0), width: FROZEN_COLS[0].width, minWidth: FROZEN_COLS[0].width }}
                        >
                          {activity.code ?? "—"}
                        </td>
                        <td
                          className="gantt-frozen-col gantt-frozen-cell"
                          style={{ left: frozenLeft(1), width: FROZEN_COLS[1].width, minWidth: FROZEN_COLS[1].width }}
                        >
                          {activity.crew ?? "—"}
                        </td>
                        <td
                          className="gantt-frozen-col gantt-frozen-cell gantt-description-cell"
                          style={{ left: frozenLeft(2), width: FROZEN_COLS[2].width, minWidth: FROZEN_COLS[2].width }}
                        >
                          <Link to={`/schedule/activities/${activity.id}`}>{activity.description}</Link>
                        </td>
                        <td
                          className="gantt-frozen-col gantt-frozen-cell"
                          style={{ left: frozenLeft(3), width: FROZEN_COLS[3].width, minWidth: FROZEN_COLS[3].width }}
                        >
                          {activity.responsibility ?? "—"}
                        </td>
                        <td
                          className="gantt-frozen-col gantt-frozen-cell"
                          style={{ left: frozenLeft(4), width: FROZEN_COLS[4].width, minWidth: FROZEN_COLS[4].width }}
                        >
                          {daysByActivity.get(activity.id) ?? "—"}
                        </td>
                        {activity.cells.map((cell, idx) => {
                          const day = data.window.days[idx];
                          return (
                            <td
                              key={cell.date}
                              className={cellClassName(cell, activity, day)}
                              onClick={() =>
                                setEditor({
                                  activityId: activity.id,
                                  activityLabel: activity.description,
                                  date: cell.date,
                                  dayOfWeek: day.day_of_week,
                                  cell,
                                })
                              }
                              title={cell.scheduled ? `${day.day_of_week} ${cell.date}` : undefined}
                            >
                              {cell.scheduled && (
                                <span className="gantt-cell-content">
                                  {cell.crew_count ?? ""}
                                  {cell.marker ? ` ${cell.marker}` : ""}
                                </span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}

      {editor && (
        <ScheduleDayCellEditor
          activityId={editor.activityId}
          activityLabel={editor.activityLabel}
          date={editor.date}
          dayOfWeek={editor.dayOfWeek}
          cell={editor.cell}
          onClose={() => setEditor(null)}
          onSaved={refetch}
        />
      )}
    </div>
  );
}
