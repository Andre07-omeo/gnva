import { db } from "./db";
import { Contexte, autoriser, auditer } from "./contexte";
import { tableauDeBord } from "./rapports";
import { filtres } from "./filtres";
import { echapper } from "./impression";
import { filtreTransactionsRapport, rapportNational } from "./rapport-national";

export async function imprimerRapport(ctx: Contexte, params: URLSearchParams) {
  autoriser(ctx, "RAPPORT_CONSULTER");
  autoriser(ctx, "RAPPORT_IMPRIMER");
  const f = await filtres(ctx, params, true);
  const q = new URLSearchParams(params);
  q.set("debut", f.debut ?? f.jour);
  q.set("fin", f.fin ?? f.jour);
  q.set("limite", "100");
  const vue = params.get("rapportVue") || "NUMEROS";
  q.set("rapportVue", vue);
  const stats = await tableauDeBord(ctx, q);
  const rapport = await rapportNational(
    filtreTransactionsRapport(f), vue, 1, 100, true,
  );
  const lignes = rapport.elements as Record<string, unknown>[];
  const statistiquesRapport = rapport.statsRapport;
  const tableau = (titres: string[], rows: unknown[][]) =>
    `<table><thead><tr>${titres.map((t) => `<th>${echapper(t)}</th>`).join("")}</tr></thead><tbody>${
      rows
        .map(
          (r) => `<tr>${r.map((v) => `<td>${typeof v === "string" && v.startsWith("PHOTO:") ? `<img src="${echapper(v.slice(6))}" alt="Photo de l'assujetti" style="width:40px;height:40px;object-fit:cover">` : echapper(v)}</td>`).join("")}</tr>`,
        )
        .join("") ||
      `<tr><td colspan="${titres.length}">Aucune donnée pour cette période.</td></tr>`
    }</tbody></table>`;
  const indicateurs = [
    ["Assujettis enregistrés", stats.assujettis],
    ["Attributions", stats.attribues],
    ["Timbres attribués", stats.timbres],
    ["Recettes (CDF)", stats.recettes],
    ["Dispromalt recouvré validé (période)", stats.recouvrements],
    ["Part Dispromalt (50 %)", stats.partDispromalt],
    ["Part province (50 %)", stats.partProvince],
    ["Solde Dispromalt cumulé après recouvrement", stats.restant],
    ["Total assujettis attribués (cumul)", stats.bilanGeneral.assujettisAttribues],
    ["Gains généraux (cumul)", stats.bilanGeneral.gainGeneral],
    ["Gains Dispromalt (cumul)", stats.bilanGeneral.gainDispromalt],
    ["Dispromalt réservé en attente (cumul)", stats.bilanGeneral.reserveDispromalt],
    ["Dispromalt disponible (cumul)", stats.bilanGeneral.disponibleDispromalt],
  ];
  const filters = [...params]
    .filter(([k]) => !["page", "limite"].includes(k))
    .map(([k, v]) => `${k} : ${v}`)
    .join(" · ");
  const html = `<!doctype html><html lang="fr"><meta charset="utf-8"><title>Rapport GNVA</title>
    <style>body{font:13px Arial;color:#17243b;padding:24px}h1{border-bottom:3px solid #1757aa;padding-bottom:16px}
    table{width:100%;border-collapse:collapse;margin:18px 0}th,td{border:1px solid #dce3ed;padding:8px;text-align:left}
    thead{display:table-header-group}tr{break-inside:avoid}button{padding:12px}small{color:#536178}
    @media print{button{display:none}@page{size:A4 landscape;margin:12mm}body{padding:0}}</style>
    <h1>GNVA · DISPROMALT — Rapport financier</h1>
    <p>Période : ${echapper(q.get("debut"))} au ${echapper(q.get("fin"))} · Émis par ${echapper(ctx.utilisateur.nom)}</p>
    <small>${echapper(filters || "Périmètre autorisé du compte")}</small>
    <h2>Statistiques</h2>${tableau(["Indicateur", "Valeur"], indicateurs)}
    <h2>Liste des sites</h2>${tableau(
      ["Site", "Zone", "Assujettis", "Recettes (CDF)"],
      stats.parSite.map((s) => [s.nom, s.zone, s.assujettis, s.recettes]),
    )}
    <h2>${echapper(vue === "NUMEROS" ? "Transactions journalières — Numéros vendus / attribués" : "Rapport groupé")} — ${lignes.length} ligne(s)</h2>
    ${tableau(
      vue === "NUMEROS"
        ? ["N° autocollant", "Référence", "Photo", "Nom complet", "Châssis", "Plaque", "Véhicule", "Taxe", "Montant", "Point de vente / site", "Province", "Commune", "District / territoire", "Date de vente", "Type de pièce", "N° pièce"]
        : ["Groupe", "Province", "Nombre de numéros", "Montant total", "Devise"],
      vue === "NUMEROS"
        ? lignes.map((r) => [
            r.numeroAutocollant, r.reference,
            typeof r.photoUrl === "string" && /^\/api\/v1\/photos\/[a-f0-9]{32}\.jpg$/.test(r.photoUrl) ? `PHOTO:${r.photoUrl}` : "—",
            r.nomComplet, r.chassis, r.plaque, r.vehicule, r.taxe, r.montant,
            r.siteNom, r.province, r.commune, r.districtTerritoire, r.dateAttribution,
            r.typePiece, r.numeroPiece,
          ])
        : lignes.map((r) => [r.groupe, r.province, r.nombre, r.montant, r.devise]),
    )}
    <h2>Totaux du rapport complet</h2>${tableau(["Nombre total de numéros", "Montant total", "Devise"],
      (statistiquesRapport.totaux.length ? statistiquesRapport.totaux : [{ montant: "0.00", devise: "CDF" }]).map(t => [
        statistiquesRapport.totalNumeros, t.montant, t.devise,
      ])
    )}
    <button onclick="window.print()">Imprimer / Enregistrer en PDF</button></html>`;
  await db.$transaction((tx) =>
    auditer(
      tx,
      ctx,
      "IMPRESSION",
      "rapports",
      undefined,
      undefined,
      undefined,
      { debut: q.get("debut"), fin: q.get("fin"), lignes: lignes.length },
    ),
  );
  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store, private, max-age=0",
    },
  });
}
