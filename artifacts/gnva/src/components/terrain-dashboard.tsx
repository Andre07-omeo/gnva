"use client";
import { useState } from "react";
import { Lock, QrCode, UserPlus } from "lucide-react";
import { getObtenirTableauDeBordQueryKey, useObtenirTableauDeBord } from "@workspace/api-client-react";
import { ErrorBox, Skeleton } from "@/components/ui";
import { useUser } from "@/components/shell";
import { has } from "@/lib/perm";
import { fmtMoney } from "@/lib/utils";
import { Assujettis } from "@/components/assujettis";
import "./terrain-dashboard.css";

type Tab = "enregistrement" | "assignation";

function jourLong(j?: string) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(j ?? "");
  if (!m) return j ?? "";
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}

export function TerrainDashboard() {
  const me = useUser();
  const canReg = has(me, "ASSUJETTI_CREER");
  const canAss = has(me, "AUTOCOLLANT_ATTRIBUER");
  const [chosen, setChosen] = useState<Tab | null>(null);
  const tab: Tab | null = chosen === "enregistrement" && canReg ? chosen : chosen === "assignation" && canAss ? chosen : canReg ? "enregistrement" : canAss ? "assignation" : null;
  const q = useObtenirTableauDeBord(undefined, { query: { queryKey: getObtenirTableauDeBordQueryKey(), refetchInterval: 30000, enabled: !!tab } });

  if (!tab) {
    return (
      <div className="card td-empty">
        <Lock size={34} color="#677084" />
        <h2>Aucun onglet autorisé</h2>
        <p>Votre compte n&apos;a ni le droit d&apos;enregistrer des assujettis ni celui d&apos;attribuer des autocollants.</p>
      </div>
    );
  }

  const d = q.data;
  const stat = (l: string, v: string | number, small = false) => <div className={`td-stat ${small ? "sm" : ""}`}><span>{l}</span><b>{v}</b></div>;

  return (
    <div className="td">
      <section className="td-hero" aria-label="Statistiques du jour">
        <div className="td-top">
          <div><h1>Ma journée</h1><p>{me.nom} — vos opérations du jour</p></div>
          {d && <span className="td-date">{jourLong(d.jour)}</span>}
        </div>
        {q.isLoading ? <div style={{ marginTop: 12 }}><Skeleton rows={2} /></div> : q.isError ? (
          <div style={{ marginTop: 12 }}><ErrorBox error={q.error} retry={() => q.refetch()} /></div>
        ) : d && (
          <div className="td-stats">
            {canReg && stat("Enregistrés", d.assujettis)}
            {canAss && stat("Attribués", d.attribues)}
            {canAss && stat("Timbres", d.timbres)}
            {canAss && stat("Recettes (CDF)", fmtMoney(d.recettes), true)}
          </div>
        )}
      </section>

      <div className="td-tabs" role="tablist">
        {canReg && <button type="button" role="tab" aria-selected={tab === "enregistrement"} className={tab === "enregistrement" ? "on" : ""} onClick={() => setChosen("enregistrement")}><UserPlus size={17} />Enregistrement</button>}
        {canAss && <button type="button" role="tab" aria-selected={tab === "assignation"} className={tab === "assignation" ? "on as" : ""} onClick={() => setChosen("assignation")}><QrCode size={17} />Assignation QR</button>}
      </div>
      <div className="td-note"><span>Actualisation automatique toutes les 30 secondes</span></div>

      <Assujettis terrainTab={tab} />
    </div>
  );
}
