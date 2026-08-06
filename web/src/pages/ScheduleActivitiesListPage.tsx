import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ApiError } from "../api/client";
import { listActivities, listSections } from "../api/schedule";
import type { ScheduleActivity, ScheduleSection } from "../api/types";
import { ColumnPicker } from "../components/ColumnPicker";
import { ScheduleNav } from "../components/ScheduleNav";
import { DataTable } from "../components/DataTable";
import { useTableColumns, type ColumnDef } from "../hooks/useTableColumns";

function num(value: string | null): string {
  if (value === null) return "—";
  const n = Number(value);
  return Number.isFinite(n) ? n.toLocaleString(undefined, { maximumFractionDigits: 2 }) : value;
}

function date(value: string | null): string {
  return value ? value.slice(0, 10) : "—";
}

function Flags({ row }: { row: ScheduleActivity }) {
  if (!row.night_work && !row.critical_path && !row.shutdown) return <span>—</span>;
  return (
    <>
      {row.critical_path && <span className="badge-flag-critical">Critical Path</span>}
      {row.night_work && <span className="badge-flag-night">Night Work</span>}
      {row.shutdown && <span className="badge-flag-shutdown">Shutdown</span>}
    </>
  );
}

export function ScheduleActivitiesListPage() {
  const [sections, setSections] = useState<ScheduleSection[]>([]);
  const [allActivities, setAllActivities] = useState<ScheduleActivity[]>([]);
  const [rows, setRows] = useState<ScheduleActivity[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [sectionId, setSectionId] = useState("");
  const [responsibility, setResponsibility] = useState("");
  const [crew, setCrew] = useState("");
  const [nightWork, setNightWork] = useState(false);
  const [criticalPath, setCriticalPath] = useState(false);
  const [shutdown, setShutdown] = useState(false);

  useEffect(() => {
    listSections()
      .then((res) => setSections(res.data))
      .catch(() => {});
    // Unfiltered baseline load, used only to populate the responsibility/crew
    // filter dropdowns with the distinct values actually present in the data.
    listActivities()
      .then((res) => setAllActivities(res.data))
      .catch(() => {});
  }, []);

  useEffect(() => {
    setIsLoading(true);
    listActivities({
      section_id: sectionId || undefined,
      responsibility: responsibility || undefined,
      crew: crew || undefined,
      night_work: nightWork || undefined,
      critical_path: criticalPath || undefined,
      shutdown: shutdown || undefined,
    })
      .then((res) => {
        setRows(res.data);
        setError(null);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load activities"))
      .finally(() => setIsLoading(false));
  }, [sectionId, responsibility, crew, nightWork, criticalPath, shutdown]);

  const sectionsById = useMemo(() => new Map(sections.map((s) => [s.id, s.name])), [sections]);
  const responsibilities = useMemo(
    () => Array.from(new Set(allActivities.map((a) => a.responsibility).filter((v): v is string => !!v))).sort(),
    [allActivities],
  );
  const crews = useMemo(
    () => Array.from(new Set(allActivities.map((a) => a.crew).filter((v): v is string => !!v))).sort(),
    [allActivities],
  );

  const columns: ColumnDef<ScheduleActivity>[] = useMemo(
    () => [
      { key: "code", label: "Code", render: (row) => row.code ?? "—" },
      { key: "section", label: "Section", render: (row) => sectionsById.get(row.section_id) ?? "—" },
      { key: "crew", label: "Crew", render: (row) => row.crew ?? "—" },
      {
        key: "description",
        label: "Description",
        render: (row) => <Link to={`/schedule/activities/${row.id}`}>{row.description}</Link>,
      },
      { key: "notes", label: "Notes", render: (row) => row.notes ?? "—", defaultVisible: false },
      { key: "responsibility", label: "Responsibility", render: (row) => row.responsibility ?? "—" },
      { key: "budget_mh", label: "Budget MH", render: (row) => num(row.budget_mh) },
      { key: "burned_mh", label: "Burned MH", render: (row) => num(row.burned_mh) },
      { key: "delta", label: "Delta", render: (row) => num(row.delta) },
      { key: "days", label: "Days", render: (row) => row.days },
      { key: "start", label: "Start", render: (row) => date(row.start_date) },
      { key: "end", label: "End", render: (row) => date(row.end_date) },
      { key: "flags", label: "Flags", render: (row) => <Flags row={row} /> },
    ],
    [sectionsById],
  );

  const { visibleColumns, visibleKeys, toggle, reset } = useTableColumns("schedule-activities", columns);

  return (
    <div>
      <div className="page-header">
        <h1>Schedule</h1>
        <Link to="/schedule/activities/new">
          <button type="button">Add activity</button>
        </Link>
      </div>
      <ScheduleNav />

      {error && <p className="error">{error}</p>}

      <div className="table-toolbar">
        <div className="table-toolbar-filters">
          <select value={sectionId} onChange={(e) => setSectionId(e.target.value)}>
            <option value="">All sections</option>
            {sections.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <select value={responsibility} onChange={(e) => setResponsibility(e.target.value)}>
            <option value="">All responsibility</option>
            {responsibilities.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
          <select value={crew} onChange={(e) => setCrew(e.target.value)}>
            <option value="">All crews</option>
            {crews.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <label className="checkbox-filter">
            <input type="checkbox" checked={criticalPath} onChange={(e) => setCriticalPath(e.target.checked)} />
            Critical path
          </label>
          <label className="checkbox-filter">
            <input type="checkbox" checked={nightWork} onChange={(e) => setNightWork(e.target.checked)} />
            Night work
          </label>
          <label className="checkbox-filter">
            <input type="checkbox" checked={shutdown} onChange={(e) => setShutdown(e.target.checked)} />
            Shutdown
          </label>
        </div>
        <ColumnPicker columns={columns} visibleKeys={visibleKeys} onToggle={toggle} onReset={reset} />
      </div>

      {isLoading ? (
        <p>Loading…</p>
      ) : (
        <DataTable
          visibleColumns={visibleColumns}
          rows={rows}
          rowKey={(row) => row.id}
          sort=""
          order="asc"
          onSortChange={() => {}}
          hasMore={false}
          isFetchingNextPage={false}
          onLoadMore={() => {}}
          emptyMessage="No activities match these filters."
        />
      )}
    </div>
  );
}
