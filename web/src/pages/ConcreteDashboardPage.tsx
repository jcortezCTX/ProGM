import { useEffect, useState } from "react";
import { ApiError } from "../api/client";
import { getConcreteSummary } from "../api/concrete";
import type { ConcreteSummary } from "../api/types";
import { ConcreteNav } from "../components/ConcreteNav";
import { MonthlyYardsChart } from "../components/MonthlyYardsChart";

function cy(value: number | null): string {
  return value === null ? "—" : value.toLocaleString(undefined, { maximumFractionDigits: 1 });
}

function percent(value: number | null): string {
  return value === null ? "—" : `${value.toFixed(1)}%`;
}

function money(value: number | null): string {
  return value === null ? "—" : `$${value.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

export function ConcreteDashboardPage() {
  const [summary, setSummary] = useState<ConcreteSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getConcreteSummary()
      .then(setSummary)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load dashboard"))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <div className="page-header">
        <h1>Concrete Log</h1>
      </div>
      <ConcreteNav />

      {error && <p className="error">{error}</p>}
      {loading ? (
        <p>Loading…</p>
      ) : summary ? (
        <>
          <div className="stat-tiles">
            <div className="stat-tile">
              <span className="stat-value">{cy(summary.total_cy_placed)}</span>
              <span className="stat-label">Total CY Placed</span>
            </div>
            <div className="stat-tile">
              <span className="stat-value">{percent(summary.percent_complete)}</span>
              <span className="stat-label">% Complete</span>
            </div>
            <div className="stat-tile">
              <span className="stat-value">{percent(summary.pass_rate)}</span>
              <span className="stat-label">28-Day Pass Rate</span>
            </div>
            <div className="stat-tile alert">
              <span className="stat-value">{summary.fail_count}</span>
              <span className="stat-label">Fails</span>
            </div>
            <div className="stat-tile">
              <span className="stat-value">
                {summary.avg_margin_above_design === null ? "—" : summary.avg_margin_above_design.toFixed(0)}
              </span>
              <span className="stat-label">Avg Margin Above Design (psi)</span>
            </div>
          </div>

          <div className="card">
            <h2>Yards Poured by Month</h2>
            <MonthlyYardsChart data={summary.monthly} />
          </div>

          <div className="card">
            <h2>Structures: Estimate vs. Actual</h2>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Structure</th>
                    <th>Est. Yds</th>
                    <th>JTD Yds</th>
                    <th>Diff.</th>
                    <th>Est. Cost</th>
                    <th>JTD Cost</th>
                    <th>Diff.</th>
                    <th>Est. Rate</th>
                    <th>Actual Rate</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.structures.map((s) => (
                    <tr key={s.id}>
                      <td>{s.name}</td>
                      <td>{cy(s.est_cy)}</td>
                      <td>{cy(s.jtd_yds)}</td>
                      <td>{cy(s.diff_cy)}</td>
                      <td>{money(s.est_cost)}</td>
                      <td>{money(s.jtd_cost)}</td>
                      <td>{money(s.diff_cost)}</td>
                      <td>{money(s.est_rate)}</td>
                      <td>{money(s.actual_rate)}</td>
                    </tr>
                  ))}
                  {summary.structures.length === 0 && (
                    <tr>
                      <td colSpan={9}>No structures yet.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
