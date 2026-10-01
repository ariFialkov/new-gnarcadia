import { useMemo, useState, type ReactNode } from "react";

export interface Column<T> {
  key: string;
  label: ReactNode;
  render?: (row: T) => ReactNode;
  sort?: (row: T) => number | string | null | undefined;
  align?: "left" | "right";
  width?: number | string;
}

export function Table<T>({ rows, columns, rowKey, defaultSort, defaultDir = "desc", onRowClick, empty = "No rows", maxHeight }: { rows: T[]; columns: Column<T>[]; rowKey: (row: T) => string; defaultSort?: string; defaultDir?: "asc" | "desc"; onRowClick?: (row: T) => void; empty?: ReactNode; maxHeight?: number }) {
  const [sortKey, setSortKey] = useState<string | undefined>(defaultSort);
  const [dir, setDir] = useState<"asc" | "desc">(defaultDir);

  const sorted = useMemo(() => {
    const col = columns.find((c) => c.key === sortKey);
    if (!col?.sort) return rows;
    const s = col.sort;
    const out = [...rows].sort((a, b) => {
      const av = s(a);
      const bv = s(b);
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === "number" && typeof bv === "number") return av - bv;
      return String(av).localeCompare(String(bv));
    });
    return dir === "desc" ? out.reverse() : out;
  }, [rows, columns, sortKey, dir]);

  const toggle = (c: Column<T>) => {
    if (!c.sort) return;
    if (sortKey === c.key) setDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(c.key);
      setDir(typeof c.sort(rows[0] as T) === "number" ? "desc" : "asc");
    }
  };

  return (
    <div className="table-wrap" style={maxHeight ? { maxHeight } : undefined}>
      <table className="tbl">
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.key} className={`${c.sort ? "sortable" : ""} ${c.align === "right" ? "num" : ""}`} style={c.width ? { width: c.width } : undefined} onClick={() => toggle(c)} aria-sort={sortKey === c.key ? (dir === "asc" ? "ascending" : "descending") : undefined}>
                {c.label}
                {sortKey === c.key && <span className="arrow">{dir === "asc" ? "▲" : "▼"}</span>}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.length === 0 && (
            <tr>
              <td colSpan={columns.length} className="empty">
                {empty}
              </td>
            </tr>
          )}
          {sorted.map((r) => (
            <tr key={rowKey(r)} className={onRowClick ? "clickable" : undefined} onClick={onRowClick ? () => onRowClick(r) : undefined}>
              {columns.map((c) => (
                <td key={c.key} className={c.align === "right" ? "num" : undefined}>
                  {c.render ? c.render(r) : String((r as Record<string, unknown>)[c.key] ?? "")}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
