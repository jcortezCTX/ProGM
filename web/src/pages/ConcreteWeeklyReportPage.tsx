import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ApiError } from "../api/client";
import { downloadWeeklyReportPdf, getWeeklyReport } from "../api/concrete";
import type { WeeklyReport } from "../api/types";
import { ConcreteNav } from "../components/ConcreteNav";

function upcomingFriday(): string {
  const d = new Date();
  const day = d.getDay();
  const diff = (5 - day + 7) % 7;
  d.setDate(d.getDate() + diff);
  return d.toISOString().slice(0, 10);
}

function date(value: string): string {
  return new Date(value).toLocaleDateString();
}

export function ConcreteWeeklyReportPage() {
  const [weekEnding, setWeekEnding] = useState(upcomingFriday());
  const [report, setReport] = useState<WeeklyReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    setLoading(true);
    getWeeklyReport(weekEnding)
      .then(setReport)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load weekly report"))
      .finally(() => setLoading(false));
  }, [weekEnding]);

  async function downloadPdf() {
    setDownloading(true);
    setError(null);
    try {
      await downloadWeeklyReportPdf(weekEnding);
    } catch (err) {
      // Surfaces the API's own message rather than a generic string - a
      // render failure and an expired session read very differently.
      setError(err instanceof ApiError ? err.message : "Failed to download PDF");
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div>
      <div className="page-header print-hide">
        <h1>Concrete Log</h1>
      </div>
      <div className="print-hide">
        <ConcreteNav />
      </div>

      <div className="table-toolbar print-hide">
        <label>
          Week Ending (Friday)
          <input type="date" value={weekEnding} onChange={(e) => setWeekEnding(e.target.value)} />
        </label>
        <button type="button" className="button-secondary" onClick={downloadPdf} disabled={downloading}>
          {downloading ? "Generating…" : "Download PDF"}
        </button>
      </div>

      {error && <p className="error">{error}</p>}
      {loading ? (
        <p>Loading…</p>
      ) : report ? (
        <div className="weekly-report">
          <h2>
            Week of {date(report.week_start)} – {date(report.week_ending)}
          </h2>

          <div className="stat-tiles">
            <div className="stat-tile">
              <span className="stat-value">{report.counts.seven_day_results}</span>
              <span className="stat-label">7-Day Results</span>
            </div>
            <div className="stat-tile">
              <span className="stat-value">{report.counts.twenty_eight_day_pass}</span>
              <span className="stat-label">28-Day Pass</span>
            </div>
            <div className="stat-tile alert">
              <span className="stat-value">{report.counts.twenty_eight_day_fail}</span>
              <span className="stat-label">28-Day Fail</span>
            </div>
          </div>

          <div className="card">
            <h3>7-Day Results</h3>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Pour Date</th>
                    <th>Location</th>
                    <th>Report #</th>
                    <th>7-Day PSI</th>
                  </tr>
                </thead>
                <tbody>
                  {report.seven_day_results.map((r) => (
                    <tr key={r.id}>
                      <td>
                        <Link to={`/concrete/pours/${r.pour.id}`}>{date(r.pour.pour_date)}</Link>
                      </td>
                      <td>{r.pour.location}</td>
                      <td>{r.report_number ?? "—"}</td>
                      <td>{r.seven_day_psi ?? "—"}</td>
                    </tr>
                  ))}
                  {report.seven_day_results.length === 0 && (
                    <tr>
                      <td colSpan={4}>No 7-day results entered this week.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="card">
            <h3>28-Day Results</h3>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Pour Date</th>
                    <th>Location</th>
                    <th>Report #</th>
                    <th>28-Day PSI</th>
                    <th>Design PSI</th>
                    <th>Result</th>
                  </tr>
                </thead>
                <tbody>
                  {report.twenty_eight_day_results.map((r) => (
                    <tr key={r.id}>
                      <td>
                        <Link to={`/concrete/pours/${r.pour.id}`}>{date(r.pour.pour_date)}</Link>
                      </td>
                      <td>{r.pour.location}</td>
                      <td>{r.report_number ?? "—"}</td>
                      <td>{r.twenty_eight_day_psi ?? "—"}</td>
                      <td>{r.pour.design_strength_psi}</td>
                      <td>
                        {r.result ? (
                          <span className={r.result === "pass" ? "badge-result-pass" : "badge-result-fail"}>
                            {r.result}
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                    </tr>
                  ))}
                  {report.twenty_eight_day_results.length === 0 && (
                    <tr>
                      <td colSpan={6}>No 28-day results entered this week.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
