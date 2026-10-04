import { z } from "zod";
import { db } from "./db";
import { Contexte, siteAutorise, zoneAutorisee } from "./contexte";
import { Prisma } from "@prisma/client";
import { exiger } from "./erreurs";
export const filtreSchema = z.object({
  recherche: z.string().max(150).default(""),
  page: z.coerce.number().int().min(1).max(100000).default(1),
  limite: z.coerce.number().int().min(1).max(100).default(25),
  statut: z.string().max(40).optional(),
  siteId: z.string().max(30).optional(),
  geographieId: z.string().max(30).optional(),
  provinceId: z.string().max(30).optional(),
  communeId: z.string().max(30).optional(),
  districtTerritoireId: z.string().max(30).optional(),
  jour: z.string().date().optional(),
  rapportVue: z.enum(["NUMEROS", "PROVINCE", "COMMUNE", "DISTRICT_TERRITOIRE", "JOUR", "SITE"]).optional(),
  debut: z.string().date().optional(),
  fin: z.string().date().optional(),
  utilisateurId: z.string().max(30).optional(),
  typeMotoId: z.string().max(30).optional(),
  exercice: z.coerce.number().int().min(2000).max(2200).optional(),
  autocollant: z.string().max(80).optional(),
  timbre: z.string().max(80).optional(),
  montantMin: z.coerce.number().nonnegative().optional(),
  montantMax: z.coerce.number().nonnegative().optional(),
});
export async function fuseau() {
  const config = await db.parametreSysteme.findUnique({
    where: { cle: "fuseauHoraire" },
  });
  const valeur =
    typeof config?.valeur === "string" ? config.valeur : "Africa/Kinshasa";
  try {
    new Intl.DateTimeFormat("fr", { timeZone: valeur }).format();
    return valeur;
  } catch {
    return "Africa/Kinshasa";
  }
}
export async function exerciceCourant() {
  const config = await db.parametreSysteme.findUnique({
    where: { cle: "exercice" },
  });
  const v = Number(config?.valeur);
  return Number.isInteger(v) && v >= 2000 && v <= 2200
    ? v
    : new Date().getUTCFullYear();
}
export async function filtres(
  ctx: Contexte,
  parametres: URLSearchParams,
  journalier = false,
) {
  const saisie = filtreSchema.parse(Object.fromEntries(parametres));
  if (saisie.jour) {
    saisie.debut = saisie.jour;
    saisie.fin = saisie.jour;
  }
  exiger(
    !saisie.debut || !saisie.fin || saisie.debut <= saisie.fin,
    "La période de fin doit être après le début.",
  );
  exiger(
    saisie.montantMin === undefined ||
      saisie.montantMax === undefined ||
      saisie.montantMin <= saisie.montantMax,
    "Le montant minimum dépasse le maximum.",
  );
  let sites = ctx.siteIds;
  if (saisie.siteId) {
    siteAutorise(ctx, saisie.siteId);
    sites = [saisie.siteId];
  }
  for (const [geographieId, niveaux] of [
    [saisie.geographieId, null],
    [saisie.provinceId, ["PROVINCE"]],
    [saisie.communeId, ["COMMUNE"]],
    [saisie.districtTerritoireId, ["DISTRICT", "TERRITOIRE"]],
  ] as const) {
    if (!geographieId) continue;
    zoneAutorisee(ctx, geographieId);
    if (niveaux) {
      const zone = await db.geographie.findUniqueOrThrow({ where: { id: geographieId } });
      exiger((niveaux as readonly string[]).includes(zone.niveau), "Niveau géographique incorrect pour ce filtre.");
    }
    const zone = await db.fermetureGeographique.findMany({
      where: { ancetreId: geographieId },
      select: { descendantId: true },
    });
    const membres = await db.site.findMany({
      where: {
        geographieId: { in: zone.map((g) => g.descendantId) },
        ...(sites === null ? {} : { id: { in: sites } }),
      },
      select: { id: true },
    });
    sites = membres.map((s) => s.id);
  }
  const tz = await fuseau();
  const aujourdHui = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const debut = saisie.debut ?? (journalier ? aujourdHui : undefined),
    fin = saisie.fin ?? (journalier ? aujourdHui : undefined);
  // Conversion du minuit local en UTC. La RDC n'applique pas d'heure d'été.
  function minuit(date: string) {
    const utc = new Date(`${date}T00:00:00Z`);
    const decalage = new Intl.DateTimeFormat("en", {
      timeZone: tz,
      timeZoneName: "longOffset",
    })
      .formatToParts(utc)
      .find((p) => p.type === "timeZoneName")?.value;
    const correspondance = decalage?.match(/GMT([+-])(\d{2}):(\d{2})/);
    const minutes = correspondance
      ? (Number(correspondance[2]) * 60 + Number(correspondance[3])) *
        (correspondance[1] === "+" ? 1 : -1)
      : 0;
    return new Date(utc.getTime() - minutes * 60000);
  }
  const periode = {
    ...(debut ? { gte: minuit(debut) } : {}),
    ...(fin ? { lt: new Date(minuit(fin).getTime() + 86400000) } : {}),
  };
  const auteur =
    ctx.utilisateur.role.code === "AGENT"
      ? ctx.utilisateur.id
      : saisie.utilisateurId;
  return {
    ...saisie,
    jour: aujourdHui,
    sites,
    periode,
    auteur,
    skip: (saisie.page - 1) * saisie.limite,
    take: saisie.limite,
  };
}
export const utilisateurSelection = {
  id: true,
  nom: true,
  email: true,
  actif: true,
  changementRequis: true,
  siteId: true,
  roleId: true,
  porteeNationale: true,
  permissionsPersonnalisees: true,
  createdAt: true,
  role: true,
  site: true,
  zones: true,
} as const;
export function filtreAttribution(
  f: Awaited<ReturnType<typeof filtres>>,
): Prisma.AttributionWhereInput {
  return {
    ...(f.typeMotoId
      ? { assujetti: { moto: { typeMotoId: f.typeMotoId } } }
      : {}),
    ...(f.exercice ? { exercice: f.exercice } : {}),
    ...(f.autocollant || f.statut
      ? {
          autocollant: {
            ...(f.autocollant ? { numero: f.autocollant } : {}),
            ...(f.statut ? { statut: f.statut } : {}),
          },
        }
      : {}),
    ...(f.timbre ? { numeroTimbre: f.timbre } : {}),
  };
}
export function filtreMontant(f: Awaited<ReturnType<typeof filtres>>) {
  return f.montantMin !== undefined || f.montantMax !== undefined
    ? {
        montant: {
          ...(f.montantMin !== undefined ? { gte: f.montantMin } : {}),
          ...(f.montantMax !== undefined ? { lte: f.montantMax } : {}),
        },
      }
    : {};
}
