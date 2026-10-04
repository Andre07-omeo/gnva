"use client";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useCreerRessource, useObtenirResponsablesRecouvrement,
  getObtenirResponsablesRecouvrementQueryKey } from "@workspace/api-client-react";
import { Btn, Field, Modal, Skeleton, ErrorBox, useToast } from "@/components/ui";
import { cleanPayload, errMsg, invalidateData, type Row } from "@/lib/utils";

export function RecouvrementForm({ refs, onClose }: { refs: Row; onClose: () => void }) {
  const [v, setV] = useState<Row>({ siteId: "", montant: "", debut: "", fin: "", commentaire: "", moniteurId: "", utilisateurConcerneId: "" });
  const [error, setError] = useState("");
  const set = (k: string, value: string) => setV(x => ({ ...x, [k]: value }));
  const qc = useQueryClient(), toast = useToast();
  const candidats = useObtenirResponsablesRecouvrement(v.siteId, { query: {
    queryKey: getObtenirResponsablesRecouvrementQueryKey(v.siteId), enabled: !!v.siteId, staleTime: 0,
  } });
  const moniteurs = (candidats.data?.moniteurs ?? []) as Row[];
  const moniteurId = v.moniteurId || (moniteurs.length === 1 ? String(moniteurs[0].id) : "");
  const responsables = ((candidats.data?.responsables ?? []) as Row[]).filter(u => u.id !== moniteurId);
  const solde = candidats.data?.soldeDispromalt as Row | undefined;
  const responsableId = v.utilisateurConcerneId || (responsables.length === 1 ? String(responsables[0].id) : "");
  const m = useCreerRessource({ mutation: {
    onSuccess: () => { toast.ok("Recouvrement créé : notification envoyée au moniteur."); invalidateData(qc); onClose(); },
    onError: e => setError(errMsg(e)),
  } });
  const go = () => {
    if (!v.siteId || !v.montant || !v.debut || !v.fin || !moniteurId || !responsableId)
      return setError("Renseignez le site, la période, le montant et les deux signataires.");
    m.mutate({ ressource: "recouvrements", data: cleanPayload({ ...v, montant: Number(v.montant),
      moniteurId, utilisateurConcerneId: responsableId }) });
  };
  return <Modal open wide title="Nouveau recouvrement" onClose={onClose} footer={<>
    <Btn onClick={onClose}>Annuler</Btn><Btn kind="save" disabled={m.isPending || candidats.isFetching || !moniteurId || !responsableId} onClick={go}>
      {m.isPending ? "Enregistrement…" : "Créer et notifier"}</Btn></>}>
    {error && <div className="errbox" role="alert">{error}</div>}
    <div className="fgrid">
      <Field label="Site *"><select className="input" value={v.siteId} onChange={e =>
        setV(x => ({ ...x, siteId: e.target.value, moniteurId: "", utilisateurConcerneId: "" }))}>
        <option value="">Choisir…</option>{(refs.sites ?? []).map((s: Row) => <option key={s.id} value={s.id}>{s.nom}</option>)}</select></Field>
      <Field label="Montant Dispromalt à recouvrer (CDF) *" hint="Débité uniquement de la part Dispromalt. La part province ne diminue pas.">
        <input className="input" type="number" min="0.01" step="0.01" value={v.montant} onChange={e => set("montant", e.target.value)} /></Field>
      <Field label="Début de période *"><input className="input" type="date" value={v.debut} onChange={e => set("debut", e.target.value)} /></Field>
      <Field label="Fin de période *"><input className="input" type="date" value={v.fin} onChange={e => set("fin", e.target.value)} /></Field>
      {v.siteId && (candidats.isLoading ? <Skeleton rows={2} /> : candidats.isError ?
        <ErrorBox error={candidats.error} retry={() => candidats.refetch()} /> : <>
          {solde && <div className="card pad" style={{ gridColumn: "1 / -1" }}>
            <b>Dispromalt — solde cumulé de ce site</b>
            <p>Gain : {String(solde.gain)} CDF · Recouvré validé : {String(solde.recouvre)} CDF · Réservé en attente : {String(solde.reserve)} CDF</p>
            <p><b>Disponible : {String(solde.disponible)} CDF</b>. Le montant de la période reste contrôlé par le serveur.</p>
          </div>}
          <Field label="Moniteur responsable *" hint="Détecté selon le site et les zones les plus proches, pas par GPS.">
            <select className="input" value={moniteurId} onChange={e => setV(x => ({ ...x, moniteurId: e.target.value, utilisateurConcerneId: "" }))}>
              <option value="">Choisir…</option>{moniteurs.map(u => <option key={u.id} value={u.id}>{u.nom}</option>)}</select>
            {!moniteurs.length && <p className="errbox">Aucun moniteur habilité. Affectez un moniteur national à cette zone avec RECOUVREMENT_VALIDER.</p>}
          </Field>
          <Field label="Moniteur provincial/de zone — seconde signature *">
            <select className="input" value={responsableId} onChange={e => set("utilisateurConcerneId", e.target.value)}>
              <option value="">Choisir…</option>{responsables.map(u => <option key={u.id} value={u.id}>{u.nom}</option>)}</select>
            {!responsables.length && <p className="errbox">Affectez un moniteur provincial actif au site ou à sa zone avec RECOUVREMENT_VALIDER.</p>}
          </Field>
        </>)}
      <Field label="Commentaire" full><textarea className="input" value={v.commentaire} onChange={e => set("commentaire", e.target.value)} /></Field>
    </div>
  </Modal>;
}