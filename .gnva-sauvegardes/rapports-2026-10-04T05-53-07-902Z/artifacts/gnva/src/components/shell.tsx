"use client";
import { createContext, useContext, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import {
  Bell, Building2, ChevronDown, Coins, FileBarChart, History, KeyRound, LayoutDashboard, LogOut, Map, MapPinned, Menu,
  QrCode, ScanLine, Settings, ShieldCheck, Sticker, Users, UserRound,
} from "lucide-react";
import { getObtenirSessionQueryKey, getObtenirReferencesQueryKey, useDeconnecter, useObtenirSession, useObtenirReferences } from "@workspace/api-client-react";
import type { UtilisateurPublic } from "@workspace/api-client-react";
import { Btn, Empty, ErrorBox, Logo, Skeleton, useToast } from "@/components/ui";
import { has, isNational } from "@/lib/perm";
import { LoginScreen } from "@/components/login";
import { ForcedReset } from "@/components/password";
import { terminerDeconnexion } from "@/lib/deconnexion";

function Denied() {
  return <div className="card"><Empty title="Accès non autorisé" icon={<ShieldCheck size={34} />}>Votre profil ne permet pas d&apos;ouvrir cette page. Contactez un administrateur si nécessaire.</Empty></div>;
}

const UserCtx = createContext<UtilisateurPublic | null>(null);
export const useUser = () => useContext(UserCtx) as UtilisateurPublic;

type Item = { href: string; label: string; icon: ReactNode; perm?: string[]; national?: boolean };
const NAV: { g: string; items: Item[] }[] = [
  { g: "Pilotage", items: [
    { href: "/", label: "Tableau de bord", icon: <LayoutDashboard size={16} /> },
    { href: "/rapports", label: "Rapports", icon: <FileBarChart size={16} />, perm: ["RAPPORT_CONSULTER"] },
    { href: "/notifications", label: "Notifications", icon: <Bell size={16} /> },
  ] },
  { g: "Terrain", items: [
    { href: "/assujettis", label: "Assujettis", icon: <UserRound size={16} />, perm: ["ASSUJETTI_CONSULTER"] },
    { href: "/autocollants", label: "Autocollants", icon: <Sticker size={16} />, perm: ["AUTOCOLLANT_CONSULTER"] },
    { href: "/verification", label: "Vérification QR", icon: <ScanLine size={16} />, perm: ["ASSUJETTI_CONSULTER"] },
  ] },
  { g: "Gestion", items: [
    { href: "/recouvrements", label: "Recouvrements", icon: <Coins size={16} />, perm: ["RECOUVREMENT_CONSULTER"] },
    { href: "/sites", label: "Sites", icon: <Building2 size={16} />, perm: ["SITE_GERER"] },
    { href: "/geographies", label: "Géographies", icon: <Map size={16} />, perm: ["GEOGRAPHIE_GERER"] },
  ] },
  { g: "Administration", items: [
    { href: "/utilisateurs", label: "Utilisateurs", icon: <Users size={16} />, perm: ["UTILISATEUR_CREER", "UTILISATEUR_MODIFIER", "UTILISATEUR_SUSPENDRE"] },
    { href: "/parametres", label: "Paramètres", icon: <Settings size={16} />, perm: ["PARAMETRE_MODIFIER"] },
    { href: "/audit", label: "Journal d'audit", icon: <History size={16} />, perm: ["AUDIT_CONSULTER"] },
    { href: "/carte", label: "Carte nationale", icon: <MapPinned size={16} />, national: true },
  ] },
];

export function Shell({ children, perm, national }: { children: ReactNode; perm?: string[]; national?: boolean }) {
  const s = useObtenirSession({ query: { retry: false, staleTime: 0,
    refetchOnMount: "always", refetchOnWindowFocus: true, queryKey: getObtenirSessionQueryKey() } });
  useEffect(() => {
    const back = (e: PageTransitionEvent) => { if (e.persisted) window.location.reload(); };
    const hide = (e: PageTransitionEvent) => {
      if (e.persisted) document.documentElement.style.visibility = "hidden";
    };
    const other = (e: StorageEvent) => { if (e.key === "gnva-deconnexion") window.location.replace("/login"); };
    window.addEventListener("pageshow", back);
    window.addEventListener("pagehide", hide);
    window.addEventListener("storage", other);
    return () => {
      window.removeEventListener("pageshow", back);
      window.removeEventListener("pagehide", hide);
      window.removeEventListener("storage", other);
    };
  }, []);
  if (s.isLoading)
    return <div style={{ maxWidth: 520, margin: "20dvh auto" }}><div className="card"><Skeleton rows={3} /></div></div>;
  if (s.isError)
    return <div style={{ maxWidth: 520, margin: "20dvh auto", padding: 16 }}><ErrorBox error={s.error} retry={() => s.refetch()} /></div>;
  const u = s.data?.utilisateur;
  if (!u) return <LoginScreen />;
  if (u.changementRequis) return <ForcedReset user={u} />;
  return <UserCtx.Provider value={u}><Frame user={u}>{(perm && !has(u, ...perm)) || (national && !isNational(u)) ? <Denied /> : children}</Frame></UserCtx.Provider>;
}

function Frame({ user, children }: { user: UtilisateurPublic; children: ReactNode }) {
  const path = usePathname() ?? "/";
  const qc = useQueryClient();
  const references=useObtenirReferences({query:{queryKey:getObtenirReferencesQueryKey(),refetchInterval:60000}});
  const identite=references.data?.identite??{};
  useEffect(()=>{
    const c=identite.couleurPrimaire;
    if(c&&/^#[0-9a-f]{6}$/i.test(c)){
      document.documentElement.style.setProperty('--blue',c);
      document.documentElement.style.setProperty('--blue2',c);
      document.documentElement.style.setProperty('--blue-soft',`${c}1a`);
    }
    return ()=>{['--blue','--blue2','--blue-soft'].forEach(k=>document.documentElement.style.removeProperty(k));};
  },[identite.couleurPrimaire]);
  useEffect(() => {
    const flux=new EventSource("/api/v1/notifications-stream");
    flux.addEventListener("notification",()=>{void qc.invalidateQueries({predicate:q=>String(q.queryKey[0]).includes("notifications")});});
    return ()=>flux.close();
  },[qc]);
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [menu, setMenu] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const out = useDeconnecter({
    mutation: {
      onSuccess: () => terminerDeconnexion(qc),
      onError: toast.err,
    },
  });
  useEffect(() => setOpen(false), [path]);
  useEffect(() => {
    const h = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setMenu(false);
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);
  const initials = user.nom.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();
  const on = (h: string) => (h === "/" ? path === "/" : path.startsWith(h));
  const visible = (i: Item) => user.roleCode === "AGENT"
    ? i.href === "/"
    : (!i.perm || has(user, ...i.perm)) && (!i.national || isNational(user));
  return (
    <div className="frame">
      <aside className={`side ${open ? "open" : ""}`} aria-label="Navigation principale">
        <div className="brand">{identite.logoUrl?<img src={identite.logoUrl} width={40} height={40} alt="Logo de la plateforme" style={{objectFit:'contain'}}/>:<Logo />}<div><b>{identite.nomPlateforme??"GNVA"}</b><small>Validation des autocollants</small></div></div>
        {NAV.map((g) => g.items.some(visible) && (
          <div key={g.g}>
            <div className="navgrp">{g.g}</div>
            {g.items.filter(visible).map((i) => <Link key={i.href} href={i.href} className={`nav ${on(i.href) ? "on" : ""}`}>{i.icon}{i.label}</Link>)}
          </div>
        ))}
        <div style={{ marginTop: "auto", padding: 14, fontSize: 11, opacity: .6, display: "flex", gap: 6, alignItems: "center" }}><ShieldCheck size={13} />Accès tracé et journalisé</div>
      </aside>
      <div className={`scrim ${open ? "open" : ""}`} onClick={() => setOpen(false)} />
      <div className="main">
        <header className="top">
          <Btn className="burger" onClick={() => setOpen(true)} aria-label="Ouvrir le menu"><Menu size={18} /></Btn>
          <span className="noprint" style={{ color: "var(--muted)", display: "flex", gap: 6, alignItems: "center" }}><QrCode size={15} />Traçabilité DRC</span>
          <div className="usermenu" ref={ref}>
            <button className="userbtn" onClick={() => setMenu((m) => !m)} aria-haspopup="menu" aria-expanded={menu}>
              <span className="avatar">{initials}</span>
              <span className="ut"><b>{user.nom}</b><small>{user.role} - {user.email}</small></span>
              <ChevronDown size={14} />
            </button>
            {menu && (
              <div className="drop" role="menu">
                <div style={{ padding: "8px 10px", borderBottom: "1px solid var(--line)", marginBottom: 4 }}>
                  <b>{user.nom}</b><div style={{ color: "var(--muted)", fontSize: 12 }}>{user.role}{user.siteNom ? ` - ${user.siteNom}` : ""}</div>
                  <div style={{ color: "var(--muted)", fontSize: 12 }}>{user.email}</div>
                </div>
                <Link href="/compte" onClick={() => setMenu(false)}><UserRound size={15} />Mon compte</Link>
                <Link href="/compte#mot-de-passe" onClick={() => setMenu(false)}><KeyRound size={15} />Mot de passe</Link>
                <button onClick={() => out.mutate()} disabled={out.isPending} style={{ color: "var(--red)" }}><LogOut size={15} />Déconnexion</button>
              </div>
            )}
          </div>
        </header>
        <main className="content">{children}</main>
      </div>
    </div>
  );
}
