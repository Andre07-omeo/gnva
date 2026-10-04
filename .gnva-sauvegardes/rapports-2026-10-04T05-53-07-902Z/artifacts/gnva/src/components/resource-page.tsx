"use client";
import { useState, useEffect } from "react";
import type { ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, Search } from "lucide-react";
import {
  useCreerRessource, useListerRessource, useModifierRessource, useObtenirReferences, getListerRessourceQueryKey,
} from "@workspace/api-client-react";
import { Btn, Empty, ErrorBox, Field, Modal, Pager, Skeleton, useMode, useToast, ViewSwitch, PageHead } from "@/components/ui";
import { DataView, deriveCols, type Col } from "@/components/data-view";
import { useUser } from "@/components/shell";
import { has, isAdmin } from "@/lib/perm";
import { cleanPayload, invalidateData, type Res, type Row } from "@/lib/utils";

export type Opt = { v: string; l: string };
export type FieldDef = {
  name: string; label: string; required?: boolean; requiredOnCreate?: boolean; minLength?: number; omitEmpty?: boolean; adminOnly?: boolean; hint?: string; full?: boolean;
  type?: "text" | "number" | "date" | "password" | "select" | "checkbox" | "multi" | "textarea";
  options?: (refs: Row, values: Row) => Opt[]; onlyCreate?: boolean; suggestions?: string[];
};

export type ResourceConfig = {
  ressource: Res; title: string; sub?: string; noun: string;
  columns?: Col[]; fields?: FieldDef[]; titleOf: (r: Row) => string;
  readOnly?: boolean; canEdit?: boolean; canDelete?: boolean; upsertEdit?: boolean;
  statuts?: string[]; setup?: ReactNode; extraActions?: (r: Row) => ReactNode; embedded?: boolean;
  extraParams?: Row; emptyHint?: string; preCols?: Col[];
  createPerm?: string[]; editPerm?: string[]; suspendPerm?: string[];
  renderForm?: (props: { row: Row | null; refs: Row; onClose: () => void }) => ReactNode;
  refetchInterval?: number; onRows?: (rows: Row[]) => void;
};

export const refOpts = (list: unknown, label: (r: Row) => string = (r) => r.nom): Opt[] =>
  ((list as Row[]) ?? []).map((r) => ({ v: String(r.id), l: label(r) }));

export function ResourcePage(c: ResourceConfig) {
  const qc = useQueryClient();
  const toast = useToast();
  const [mode, setMode] = useMode();
  const [recherche, setRecherche] = useState("");
  const [statut, setStatut] = useState("");
  const [page, setPage] = useState(1);
  const limite = 25;
  const [editing, setEditing] = useState<Row | "new" | null>(null);

  const params = { page, limite, ...(recherche ? { recherche } : {}), ...(statut ? { statut } : {}), ...(c.extraParams ?? {}) };
  const list = useListerRessource(c.ressource, params, { query: {
    queryKey: getListerRessourceQueryKey(c.ressource, params),
    refetchInterval: c.refetchInterval ?? false,
  } });
  const refs = useObtenirReferences();
  const rows = (list.data?.elements ?? []) as Row[];
  useEffect(() => {
    if (list.data?.elements) c.onRows?.(list.data.elements as Row[]);
  }, [list.data?.elements, c.onRows]);
  const user = useUser();
  const canCreate = !c.readOnly && !!c.createPerm && has(user, ...c.createPerm);
  const canEdit = !c.readOnly && c.canEdit !== false && !!c.editPerm && has(user, ...c.editPerm);
  const canDelete = false;
  const canSuspend = !!c.suspendPerm && has(user, ...c.suspendPerm);
  const susp = useModifierRessource({
    mutation: { onSuccess: () => { toast.ok("Statut mis à jour"); invalidateData(qc); }, onError: toast.err },
  });

  const actions = (r: Row): ReactNode => (
    <>
      {c.extraActions?.(r)}
      {canEdit && <Btn sm onClick={() => setEditing(r)} aria-label="Modifier"><Pencil size={13} />Modifier</Btn>}
      {canSuspend && typeof r.actif === "boolean" && (
        <Btn sm kind={r.actif ? "danger" : "save"} disabled={susp.isPending} onClick={() => susp.mutate({ ressource: c.ressource, id: String(r.id), data: { actif: !r.actif } })}>
          {r.actif ? "Suspendre" : "Réactiver"}
        </Btn>
      )}
    </>
  );
  const hasActions = canEdit || canSuspend || !!c.extraActions;

  return (
    <div>
      {!c.embedded && (
        <PageHead title={c.title} sub={c.sub}>
          {canCreate && <Btn kind="primary" onClick={() => setEditing("new")}><Plus size={15} />Nouveau</Btn>}
        </PageHead>
      )}
      {c.embedded && canCreate && <div className="tools"><Btn kind="primary" onClick={() => setEditing("new")}><Plus size={15} />Ajouter : {c.noun}</Btn></div>}
      <div className="tools">
        <div style={{ position: "relative" }}>
          <Search size={14} style={{ position: "absolute", left: 9, top: 11, color: "#677084" }} />
          <input className="input" style={{ paddingLeft: 28 }} placeholder="Rechercher" value={recherche} onChange={(e) => { setRecherche(e.target.value); setPage(1); }} />
        </div>
        {c.statuts && (
          <select className="input" value={statut} onChange={(e) => { setStatut(e.target.value); setPage(1); }}>
            <option value="">Tous les statuts</option>
            {c.statuts.map((s) => <option key={s}>{s}</option>)}
          </select>
        )}
        <span style={{ marginLeft: "auto" }}><ViewSwitch mode={mode} onChange={setMode} /></span>
      </div>
      <div className="card">
        {list.isLoading ? <Skeleton /> : list.isError ? <div className="pad"><ErrorBox error={list.error} retry={() => list.refetch()} /></div> : rows.length === 0 ? (
          <Empty title={recherche || statut ? "Aucun résultat" : `Aucun ${c.noun} enregistré`}>
            {recherche || statut ? "Modifiez la recherche ou les filtres." : (c.setup ?? c.emptyHint ?? (!canCreate ? "Les enregistrements apparaîtront ici dès les premières opérations." : `Utilisez le bouton Nouveau pour créer le premier ${c.noun}.`))}
          </Empty>
        ) : (
          <>
            <DataView rows={rows} columns={c.columns ?? [...(c.preCols ?? []), ...deriveCols(rows)]} mode={mode} titleOf={c.titleOf} actions={hasActions ? actions : undefined} />
            <Pager page={page} limite={limite} total={list.data?.total ?? rows.length} onPage={setPage} />
          </>
        )}
      </div>
      {editing && (c.renderForm
        ? c.renderForm({ row: editing === "new" ? null : editing, refs: (refs.data ?? {}) as Row, onClose: () => setEditing(null) })
        : <FormModal c={c} row={editing === "new" ? null : editing} refs={(refs.data ?? {}) as Row} onClose={() => setEditing(null)} />)}
    </div>
  );
}

function FormModal({ c, row, refs, onClose }: { c: ResourceConfig; row: Row | null; refs: Row; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const me = useUser();
  const fields = (c.fields ?? []).filter((f) => !f.adminOnly || isAdmin(me));
  const init: Row = {};
  fields.forEach((f) => {
    const v = row?.[f.name];
    init[f.name] = f.type === "checkbox" ? (row ? !!v : f.name === "actif") : f.type === "multi" ? (Array.isArray(v) ? v.map(String) : []) : f.type === "date" ? String(v ?? "").slice(0, 10) : v == null ? "" : typeof v === "object" ? JSON.stringify(v) : String(v);
  });
  const [vals, setVals] = useState<Row>(init);
  const [error, setError] = useState("");
  const done = { onSuccess: () => { toast.ok(`${c.noun} enregistré`); invalidateData(qc); onClose(); }, onError: (e: unknown) => { setError((e as { data?: { error?: string } })?.data?.error ?? "Enregistrement impossible"); } };
  const create = useCreerRessource({ mutation: done });
  const modify = useModifierRessource({ mutation: done });
  const pending = create.isPending || modify.isPending;
  const set = (k: string, v: unknown) => setVals((x) => ({
    ...x, [k]: v,
    ...(c.ressource === "utilisateurs" && k === "roleId"
      ? { zoneIds: [], siteId: "", permissions: [], porteeNationale: false } : {}),
  }));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    const data: Row = {};
    for (const f of fields) {
      if (f.onlyCreate && row) continue;
      let v = vals[f.name];
      if ((f.required || (f.requiredOnCreate && !row)) && (v === "" || v === undefined)) return setError(`Le champ « ${f.label} » est obligatoire.`);
      if (f.minLength && v && String(v).length < f.minLength) return setError(`« ${f.label} » : ${f.minLength} caractères minimum.`);
      if (f.type === "number" && v !== "") v = Number(v);
      data[f.name] = v;
    }
    const payload = cleanPayload(data);
    fields.forEach(f=>{if(f.type==="multi"&&f.omitEmpty&&Array.isArray(vals[f.name])&&!vals[f.name].length)payload[f.name]=null;});
    // les cases à cocher et listes vides restent explicites
    fields.forEach((f) => { if (f.type === "checkbox") payload[f.name] = !!vals[f.name]; if (f.type === "multi" && !(f.onlyCreate && row) && !(f.omitEmpty && !(vals[f.name] as string[]).length)) payload[f.name] = vals[f.name]; });
    if (row && !c.upsertEdit) modify.mutate({ ressource: c.ressource, id: String(row.id), data: payload });
    else create.mutate({ ressource: c.ressource, data: payload });
  };

  return (
    <Modal open title={`${row ? "Modifier" : "Nouveau"} : ${c.noun}`} onClose={onClose} wide={fields.length > 6}
      footer={<><Btn onClick={onClose}>Annuler</Btn><Btn kind="save" disabled={pending} onClick={(e) => submit(e as unknown as React.FormEvent)}>{pending ? "Enregistrement..." : "Enregistrer"}</Btn></>}>
      <form onSubmit={submit} className="fgrid" noValidate>
        {error && <div className="errbox full" style={{ gridColumn: "1/-1", marginBottom: 12 }} role="alert">{error}</div>}
        {fields.filter((f) => !(f.onlyCreate && row)).map((f) => {
          const id = `f-${f.name}`;
          const opts = f.options?.(refs, vals) ?? [];
          const full = f.full || f.type === "multi" || f.type === "textarea";
          return (
            <Field key={f.name} label={f.label + (f.required || (f.requiredOnCreate && !row) ? " *" : "")} hint={f.hint} full={full}>
              {f.type === "select" ? (
                <select id={id} className="input" value={vals[f.name]} onChange={(e) => set(f.name, e.target.value)}>
                  <option value="">{f.required ? "Choisir..." : "Aucun"}</option>
                  {opts.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}
                </select>
              ) : f.type === "checkbox" ? (
                <label className="chk"><input id={id} type="checkbox" checked={!!vals[f.name]} onChange={(e) => set(f.name, e.target.checked)} />Activé</label>
              ) : f.type === "multi" ? (
                <div className="chips">
                  {opts.length === 0 && <span className="hint">Aucune option disponible.</span>}
                  {opts.map((o) => (
                    <label key={o.v}><input type="checkbox" checked={(vals[f.name] as string[]).includes(o.v)} onChange={(e) => set(f.name, e.target.checked ? [...vals[f.name], o.v] : (vals[f.name] as string[]).filter((x) => x !== o.v))} />{o.l}</label>
                  ))}
                </div>
              ) : f.type === "textarea" ? (
                <textarea id={id} className="input" rows={3} value={vals[f.name]} onChange={(e) => set(f.name, e.target.value)} />
              ) : (
                <>
                  <input id={id} className="input" type={f.type ?? "text"} step={f.type === "number" ? "any" : undefined} list={f.suggestions ? `${id}-l` : undefined} value={vals[f.name]} autoComplete={f.type === "password" ? "new-password" : "off"} onChange={(e) => set(f.name, e.target.value)} />
                  {f.suggestions && <datalist id={`${id}-l`}>{f.suggestions.map((s) => <option key={s} value={s} />)}</datalist>}
                </>
              )}
            </Field>
          );
        })}
      </form>
    </Modal>
  );
}
