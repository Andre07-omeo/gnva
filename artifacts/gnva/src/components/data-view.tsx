"use client";
import { Fragment } from "react";
import type { ReactNode } from "react";
import { Badge, Mode } from "@/components/ui";
import { fmtDate, isIso, type Row } from "@/lib/utils";

export type Col = { key: string; label: string; render?: (r: Row) => ReactNode };

export function cell(v: unknown, key: string): ReactNode {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "boolean") return <Badge t={v ? "ok" : "bad"}>{v ? "Oui" : "Non"}</Badge>;
  if (key === "statut") return <Badge>{String(v)}</Badge>;
  if (isIso(v)) return fmtDate(v);
  if (Array.isArray(v)) return v.length ? `${v.length}` : "—";
  if (typeof v === "object") return String((v as Row).nom ?? (v as Row).code ?? "—");
  return String(v);
}

export function deriveCols(rows: Row[]): Col[] {
  const first = rows[0] ?? {};
  return Object.keys(first)
    .filter((k) => !/(^id$|Id$|password|hash|photoUrl)/.test(k) && (typeof first[k] !== "object" || first[k] === null))
    .slice(0, 6)
    .map((k) => ({ key: k, label: k.replace(/([A-Z])/g, " $1").toLowerCase() }));
}

export function DataView({ rows, columns, mode, titleOf, actions, openRow }: { rows: Row[]; columns?: Col[]; mode: Mode; titleOf: (r: Row) => string; actions?: (r: Row) => ReactNode; openRow?: (r: Row) => void }) {
  const cols = columns ?? deriveCols(rows);
  const val = (r: Row, c: Col) => (c.render ? c.render(r) : cell(r[c.key], c.key));
  if (mode === "grid")
    return (
      <div className="grid" style={{ padding: 12 }}>
        {rows.map((r, i) => (
          <div key={String(r.id ?? i)} className="card gcard">
            <h3>{openRow ? <button className="row-open" onClick={() => openRow(r)}>{titleOf(r)}</button> : titleOf(r)}</h3>
            <dl>{cols.map((c) => <Fragment key={c.key}><dt>{c.label}</dt><dd>{val(r, c)}</dd></Fragment>)}</dl>
            {actions && <div className="acts">{actions(r)}</div>}
          </div>
        ))}
      </div>
    );
  if (mode === "compact")
    return (
      <div className="compact">
        {rows.map((r, i) => (
          <div key={String(r.id ?? i)} className="crow">
            <span className="t">{openRow ? <button className="row-open" onClick={() => openRow(r)}>{titleOf(r)}</button> : titleOf(r)}</span>
            {cols.slice(0, 3).map((c) => <span key={c.key} className="m">{val(r, c)}</span>)}
            {actions && <span className="acts">{actions(r)}</span>}
          </div>
        ))}
      </div>
    );
  return (
    <div className="tscroll">
      <table className="tbl">
        <thead><tr>{cols.map((c) => <th key={c.key}>{c.label}</th>)}{actions && <th />}</tr></thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={String(r.id ?? i)}>
              {cols.map((c) => <td key={c.key}>{openRow && c.key === "nom" ? <button className="row-open" onClick={() => openRow(r)}>{val(r, c)}</button> : val(r, c)}</td>)}
              {actions && <td><div className="acts">{actions(r)}</div></td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
