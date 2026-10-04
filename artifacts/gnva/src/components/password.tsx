"use client";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { LogOut, ShieldAlert } from "lucide-react";
import { getObtenirSessionQueryKey, useChangerMotDePasse, useDeconnecter } from "@workspace/api-client-react";
import type { UtilisateurPublic } from "@workspace/api-client-react";
import { Btn, Field, Logo, useToast } from "@/components/ui";
import { errMsg } from "@/lib/utils";

export function PasswordForm({ onDone }: { onDone?: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [actuel, setActuel] = useState("");
  const [nouveau, setNouveau] = useState("");
  const [conf, setConf] = useState("");
  const [error, setError] = useState("");
  const m = useChangerMotDePasse({
    mutation: {
      onSuccess: () => {
        toast.ok("Mot de passe modifié");
        setActuel(""); setNouveau(""); setConf("");
        qc.invalidateQueries({ queryKey: getObtenirSessionQueryKey() });
        onDone?.();
      },
      onError: (e) => setError(errMsg(e)),
    },
  });
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!actuel) return setError("Saisissez le mot de passe actuel.");
    if (nouveau.length < 4) return setError("Le nouveau mot de passe doit contenir au moins 4 caractères.");
    if (nouveau === actuel) return setError("Le nouveau mot de passe doit différer de l'actuel.");
    if (nouveau !== conf) return setError("La confirmation ne correspond pas.");
    m.mutate({ data: { actuel, nouveau } });
  };
  return (
    <form onSubmit={submit} noValidate>
      {error && <div className="errbox" style={{ marginBottom: 12 }} role="alert">{error}</div>}
      <Field label="Mot de passe actuel"><input className="input" type="password" autoComplete="current-password" value={actuel} onChange={(e) => setActuel(e.target.value)} /></Field>
      <Field label="Nouveau mot de passe" hint="4 caractères minimum."><input className="input" type="password" autoComplete="new-password" value={nouveau} onChange={(e) => setNouveau(e.target.value)} /></Field>
      <Field label="Confirmer le nouveau mot de passe"><input className="input" type="password" autoComplete="new-password" value={conf} onChange={(e) => setConf(e.target.value)} /></Field>
      <Btn type="submit" kind="save" disabled={m.isPending}>{m.isPending ? "Enregistrement..." : "Enregistrer le mot de passe"}</Btn>
    </form>
  );
}

export function ForcedReset({ user }: { user: UtilisateurPublic }) {
  const qc = useQueryClient();
  const out = useDeconnecter({ mutation: { onSuccess: () => { qc.clear(); qc.setQueryData(getObtenirSessionQueryKey(), { utilisateur: null }); } } });
  return (
    <div style={{ minHeight: "100dvh", display: "grid", placeItems: "center", padding: 16, background: "linear-gradient(160deg,#0f2d66,#173f8a)" }}>
      <div className="card pad" style={{ maxWidth: 440, width: "100%", padding: 26 }}>
        <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 12 }}><Logo /><div><b>GNVA</b><div style={{ color: "var(--muted)", fontSize: 12 }}>{user.email}</div></div></div>
        <div style={{ display: "flex", gap: 10, background: "var(--orange-soft)", padding: 12, borderRadius: 8, marginBottom: 16, color: "#8a4a0c" }}>
          <ShieldAlert size={20} style={{ flexShrink: 0 }} />
          <span>Votre mot de passe initial doit être remplacé avant d&apos;accéder à l&apos;application.</span>
        </div>
        <PasswordForm />
        <Btn kind="ghost" style={{ marginTop: 12 }} onClick={() => out.mutate()}><LogOut size={15} />Se déconnecter</Btn>
      </div>
    </div>
  );
}
