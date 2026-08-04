import { useEffect, useRef, useState } from "react";

export function ColumnPicker({
  columns,
  visibleKeys,
  onToggle,
  onReset,
}: {
  columns: { key: string; label: string }[];
  visibleKeys: string[];
  onToggle: (key: string) => void;
  onReset: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  return (
    <div className="column-picker" ref={ref}>
      <button type="button" className="button-secondary" onClick={() => setOpen((v) => !v)}>
        Columns
      </button>
      {open && (
        <div className="column-picker-menu">
          <div className="column-picker-header">
            <span>Show columns</span>
            <button type="button" className="column-picker-reset" onClick={onReset}>
              Reset
            </button>
          </div>
          <div className="column-picker-list">
            {columns.map((col) => {
              const checked = visibleKeys.includes(col.key);
              return (
                <label key={col.key} className="column-picker-item">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => onToggle(col.key)}
                    disabled={checked && visibleKeys.length === 1}
                  />
                  {col.label}
                </label>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
