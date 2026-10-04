import type { QueryClient } from "@tanstack/react-query";
import { getObtenirSessionQueryKey } from "@workspace/api-client-react";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs));

// Exception limitée à l'adaptateur des vues polymorphes du contrat Donnees.
// Les services, validations et transactions utilisent des types stricts Prisma/Zod.
// Le schéma de chaque ressource est validé au serveur; la vue générique reste
// capable d'afficher les colonnes JSON des paramètres et journaux.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Row = Record<string, any>;
export type Res =
  | "geographies" | "sites" | "utilisateurs" | "roles" | "assujettis" | "autocollants" | "types-moto"
  | "tarifs" | "recouvrements" | "transactions" | "audit" | "notifications" | "parametres" | "vols";

export const errMsg = (e: unknown): string => {
  const x = e as { data?: { error?: string }; message?: string; status?: number };
  if (x?.status === 403) return x?.data?.error ?? "Accès refusé pour votre profil.";
  return x?.data?.error ?? x?.message ?? "Erreur inattendue";
};

/** Invalide toutes les données sauf la session. */
export const invalidateData = (qc: QueryClient) =>
  qc.invalidateQueries({ predicate: (q) => q.queryKey[0] !== getObtenirSessionQueryKey()[0] });

export const fmtDate = (v: unknown) => {
  if (typeof v !== "string") return "";
  const d = new Date(v);
  return isNaN(d.getTime()) ? v : d.toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" });
};
export const isIso = (v: unknown) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}(T|$)/.test(v);
export const fmtMoney = (v: unknown) => {
  const n = Number(v);
  return isNaN(n) ? String(v ?? "0") : n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

export const tone = (s: unknown): "ok" | "warn" | "bad" | "info" | "" => {
  const t = String(s ?? "").toUpperCase();
  if (!t) return "";
  if (/REJET|SUSP|VOL|ERREUR|ANNUL|INACTIF/.test(t)) return "bad";
  if (/VALID|ACTIF|ATTRIB|PAYE/.test(t)) return "ok";
  if (/ATTENTE|ENVOY|PREPAR|DISPON/.test(t)) return "warn";
  if (/RECU/.test(t)) return "info";
  return "";
};

export const cleanPayload = (o: Row): Row => {
  const out: Row = {};
  for (const [k, v] of Object.entries(o)) {
    if (v === "" || v === null || v === undefined) continue;
    out[k] = v;
  }
  return out;
};

export function csrf(): Record<string, string> {
  if (typeof document === "undefined") return {};
  const m = document.cookie.split("; ").find((c) => c.split("=")[0] === "gnva_csrf");
  return m ? { "x-csrf-token": decodeURIComponent(m.split("=")[1] ?? "") } : {};
}

export async function uploadPhoto(file: File): Promise<string> {
  const fd = new FormData();
  fd.append("file", file);
  const r = await fetch("/api/v1/photos", { method: "POST", body: fd, credentials: "include", headers: csrf() });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw { data: j, message: "Échec du téléversement de la photo" };
  return j.url as string;
}

export async function getJson(url: string): Promise<Row> {
  const r = await fetch(url, { credentials: "include" });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw { data: j, status: r.status, message: "Introuvable" };
  return j;
}

export async function apiJson<T = Row>(url: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const r = await fetch(url, {
    method: init?.method ?? "GET", credentials: "include",
    headers: { ...(init?.body !== undefined ? { "Content-Type": "application/json" } : {}), ...csrf() },
    body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw { data: j, status: r.status, message: "Requête refusée" };
  return j as T;
}
