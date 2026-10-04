import QRCode from "qrcode";
import { NextRequest } from "next/server";
import { db } from "./db";
import { Contexte, autoriser, auditer } from "./contexte";
import { lister } from "./lecture";
import { exiger } from "./erreurs";
import { ticketPOS } from "./ticket-pos";
import { afficherNumeroAutocollant } from "@/lib/numero-autocollant";

export function urlBase(req: NextRequest) {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, "");
  exiger(
    process.env.NODE_ENV !== "production",
    "APP_URL doit désigner votre URL HTTPS publique en production.",
    503,
  );
  const host =
    req.headers.get("x-forwarded-host") ??
    req.headers.get("host") ??
    new URL(req.url).host;
  const proto =
    req.headers.get("x-forwarded-proto") ??
    new URL(req.url).protocol.replace(":", "");
  return `${proto}://${host}`;
}
export const echapper = (v: unknown) =>
  String(v ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
export async function imageQR(req: NextRequest, numero: string) {
  const qr = await db.autocollant.findFirst({
    where: { OR: [{ numero }, { jeton: numero }] },
    select: { jeton: true },
  });
  exiger(qr, "Autocollant introuvable.", 404);
  const png = await QRCode.toBuffer(`${urlBase(req)}/autocollant/${qr.jeton}`, {
    width: 512,
    margin: 2,
    errorCorrectionLevel: "M",
  });
  return new Response(new Uint8Array(png).buffer, {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=600",
    },
  });
}
export async function imprimer(ctx: Contexte, type: string, id: string) {
  autoriser(ctx, "RAPPORT_IMPRIMER");
  let donnee: Record<string, unknown>, qr: string | undefined, titre: string;
  if (type === "ticket") {
    donnee = (await lister(
      ctx,
      "assujettis",
      new URLSearchParams(),
      id,
    )) as Record<string, unknown>;
    titre = "Ticket d’enregistrement";
    qr = await QRCode.toDataURL(
      String(donnee.reference),
      { margin: 4, width: 256, errorCorrectionLevel: "M" },
    );
  } else if (type === "recouvrement") {
    donnee = (await lister(
      ctx,
      "recouvrements",
      new URLSearchParams(),
      id,
    )) as Record<string, unknown>;
    titre = donnee.statut === "VALIDE"
      ? "Preuve de reçu de recouvrement · Dispromalt"
      : "Document provisoire de recouvrement · Dispromalt";
  } else if (type === "autocollant") {
    donnee = (await lister(
      ctx,
      "autocollants",
      new URLSearchParams(),
      id,
    )) as Record<string, unknown>;
    donnee.numero = donnee.numeroAffiche ?? donnee.numero;
    titre = "Autocollant QR GNVA";
    qr = await QRCode.toDataURL(
      `${urlBase(ctx.req)}/autocollant/${donnee.jeton}`,
      { width: 320, margin: 2 },
    );
  } else if (type === "attribution") {
    const a = await db.attribution.findUnique({
      where: { id },
      include: { autocollant: { include: { lot: true } } },
    });
    exiger(a, "Attribution introuvable.", 404);
    await lister(ctx, "assujettis", new URLSearchParams(), a.assujettiId);
    donnee = JSON.parse(JSON.stringify(a)) as Record<string, unknown>;
    donnee.numero = afficherNumeroAutocollant(
      a.autocollant.numero,
      a.autocollant.lot?.serie,
    );
    titre = "Reçu d’attribution";
    qr = await QRCode.toDataURL(
      `${urlBase(ctx.req)}/autocollant/${a.autocollant.jeton}`,
      { width: 220, margin: 1 },
    );
  } else {
    exiger(false, "Modèle d’impression inconnu.", 404);
  }
  const noms: Record<string, string> = {
    reference: "Référence",
    nom: "Nom",
    postnom: "Postnom",
    prenom: "Prénom",
    plaque: "Plaque",
    chassis: "Châssis",
    moteur: "Moteur",
    numero: "Autocollant",
    numeroTimbre: "Timbre",
    exercice: "Exercice",
    montant: "Montant total",
    partDispromalt: "Montant recouvré Dispromalt",
    partProvince: "Montant recouvré province/zone (historique)",
    statut: "Statut",
    debut: "Période du",
    fin: "Période au",
    createdAt: "Enregistré le",
    typeAutocollant: "Type d’autocollant",
    quantite: "Quantité",
    commentaire: "Commentaire",
  };
  const lignes = Object.entries(donnee!)
    .filter(([cle]) => cle in noms)
    .map(
      ([cle, valeur]) =>
        `<tr><th>${echapper(noms[cle])}</th><td>${echapper(valeur)}</td></tr>`,
    )
    .join("");
  const objet = (cle: string) => {
    const v = donnee![cle];
    if (!v || typeof v !== "object") return "";
    const o = v as Record<string, unknown>;
    return `<p><b>${echapper(cle === "source" ? "Source" : cle === "destination" ? "Destination" : "Site")}</b> : ${echapper(o.nom)} · ${echapper(o.code)}</p>`;
  };
  const validations = Array.isArray(donnee!.validations)
    ? (donnee!.validations as Record<string, unknown>[])
    : [];
  const signatures = validations
    .map(
      (v) =>
        `<div class="signature"><b>${echapper(v.etape ? `Partie ${v.etape}` : v.statut)}</b> · ${echapper(v.nomValidateur ?? v.utilisateurId)}<br>${echapper(v.createdAt)}<br><small>Signature interne : ${echapper(v.signature ?? "validation horodatée")}</small></div>`,
    )
    .join("");
  const preuve =
    type === "recouvrement" && donnee!.statut !== "VALIDE"
      ? '<p class="alerte">DOCUMENT PROVISOIRE — double validation non terminée.</p>'
      : "";
  await db.$transaction((tx) =>
    auditer(
      tx,
      ctx,
      "IMPRESSION",
      type,
      id,
      ctx.utilisateur.siteId ?? undefined,
    ),
  );
  const html = type === "ticket"
    ? ticketPOS(donnee!, qr!, ctx.req.nextUrl.searchParams.get("largeur") === "58" ? 58 : 80, echapper)
    : `<!doctype html><html lang="fr"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${echapper(titre!)}</title><style>body{font:14px Arial;color:#17243b;max-width:800px;margin:32px auto;padding:24px}header{border-bottom:3px solid #1757aa;padding-bottom:18px}h1{font-size:23px}table{width:100%;border-collapse:collapse}th,td{text-align:left;padding:9px;border-bottom:1px solid #dde4ed}th{width:40%}.signature{margin:20px 0;padding:14px;border:1px solid #abbccd;word-break:break-all}button{padding:12px;background:#1757aa;color:white;border:0;border-radius:6px;cursor:pointer}.alerte{color:#b21c1c;font-weight:bold}@media print{body{margin:0;padding:8mm}button{display:none}@page{size:A4;margin:12mm}}@media print and (max-width:80mm){body{width:70mm;font-size:11px}h1{font-size:16px}}</style><header><b>GNVA · DISPROMALT</b><h1>${echapper(titre!)}</h1><p>Gestion Numérique de Validation des Autocollants</p></header>${preuve}${objet("site")}${objet("source")}${objet("destination")}<table>${lignes}</table>${qr ? `<img src="${qr}" alt="QR de vérification" width="180">` : ""}${signatures}<p>Document issu des opérations enregistrées. Conservez la référence pour contrôle.</p><button onclick="window.print()">Imprimer / Enregistrer en PDF</button></html>`;
  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
