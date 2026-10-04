import { db } from "./db";
import { Contexte, autoriser, auditer } from "./contexte";
import { tableauDeBord } from "./rapports";
import { filtres } from "./filtres";
import { lister } from "./lecture";
import { echapper } from "./impression";
import { exiger } from "./erreurs";

export async function imprimerRapport(ctx: Contexte, params: URLSearchParams) {
  autoriser(ctx, "RAPPORT_CONSULTER");
  autoriser(ctx, "RAPPORT_IMPRIMER");
  const f = await filtres(ctx, params, true);
  const q = new URLSearchParams(params);
  q.set("debut", f.debut ?? f.jour);
  q.set("fin", f.fin ?? f.jour);
  q.set("limite", "100");
  const stats = await tableauDeBord(ctx, q);
  const lignes: Record<string, unknown>[] = [];
  for (let page = 1; page <= 100; page++) {
    q.set("page", String(page));
    const lot = (await lister(ctx, "transactions", q)) as {
      elements: Record<string, unknown>[];
      total: number;
    };
    exiger(
      lot.total <= 10000,
      "Affinez la période : une impression est limitée à 10 000 transactions.",
    );
    lignes.push(...lot.elements);
    if (lignes.length >= lot.total) break;
  }
  const tableau = (titres: string[], rows: unknown[][]) =>
    `<table><thead><tr>${titres.map((t) => `<th>${echapper(t)}</th>`).join("")}</tr></thead><tbody>${
      rows
        .map(
          (r) => `<tr>${r.map((v) => `<td>${echapper(v)}</td>`).join("")}</tr>`,
        )
        .join("") ||
      `<tr><td colspan="${titres.length}">Aucune donnée pour cette période.</td></tr>`
    }</tbody></table>`;
  const indicateurs = [
    ["Assujettis enregistrés", stats.assujettis],
    ["Attributions", stats.attribues],
    ["Timbres attribués", stats.timbres],
    ["Recettes (CDF)", stats.recettes],
    ["Recouvrements validés", stats.recouvrements],
    ["Part Dispromalt (50 %)", stats.partDispromalt],
    ["Part province (50 %)", stats.partProvince],
    ["Restant à recouvrer", stats.restant],
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
    <h2>Transactions journalières — ${lignes.length} ligne(s)</h2>
    ${tableau(
      ["Date", "Référence", "Site", "Montant", "Devise", "Statut"],
      lignes.map((r) => [
        new Date(String(r.createdAt)).toLocaleString("fr-FR", {
          timeZone: "Africa/Kinshasa",
        }),
        r.reference,
        (r.site as { nom?: string })?.nom,
        r.montant,
        r.devise,
        r.statut,
      ]),
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
