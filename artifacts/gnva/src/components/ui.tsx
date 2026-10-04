"use client";
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { AlertTriangle, Inbox, LayoutGrid, List, Table2, X } from "lucide-react";
import { errMsg, tone } from "@/lib/utils";

/* Toasts */
type T = { id: number; msg: string; err: boolean };
const ToastCtx = createContext<{ ok: (m: string) => void; err: (e: unknown) => void }>({ ok: () => {}, err: () => {} });
export const useToast = () => useContext(ToastCtx);
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<T[]>([]);
  const push = useCallback((msg: string, err: boolean) => {
    const id = Date.now() + Math.random();
    setItems((x) => [...x, { id, msg, err }]);
    setTimeout(() => setItems((x) => x.filter((i) => i.id !== id)), 4500);
  }, []);
  const value = { ok: (m: string) => push(m, false), err: (e: unknown) => push(typeof e === "string" ? e : errMsg(e), true) };
  return (
    <ToastCtx.Provider value={value}>
      {children}
      <div className="toasts" role="status">
        {items.map((i) => <div key={i.id} className={`toast ${i.err ? "err" : ""}`}>{i.msg}</div>)}
      </div>
    </ToastCtx.Provider>
  );
}

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & { kind?: "primary" | "save" | "assign" | "danger" | "ghost"; sm?: boolean };
export function Btn({ kind, sm, className = "", type = "button", ...p }: BtnProps) {
  return <button type={type} className={`btn ${kind ?? ""} ${sm ? "sm" : ""} ${className}`} {...p} />;
}

export function Field({ label, hint, children, full }: { label: string; hint?: string; children: ReactNode; full?: boolean }) {
  return (
    <div className={`field ${full ? "full" : ""}`}>
      <label>{label}</label>
      {children}
      {hint && <span className="hint">{hint}</span>}
    </div>
  );
}

export function Modal({ open, title, onClose, children, footer, wide }: { open: boolean; title: string; onClose: () => void; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${wide ? "wide" : ""}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="mh"><h2 style={{ fontSize: 17 }}>{title}</h2><Btn kind="ghost" sm onClick={onClose} aria-label="Fermer"><X size={16} /></Btn></div>
        <div className="mb">{children}</div>
        {footer && <div className="mf">{footer}</div>}
      </div>
    </div>
  );
}

export function Badge({ children, t }: { children: ReactNode; t?: string }) {
  return <span className={`badge ${t ?? tone(children)}`}>{children}</span>;
}

export function PageHead({ title, sub, children }: { title: string; sub?: string; children?: ReactNode }) {
  return (
    <div className="phead">
      <div><h1>{title}</h1>{sub && <p>{sub}</p>}</div>
      <div className="tools" style={{ margin: 0 }}>{children}</div>
    </div>
  );
}

export function Empty({ title, children, icon }: { title: string; children?: ReactNode; icon?: ReactNode }) {
  return <div className="empty">{icon ?? <Inbox size={34} />}<h3>{title}</h3><div>{children}</div></div>;
}

export function Skeleton({ rows = 5 }: { rows?: number }) {
  return <div>{Array.from({ length: rows }).map((_, i) => <div key={i} className="skel" />)}</div>;
}

export function ErrorBox({ error, retry }: { error: unknown; retry?: () => void }) {
  return (
    <div className="errbox" role="alert">
      <span style={{ display: "flex", gap: 8, alignItems: "center" }}><AlertTriangle size={18} />{errMsg(error)}</span>
      {retry && <Btn sm onClick={retry}>Réessayer</Btn>}
    </div>
  );
}

export type Mode = "grid" | "table" | "compact";
export function useMode(): [Mode, (m: Mode) => void] {
  const [m, setM] = useState<Mode>("table");
  useEffect(() => {
    const s = localStorage.getItem("gnva-mode") as Mode | null;
    if (s) setM(s);
  }, []);
  return [m, (v) => { setM(v); localStorage.setItem("gnva-mode", v); }];
}
export function ViewSwitch({ mode, onChange }: { mode: Mode; onChange: (m: Mode) => void }) {
  const items: [Mode, ReactNode, string][] = [["grid", <LayoutGrid key="g" size={15} />, "Grille"], ["table", <Table2 key="t" size={15} />, "Tableau"], ["compact", <List key="c" size={15} />, "Compact"]];
  return (
    <div className="seg" role="group" aria-label="Mode d'affichage">
      {items.map(([k, ic, l]) => <button key={k} type="button" className={mode === k ? "on" : ""} title={l} aria-label={l} onClick={() => onChange(k)}>{ic}</button>)}
    </div>
  );
}

export function Pager({ page, limite, total, onPage }: { page: number; limite: number; total: number; onPage: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / limite));
  return (
    <div className="pager">
      <span>{total} élément{total > 1 ? "s" : ""} - page {page} sur {pages}</span>
      <span className="acts">
        <Btn sm disabled={page <= 1} onClick={() => onPage(page - 1)}>Précédent</Btn>
        <Btn sm disabled={page >= pages} onClick={() => onPage(page + 1)}>Suivant</Btn>
      </span>
    </div>
  );
}

export function Logo({ size = 34 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden="true">
      <rect width="40" height="40" rx="9" fill="#fff" />
      <path d="M8 8h9v4H12v6h5v4h-5v6h5v4H8z" fill="#173f8a" />
      <rect x="21" y="8" width="5" height="5" fill="#d9731a" /><rect x="28" y="8" width="5" height="5" fill="#173f8a" />
      <rect x="21" y="15" width="5" height="5" fill="#173f8a" /><rect x="28" y="22" width="5" height="5" fill="#1f8a4c" />
      <rect x="21" y="29" width="12" height="4" fill="#173f8a" />
    </svg>
  );
}
