"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { Download, Printer } from "lucide-react";
import { getListerRessourceQueryKey, getObtenirTableauDeBordQueryKey, useListerRessource, useObtenirReferences, useObtenirTableauDeBord } from "@workspace/api-client-react";
import { Empty, ErrorBox, PageHead, Pager, Skeleton } from "@/components/ui";
import { DataView } from "@/components/data-view";
import { useUser } from "@/components/shell";
import { has } from "@/lib/perm";
import { fmtMoney, type Row } from "@/lib/utils";
import { TerrainDashboard } from "@/components/terrain-dashboard";

function Filters({ p, set, extended }: { p: Row; set: (k: string, v: string) => void; extended?: boolean }) {
  const refs = useObtenirReferences();
  const me = useUser();
  const users = useListerRessource("utilisateurs", { limite: 100 }, { query: { enabled: !!extended && has(me, "UTILISATEUR_CREER", "UTILISATEUR_MODIFIER"), retry: false, queryKey: getListerRessourceQueryKey("utilisateurs", { limite: 100 }) } });
  const sites = (refs.data?.sites ?? []) as Row[];
  const inp = (k: string, ph: string, type = "text") => <input className="input" type={type} aria-label={ph} placeholder={ph} value={p[k] ?? ""} onChange={(e) => set(k, e.target.value)} />;
  const sel = (k: string, all: string, opts: Row[]) => (
    <select className="input" aria-label={all} value={p[k] ?? ""} onChange={(e) => set(k, e.target.value)}>
      <option value="">{all}</option>{opts.map((s) => <option key={s.id} value={s.id}>{s.nom}</option>)}
    </select>
  );
  return (
    <>
      {inp("debut", "Début", "date")}{inp("fin", "Fin", "date")}
      {sel("siteId", "Tous les sites", sites)}
      {extended && <>
        {sel("geographieId", "Toutes les géographies", (refs.data?.geographies ?? []) as Row[])}
        {sel("typeMotoId", "Tous les types de moto", (refs.data?.typesMoto ?? []) as Row[])}
        {sel("utilisateurId", "Tous les agents", ((users.data?.elements ?? []) as Row[]))}
        {inp("exercice", "Exercice", "number")}{inp("statut", "Statut")}{inp("autocollant", "Autocollant")}{inp("timbre", "Timbre")}
      </>}
    </>
  );
}

export function useFilters() {
  const [p, setP] = useState<Row>({});
  const [ready, setReady] = useState(false);
  useEffect(() => {
    setP(Object.fromEntries(new URLSearchParams(window.location.search)));
    setReady(true);
  }, []);
  useEffect(() => {
    if (!ready) return;
    const q=new URLSearchParams(Object.fromEntries(Object.entries(p).filter(([,val])=>!!val)));
    window.history.replaceState(null,"",`${window.location.pathname}${q.size?`?${q}`:""}`);
  }, [p, ready]);
  const set = (k: string, v: string) => setP((x) => ({ ...x, [k]: v }));
  const clean = Object.fromEntries(Object.entries(p).filter(([, v]) => v));
  return { p, set, clean };
}

export function Kpis({ params }: { params: Row }) {
  const q = useObtenirTableauDeBord(params, { query: {
    queryKey: getObtenirTableauDeBordQueryKey(params), refetchInterval: 10000,
  } });
  if (q.isLoading) return <div className="card"><Skeleton rows={3} /></div>;
  if (q.isError) return <ErrorBox error={q.error} retry={() => q.refetch()} />;
  const d = q.data!;
  const bilan = d.bilanGeneral;
  const parSite = (d.parSite ?? []) as Row[];
  const max = Math.max(1, ...parSite.map((s) => Number(s.assujettis) || 0));
  const vide = d.assujettis === 0 && d.sitesActifs === 0 && d.sitesSuspendus === 0;
  const k = (l: string, v: string | number, c = "") => <div className={`card kpi ${c}`}><span>{l}</span><b>{v}</b></div>;
  return (
    <>
      <section className="card pad" style={{ marginBottom: 16 }} aria-label="Bilan général cumulé">
        <h3>Bilan général cumulé</h3>
        <p>Toutes les dates, dans votre périmètre territorial et les sites sélectionnés. Les filtres de période ci-dessous ne remettent pas ces soldes à zéro.</p>
        <div className="kpis">
          {k("Total assujettis attribués", bilan.assujettisAttribues)}
          {k("Gain général total (CDF)", fmtMoney(bilan.gainGeneral), "g")}
          {k("Gain total Dispromalt — 50 %", fmtMoney(bilan.gainDispromalt), "g")}
          {k("Gain total province — 50 %", fmtMoney(bilan.gainProvince), "o")}
          {k("Dispromalt recouvré et validé", fmtMoney(bilan.recouvreDispromalt))}
          {k("Dispromalt restant après recouvrement", fmtMoney(bilan.resteDispromalt), "g")}
          {k("Dispromalt réservé en attente", fmtMoney(bilan.reserveDispromalt))}
          {k("Dispromalt disponible à recouvrer", fmtMoney(bilan.disponibleDispromalt), "g")}
        </div>
      </section>
      <h3>Indicateurs de la période sélectionnée</h3>
      {vide && (
        <div className="card pad" style={{ marginBottom: 14, borderLeft: "4px solid var(--orange)" }}>
          <b>Premiers pas pour mettre GNVA en service</b>
          <ol style={{ margin: "8px 0 0", paddingLeft: 18 }}>
            <li><Link href="/geographies">Créer les géographies</Link> (provinces, villes, communes).</li>
            <li><Link href="/sites">Créer les sites</Link> rattachés à une géographie.</li>
            <li><Link href="/parametres">Définir les types de moto et tarifs</Link>.</li>
            <li><Link href="/utilisateurs">Créer les utilisateurs</Link> avec rôle, site et zones.</li>
            <li><Link href="/autocollants">Générer les autocollants</Link> puis <Link href="/assujettis">enregistrer les assujettis</Link>.</li>
          </ol>
        </div>
      )}
      <div className="kpis">
        {k("Assujettis", d.assujettis)}{k("Attribués", d.attribues, "o")}{k("Disponibles", d.disponibles, "g")}{k("Timbres", d.timbres)}
        {k("Gains générés (CDF)", fmtMoney(d.recettes), "g")}{k("Dispromalt recouvré validé", fmtMoney(d.recouvrements), "g")}
        {k("Gain Dispromalt (50 %)", fmtMoney(d.partDispromalt), "g")}
        {k("Gain province (50 %)", fmtMoney(d.partProvince), "o")}
        {k("Sites actifs", d.sitesActifs)}{k("Sites suspendus", d.sitesSuspendus, "r")}{k("Utilisateurs actifs", d.utilisateursActifs)}
      </div>
      <div className="two">
        <div className="card pad">
          <h3 style={{ marginBottom: 10 }}>Par site</h3>
          {parSite.length === 0 ? <Empty title="Aucune donnée par site">Les volumes apparaîtront après les premières attributions.</Empty> :
            parSite.map((s, i) => (
              <div key={i} style={{ marginBottom: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}><b>{String(s.nom)}</b><span className="mono">{String(s.assujettis)} / {fmtMoney(s.recettes)}</span></div>
                <div className="bar"><i style={{ width: `${((Number(s.assujettis) || 0) / max) * 100}%` }} /></div>
              </div>
            ))}
        </div>
        <div className="card pad"><h3>Partage des gains de la période</h3>
          <dl className="kv"><dt>Dispromalt</dt><dd>{fmtMoney(d.partDispromalt)} CDF</dd>
            <dt>Province</dt><dd>{fmtMoney(d.partProvince)} CDF</dd>
            <dt>Dispromalt recouvré et validé</dt><dd>{fmtMoney(d.recouvrements)} CDF</dd></dl>
          <p style={{ color: "var(--muted)" }}>Chaque attribution génère une transaction et crédite les deux parts. Le recouvrement ne débite que Dispromalt ; la part province reste inchangée.</p>
        </div>
      </div>
    </>
  );
}

export function Dashboard() {
  const me = useUser();
  const f = useFilters();
  if (me.roleCode === "AGENT") return <TerrainDashboard />;
  return (
    <div>
      <PageHead title="Tableau de bord" sub="Vue consolidée selon votre périmètre d'accès."><Filters p={f.p} set={f.set} /></PageHead>
      <Kpis params={f.clean} />
    </div>
  );
}

export function Rapports() {
  const f = useFilters();
  const me = useUser();
  const [page, setPage] = useState(1);
  const stats = useObtenirTableauDeBord(f.clean);
  const periode = { ...f.clean, debut: f.clean.debut || stats.data?.jour, fin: f.clean.fin || stats.data?.jour };
  const tx = useListerRessource("transactions", { limite: 100, ...periode, page }, {
    query: { enabled: !!stats.data, queryKey: getListerRessourceQueryKey("transactions", { limite: 100, ...periode, page }) },
  });
  const rows = (tx.data?.elements ?? []) as Row[];
  const qs = new URLSearchParams(Object.fromEntries(Object.entries(periode).filter(([, v]) => v)) as Record<string, string>).toString();
  return (
    <div>
      <PageHead title="Rapports" sub="Synthèse financière et transactions sur la période.">
        {has(me, "RAPPORT_EXPORTER") && <a className="btn save" href={`/api/v1/exports/transactions?${qs}`}><Download size={15} />Exporter</a>}
        {has(me, "RAPPORT_IMPRIMER") && <a className="btn" target="_blank" rel="noreferrer" href={`/api/v1/impression/rapport?${qs}`}><Printer size={15} />Imprimer le rapport complet</a>}
      </PageHead>
      <div className="tools"><Filters p={f.p} set={(k, v) => { f.set(k, v); setPage(1); }} extended /></div>
      <Kpis params={f.clean} />
      <div className="card" style={{ marginTop: 14 }}>
        <div className="pad"><h3>Transactions</h3></div>
        {tx.isLoading ? <Skeleton /> : tx.isError ? <div className="pad"><ErrorBox error={tx.error} retry={() => tx.refetch()} /></div> : rows.length === 0 ? (
          <Empty title="Aucune transaction">Les transactions sont créées automatiquement lors de chaque attribution d&apos;autocollant.</Empty>
        ) : <><DataView rows={rows} mode="table" titleOf={(r) => String(r.reference ?? r.id)} />
          <Pager page={page} limite={100} total={tx.data?.total ?? 0} onPage={setPage} /></>}
      </div>
    </div>
  );
}
