"use client";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Eye, EyeOff, LogIn, MapPinned, QrCode, Wallet } from "lucide-react";
import { useRouter } from "next/navigation";
import { getObtenirSessionQueryKey, useConnecter } from "@workspace/api-client-react";
import { Btn, Field, Logo } from "@/components/ui";
import { errMsg } from "@/lib/utils";

const COMPTES = ["admin@gnva.cd", "omeongaandre2@gmail.com"];

export function LoginScreen() {
  const qc = useQueryClient();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState("");
  const login = useConnecter({
    mutation: {
      onSuccess: (s) => { qc.clear(); qc.setQueryData(getObtenirSessionQueryKey(), s); router.replace("/"); },
      onError: (e) => setError(errMsg(e)),
    },
  });
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!email || !pw) return setError("Saisissez votre adresse e-mail et votre mot de passe.");
    login.mutate({ data: { email: email.trim().toLowerCase(), motDePasse: pw } });
  };
  return (
    <div className="login">
      <section className="lhero">
        <div className="brand" style={{ border: 0, padding: 0, display: "flex", gap: 12, alignItems: "center" }}><Logo size={44} /><div><b style={{ fontSize: 22, letterSpacing: ".1em" }}>GNVA</b><small style={{ display: "block", opacity: .75 }}>Gestion Numérique de Validation des Autocollants</small></div></div>
        <div>
          <h1>Chaque autocollant tracé, de l&apos;enregistrement au recouvrement.</h1>
          <div className="lfeat">
            <div><QrCode size={22} /><span><b>Autocollants QR</b><small>Attribution, vérification publique et impression des tickets.</small></span></div>
            <div><MapPinned size={22} /><span><b>Sites et territoires</b><small>Accès limité aux zones et au site de chaque agent.</small></span></div>
            <div><QrCode size={22} /><span><b>Attribution territoriale</b><small>Des autocollants réservés à leur province ou district.</small></span></div>
            <div><Wallet size={22} /><span><b>Recouvrements à double validation</b><small>Parts Dispromalt et Province, deux identités distinctes.</small></span></div>
          </div>
        </div>
        <small style={{ opacity: .7 }}>Agents de terrain, moniteurs et administrateurs Dispromalt - République démocratique du Congo</small>
      </section>
      <section className="lform">
        <form className="card" onSubmit={submit} noValidate>
          <h2 style={{ fontSize: 22 }}>Connexion</h2>
          <p style={{ color: "var(--muted)", margin: "4px 0 18px" }}>Accédez à votre espace sécurisé.</p>
          {error && <div className="errbox" style={{ marginBottom: 12 }} role="alert">{error}</div>}
          <Field label="Adresse e-mail"><input className="input" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
          <Field label="Mot de passe">
            <div style={{ position: "relative" }}>
              <input className="input" type={show ? "text" : "password"} autoComplete="current-password" value={pw} onChange={(e) => setPw(e.target.value)} />
              <button type="button" onClick={() => setShow(!show)} aria-label="Afficher le mot de passe" style={{ position: "absolute", right: 8, top: 8, border: 0, background: "none", cursor: "pointer", color: "var(--muted)" }}>{show ? <EyeOff size={18} /> : <Eye size={18} />}</button>
            </div>
          </Field>
          <Btn type="submit" kind="primary" disabled={login.isPending} className="w-full" style={{ width: "100%", padding: 10 }}><LogIn size={16} />{login.isPending ? "Connexion..." : "Se connecter"}</Btn>
          {process.env.NODE_ENV!=="production"&&<div style={{ marginTop: 18, fontSize: 12.5, color: "var(--muted)" }}>
            Comptes initiaux (cliquer pour renseigner l&apos;e-mail) :
            <div className="accts">{COMPTES.map((c) => <button key={c} type="button" onClick={() => setEmail(c)}>{c}</button>)}</div>
            <p style={{ marginBottom: 0 }}>Un changement de mot de passe est exigé à la première connexion.</p>
          </div>}
        </form>
      </section>
    </div>
  );
}
