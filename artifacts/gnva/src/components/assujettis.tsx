"use client";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AlertOctagon, Camera, Pencil, Plus, Printer, QrCode, Search, SearchCheck, Tag, Ticket, Trash2 } from "lucide-react";
import {
  useAttribuerAutocollant, useCreerRessource, useListerRessource, useModifierRessource, useObtenirReferences,
  useRechercherDoublons, useSupprimerRessource, getListerRessourceQueryKey,
} from "@workspace/api-client-react";
import { Badge, Btn, Empty, ErrorBox, Field, Modal, PageHead, Pager, Skeleton, useMode, useToast, ViewSwitch } from "@/components/ui";
import { DataView, type Col } from "@/components/data-view";
import { useUser } from "@/components/shell";
import { has } from "@/lib/perm";
import { apiJson, cleanPayload, errMsg, invalidateData, uploadPhoto, type Row } from "@/lib/utils";
import { PIECES_IDENTITE } from "@/lib/rapport-options";
import {QrScanner,valeurQr} from "@/components/qr-scanner";
import { afficherNumeroAutocollant } from "@/lib/numero-autocollant";

const nomComplet = (r: Row) => [r.nom, r.postnom, r.prenom].filter(Boolean).join(" ");
const attribs = (r: Row) => (Array.isArray(r.attributions) ? (r.attributions as Row[]) : []);
const numeroQRAttribue = (a: Row) => a.numeroAutocollant ?? a.numero ?? a.autocollant?.numero;
const numeroAttribue = (a: Row) => afficherNumeroAutocollant(
  numeroQRAttribue(a),
  a.autocollant?.lot?.serie,
);

const COLS: Col[] = [
  { key: "reference", label: "Référence" },
  { key: "nom", label: "Assujetti", render: (r) => nomComplet(r) },
  { key: "telephone", label: "Téléphone" },
  { key: "plaque", label: "Plaque" },
  { key: "site", label: "Site" },
  { key: "statut", label: "Statut", render: (r) => <>{r.vole ? <Badge t="bad">Volé</Badge> : <Badge>{String(r.statut ?? "—")}</Badge>}</> },
  { key: "photoUrl", label: "Photo", render: (r) => r.photoUrl ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={String(r.photoUrl)} alt={`Photo de ${nomComplet(r) || "l'assujetti"}`} style={{ width: 36, height: 36, objectFit: "cover", borderRadius: 6 }} /> : "—" },
  { key: "attributions", label: "Autocollant", render: (r) => attribs(r)[0] ? <span className="mono">{String(numeroAttribue(attribs(r)[0]) ?? "attribué")}</span> : "—" },
];
const COLS_ADMIN: Col[] = [...COLS,
  { key: "dateAttribution", label: "Date d'attribution", render: (r) => attribs(r)[0]?.createdAt ? new Date(String(attribs(r)[0].createdAt)).toLocaleString("fr-FR") : "—" },
  { key: "siteAttribution", label: "Site d'attribution", render: (r) => String(attribs(r)[0]?.transaction?.site?.nom ?? "—") },
];

export function Assujettis({ terrainTab }: { terrainTab?: "enregistrement" | "assignation" } = {}) {
  const qc = useQueryClient();
  const toast = useToast();
  const [mode, setMode] = useMode();
  const [recherche, setRecherche] = useState("");
  const [statut, setStatut] = useState("");
  const [siteId, setSiteId] = useState("");
  const [page, setPage] = useState(1);
  const [edit, setEdit] = useState<Row | "new" | null>(null);
  const [assign, setAssign] = useState<Row | null>(null);
  const [del, setDel] = useState<Row | null>(null);
  const [vol, setVol] = useState<Row | null>(null);
  const [tk, setTk] = useState(false);
  const [ticket, setTicket] = useState<Row | null>(null);
  const me = useUser();
  const terrain = me.roleCode === "AGENT";
  const refs = useObtenirReferences();
  const sites = (refs.data?.sites ?? []) as Row[];
  const params = terrain ? { page, limite: 25 } : { page, limite: 25,
    ...(terrainTab === "assignation" ? { statut: "ACTIF" } : statut && { statut }),
    ...(recherche && { recherche }), ...(siteId && { siteId }) };
  const list = useListerRessource("assujettis", params,
    { query: { queryKey: getListerRessourceQueryKey("assujettis", params), refetchInterval: terrain ? 10000 : false, refetchOnMount: "always" } });
  const rows = (list.data?.elements ?? []) as Row[];
  const remove = useSupprimerRessource({ mutation: { onSuccess: () => { toast.ok("Assujetti supprimé"); setDel(null); invalidateData(qc); }, onError: toast.err } });

  const actions = (r: Row) => {
    const at = attribs(r)[0];
    const num = at ? numeroQRAttribue(at) : undefined;
    const peutArchiverAttribue = me.roleCode === "ADMIN_NATIONAL" || me.roleCode === "SUPER_ADMIN";
    const attribueExercice = attribs(r).some(a => Number(a.exercice) === Number(refs.data?.exercice ?? new Date().getFullYear()));
    return (
      <>
        {r.vole ? <Badge t="bad">Volé</Badge> : null}
        {terrainTab !== "enregistrement" && has(me, "AUTOCOLLANT_ATTRIBUER") && !r.vole && !attribueExercice && <Btn sm kind="assign" onClick={() => setAssign(r)}><Tag size={13} />Attribuer</Btn>}
        {has(me,"RAPPORT_IMPRIMER") && <a className="btn sm" target="_blank" rel="noreferrer" href={`/api/v1/impression/ticket/${r.id}`}><Printer size={13} />{terrain ? "Imprimer / Réimprimer le ticket" : "Ticket"}</a>}
        {!terrainTab && at?.id != null && <a className="btn sm" target="_blank" rel="noreferrer" href={`/api/v1/impression/attribution/${at.id}`}><Printer size={13} />Attribution</a>}
        {!terrainTab && num && <a className="btn sm" target="_blank" rel="noreferrer" href={`/api/v1/qr/${encodeURIComponent(String(num))}`}><QrCode size={13} />QR</a>}
        {terrainTab !== "assignation" && (me.roleCode === "AGENT" ? has(me, "ASSUJETTI_CREER") : has(me, "ASSUJETTI_MODIFIER")) && attribs(r).length === 0 && <Btn sm onClick={() => setEdit(r)}><Pencil size={13} />{terrainTab ? "Reprendre l’enregistrement" : "Modifier"}</Btn>}
        {!terrainTab && has(me, "VOL_DECLARER") && !r.vole && <Btn sm kind="danger" onClick={() => setVol(r)}><AlertOctagon size={13} />Vol</Btn>}
        {!terrainTab && has(me, "ASSUJETTI_SUPPRIMER") && (!attribs(r).length || peutArchiverAttribue) && <Btn sm kind="danger" onClick={() => setDel(r)} aria-label="Supprimer"><Trash2 size={13} />Supprimer</Btn>}
      </>
    );
  };

  return (
    <div>
      <PageHead title={terrainTab === "assignation" ? "Dossiers à assigner" : terrainTab ? "Mes enregistrements" : "Assujettis"} sub={terrain ? "Vos dossiers non attribués uniquement, sans filtres. Après attribution, le dossier disparaît." : "Propriétaires de motos enregistrés et attribution des autocollants."}>
        {!terrain && !terrainTab && <Btn onClick={() => setTk(true)}><Ticket size={15} />Chercher un ticket</Btn>}
        {terrainTab !== "assignation" && has(me, "ASSUJETTI_CREER") && <Btn kind="primary" onClick={() => setEdit("new")}><Plus size={15} />Nouvel assujetti</Btn>}
      </PageHead>
      <div className="tools">
        {!terrain && <>
        <div style={{ position: "relative" }}><Search size={14} style={{ position: "absolute", left: 9, top: 11, color: "#677084" }} />
          <input className="input" style={{ paddingLeft: 28 }} placeholder="Nom, plaque, téléphone, référence" value={recherche} onChange={(e) => { setRecherche(e.target.value); setPage(1); }} /></div>
        <select className="input" value={siteId} onChange={(e) => { setSiteId(e.target.value); setPage(1); }}>
          <option value="">Tous les sites</option>{sites.map((s) => <option key={s.id} value={s.id}>{s.nom}</option>)}
        </select>
        <input className="input" placeholder="Statut" value={statut} onChange={(e) => { setStatut(e.target.value.toUpperCase()); setPage(1); }} style={{ minWidth: 110 }} />
        </>}
        <span style={{ marginLeft: "auto" }}><ViewSwitch mode={mode} onChange={setMode} /></span>
      </div>
      <div className="card">
        {list.isLoading ? <Skeleton /> : list.isError ? <div className="pad"><ErrorBox error={list.error} retry={() => list.refetch()} /></div> : rows.length === 0 ? (
          <Empty title="Aucun assujetti">
            {recherche || statut || siteId ? "Aucun résultat pour ces filtres." : <>Avant d&apos;enregistrer un assujetti, vérifiez qu&apos;un site et un type de moto existent (menus Sites et Paramètres), puis utilisez « Nouvel assujetti ».</>}
          </Empty>
        ) : (
          <>
            <DataView rows={rows} columns={terrain ? COLS : COLS_ADMIN} mode={mode} titleOf={nomComplet} actions={actions}
              openRow={terrainTab === "enregistrement" ? r => {
                if (attribs(r).length === 0 && has(me, "ASSUJETTI_CREER")) setEdit(r);
              } : undefined} />
            <Pager page={page} limite={25} total={list.data?.total ?? rows.length} onPage={setPage} />
          </>
        )}
      </div>
      {edit && <AssujettiForm terrain={terrain || !!terrainTab} row={edit === "new" ? null : edit} sites={sites} typesMoto={(refs.data?.typesMoto ?? []) as Row[]} onSaved={(r) => { if (has(me, "RAPPORT_IMPRIMER") && attribs(r).length === 0) setTicket(r); }} onClose={() => setEdit(null)} />}
      {ticket && <Modal open title="Assujetti enregistré — ticket POS" onClose={() => setTicket(null)}>
        <p>Dossier <b>{String(ticket.reference)}</b> enregistré. Vous pouvez imprimer maintenant ou réimprimer depuis sa fiche tant qu’il n’est pas attribué.</p>
        <a className="btn primary" target="_blank" rel="noreferrer" href={`/api/v1/impression/ticket/${ticket.id}`}><Printer size={15} />Aperçu / Imprimer le ticket POS</a>
      </Modal>}
      {tk && <TicketModal onClose={() => setTk(false)} />}
      {vol && <VolModal row={vol} onClose={() => setVol(null)} />}
      {assign && <AssignModal row={assign} onClose={() => setAssign(null)} />}
      <Modal open={!!del} title="Supprimer l'assujetti" onClose={() => setDel(null)} footer={<>
        <Btn onClick={() => setDel(null)}>Annuler</Btn>
        <Btn kind="danger" disabled={remove.isPending} onClick={() => del && remove.mutate({ ressource: "assujettis", id: String(del.id) })}>Confirmer</Btn></>}>
        <p>Archiver <b>{del ? nomComplet(del) : ""}</b> du registre actif ?</p>
        <p>Le dossier, ses attributions et son historique financier ne seront pas effacés. L&apos;opération est journalisée.</p>
      </Modal>
    </div>
  );
}

function AssignModal({ row, onClose }: { row: Row; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [numeroAutocollant, setA] = useState("");
  const [numeroTimbre, setT] = useState("");
  const [error, setError] = useState("");
  const [camera,setCamera]=useState(false);
  const m = useAttribuerAutocollant({
    mutation: { onSuccess: () => { toast.ok("Autocollant attribué"); invalidateData(qc); onClose(); }, onError: (e) => setError(errMsg(e)) },
  });
  const go = () => {
    if (!numeroAutocollant.trim() || !numeroTimbre.trim()) return setError("Numéro d'autocollant et numéro de timbre obligatoires.");
    setError("");
    m.mutate({ data: { assujettiId: String(row.id), numeroAutocollant: numeroAutocollant.trim(), numeroTimbre: numeroTimbre.trim() } });
  };
  return (
    <Modal open title={`Attribuer : ${nomComplet(row)}`} onClose={onClose} footer={<><Btn onClick={onClose}>Annuler</Btn><Btn kind="assign" disabled={m.isPending} onClick={go}><Tag size={14} />{m.isPending ? "Attribution..." : "Attribuer"}</Btn></>}>
      {error && <div className="errbox" style={{ marginBottom: 12 }} role="alert">{error}</div>}
      <Field label="Numéro de l'autocollant" hint="Doit être disponible et appartenir au périmètre territorial de votre site."><input className="input mono" value={numeroAutocollant} onChange={(e) => setA(e.target.value)} /></Field>
      <Btn onClick={()=>setCamera(v=>!v)}><Camera size={14}/>Scanner le QR</Btn>
      {camera&&<QrScanner onRead={v=>{setA(valeurQr(v));setCamera(false);}} onClose={()=>setCamera(false)}/>}
      <Field label="Numéro de timbre"><input className="input mono" value={numeroTimbre} onChange={(e) => setT(e.target.value)} /></Field>
      <p style={{ color: "var(--muted)", fontSize: 12.5 }}>Une transaction financière est créée automatiquement lors de l&apos;attribution.</p>
    </Modal>
  );
}

const FIELDS = ["nom", "postnom", "prenom", "sexe", "naissance", "telephone", "adresse", "typePiece", "numeroPiece", "siteId", "typeMotoId", "plaque", "chassis", "moteur", "marque", "couleur"] as const;

function AssujettiForm({ row, sites, typesMoto, onClose, onSaved, terrain }: { row: Row | null; sites: Row[]; typesMoto: Row[]; onClose: () => void; onSaved: (r: Row) => void; terrain?: boolean }) {
  const me = useUser();
  const qc = useQueryClient();
  const toast = useToast();
  const [v, setV] = useState<Row>(() => {
    const o: Row = {};
    FIELDS.forEach((k) => (o[k] = row?.[k] == null ? "" : String(row[k]).slice(0, k === "naissance" ? 10 : 999)));
    o.photoUrl = row?.photoUrl ?? "";
    if (!row && me.siteId) o.siteId = me.siteId;
    o.combine = false; o.numeroAutocollant = ""; o.numeroTimbre = "";
    return o;
  });
  const pieces = String(v.typePiece ?? "").split("|").filter(Boolean);
  const [error, setError] = useState("");
  const [up, setUp] = useState(false);
  const [dups, setDups] = useState<Row[] | null>(null);
  const set = (k: string, x: unknown) => {setDups(null);setV((o) => ({ ...o, [k]: x }));};
  const done = { onSuccess: (resultat: unknown) => { toast.ok("Assujetti enregistré"); invalidateData(qc); onClose(); if (resultat && typeof resultat === "object") onSaved(resultat as Row); }, onError: (e: unknown) => setError(errMsg(e)) };
  const create = useCreerRessource({ mutation: done });
  const modify = useModifierRessource({ mutation: done });
  const dupes = useRechercherDoublons({
    mutation: {
      onSuccess: (r) => setDups(Array.isArray(r) ? (r as unknown as Row[]) : []),
      onError: toast.err,
    },
  });
  const pending = create.isPending || modify.isPending;

  const validate = (): string => {
    const req: [string, string][] = [["nom", "Nom"], ["postnom", "Postnom"], ["sexe", "Sexe"], ["telephone", "Téléphone"], ["adresse", "Adresse"], ["photoUrl", "Photo"], ["typeMotoId", "Type de moto"], ["siteId", "Site"]];
    for (const [k, l] of req) if (!String(v[k] ?? "").trim()) return `Le champ « ${l} » est obligatoire.`;
    const ids = ["plaque", "chassis", "moteur"].filter((k) => String(v[k]).trim());
    if (ids.length < 2) return "Renseignez au moins deux identifiants parmi plaque, châssis et moteur.";
    if (v.chassis && !/^[A-Za-z0-9]{10,}$/.test(v.chassis)) return "Le châssis doit comporter au moins 10 caractères alphanumériques, sans espace.";
    if (v.moteur && String(v.moteur).trim().length < 5) return "Le numéro de moteur doit comporter au moins 5 caractères.";
    return "";
  };
  const submit = async () => {
    const e = validate();
    setError(e);
    if (e) return;
    if(dups===null) {
      try {
        const controles=await dupes.mutateAsync({data:cleanPayload({nom:v.nom,postnom:v.postnom,telephone:v.telephone,plaque:v.plaque,chassis:v.chassis,moteur:v.moteur,excludeId:row?.id})});
        if(Array.isArray(controles)&&controles.length) {setError("Des correspondances ont été trouvées. Vérifiez les dossiers affichés avant de confirmer l’enregistrement.");return;}
      } catch(erreur){setError(errMsg(erreur));return;}
    }
    const { combine, numeroAutocollant, numeroTimbre, ...rest } = v;
    if (combine && (!String(numeroAutocollant).trim() || !String(numeroTimbre).trim())) return setError("Numéro d'autocollant et de timbre obligatoires pour l'attribution immédiate.");
    const data = cleanPayload(rest);
    if (combine && !row) data.attribution = { numeroAutocollant: String(numeroAutocollant).trim(), numeroTimbre: String(numeroTimbre).trim() };
    if (row) modify.mutate({ ressource: "assujettis", id: String(row.id), data });
    else create.mutate({ ressource: "assujettis", data });
  };
  const onFile = async (f?: File) => {
    if (!f) return;
    setUp(true);
    try { set("photoUrl", await uploadPhoto(f)); } catch (e) { setError(errMsg(e)); } finally { setUp(false); }
  };
  const txt = (k: string, label: string, req = false, extra?: Row) => (
    <Field label={label + (req ? " *" : "")} {...extra}><input className="input" value={v[k]} onChange={(e) => set(k, e.target.value)} /></Field>
  );

  return (
    <Modal open wide title={row ? "Modifier l'assujetti" : "Nouvel assujetti"} onClose={onClose} footer={<>
      <Btn onClick={() => dupes.mutate({ data: cleanPayload({ nom: v.nom, postnom: v.postnom, telephone: v.telephone, plaque: v.plaque, chassis: v.chassis, moteur: v.moteur, excludeId: row?.id }) })} disabled={dupes.isPending}><SearchCheck size={14} />Chercher des doublons</Btn>
      <Btn onClick={onClose}>Annuler</Btn>
      <Btn kind="save" disabled={pending || up || dupes.isPending} onClick={()=>void submit()}>{pending ? "Enregistrement..." : row ? "Valider" : dups?.length ? "Enregistrer après vérification" : "Enregistrer"}</Btn></>}>
      {row?.vole ? <div className="errbox" style={{ marginBottom: 12 }}><b>MOTO DÉCLARÉE VOLÉE</b></div> : null}
      {error && <div className="errbox" style={{ marginBottom: 12 }} role="alert">{error}</div>}
      {dups && me.roleCode === "AGENT" && dups.length > 0 && <p role="alert">Correspondance détectée. Contactez un administrateur pour vérification ; les autres dossiers restent confidentiels.</p>}
      {dups && me.roleCode !== "AGENT" && <div className="card pad" style={{ marginBottom: 12, borderLeft: `4px solid ${dups.length ? "var(--orange)" : "var(--green)"}` }}>
        {dups.length === 0 ? "Aucun doublon détecté." : <><b>Alerte : {dups.length} correspondance(s) à vérifier</b>{dups.map((d, i) => <div key={i} style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 4 }}>{d.exact ? <Badge t="warn">Exact</Badge> : null}{d.vole ? <Badge t="bad">Volé</Badge> : null}{d.similarite != null ? <Badge t="info">Similarité {String(d.similarite)}</Badge> : null}<span>{String(d.reference ?? "")} {nomComplet(d)} {d.plaque ? `- ${d.plaque}` : ""}</span></div>)}</>}
      </div>}
      <div style={{ display: "flex", gap: 14, alignItems: "center", marginBottom: 14 }}>
        {v.photoUrl ? /* eslint-disable-next-line @next/next/no-img-element */ <img className="photo" src={v.photoUrl} alt="Photo de l'assujetti" /> : <div className="photo"><Camera size={26} /></div>}
        <Field label="Photo *" hint={up ? "Téléversement..." : "Prise de vue directe sur mobile."}>
          <input className="input" type="file" accept="image/*" capture="environment" onChange={(e) => onFile(e.target.files?.[0])} />
        </Field>
      </div>
      <div className="fgrid">
        {txt("nom", "Nom", true)}{txt("postnom", "Postnom", true)}{txt("prenom", "Prénom")}
        <Field label="Sexe *"><select className="input" value={v.sexe} onChange={(e) => set("sexe", e.target.value)}><option value="">Choisir...</option><option value="M">Masculin</option><option value="F">Féminin</option></select></Field>
        <Field label="Date de naissance"><input className="input" type="date" value={v.naissance} onChange={(e) => set("naissance", e.target.value)} /></Field>
        {txt("telephone", "Téléphone", true)}
        <Field label="Adresse *" full><input className="input" value={v.adresse} onChange={(e) => set("adresse", e.target.value)} /></Field>
        <Field label="Type de pièce d'identité" full><div style={{ display: "flex", flexWrap: "wrap", gap: 14 }}>
          {[...PIECES_IDENTITE.map(p => ({ value: p.value as string, label: p.label as string })), ...pieces.filter(c => !PIECES_IDENTITE.some(p => p.value === c)).map(c => ({ value: c, label: `${c} (existant)` }))].map(p => (
            <label key={p.value} className="chk"><input type="checkbox" checked={pieces.includes(p.value)} onChange={(e) => set("typePiece", (e.target.checked ? [...pieces, p.value] : pieces.filter(x => x !== p.value)).join("|"))} />{p.label}</label>))}
        </div></Field>{txt("numeroPiece", "Numéro de pièce")}
        <Field label="Site *"><select className="input" value={v.siteId} onChange={(e) => set("siteId", e.target.value)}><option value="">Choisir...</option>{sites.map((s) => <option key={s.id} value={s.id}>{s.nom}</option>)}</select></Field>
        <Field label="Type de moto *"><select className="input" value={v.typeMotoId} onChange={(e) => set("typeMotoId", e.target.value)}><option value="">Choisir...</option>{typesMoto.map((s) => <option key={s.id} value={s.id}>{s.nom}{s.roues ? ` (${s.roues} roues)` : ""}</option>)}</select></Field>
        {txt("plaque", "Plaque")}{txt("chassis", "Châssis", false, { hint: "Au moins deux identifiants parmi plaque, châssis, moteur." })}{txt("moteur", "Moteur")}
        {txt("marque", "Marque")}{txt("couleur", "Couleur")}
        {!terrain && !row && has(me, "AUTOCOLLANT_ATTRIBUER") && (
          <>
            <Field label="Attribution" full><label className="chk"><input type="checkbox" checked={!!v.combine} onChange={(e) => set("combine", e.target.checked)} />Enregistrer et attribuer l&apos;autocollant immédiatement (une seule opération)</label></Field>
            {v.combine && <>
              <Field label="Numéro de l'autocollant *"><input className="input mono" value={v.numeroAutocollant} onChange={(e) => set("numeroAutocollant", e.target.value)} /></Field>
              <Field label="Numéro de timbre *"><input className="input mono" value={v.numeroTimbre} onChange={(e) => set("numeroTimbre", e.target.value)} /></Field>
            </>}
          </>
        )}
      </div>
    </Modal>
  );
}

function TicketModal({ onClose }: { onClose: () => void }) {
  const [ref, setRef] = useState("");
  const [res, setRes] = useState<Row | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const go = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ref.trim()) return;
    setBusy(true); setError(""); setRes(null);
    try { setRes(await apiJson<Row>(`/api/v1/recherche-ticket/${encodeURIComponent(ref.trim())}`)); } catch (x) { setError(errMsg(x)); } finally { setBusy(false); }
  };
  return (
    <Modal open title="Recherche par référence de ticket" onClose={onClose}>
      <form onSubmit={go} className="tools"><input className="input mono" style={{ flex: 1 }} placeholder="Référence du ticket" value={ref} onChange={(e) => setRef(e.target.value)} /><Btn type="submit" kind="primary" disabled={busy}><Search size={14} />Chercher</Btn></form>
      {error && <div className="errbox" role="alert">{error}</div>}
      {res && (
        <div>
          {res.vole ? <div className="errbox" style={{ marginBottom: 10 }}><b>MOTO DÉCLARÉE VOLÉE</b></div> : null}
          <div style={{ display: "flex", gap: 12 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {res.photoUrl ? <img className="photo" src={String(res.photoUrl)} alt="Photo" /> : null}
            <dl className="kv" style={{ flex: 1 }}>
              <dt>Référence</dt><dd>{String(res.reference ?? "")}</dd><dt>Assujetti</dt><dd>{nomComplet(res)}</dd>
              <dt>Téléphone</dt><dd>{String(res.telephone ?? "—")}</dd><dt>Plaque</dt><dd>{String(res.plaque ?? "—")}</dd>
              <dt>Statut</dt><dd>{String(res.statut ?? "—")}</dd>
            </dl>
          </div>
        </div>
      )}
    </Modal>
  );
}

function VolModal({ row, onClose }: { row: Row; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [c, setC] = useState("");
  const m = useCreerRessource({ mutation: { onSuccess: () => { toast.ok("Vol déclaré"); invalidateData(qc); onClose(); }, onError: toast.err } });
  return (
    <Modal open title={`Déclarer le vol : ${nomComplet(row)}`} onClose={onClose} footer={<><Btn onClick={onClose}>Annuler</Btn>
      <Btn kind="danger" disabled={m.isPending} onClick={() => m.mutate({ ressource: "vols", data: cleanPayload({ assujettiId: String(row.id), commentaire: c.trim() }) })}>Déclarer le vol</Btn></>}>
      <div className="errbox" style={{ marginBottom: 12 }}>La moto sera signalée comme volée lors de toute vérification.</div>
      <Field label="Commentaire"><textarea className="input" rows={3} value={c} onChange={(e) => setC(e.target.value)} /></Field>
    </Modal>
  );
}
