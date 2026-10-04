import { Prisma } from "@prisma/client";
import { db } from "./db";
import { exiger } from "./erreurs";
import { fuseau } from "./filtres";
import { filtreAttribution, filtreMontant } from "./filtres";
import { libellePieces } from "@/lib/rapport-options";

const inclure = {
  site: { include: { geographie: true } },
  attribution: { include: {
    autocollant: true,
    assujetti: { include: { moto: { include: { typeMoto: true } } } },
  } },
} satisfies Prisma.TransactionFinanciereInclude;

type TransactionRapport = Prisma.TransactionFinanciereGetPayload<{ include: typeof inclure }>;

export async function rapportNational(
  where: Prisma.TransactionFinanciereWhereInput,
  vue: string,
  page: number,
  limite: number,
  complet = false,
) {
  const [stats, total] = await Promise.all([
    db.transactionFinanciere.groupBy({
      by: ["devise"], where, _sum: { montant: true }, _count: { _all: true },
    }),
    db.transactionFinanciere.count({ where }),
  ]);
  const totaux = stats.map(s => ({
    devise: s.devise, montant: (s._sum.montant ?? new Prisma.Decimal(0)).toFixed(2),
  }));
  if (vue === "NUMEROS") {
    exiger(!complet || total <= 10000, "Affinez la période : une impression est limitée à 10 000 transactions.");
    const [donnees, tz] = await Promise.all([
      db.transactionFinanciere.findMany({
        where, include: inclure, orderBy: { createdAt: "desc" },
        skip: complet ? 0 : (page - 1) * limite, take: complet ? 10000 : limite,
      }),
      fuseau(),
    ]);
    const zones = await geographies(donnees.map(d => d.site.geographieId));
    return {
      elements: donnees.map(d => detail(d, zones, tz)),
      total,
      statsRapport: { totalNumeros: total, totaux },
    };
  }

  exiger(total <= 10000, "Affinez les filtres : les rapports groupés sont limités à 10 000 attributions.");
  const [donnees, tz] = await Promise.all([
    db.transactionFinanciere.findMany({ where, include: inclure, orderBy: { createdAt: "desc" } }),
    fuseau(),
  ]);
  const zones = await geographies(donnees.map(d => d.site.geographieId));
  const groupe = new Map<string, { province: string; nombre: number; montant: Prisma.Decimal; devise: string }>();
  for (const d of donnees) {
    const row = detail(d, zones, tz);
    let key: string;
    if (vue === "PROVINCE") key = row.province;
    else if (vue === "COMMUNE") key = row.commune;
    else if (vue === "DISTRICT_TERRITOIRE") key = row.districtTerritoire;
    else if (vue === "SITE") key = row.siteNom;
    else key = dateLocale(d.createdAt, tz);
    const province = vue === "JOUR" ? "" : row.province;
    const index = `${key}\u0000${province}\u0000${d.devise}`;
    const existant = groupe.get(index);
    if (existant) {
      existant.nombre++;
      existant.montant = existant.montant.plus(d.montant);
    } else groupe.set(index, {
      province, nombre: 1, montant: d.montant, devise: d.devise,
    });
  }
  const resultat = [...groupe.entries()]
    .sort(([a], [b]) => a.localeCompare(b, "fr"))
    .map(([index, data]) => ({
      groupe: index.split("\u0000", 1)[0],
      ...data, montant: data.montant.toFixed(2),
    }));
  return {
    elements: complet ? resultat : resultat.slice((page - 1) * limite, page * limite),
    total: resultat.length,
    statsRapport: { totalNumeros: total, totaux },
  };
}

export function filtreTransactionsRapport(
  f: Awaited<ReturnType<typeof import("./filtres").filtres>>,
  id?: string,
): Prisma.TransactionFinanciereWhereInput {
  return {
    ...(id ? { id } : {}),
    ...(f.sites === null ? {} : { siteId: { in: f.sites } }),
    createdAt: f.periode,
    attribution: filtreAttribution(f),
    ...filtreMontant(f),
    ...(f.auteur ? { auteurId: f.auteur } : {}),
    ...(f.recherche ? { reference: { contains: f.recherche } } : {}),
  };
}

async function geographies(ids: string[]) {
  const siteIds = [...new Set(ids)];
  const sites = await db.site.findMany({
    where: { geographieId: { in: siteIds } },
    select: { id: true, geographieId: true },
  });
  const ancestors = await db.fermetureGeographique.findMany({
    where: { descendantId: { in: [...new Set(sites.map(s => s.geographieId))] } },
    include: { ancetre: true },
  });
  return new Map(sites.map(site => {
    const levels = ancestors
      .filter(g => g.descendantId === site.geographieId)
      .map(g => ({ niveau: g.ancetre.niveau.toUpperCase(), nom: g.ancetre.nom, profondeur: g.profondeur }))
      .sort((a, b) => b.profondeur - a.profondeur);
    return [site.id, {
      province: levels.find(g => g.niveau === "PROVINCE")?.nom ?? "Non précisée",
      commune: levels.find(g => g.niveau === "COMMUNE")?.nom ?? "Non renseignée",
      districtTerritoire: levels.find(g => ["DISTRICT", "TERRITOIRE"].includes(g.niveau))?.nom ?? "Non renseigné",
    }];
  }));
}

function dateLocale(date: Date, tz: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(date);
  const value = Object.fromEntries(parts.map(p => [p.type, p.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

function detail(d: TransactionRapport, zones: Awaited<ReturnType<typeof geographies>>, tz: string) {
  const a = d.attribution;
  const assujetti = a?.assujetti;
  const moto = assujetti?.moto;
  const localized = zones.get(d.site.id);
  const f = (date: Date) => new Intl.DateTimeFormat("fr-FR", {
    timeZone: tz, dateStyle: "short", timeStyle: "short",
  }).format(date);
  const jourAttribution = dateLocale(d.createdAt, tz);
  return {
    id: d.id, reference: d.reference, montant: d.montant.toFixed(2),
    devise: d.devise, statut: d.statut, createdAt: d.createdAt,
    numeroAutocollant: a?.autocollant.numero ?? "—",
    numeroTimbre: a?.numeroTimbre ?? "—",
    photoUrl: assujetti?.photoUrl ?? null,
    nomComplet: [assujetti?.nom, assujetti?.postnom, assujetti?.prenom].filter(Boolean).join(" "),
    chassis: moto?.chassis ?? "—", plaque: moto?.plaque ?? "—",
    vehicule: moto?.typeMoto.nom ?? "—", taxe: d.montant.toFixed(2),
    siteNom: d.site.nom, province: localized?.province ?? "Non précisée",
    commune: localized?.commune ?? "Non renseignée",
    districtTerritoire: localized?.districtTerritoire ?? "Non renseigné",
    dateAttribution: f(d.createdAt), jourAttribution,
    typePiece: libellePieces(assujetti?.typePiece) || "—",
    numeroPiece: assujetti?.numeroPiece ?? "—",
    typeAutocollant: a?.autocollant.typeAutocollant ?? "—",
  };
}