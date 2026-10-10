"use client";
import { useState, useRef, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Check, Download, Eye, Layers, Printer, QrCode, Upload } from "lucide-react";
import { getListerRessourceQueryKey, useGenererAutocollants, useListerRessource, useObtenirReferences, useValiderRecouvrement } from "@workspace/api-client-react";
import { ResourcePage } from "@/components/resource-page";
import { Badge, Btn, Field, Modal, PageHead, useToast } from "@/components/ui";
import { useUser } from "@/components/shell";
import { has } from "@/lib/perm";
import { apiJson, errMsg, fmtMoney, invalidateData, type Row } from "@/lib/utils";
import { ZoneLot } from "@/components/zone-lot";
import { RecouvrementForm } from "@/components/recouvrement-form";
import { afficherNumeroAutocollant } from "@/lib/numero-autocollant";

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
        statuts={["EN_ATTENTE", "SIGNE_MONITEUR", "VALIDE", "REJETE"]} canEdit={false} filtreProvince createPerm={["RECOUVREMENT_CREER"]} extraActions={step}
        extraParams={typeof window !== "undefined" ? Object.fromEntries(new URLSearchParams(window.location.search)) : {}}
        renderForm={({ refs, onClose }) => <RecouvrementForm refs={refs} onClose={onClose} />}
        titleOf={(r) => String(r.reference ?? r.id)}
        columns={[{ key: "reference", label: "Référence" }, { key: "site", label: "Site", render: (r) => String(r.site?.nom ?? "—") },
          { key: "zone", label: "Zone géographique", render: (r) => String(r.site?.geographie?.nom ?? "—") },
          { key: "montant", label: "Montant", render: (r) => fmtMoney(r.montant) },
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
  const [v, setV] = useState<Row>({ serie: "", prefixe: "", geographieId: "", debut: "1", fin: "", longueur: "4", typeAutocollant: "AUTOCOLLANT_2R" });
  const [error, setError] = useState("");
  const [final, setFinal] = useState<Row | null>(null);
  const derniereSaisie = useRef<Row | null>(null);
  const set = (k: string, x: string) => setV((o) => ({ ...o, [k]: x }));
  const params = { geographieId: String(v.geographieId), page: 1, limite: 1 };
  const derniersDansLaZone = useListerRessource("autocollants", params, {
    query: {
      enabled: !!v.geographieId,
      queryKey: getListerRessourceQueryKey("autocollants", params),
      refetchOnMount: "always",
    },
  });
  const m = useGenererAutocollants({ mutation: { onSuccess: (r) => {
    const resultat = r as unknown as Row;
    toast.ok(resultat.message ?? "Autocollants générés");
    setFinal({ ...(derniereSaisie.current ?? {}), nombre: resultat.nombre ?? 0, autocollants: resultat.autocollants });
    invalidateData(qc);
  }, onError: (e) => setError(errMsg(e)) } });
  const go = () => {
    if (!v.serie || !v.prefixe || !v.geographieId || v.fin === "") return setError("Renseignez la série, le préfixe, la province (et le district pour Kinshasa) et la plage.");
    const debut = Number(v.debut), fin = Number(v.fin), longueur = Number(v.longueur);
    if (!(fin >= debut) || debut < 0) return setError("La plage est invalide : la fin doit être supérieure ou égale au début.");
    if (longueur < 1 || longueur > 20) return setError("La longueur doit être comprise entre 1 et 20.");
    setError("");
    const zone = ((refs.data?.geographies ?? []) as Row[]).find((g) => String(g.id) === String(v.geographieId));
    derniereSaisie.current = {
      ...v,
      prefixe: String(v.prefixe).replace(/\s/g, "").toUpperCase(),
      debut,
      fin,
      longueur,
      zoneNom: zone?.nom ?? v.geographieId,
    };
    m.mutate({ data: { serie: v.serie, prefixe: v.prefixe, geographieId: v.geographieId, debut, fin, longueur, typeAutocollant: v.typeAutocollant as "AUTOCOLLANT_2R" | "AUTOCOLLANT_3R" } });
  };
  const telechargerCSV = () => {
    if (!final) return;
    const cellule = (valeur: unknown) => {
      const texte = String(valeur ?? "");
      const protege = /^[=+\-@\t\r]/.test(texte) ? `'${texte}` : texte;
      return `"${protege.replaceAll('"', '""')}"`;
    };
    const autocollants = Array.isArray(final.autocollants) ? final.autocollants as Row[] : [];
    if (autocollants.length !== Number(final.nombre)) {
      setError("La liste des URL QR n’est pas complète. Ne réimportez pas cette série; relancez son export depuis la liste des autocollants.");
      return;
    }
    const lignes = [
      ["numero", "serie", "numeroAffiche", "urlPublique", "zone", "typeAutocollant"],
      ...autocollants.map((autocollant) => [
        autocollant.numero,
        final.serie,
        afficherNumeroAutocollant(autocollant.numero, final.serie),
        autocollant.urlPublique,
        final.zoneNom,
        final.typeAutocollant,
      ]),
    ];
    const csv = `\uFEFF${lignes.map((ligne) => ligne.map(cellule).join(";")).join("\r\n")}`;
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const lien = document.createElement("a");
    lien.href = url;
    lien.download = `GNVA-${String(final.serie).replace(/[^A-Za-z0-9_-]+/g, "_")}.csv`;
    lien.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  };
  const derniers = (derniersDansLaZone.data?.elements ?? []) as Row[];
  const dernier = derniers[0];
  return (
    <Modal open wide title="Générer une série d'autocollants" onClose={onClose} footer={final ? <>
      <Btn onClick={onClose}>Fermer</Btn><Btn kind="save" onClick={telechargerCSV}><Download size={14} />Télécharger la série en CSV</Btn>
    </> : <>
      <Btn onClick={onClose}>Annuler</Btn><Btn kind="save" disabled={m.isPending} onClick={go}><Layers size={14} />{m.isPending ? "Génération..." : "Générer"}</Btn>
    </>}>
      {final ? (
        <>
        {error && <div className="errbox" role="alert">{error}</div>}
        <div className="card pad" role="status">
          <h3>Génération terminée</h3>
          <p>{String(final.nombre)} autocollant(s) sont déjà enregistrés en base. Il n&apos;est pas nécessaire de les réimporter.</p>
          <p>Dernier autocollant créé pour {String(final.zoneNom)} : <b className="mono">{afficherNumeroAutocollant(
            `${String(final.prefixe)}-${String(final.fin).padStart(Number(final.longueur), "0")}`,
            final.serie,
          )}</b></p>
          <p style={{ marginBottom: 0 }}>Le bouton ci-dessous télécharge une copie CSV de cette série enregistrée.</p>
        </div>
        </>
      ) : <>
        {error && <div className="errbox" style={{ marginBottom: 12 }} role="alert">{error}</div>}
        <div className="fgrid">
          <Field label="Série *" hint="La série complète distingue les autocollants portant le même numéro."><input className="input" value={v.serie} onChange={(e) => set("serie", e.target.value)} /></Field>
          <Field label="Préfixe *"><input className="input" value={v.prefixe} onChange={(e) => set("prefixe", e.target.value)} /></Field>
          <ZoneLot zones={(refs.data?.geographies ?? []) as Row[]} onChange={id => set("geographieId", id)} />
          <div className="card pad full" role="status" style={{ marginBottom: 12 }}>
            <b>Dernier autocollant déjà généré dans cette zone</b>
            <div className="mono" style={{ marginTop: 4 }}>
              {!v.geographieId ? "Choisissez une province ou un district." :
                derniersDansLaZone.isLoading ? "Recherche…" :
                dernier ? afficherNumeroAutocollant(dernier.numero, dernier.lot?.serie) :
                "Aucun autocollant enregistré dans cette zone."}
            </div>
          </div>
          <Field label="Premier numéro *"><input className="input" type="number" min={0} value={v.debut} onChange={(e) => set("debut", e.target.value)} /></Field>
          <Field label="Dernier numéro *"><input className="input" type="number" min={0} value={v.fin} onChange={(e) => set("fin", e.target.value)} /></Field>
          <Field label="Longueur du numéro *" hint="4 chiffres par défaut; les zéros à gauche sont conservés."><input className="input" type="number" min={1} max={20} value={v.longueur} onChange={(e) => set("longueur", e.target.value)} /></Field>
          <Field label="Type d’autocollant"><select className="input" value={v.typeAutocollant} onChange={(e) => set("typeAutocollant", e.target.value)}><option value="AUTOCOLLANT_2R">Autocollant 2 roues</option><option value="AUTOCOLLANT_3R">Autocollant 3 roues</option></select></Field>
        </div>
      </>}
    </Modal>
  );
}

const numOf = (r: Row) => r.numero ?? r.numeroAutocollant;
const numeroAvecSerie = (r: Row) => afficherNumeroAutocollant(numOf(r), r.lot?.serie);

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
        <Field label="Ou coller le contenu CSV *" full hint="Importez de 1 à 10 000 autocollants, y compris un fichier de 10 lignes."><textarea className="input mono" rows={6} value={v.csv} onChange={(e) => set("csv", e.target.value)} /></Field>
      </div>
      {prev && (
        <div className="card pad" style={{ borderLeft: "4px solid var(--orange)" }}>
          <b>{String(prev.message ?? "Aperçu")}</b> - {String(prev.nombre ?? 0)} ligne(s)
          <div className="mono" style={{ fontSize: 12, color: "var(--muted)" }}>Empreinte : {String(prev.empreinte ?? "")}</div>
          {apercu.slice(0, 10).map((a, i) => <div key={i} className="mono" style={{ fontSize: 12 }}>{typeof a === "object" && a !== null
            ? `${afficherNumeroAutocollant((a as Row).numero, v.serie)} | ${String((a as Row).urlPublique ?? (a as Row).url ?? "—")}`
            : String(a)}</div>)}
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
      <ResourcePage embedded readOnly ressource="autocollants" noun="autocollant" title="Autocollants" filtreProvince statuts={["DISPONIBLE", "ATTRIBUE"]}
        titleOf={(r) => numeroAvecSerie(r)}
        columns={[
          { key: "qr", label: "QR", render: (r) => numOf(r) ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={`/api/v1/qr/${encodeURIComponent(String(r.id))}`} alt={`QR ${numeroAvecSerie(r)}`} width={48} height={48} loading="lazy" /> : "—" },
          { key: "numeroAffiche", label: "Autocollant / Série", render: (r) => numeroAvecSerie(r) },
          { key: "zoneGeographique", label: "Zone géographique", render: (r) => String(r.zoneGeographique?.nom ?? "—") },
          { key: "urlPublique", label: "URL du QR", render: (r) => r.jeton
            ? <a href={String(r.urlPublique ?? `/autocollant/${r.jeton}`)} target="_blank" rel="noreferrer">Visualiser / scanner</a>
            : "—" },
          { key: "site", label: "Site d'origine", render: (r) => String(r.site?.nom ?? "—") },
          { key: "typeAutocollant", label: "Type" },
          { key: "statut", label: "Statut" },
          ...(me.roleCode === "AGENT" ? [] : [
            { key: "assujetti", label: "Assujetti", render: (r: Row) => r.attribution?.assujetti ? [r.attribution.assujetti.nom, r.attribution.assujetti.postnom, r.attribution.assujetti.reference].filter(Boolean).join(" · ") : "—" },
            { key: "dateAttribution", label: "Date d'attribution", render: (r: Row) => r.attribution?.createdAt ? new Date(String(r.attribution.createdAt)).toLocaleString("fr-FR") : "—" },
            { key: "siteAttribution", label: "Site d'attribution", render: (r: Row) => String(r.attribution?.transaction?.site?.nom ?? "—") },
          ]),
        ]}
        extraActions={(r) => <>{numOf(r) && <a className="btn sm" target="_blank" rel="noreferrer" href={`/api/v1/qr/${encodeURIComponent(String(r.id))}`}><QrCode size={13} />QR</a>}{printLink("autocollant", r.id)}</>}
        setup="Utilisez « Générer une série » ou « Importer CSV ». Sélectionnez la province, ou un district pour Kinshasa." fields={[]} />
      {gen && <GenererModal onClose={() => setGen(false)} />}
      {imp && <ImportModal onClose={() => setImp(false)} />}
    </div>
  );
}
