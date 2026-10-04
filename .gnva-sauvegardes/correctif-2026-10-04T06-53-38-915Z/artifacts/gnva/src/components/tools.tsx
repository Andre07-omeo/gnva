"use client";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Camera, LogOut, Printer, ScanLine, Search } from "lucide-react";
import { useDeconnecter } from "@workspace/api-client-react";
import { Badge, Btn, PageHead, useToast } from "@/components/ui";
import { PasswordForm } from "@/components/password";
import { useUser } from "@/components/shell";
import { apiJson, errMsg, fmtDate, getJson, type Row } from "@/lib/utils";
import {QrScanner} from "@/components/qr-scanner";
import { terminerDeconnexion } from "@/lib/deconnexion";

export function Verification() {
  const [num, setNum] = useState("");
  const [res, setRes] = useState<Row | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [cam, setCam] = useState(false);

  const check = async (v: string) => {
    const x = v.trim().split("/").filter(Boolean).pop() ?? "";
    if (!x) return;
    setBusy(true); setError(""); setRes(null);
    try { setRes(await getJson(`/api/v1/public/${encodeURIComponent(x)}`)); } catch (e) { setError(errMsg(e)); } finally { setBusy(false); }
  };


  const LABELS: [string, string][] = [["nom", "Nom"], ["postnom", "Postnom"], ["prenom", "Prénom"], ["plaque", "Plaque"], ["chassis", "Châssis"], ["moteur", "Moteur"], ["numeroAutocollant", "Autocollant"], ["numeroTimbre", "Timbre"], ["dateAttribution", "Attribué le"], ["exercice", "Exercice"]];
  const flat = res ? LABELS.filter(([k]) => res[k] != null && res[k] !== "").map(([k, l]) => [l, k === "dateAttribution" ? fmtDate(res[k]) : String(res[k])]) : [];
  return (
    <div>
      <PageHead title="Vérification d'un autocollant" sub="Contrôle terrain par numéro ou lecture du code QR." />
      <div className="card pad" style={{ maxWidth: 640 }}>
        <form onSubmit={(e) => { e.preventDefault(); check(num); }} className="tools" style={{ marginBottom: 0 }}>
          <input className="input mono" style={{ flex: 1 }} placeholder="Numéro ou jeton de l'autocollant" value={num} onChange={(e) => setNum(e.target.value)} />
          <Btn type="submit" kind="primary" disabled={busy}><Search size={15} />Vérifier</Btn>
          <Btn onClick={() => setCam((c) => !c)}><Camera size={15} />{cam ? "Arrêter" : "Scanner"}</Btn>
        </form>
        {cam && <QrScanner onRead={v=>{setNum(v);setCam(false);void check(v);}} onClose={()=>setCam(false)}/>}
        {error && <div className="errbox" style={{ marginTop: 12 }} role="alert">{error}</div>}
        {busy && <p style={{ color: "var(--muted)" }}>Vérification...</p>}
        {res && (
          <div style={{ marginTop: 16 }}>
            <Badge t={res.statut==="ATTRIBUE"&&!res.vole?"ok":"warn"}>{String(res.statut)}</Badge>
            {res.vole ? <div className="errbox" style={{ marginBottom: 10 }}><b>MOTO DÉCLARÉE VOLÉE - ne pas valider</b></div> : null}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {res.photoUrl ? <img className="photo" style={{ width: 120, height: 120, marginBottom: 10 }} src={String(res.photoUrl)} alt="Photo de l'assujetti" /> : null}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <h3 style={{ display: "flex", gap: 8, alignItems: "center" }}><ScanLine size={18} />Résultat</h3>
              {res.statut != null && <Badge>{String(res.statut)}</Badge>}
            </div>
            <dl className="kv">{flat.map(([k, v]) => <div key={k} style={{ display: "contents" }}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`/api/v1/qr/${encodeURIComponent(String(res.numero ?? res.numeroAutocollant ?? num))}`} alt="Code QR" width={140} height={140} style={{ marginTop: 12 }} />
          </div>
        )}
        {!res && !error && !busy && <p style={{ color: "var(--muted)", marginBottom: 0 }}>Saisissez un numéro ou scannez un autocollant pour afficher son état public.</p>}
      </div>
    </div>
  );
}

export function Compte() {
  const u = useUser();
  const qc = useQueryClient();
  const toast = useToast();
  const out = useDeconnecter({ mutation: { onSuccess: () => terminerDeconnexion(qc), onError: toast.err } });
  const [posBusy, setPosBusy] = useState(false);
  const share = (on: boolean) => {
    const send = (body: Row) => apiJson("/api/v1/position", { method: "POST", body }).then(() => toast.ok(on ? "Position partagée" : "Partage désactivé")).catch(toast.err).finally(() => setPosBusy(false));
    setPosBusy(true);
    if (!on) return void send({ consentement: false });
    if (!navigator.geolocation) { setPosBusy(false); return toast.err("Géolocalisation indisponible sur cet appareil."); }
    navigator.geolocation.getCurrentPosition((p) => send({ latitude: p.coords.latitude, longitude: p.coords.longitude, consentement: true }), () => { setPosBusy(false); toast.err("Position refusée ou indisponible."); }, { enableHighAccuracy: true, timeout: 15000 });
  };
  return (
    <div>
      <PageHead title="Mon compte" sub="Profil et sécurité.">
        <Btn onClick={() => window.print()}><Printer size={15} />Imprimer</Btn>
      </PageHead>
      <div className="two">
        <div className="card pad">
          <h3 style={{ marginBottom: 10 }}>Profil</h3>
          <dl className="kv">
            <dt>Nom</dt><dd>{u.nom}</dd><dt>E-mail</dt><dd>{u.email}</dd><dt>Rôle</dt><dd>{u.role}</dd>
            <dt>Site</dt><dd>{u.siteNom ?? "Tous les sites autorisés"}</dd>
            <dt>Statut</dt><dd><Badge t={u.actif ? "ok" : "bad"}>{u.actif ? "Actif" : "Inactif"}</Badge></dd>
            <dt>Permissions</dt><dd style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>{u.permissions.length ? u.permissions.map((p) => <span key={p} className="badge info">{p}</span>) : "Aucune"}</dd>
          </dl>
          <Btn kind="danger" style={{ marginTop: 14 }} disabled={out.isPending} onClick={() => out.mutate()}><LogOut size={15} />Déconnexion</Btn>
        </div>
        <div className="card pad" id="mot-de-passe">
          <h3 style={{ marginBottom: 10 }}>Changer le mot de passe</h3>
          <PasswordForm />
        </div>
        <div className="card pad">
          <h3 style={{ marginBottom: 6 }}>Partage de position</h3>
          <p style={{ color: "var(--muted)", marginTop: 0 }}>Facultatif. Sur action de votre part uniquement, votre dernière position est transmise à la carte nationale. Aucun suivi continu.</p>
          <div className="acts" style={{ justifyContent: "flex-start" }}>
            <Btn kind="primary" disabled={posBusy} onClick={() => share(true)}>Partager ma position maintenant</Btn>
            <Btn disabled={posBusy} onClick={() => share(false)}>Désactiver le partage</Btn>
          </div>
        </div>
      </div>
    </div>
  );
}
