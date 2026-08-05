import { useState } from "react";

interface MonthlyYardsChartProps {
  data: { month: string; cy: number }[];
}

function monthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString(undefined, { month: "short", timeZone: "UTC" });
}

const WIDTH = 640;
const HEIGHT = 220;
const PADDING_LEFT = 40;
const PADDING_BOTTOM = 28;
const PADDING_TOP = 12;

// Single series (monthly CY placed) - no legend needed, the chart title
// names it. Thin bars with rounded data-ends, a recessive baseline, and a
// per-bar hover tooltip, per this repo's dataviz conventions.
export function MonthlyYardsChart({ data }: MonthlyYardsChartProps) {
  const [hovered, setHovered] = useState<number | null>(null);

  if (data.length === 0) {
    return <p className="chart-empty">No pours recorded yet.</p>;
  }

  const max = Math.max(...data.map((d) => d.cy), 1);
  const plotWidth = WIDTH - PADDING_LEFT - 12;
  const plotHeight = HEIGHT - PADDING_TOP - PADDING_BOTTOM;
  const barGap = 10;
  const barWidth = Math.max(8, plotWidth / data.length - barGap);

  return (
    <div className="chart-wrap">
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label="Monthly cubic yards poured" className="bar-chart">
        <line
          x1={PADDING_LEFT}
          y1={HEIGHT - PADDING_BOTTOM}
          x2={WIDTH}
          y2={HEIGHT - PADDING_BOTTOM}
          className="chart-baseline"
        />
        {[0.5, 1].map((frac) => (
          <line
            key={frac}
            x1={PADDING_LEFT}
            y1={PADDING_TOP + plotHeight * (1 - frac)}
            x2={WIDTH}
            y2={PADDING_TOP + plotHeight * (1 - frac)}
            className="chart-gridline"
          />
        ))}
        <text x={4} y={PADDING_TOP + 4} className="chart-axis-label">
          {Math.round(max)}
        </text>
        <text x={4} y={HEIGHT - PADDING_BOTTOM + 4} className="chart-axis-label">
          0
        </text>
        {data.map((d, i) => {
          const barHeight = (d.cy / max) * plotHeight;
          const x = PADDING_LEFT + i * (plotWidth / data.length) + barGap / 2;
          const y = HEIGHT - PADDING_BOTTOM - barHeight;
          return (
            <g key={d.month} onMouseEnter={() => setHovered(i)} onMouseLeave={() => setHovered(null)}>
              <rect
                x={x}
                y={y}
                width={barWidth}
                height={Math.max(barHeight, 1)}
                rx={4}
                className={hovered === i ? "chart-bar chart-bar-hover" : "chart-bar"}
              />
              <text x={x + barWidth / 2} y={HEIGHT - PADDING_BOTTOM + 16} textAnchor="middle" className="chart-axis-label">
                {monthLabel(d.month)}
              </text>
              {hovered === i && (
                <text x={x + barWidth / 2} y={y - 6} textAnchor="middle" className="chart-value-label">
                  {d.cy.toLocaleString(undefined, { maximumFractionDigits: 1 })} CY
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
