// Shared fulfillment indicator for requisitions: quantity_received vs.
// quantity_ordered are both server-derived NUMERIC strings (never floated —
// CLAUDE.md), so this only ever displays them, the ratio for the bar width
// is a display-only computation, never round-tripped anywhere.
export function FulfillmentBar({ ordered, received }: { ordered: string; received: string }) {
  const orderedNum = Number(ordered);
  const receivedNum = Number(received);
  const pct = orderedNum > 0 ? Math.min(100, (receivedNum / orderedNum) * 100) : 0;
  const complete = orderedNum > 0 && receivedNum >= orderedNum;

  return (
    <div className="fulfillment">
      <span className="fulfillment-text">
        {received} of {ordered} received
      </span>
      <div className="progress-bar">
        <div className={`progress-bar-fill${complete ? " complete" : ""}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
