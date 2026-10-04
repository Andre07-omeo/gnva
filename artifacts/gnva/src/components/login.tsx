"use client";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AlertCircle, Eye, EyeOff, Lock, LogIn, Mail, MapPinned, QrCode, Wallet } from "lucide-react";
import { useRouter } from "next/navigation";
import { getObtenirSessionQueryKey, useConnecter } from "@workspace/api-client-react";
import { Logo } from "@/components/ui";
import { errMsg } from "@/lib/utils";
import s from "./login.module.css";

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
    <div className={s.page}>
      <div className={`${s.glow} ${s.g1}`} aria-hidden="true" />
      <div className={`${s.glow} ${s.g2}`} aria-hidden="true" />
      <div className={`${s.glow} ${s.g3}`} aria-hidden="true" />
      <section className={s.pres}>
        <div className={s.presBrand}>
          <Logo size={44} />
          <div><b>GNVA</b><small>Gestion Numérique de Validation des Autocollants</small></div>
        </div>
        <h1>Chaque autocollant tracé, de l&apos;enregistrement au recouvrement.</h1>
        <ul className={s.feats}>
          <li><span className={s.fi}><QrCode size={20} /></span><span><b>Autocollants QR</b><small>Attribution, vérification publique et impression des tickets.</small></span></li>
          <li><span className={s.fi}><MapPinned size={20} /></span><span><b>Sites et territoires</b><small>Accès limité aux zones et au site de chaque agent.</small></span></li>
          <li><span className={s.fi}><Wallet size={20} /></span><span><b>Recouvrements à double validation</b><small>Dispromalt : deux signatures et une preuve de reçu partagée.</small></span></li>
        </ul>
        <small className={s.pfoot}>Agents de terrain, moniteurs et administrateurs Dispromalt - République démocratique du Congo</small>
      </section>
      <div className={s.wrap}>
        <form className={s.card} onSubmit={submit}>
          <div className={s.head}>
            <div className={s.logoWrap}><Logo size={68} /></div>
            <p className={s.brandName}>GNVA</p>
            <p className={s.sub}>Gestion Numérique de Validation des Autocollants</p>
            <h2 className={s.title}>Connexion</h2>
            <span className={s.bar} aria-hidden="true" />
          </div>
          {error && <div className={s.err} role="alert"><AlertCircle size={18} /><span>{error}</span></div>}
          <div className={s.form}>
            <div>
              <label className={s.lbl} htmlFor="gnva-email">Adresse e-mail</label>
              <div className={s.box}>
                <span className={s.ic}><Mail size={18} aria-hidden="true" /></span>
                <input id="gnva-email" className={s.inp} type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
            </div>
            <div>
              <label className={s.lbl} htmlFor="gnva-pw">Mot de passe</label>
              <div className={s.box}>
                <span className={s.ic}><Lock size={18} aria-hidden="true" /></span>
                <input id="gnva-pw" className={`${s.inp} ${s.inpPw}`} type={show ? "text" : "password"} autoComplete="current-password" required value={pw} onChange={(e) => setPw(e.target.value)} />
                <button type="button" className={s.eye} onClick={() => setShow(!show)} aria-label={show ? "Masquer le mot de passe" : "Afficher le mot de passe"} aria-pressed={show}>
                  {show ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
                </button>
              </div>
            </div>
            <button type="submit" className={s.submit} disabled={login.isPending}>
              <LogIn size={18} aria-hidden="true" />{login.isPending ? "Connexion..." : "Se connecter"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
