"use client";
import { useState, useRef, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Check, Download, Eye, Layers, Printer, QrCode, Upload } from "lucide-react";
import { useGenererAutocollants, useObtenirReferences, useValiderRecouvrement } from "@workspace/api-client-react";
import { ResourcePage } from "@/components/resource-page";
import { Badge, Btn, Field, Modal, PageHead, useToast } from "@/components/ui";
import { useUser } from "@/components/shell";
import { has } from "@/lib/perm";
import { apiJson, errMsg, fmtMoney, invalidateData, type Row } from "@/lib/utils";
import { ZoneLot } from "@/components/zone-lot";
import { RecouvrementForm } from "@/components/recouvrement-form";

function Comment({ title, label, onGo, onClose, pending, kind }: { title: string; label: string; onGo: (c: string) => void; onClose: () => void; pending: boolean; kind: "save" | "danger" }) {
  const [c, setC] = useState("");
  return (
    <Modal open title={title} onClose={onClose} footer={<><Btn onClick={onClose}>Annuler</Btn><Btn kind={kind} disabled={pending} onClick={() => onGo(c)}>{label}</Btn></>}>
      <Field label="Commentaire (optionnel)"><textarea className="input" rows={3} value={c} onChange={(e) => setC(e.target.value)} /></Field>
    </Modal>
  );
}

const printLink = (kind: string, id: unknown, label = "Imprimer") => (
  <a key={`p${kind}`} className="btn sm" target="_blank" rel="noreferrer" href={`/api/v1/impression/${kind}/${id}`}><Printer size={13} />{label}</a>
);

export function Recouvrements() {
  const qc = useQueryClient();
  const toast = useToast();
  const me = useUser();
  const [sel, setSel] = useState<{ row: Row; statut: string; label: string } | null>(null);
  const [recu, setRecu] = useState<Row | null>(null);
  const statuts = useRef(new Map<string, string>());
  const suivre = useCallback((rows: Row[]) => {
    for (const r of rows) {
      const id = String(r.id), precedent = statuts.current.get(id);
      if (precedent && precedent !== "VALIDE" && r.statut === "VALIDE" &&
          (r.moniteurId === me.id || r.utilisateurConcerneId === me.id)) setRecu(r);
      statuts.current.set(id, String(r.statut));
    }
  }, [me.id]);
  const val = useValiderRecouvrement({ mutation: { onSuccess: (resultat) => {
    toast.ok("Validation enregistrée"); setSel(null); invalidateData(qc);
    const r = resultat as Row;
    if (r.statut === "VALIDE") setRecu(r);
  }, onError: toast.err } });
  const nb = (r: Row) => (Array.isArray(r.validations) ? r.validations.length : 0);
  const step = (r: Row) => {
    const done = ["VALIDE", "REJETE"].includes(String(r.statut).toUpperCase()) || nb(r) >= 2;
    const first = nb(r) === 0;
    const eligible = first ? r.moniteurId ? r.moniteurId === me.id :
      me.roleCode === "MONITEUR_NATIONAL" :
      (r.utilisateurConcerneId ? r.utilisateurConcerneId === me.id : me.siteId === r.siteId) &&
      !r.validations?.some((v: Row) => v.utilisateurId === me.id);
    return (
      <>
        {!done && eligible && has(me, "RECOUVREMENT_VALIDER") && <Btn sm kind="save" onClick={() => setSel({ row: r, statut: first ? "VALIDER" : "VALIDATED", label: first ? "Première validation" : "Seconde validation" })}><Check size={13} />{first ? "Valider (1/2)" : "Valider (2/2)"}</Btn>}
        {has(me, "RAPPORT_IMPRIMER") && printLink("recouvrement", r.id, r.statut === "VALIDE" ? "Imprimer la preuve de reçu" : "Document provisoire")}
      </>
    );
  };
  return (
    <>
      <ResourcePage ressource="recouvrements" noun="recouvrement" title="Recouvrements" sub="Recouvrement de la part Dispromalt uniquement. Historique conservé et reçu après double validation."
        readOnly={me.roleCode !== "MONITEUR_NATIONAL"} refetchInterval={10000} onRows={suivre}
        statuts={["EN_ATTENTE", "SIGNE_MONITEUR", "VALIDE", "REJETE"]} canEdit={false} createPerm={["RECOUVREMENT_CREER"]} extraActions={step}
        extraParams={typeof window !== "undefined" ? Object.fromEntries(new URLSearchParams(window.location.search)) : {}}
        renderForm={({ refs, onClose }) => <RecouvrementForm refs={refs} onClose={onClose} />}
        titleOf={(r) => String(r.reference ?? r.id)}
        columns={[{ key: "reference", label: "Référence" }, { key: "site", label: "Site" }, { key: "montant", label: "Montant", render: (r) => fmtMoney(r.montant) },
          { key: "partDispromalt", label: "Recouvré Dispromalt", render: (r) => fmtMoney(r.partDispromalt) }, { key: "partProvince", label: "Province (historique)", render: (r) => fmtMoney(r.partProvince) },
          { key: "validations", label: "Validations", render: (r) => `${nb(r)} / 2` }, { key: "statut", label: "Statut", render: (r) => <Badge>{String(r.statut)}</Badge> }]}
        setup="Seul le moniteur national crée une demande. Les deux moniteurs retrouvent ici son historique et son reçu." />
      {sel && <Comment title={`${sel.label} : ${sel.row.reference ?? ""}`} label="Confirmer la validation" kind="save" pending={val.isPending} onClose={() => setSel(null)}
        onGo={(c) => val.mutate({ id: String(sel.row.id), data: { statut: sel.statut, ...(c ? { commentaire: c } : {}) } })} />}
      {recu && <Modal open title="Recouvrement validé — preuve de reçu" onClose={() => setRecu(null)}>
        <p>Le reçu <b>{String(recu.reference)}</b> est disponible pour les deux moniteurs dans leur historique de recouvrement.</p>
        {has(me, "RAPPORT_IMPRIMER") && printLink("recouvrement", recu.id, "Ouvrir / Imprimer la preuve de reçu")}
      </Modal>}
    </>
  );
}

export function GenererModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const refs = useObtenirReferences();
  const [v, setV] = useState<Row>({ serie: "", prefixe: "", geographieId: "", debut: "1", fin: "", longueur: "6", typeAutocollant: "AUTOCOLLANT_2R" });
  const [error, setError] = useState("");
  const set = (k: string, x: string) => setV((o) => ({ ...o, [k]: x }));
  const m = useGenererAutocollants({ mutation: { onSuccess: (r) => { toast.ok(r.message ?? "Autocollants générés"); invalidateData(qc); onClose(); }, onError: (e) => setError(errMsg(e)) } });
  const go = () => {
    if (!v.serie || !v.prefixe || !v.geographieId || v.fin === "") return setError("Renseignez la série, le préfixe, la province (et le district pour Kinshasa) et la plage.");
    const debut = Number(v.debut), fin = Number(v.fin), longueur = Number(v.longueur);
    if (!(fin >= debut) || debut < 0) return setError("La plage est invalide : la fin doit être supérieure ou égale au début.");
    if (longueur < 1 || longueur > 20) return setError("La longueur doit être comprise entre 1 et 20.");
    setError("");
    m.mutate({ data: { serie: v.serie, prefixe: v.prefixe, geographieId: v.geographieId, debut, fin, longueur, typeAutocollant: v.typeAutocollant as "AUTOCOLLANT_2R" | "AUTOCOLLANT_3R" } });
  };
  return (
    <Modal open wide title="Générer une série d'autocollants" onClose={onClose} footer={<><Btn onClick={onClose}>Annuler</Btn><Btn kind="save" disabled={m.isPending} onClick={go}><Layers size={14} />{m.isPending ? "Génération..." : "Générer"}</Btn></>}>
      {error && <div className="errbox" style={{ marginBottom: 12 }} role="alert">{error}</div>}
      <div className="fgrid">
        <Field label="Série *"><input className="input" value={v.serie} onChange={(e) => set("serie", e.target.value)} /></Field>
        <Field label="Préfixe *"><input className="input" value={v.prefixe} onChange={(e) => set("prefixe", e.target.value)} /></Field>
        <ZoneLot zones={(refs.data?.geographies ?? []) as Row[]} onChange={id => set("geographieId", id)} />
        <Field label="Premier numéro *"><input className="input" type="number" min={0} value={v.debut} onChange={(e) => set("debut", e.target.value)} /></Field>
        <Field label="Dernier numéro *"><input className="input" type="number" min={0} value={v.fin} onChange={(e) => set("fin", e.target.value)} /></Field>
        <Field label="Longueur du numéro *" hint="Nombre de chiffres avec zéros de remplissage."><input className="input" type="number" min={1} max={20} value={v.longueur} onChange={(e) => set("longueur", e.target.value)} /></Field>
        <Field label="Type d’autocollant"><select className="input" value={v.typeAutocollant} onChange={(e) => set("typeAutocollant", e.target.value)}><option value="AUTOCOLLANT_2R">Autocollant 2 roues</option><option value="AUTOCOLLANT_3R">Autocollant 3 roues</option></select></Field>
      </div>
    </Modal>
  );
}

const numOf = (r: Row) => r.numero ?? r.numeroAutocollant;

export function ImportModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const refs = useObtenirReferences();
  const [v, setV] = useState<Row>({ serie: "", geographieId: "", typeAutocollant: "AUTOCOLLANT_2R", csv: "" });
  const [prev, setPrev] = useState<Row | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (k: string, x: string) => { setV((o) => ({ ...o, [k]: x })); setPrev(null); };
  const run = async (confirmer: boolean) => {
    if (!v.csv.trim() || !v.serie || !v.geographieId) return setError("CSV, série et périmètre territorial sont obligatoires.");
    setBusy(true); setError("");
    try {
      const r = await apiJson<Row>("/api/v1/import-qr", { method: "POST", body: { ...v, confirmer } });
      if (confirmer) { toast.ok(r.message ?? "Import terminé"); invalidateData(qc); onClose(); } else setPrev(r);
    } catch (e) { setError(errMsg(e)); } finally { setBusy(false); }
  };
  const apercu = Array.isArray(prev?.apercu) ? (prev!.apercu as unknown[]) : [];
  return (
    <Modal open wide title="Importer des autocollants (CSV)" onClose={onClose} footer={<>
      <Btn onClick={onClose}>Annuler</Btn>
      <Btn disabled={busy} onClick={() => run(false)}><Eye size={14} />Aperçu</Btn>
      <Btn kind="save" disabled={busy || !prev} onClick={() => run(true)}>Confirmer l&apos;import</Btn></>}>
      {error && <div className="errbox" style={{ marginBottom: 12 }} role="alert">{error}</div>}
      <div className="fgrid">
        <Field label="Série *"><input className="input" value={v.serie} onChange={(e) => set("serie", e.target.value)} /></Field>
        <Field label="Type d’autocollant"><select className="input" value={v.typeAutocollant} onChange={(e) => set("typeAutocollant", e.target.value)}><option value="AUTOCOLLANT_2R">Autocollant 2 roues</option><option value="AUTOCOLLANT_3R">Autocollant 3 roues</option></select></Field>
        <ZoneLot zones={(refs.data?.geographies ?? []) as Row[]} onChange={id => set("geographieId", id)} />
        <Field label="Fichier CSV" full><input className="input" type="file" accept=".csv,text/csv,text/plain" onChange={async (e) => { const f = e.target.files?.[0]; if (f) set("csv", await f.text()); }} /></Field>
        <Field label="Ou coller le contenu CSV *" full><textarea className="input mono" rows={6} value={v.csv} onChange={(e) => set("csv", e.target.value)} /></Field>
      </div>
      {prev && (
        <div className="card pad" style={{ borderLeft: "4px solid var(--orange)" }}>
          <b>{String(prev.message ?? "Aperçu")}</b> - {String(prev.nombre ?? 0)} ligne(s)
          <div className="mono" style={{ fontSize: 12, color: "var(--muted)" }}>Empreinte : {String(prev.empreinte ?? "")}</div>
          {apercu.slice(0, 10).map((a, i) => <div key={i} className="mono" style={{ fontSize: 12 }}>{typeof a === "object" ? Object.values(a as Row).join(" | ") : String(a)}</div>)}
          <p style={{ marginBottom: 0, fontSize: 12.5 }}>Rien n&apos;est enregistré tant que vous n&apos;avez pas confirmé.</p>
        </div>
      )}
    </Modal>
  );
}

export function Autocollants() {
  const me = useUser();
  const [gen, setGen] = useState(false);
  const [imp, setImp] = useState(false);
  const canCreate = has(me, "AUTOCOLLANT_CREER");
  return (
    <div>
      <PageHead title="Autocollants" sub="Inventaire des autocollants QR par série et par site.">
        <a className="btn" href="/api/v1/exports/autocollants"><Download size={15} />Exporter</a>
        {canCreate && <Btn onClick={() => setImp(true)}><Upload size={15} />Importer CSV</Btn>}
        {canCreate && <Btn kind="primary" onClick={() => setGen(true)}><Layers size={15} />Générer une série</Btn>}
      </PageHead>
      <ResourcePage embedded readOnly ressource="autocollants" noun="autocollant" title="Autocollants" statuts={["DISPONIBLE", "ATTRIBUE"]}
        titleOf={(r) => String(numOf(r) ?? r.id)}
        preCols={[{ key: "qr", label: "QR", render: (r) => numOf(r) ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={`/api/v1/qr/${encodeURIComponent(String(numOf(r)))}`} alt={`QR ${numOf(r)}`} width={48} height={48} loading="lazy" /> : "—" }]}
        extraActions={(r) => <>{numOf(r) && <a className="btn sm" target="_blank" rel="noreferrer" href={`/api/v1/qr/${encodeURIComponent(String(numOf(r)))}`}><QrCode size={13} />QR</a>}{printLink("autocollant", r.id)}</>}
        setup="Utilisez « Générer une série » ou « Importer CSV ». Sélectionnez la province, ou un district pour Kinshasa." fields={[]} />
      {gen && <GenererModal onClose={() => setGen(false)} />}
      {imp && <ImportModal onClose={() => setImp(false)} />}
    </div>
  );
}
