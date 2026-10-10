"use client";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useCreerRessource, useObtenirResponsablesRecouvrement,
  getObtenirResponsablesRecouvrementQueryKey } from "@workspace/api-client-react";
import { Btn, Field, Modal, Skeleton, ErrorBox, useToast } from "@/components/ui";
import { cleanPayload, errMsg, invalidateData, type Row } from "@/lib/utils";
import { normaliserTerritoire } from "@/lib/territoire";

export function RecouvrementForm({ refs, onClose }: { refs: Row; onClose: () => void }) {
  const [v, setV] = useState<Row>({ provinceId: "", siteId: "", montant: "", debut: "", fin: "", commentaire: "", moniteurId: "", utilisateurConcerneId: "" });
  const [error, setError] = useState("");
  const [rechercheSite, setRechercheSite] = useState("");
  const [rechercheMoniteur, setRechercheMoniteur] = useState("");
  const [rechercheResponsable, setRechercheResponsable] = useState("");
  const set = (k: string, value: string) => setV(x => ({ ...x, [k]: value }));
  const provinces = ((refs.geographies ?? []) as Row[]).filter(g => normaliserTerritoire(g.niveau) === "PROVINCE");
  const sites = (refs.sites ?? []) as Row[];
  const provinceDesSites = (site: Row) => {
    const chemin = (Array.isArray(site.cheminGeographique) ? site.cheminGeographique : []) as Row[];
    return String(chemin.find(g => normaliserTerritoire(g.niveau) === "PROVINCE")?.id ?? "");
  };
  const sitesProvince = sites.filter(site => site.actif !== false && provinceDesSites(site) === String(v.provinceId));
  const sitesFiltres = sitesProvince.filter(site =>
    `${site.nom ?? ""} ${site.code ?? ""}`
      .toLocaleLowerCase("fr")
      .includes(rechercheSite.trim().toLocaleLowerCase("fr")),
  );
  const qc = useQueryClient(), toast = useToast();
  const candidats = useObtenirResponsablesRecouvrement(v.siteId, { query: {
    queryKey: getObtenirResponsablesRecouvrementQueryKey(v.siteId), enabled: !!v.siteId, staleTime: 0,
  } });
  const moniteurs = (candidats.data?.moniteurs ?? []) as Row[];
  const moniteursFiltres = moniteurs.filter(u =>
    String(u.nom ?? "").toLocaleLowerCase("fr").includes(rechercheMoniteur.trim().toLocaleLowerCase("fr")),
  );
  const moniteurId = moniteurs.some(u => String(u.id) === v.moniteurId)
    ? v.moniteurId
    : moniteurs.length === 1 ? String(moniteurs[0].id) : "";
  const responsables = ((candidats.data?.responsables ?? []) as Row[]).filter(u => u.id !== moniteurId);
  const responsablesFiltres = responsables.filter(u =>
    String(u.nom ?? "").toLocaleLowerCase("fr").includes(rechercheResponsable.trim().toLocaleLowerCase("fr")),
  );
  const solde = candidats.data?.soldeDispromalt as Row | undefined;
  const responsableId = responsables.some(u => String(u.id) === v.utilisateurConcerneId)
    ? v.utilisateurConcerneId
    : responsables.length === 1 ? String(responsables[0].id) : "";
  const siteSelectionne = ((refs.sites ?? []) as Row[]).find(s => String(s.id) === v.siteId);
  const m = useCreerRessource({ mutation: {
    onSuccess: () => { toast.ok("Recouvrement créé : notification envoyée au moniteur."); invalidateData(qc); onClose(); },
    onError: e => setError(errMsg(e)),
  } });
  const go = () => {
    if (!v.siteId || !v.montant || !v.debut || !v.fin || !moniteurId || !responsableId)
      return setError("Renseignez le site, la période, le montant et les deux signataires.");
    const { provinceId: _provinceId, ...donnees } = v;
    m.mutate({ ressource: "recouvrements", data: cleanPayload({ ...donnees, montant: Number(v.montant),
      moniteurId, utilisateurConcerneId: responsableId }) });
  };
  const choisirProvince = (provinceId: string) => {
    const sitesDisponibles = sites.filter(site => site.actif !== false && provinceDesSites(site) === provinceId);
    setV(x => ({
      ...x,
      provinceId,
      siteId: sitesDisponibles.length === 1 ? String(sitesDisponibles[0].id) : "",
      montant: "",
      moniteurId: "",
      utilisateurConcerneId: "",
    }));
    setRechercheSite("");
    setRechercheMoniteur("");
    setRechercheResponsable("");
  };
  return <Modal open wide title="Nouveau recouvrement" onClose={onClose} footer={<>
    <Btn onClick={onClose}>Annuler</Btn><Btn kind="save" disabled={m.isPending || candidats.isFetching || !moniteurId || !responsableId} onClick={go}>
      {m.isPending ? "Enregistrement…" : "Créer et notifier"}</Btn></>}>
    {error && <div className="errbox" role="alert">{error}</div>}
    <div className="fgrid">
      <Field label="Province *"><select className="input" value={String(v.provinceId)} onChange={e => choisirProvince(e.target.value)}>
        <option value="">Choisir une province…</option>{provinces.map(p => <option key={p.id} value={p.id}>{p.nom}</option>)}
      </select></Field>
      <Field label="Site *">
        {v.provinceId && sitesProvince.length > 0 && <input
          className="input"
          type="search"
          aria-label="Filtrer les sites de la province"
          placeholder="Rechercher un site par nom ou code"
          value={rechercheSite}
          onChange={e => {
            const recherche = e.target.value;
            const rechercheNormalisee = recherche.trim().toLocaleLowerCase("fr");
            setRechercheSite(recherche);
            if (v.siteId && !sitesProvince.some(site =>
              String(site.id) === v.siteId &&
              `${site.nom ?? ""} ${site.code ?? ""}`.toLocaleLowerCase("fr").includes(rechercheNormalisee),
            )) {
              setV(x => ({ ...x, siteId: "", montant: "", moniteurId: "", utilisateurConcerneId: "" }));
            }
          }}
        />}
        <select className="input" value={v.siteId} disabled={!v.provinceId || sitesProvince.length === 0} onChange={e =>
        { setV(x => ({ ...x, siteId: e.target.value, montant: "", moniteurId: "", utilisateurConcerneId: "" })); setRechercheMoniteur(""); setRechercheResponsable(""); setError(""); }}>
        <option value="">Choisir un site…</option>{sitesFiltres.map((s: Row) => <option key={s.id} value={s.id}>{s.nom}{s.code ? ` — ${s.code}` : ""}</option>)}</select>
        {!v.provinceId && <p className="hint">Choisissez d&apos;abord une province pour filtrer ses sites.</p>}
        {v.provinceId && sitesProvince.length === 0 && <p className="hint">Aucun site actif disponible dans cette province.</p>}
        {v.provinceId && sitesProvince.length > 0 && sitesFiltres.length === 0 && <p className="hint">Aucun site ne correspond à cette recherche.</p>}
      </Field>
      <Field label="Montant Dispromalt à recouvrer (CDF) *" hint="Le montant est débité uniquement de la part Dispromalt. La part province ne diminue pas.">
        <input className="input" type="number" min="0.01" step="0.01" value={v.montant} onChange={e => set("montant", e.target.value)} /></Field>
      <Field label="Début de période *"><input className="input" type="date" value={v.debut} onChange={e => set("debut", e.target.value)} /></Field>
      <Field label="Fin de période *"><input className="input" type="date" value={v.fin} onChange={e => set("fin", e.target.value)} /></Field>
      {v.siteId && (candidats.isLoading ? <Skeleton rows={2} /> : candidats.isError ?
        <ErrorBox error={candidats.error} retry={() => candidats.refetch()} /> : <>
          {solde && <div className="card pad" style={{ gridColumn: "1 / -1" }}>
            <b>Dispromalt — bilan du site {String(siteSelectionne?.nom ?? "")}</b>
            <p>Gain Dispromalt : {String(solde.gain)} CDF · Recouvré validé : {String(solde.recouvre)} CDF · Réservé en attente : {String(solde.reserve)} CDF</p>
             <p><b>Part Dispromalt disponible : {String(solde.disponible)} CDF</b>. Cette information est calculée automatiquement; le montant de la période reste contrôlé par le serveur.</p>
          </div>}
          <Field label="Moniteur responsable *" hint="Détecté selon le site et les zones les plus proches, pas par GPS.">
            {moniteurs.length === 1
              ? <div className="card pad"><b>{String(moniteurs[0].nom)}</b> — sélectionné automatiquement</div>
              : <>
                  {moniteurs.length > 1 && <input className="input" type="search" aria-label="Rechercher un moniteur responsable" placeholder="Rechercher par nom" value={rechercheMoniteur} onChange={e => setRechercheMoniteur(e.target.value)} />}
                  <select className="input" value={moniteurId} onChange={e => setV(x => ({ ...x, moniteurId: e.target.value, utilisateurConcerneId: "" }))}>
                    <option value="">Choisir…</option>{moniteursFiltres.map(u => <option key={u.id} value={u.id}>{u.nom}</option>)}</select>
                </>}
            {!moniteurs.length && <p className="errbox">Aucun moniteur habilité. Affectez un moniteur national à cette zone avec RECOUVREMENT_VALIDER.</p>}
            {moniteurs.length > 1 && moniteurId && <p className="hint">Moniteur sélectionné : <b>{String(moniteurs.find(u => String(u.id) === moniteurId)?.nom ?? "")}</b></p>}
          </Field>
          <Field label="Moniteur provincial/de zone — seconde signature *">
            {responsables.length === 1
              ? <div className="card pad"><b>{String(responsables[0].nom)}</b> — sélectionné automatiquement</div>
              : <>
                  {responsables.length > 1 && <input className="input" type="search" aria-label="Rechercher le moniteur provincial ou de zone" placeholder="Rechercher par nom" value={rechercheResponsable} onChange={e => setRechercheResponsable(e.target.value)} />}
                  <select className="input" value={responsableId} onChange={e => set("utilisateurConcerneId", e.target.value)}>
                    <option value="">Choisir…</option>{responsablesFiltres.map(u => <option key={u.id} value={u.id}>{u.nom}</option>)}</select>
                </>}
            {!responsables.length && <p className="errbox">Affectez un moniteur provincial actif au site ou à sa zone avec RECOUVREMENT_VALIDER.</p>}
            {responsables.length > 1 && responsableId && <p className="hint">Moniteur sélectionné : <b>{String(responsables.find(u => String(u.id) === responsableId)?.nom ?? "")}</b></p>}
          </Field>
        </>)}
      <Field label="Commentaire" full><textarea className="input" value={v.commentaire} onChange={e => set("commentaire", e.target.value)} /></Field>
    </div>
  </Modal>;
}