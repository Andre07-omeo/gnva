import { Prisma } from "@prisma/client";
import { db } from "./db";
import { Contexte, autoriser, autoriserTerrain, auditer } from "./contexte";
import { zonesAutocollants } from "./territoires";
import { filtres, filtreAttribution, filtreMontant } from "./filtres";
import { exiger } from "./erreurs";
import { lister } from "./lecture";
import { gains, soldeDispromalt } from "./soldes";

export async function tableauDeBord(
  ctx: Contexte,
  parametres: URLSearchParams,
) {
  autoriserTerrain(ctx, "RAPPORT_CONSULTER");
  const f = await filtres(ctx, parametres, true);
  const zones = await zonesAutocollants(ctx, f.sites);
  const site = f.sites === null ? {} : { siteId: { in: f.sites } };
  const auteur = f.auteur ? { auteurId: f.auteur } : {};
  const assujetti: Prisma.AssujettiWhereInput = {
    ...site,
    deletedAt: null,
    createdAt: f.periode,
    ...(f.auteur ? { createurId: f.auteur } : {}),
    ...(f.typeMotoId ? { moto: { typeMotoId: f.typeMotoId } } : {}),
    ...(f.exercice ? { exercice: f.exercice } : {}),
  };
  const attributions: Prisma.AttributionWhereInput = {
    AND: [{ assujetti: site }, filtreAttribution(f)],
    createdAt: f.periode,
    ...(f.auteur ? { agentId: f.auteur } : {}),
  };
  const transaction: Prisma.TransactionFinanciereWhereInput = {
    ...site,
    ...auteur,
    createdAt: f.periode,
    attribution: filtreAttribution(f),
    ...filtreMontant(f),
  };
  const recouvrement: Prisma.RecouvrementWhereInput = {
    ...site,
    ...auteur,
    statut: "VALIDE",
    createdAt: f.periode,
    ...filtreMontant(f),
  };
  const filtreSites = f.sites === null ? {} : { id: { in: f.sites } };
  const [
    assujettis,
    attribues,
    disponibles,
    timbres,
    recettes,
    recouvrements,
    sitesActifs,
    sitesSuspendus,
    utilisateursActifs,
    ventilationSites,
    ventilationRecettes,
  ] = await Promise.all([
    db.assujetti.count({ where: assujetti }),
    db.attribution.count({ where: attributions }),
    db.autocollant.count({
      where: {
        ...(zones === null ? {} : { geographieId: { in: zones } }),
        statut: "DISPONIBLE",
      },
    }),
    db.attribution.count({ where: attributions }),
    gains(db, transaction),
    db.recouvrement.aggregate({ where: recouvrement, _sum: { partDispromalt: true } }),
    db.site.count({ where: { ...filtreSites, actif: true } }),
    db.site.count({ where: { ...filtreSites, actif: false } }),
    db.utilisateur.count({
      where: {
        actif: true,
        ...(f.sites === null ? {} : { siteId: { in: f.sites } }),
        ...(ctx.utilisateur.role.code === "AGENT"
          ? { id: ctx.utilisateur.id }
          : {}),
      },
    }),
    db.assujetti.groupBy({
      by: ["siteId"],
      where: assujetti,
      _count: { id: true },
      orderBy: { _count: { id: "desc" } },
      take: 50,
    }),
    db.transactionFinanciere.groupBy({
      by: ["siteId"],
      where: transaction,
      _sum: { montant: true },
    }),
  ]);
  const sites = await db.site.findMany({
    where: {
      id: {
        in: [
          ...new Set([
            ...ventilationSites.map((v) => v.siteId),
            ...ventilationRecettes.map((v) => v.siteId),
          ]),
        ],
      },
    },
    select: { id: true, nom: true, geographie: { select: { nom: true } } },
  });
  // Bilan cumulatif indépendant des dates : un changement de jour ne doit
  // jamais effacer la dette ni recréditer des montants déjà recouvrés.
  const bilanGeneral = await db.$transaction(async (tx) => {
    const personnel = ctx.utilisateur.role.code === "AGENT";
    const [solde, assujettisAttribues] = await Promise.all([
      soldeDispromalt(tx,
        { ...site, ...(personnel ? { auteurId: ctx.utilisateur.id } : {}) },
        { ...site, ...(personnel ? { auteurId: ctx.utilisateur.id } : {}) }),
      tx.assujetti.count({ where: {
        ...site, deletedAt: null, attributions: { some: {} },
        ...(personnel ? { createurId: ctx.utilisateur.id } : {}),
      } }),
    ]);
    return {
      assujettisAttribues,
      gainGeneral: solde.revenus.total.toFixed(2),
      gainDispromalt: solde.revenus.partDispromalt.toFixed(2),
      gainProvince: solde.revenus.partProvince.toFixed(2),
      recouvreDispromalt: solde.recouvre.toFixed(2),
      reserveDispromalt: solde.reserve.toFixed(2),
      resteDispromalt: solde.restant.toFixed(2),
      disponibleDispromalt: solde.disponible.toFixed(2),
    };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  const total = recettes.total,
    recupere = recouvrements._sum.partDispromalt ?? new Prisma.Decimal(0);
  return {
    assujettis,
    attribues,
    disponibles,
    timbres,
    recettes: total.toFixed(2),
    recouvrements: recupere.toFixed(2),
    sitesActifs,
    sitesSuspendus,
    utilisateursActifs,
    jour: f.jour,
    restant: bilanGeneral.resteDispromalt,
    partDispromalt: recettes.partDispromalt.toFixed(2),
    partProvince: recettes.partProvince.toFixed(2),
    bilanGeneral,
    parSite: sites.map((s) => ({
      id: s.id,
      nom: s.nom,
      zone: s.geographie.nom,
      assujettis:
        ventilationSites.find((v) => v.siteId === s.id)?._count.id ?? 0,
      recettes: (
        ventilationRecettes.find((v) => v.siteId === s.id)?._sum.montant ??
        new Prisma.Decimal(0)
      ).toFixed(2),
    })),
  };
}
function valeurCSV(v: unknown) {
  const texte =
    v === null || v === undefined
      ? ""
      : typeof v === "object"
        ? JSON.stringify(v)
        : String(v);
  // Un tableur ne doit pas interpréter des saisies comme des formules.
  return `"${(/^[=+@\-\t\r]/.test(texte) ? "'" + texte : texte).replaceAll('"', '""')}"`;
}
export async function exporter(
  ctx: Contexte,
  ressource: string,
  parametres: URLSearchParams,
) {
  autoriser(ctx, "RAPPORT_EXPORTER");
  exiger(
    ["transactions", "autocollants", "assujettis", "recouvrements"].includes(
      ressource,
    ),
    "Ce module ne peut pas être exporté.",
  );
  const limite = 10000,
    lignes: Record<string, unknown>[] = [];
  const p = new URLSearchParams(parametres);
  p.set("limite", "100");
  for (let page = 1; page <= limite / 100; page++) {
    p.set("page", String(page));
    const resultat = (await lister(ctx, ressource, p)) as {
      elements: Record<string, unknown>[];
      total: number;
    };
    exiger(
      resultat.total <= limite,
      "Affinez les filtres : un export synchrone est limité à 10 000 lignes.",
    );
    lignes.push(...resultat.elements);
    if (lignes.length >= resultat.total) break;
  }
  const colonnes = [...new Set(lignes.flatMap((r) => Object.keys(r)))].filter(
    (k) => !["moto", "attributions", "avant", "apres", "jeton"].includes(k),
  );
  const csv =
    "\uFEFF" +
    [
      colonnes.map(valeurCSV).join(";"),
      ...lignes.map((r) => colonnes.map((c) => valeurCSV(r[c])).join(";")),
    ].join("\r\n");
  await db.$transaction((tx) =>
    auditer(
      tx,
      ctx,
      "EXPORT_CSV",
      ressource,
      undefined,
      ctx.utilisateur.siteId ?? undefined,
      undefined,
      { nombre: lignes.length },
    ),
  );
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="gnva-${ressource}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
