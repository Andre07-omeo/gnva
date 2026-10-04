import { db } from "./db";
import { Contexte, Transaction, zoneAutorisee, siteAutorise } from "./contexte";
import { exiger } from "./erreurs";
import { estKinshasa, normaliserTerritoire } from "../lib/territoire";

export async function verifierZoneLot(
  tx: Transaction,
  ctx: Contexte,
  id: string,
  siteId?: string,
) {
  zoneAutorisee(ctx, id);
  const zone = await tx.geographie.findUniqueOrThrow({ where: { id } });
  exiger(zone.actif, "Cette zone est suspendue.");
  const ascendants = await tx.fermetureGeographique.findMany({
    where: { descendantId: id },
    include: { ancetre: true },
  });
  const province = ascendants.find(
    (g) => normaliserTerritoire(g.ancetre.niveau) === "PROVINCE",
  )?.ancetre;
  exiger(province?.actif, "Le lot doit appartenir à une province active.");
  if (estKinshasa(province))
    exiger(
      normaliserTerritoire(zone.niveau) === "DISTRICT",
      "Pour Kinshasa, choisissez obligatoirement un district.",
    );
  else
    exiger(
      normaliserTerritoire(zone.niveau) === "PROVINCE",
      "Pour les autres provinces, sélectionnez uniquement la province.",
    );
  const descendants = await tx.fermetureGeographique.findMany({
    where: { ancetreId: id },
    select: { descendantId: true },
  });
  // Le site d'origine est conservé pour la traçabilité des anciens dossiers.
  // Il ne restreint plus l'utilisation : le périmètre du lot fait autorité.
  const site = await tx.site.findFirst({
    where: {
      actif: true,
      geographieId: { in: descendants.map((g) => g.descendantId) },
      ...(siteId
        ? { id: siteId }
        : ctx.siteIds === null
          ? {}
          : { id: { in: ctx.siteIds } }),
    },
    orderBy: { id: "asc" },
  });
  exiger(site, "Créez d’abord un site actif dans cette zone.");
  siteAutorise(ctx, site.id);
  return site;
}
export async function zonesAutocollants(
  ctx: Contexte,
  sites: string[] | null = ctx.siteIds,
) {
  if (sites === null) return null;
  const points = await db.site.findMany({
    where: { id: { in: sites } },
    select: { geographieId: true },
  });
  const ascendants = await db.fermetureGeographique.findMany({
    where: { descendantId: { in: points.map((s) => s.geographieId) } },
    select: { ancetreId: true },
  });
  return [...new Set(ascendants.map((g) => g.ancetreId))];
}
