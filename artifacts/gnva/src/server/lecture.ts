import { Prisma } from "@prisma/client";
import { db } from "./db";
import { Contexte, autoriser, autoriserTerrain, national, zoneAutorisee } from "./contexte";
import { zonesAutocollants } from "./territoires";
import { exiger, ErreurMetier } from "./erreurs";
import {
  filtres,
  filtreAttribution,
  filtreMontant,
  utilisateurSelection,
  exerciceCourant,
} from "./filtres";
import { aplatirAssujetti, inclureAssujetti } from "./saisies";
import { PERMISSIONS } from "./permissions";
import { partagerGain } from "./soldes";
import { filtreTransactionsRapport, rapportNational } from "./rapport-national";
import { afficherNumeroAutocollant } from "@/lib/numero-autocollant";

export async function lister(
  ctx: Contexte,
  ressource: string,
  parametres: URLSearchParams,
  id?: string,
) {
  const terrain = ctx.utilisateur.role.code === "AGENT";
  // Pour les dossiers terrain, seuls les paramètres de pagination sont admis.
  // Les contraintes métier restent serveur, indépendamment des paramètres URL.
  const params = terrain && ressource === "assujettis"
    ? new URLSearchParams(
        [...parametres].filter(([cle]) => ["page", "limite"].includes(cle)),
      )
    : parametres;
  const f = await filtres(ctx, params);
  const commun = { skip: id ? 0 : f.skip, take: id ? 1 : f.take };
  const cle = id ? { id } : {};
  const site = f.sites === null ? {} : { siteId: { in: f.sites } };
  const ordre = { createdAt: "desc" } as const;
  let elements: unknown[], total: number;
  let statsRapport: unknown;
  const paginer = async <T>(liste: Promise<T[]>, compter: Promise<number>) => {
    const resultat = await Promise.all([liste, compter]);
    elements = resultat[0];
    total = resultat[1];
  };
  switch (ressource) {
    case "geographies": {
      autoriser(ctx, "RAPPORT_CONSULTER");
      const where: Prisma.GeographieWhereInput = {
        ...cle,
        ...(ctx.geoIds === null
          ? {}
          : { id: { in: ctx.geoIds, ...(id ? { equals: id } : {}) } }),
        ...(f.recherche
          ? {
              OR: [
                { nom: { contains: f.recherche } },
                { code: { contains: f.recherche } },
              ],
            }
          : {}),
      };
      await paginer(
        db.geographie.findMany({
          where,
          ...commun,
          include: { parent: true },
          orderBy: { nom: "asc" },
        }),
        db.geographie.count({ where }),
      );
      break;
    }
    case "sites": {
      autoriser(ctx, "RAPPORT_CONSULTER");
      const where: Prisma.SiteWhereInput = {
        ...cle,
        ...(f.sites === null
          ? {}
          : { id: { in: f.sites, ...(id ? { equals: id } : {}) } }),
        ...(f.recherche
          ? {
              OR: [
                { nom: { contains: f.recherche } },
                { code: { contains: f.recherche } },
              ],
            }
          : {}),
      };
      await paginer(
        db.site.findMany({
          where,
          ...commun,
          include: { geographie: true },
          orderBy: { nom: "asc" },
        }),
        db.site.count({ where }),
      );
      break;
    }
    case "utilisateurs": {
      exiger(
        ctx.permissions.includes("UTILISATEUR_CREER") ||
          ctx.permissions.includes("UTILISATEUR_MODIFIER"),
        "Accès aux comptes non autorisé.",
        403,
      );
      const where: Prisma.UtilisateurWhereInput = {
        ...cle,
        ...(f.sites === null
          ? {}
          : {
              OR: [
                { siteId: { in: f.sites } },
                { zones: { some: { geographieId: { in: ctx.geoIds ?? [] } } } },
              ],
            }),
        ...(f.recherche
          ? {
              AND: [
                {
                  OR: [
                    { nom: { contains: f.recherche } },
                    { email: { contains: f.recherche } },
                  ],
                },
              ],
            }
          : {}),
      };
      await paginer(
        db.utilisateur.findMany({
          where,
          ...commun,
          select: utilisateurSelection,
          orderBy: ordre,
        }),
        db.utilisateur.count({ where }),
      );
      elements = elements!.map((d) => {
        const u = d as Prisma.UtilisateurGetPayload<{
          select: typeof utilisateurSelection;
        }>;
        return {
          ...u,
          zoneIds: u.zones.map((z) => z.geographieId),
          permissions: Array.isArray(u.permissionsPersonnalisees)
            ? u.permissionsPersonnalisees.filter(
                (p) =>
                  typeof p === "string" &&
                  PERMISSIONS.includes(p as (typeof PERMISSIONS)[number]),
              )
            : null,
        };
      });
      break;
    }
    case "roles": {
      autoriser(ctx, "UTILISATEUR_MODIFIER");
      const where: Prisma.RoleWhereInput = {
        ...cle,
        ...(national(ctx.utilisateur)
          ? {}
          : {
              code: {
                notIn: ["SUPER_ADMIN", "ADMIN_NATIONAL", "MONITEUR_NATIONAL"],
              },
            }),
      };
      await paginer(
        db.role.findMany({
          where,
          ...commun,
          include: { permissions: true },
          orderBy: { nom: "asc" },
        }),
        db.role.count({ where }),
      );
      elements = elements!.map((d) => {
        const r = d as Prisma.RoleGetPayload<{
          include: { permissions: true };
        }>;
        return {
          ...r,
          permissions: r.permissions
            .map((p) => p.permissionCode)
            .filter((p) =>
              PERMISSIONS.includes(p as (typeof PERMISSIONS)[number]),
            ),
        };
      });
      break;
    }
    case "assujettis": {
      autoriserTerrain(ctx);
      const where: Prisma.AssujettiWhereInput = {
        ...cle,
        ...site,
        deletedAt: null,
        ...(terrain
          ? { createurId: ctx.utilisateur.id, attributions: { none: {} } }
          : {}),
        createdAt: f.periode,
        ...(f.auteur ? { createurId: f.auteur } : {}),
        ...(f.exercice ? { exercice: f.exercice } : {}),
        ...(f.statut ? { statut: f.statut } : {}),
        ...(f.typeMotoId ? { moto: { typeMotoId: f.typeMotoId } } : {}),
        ...(f.recherche
          ? {
              OR: [
                { nom: { contains: f.recherche } },
                { postnom: { contains: f.recherche } },
                { reference: { contains: f.recherche } },
                { telephone: { contains: f.recherche } },
                { moto: { plaque: { contains: f.recherche } } },
              ],
            }
          : {}),
      };
      await paginer(
        db.assujetti.findMany({
          where,
          ...commun,
          include: inclureAssujetti,
          orderBy: ordre,
        }),
        db.assujetti.count({ where }),
      );
      elements = elements!.map((d) =>
        aplatirAssujetti(
          d as Prisma.AssujettiGetPayload<{ include: typeof inclureAssujetti }>,
        ),
      );
      break;
    }
    case "autocollants": {
      autoriserTerrain(ctx, "AUTOCOLLANT_CONSULTER");
      if (f.geographieId) zoneAutorisee(ctx, f.geographieId);
      const zones = await zonesAutocollants(ctx, f.sites);
      const where: Prisma.AutocollantWhereInput = {
        ...cle,
        ...(zones === null ? {} : { geographieId: { in: zones } }),
        ...(f.geographieId ? { geographieId: f.geographieId } : {}),
        ...(ctx.utilisateur.role.code === "AGENT"
          ? {
              OR: [
                { statut: "DISPONIBLE" },
                { attribution: { agentId: ctx.utilisateur.id } },
              ],
            }
          : {}),
        createdAt: f.periode,
        ...(f.statut ? { statut: f.statut } : {}),
        ...(f.recherche ? { numero: { contains: f.recherche } } : {}),
      };
      await paginer(
        db.autocollant.findMany({
          where,
          ...commun,
          include: {
            site: true,
            lot: true,
            attribution: {
              select: {
                createdAt: true,
                assujetti: terrain ? false : {
                  select: { nom: true, postnom: true, reference: true },
                },
                numeroTimbre: true,
                transaction: terrain ? false : {
                  select: { site: { select: { nom: true } } },
                },
              },
            },
          },
          orderBy: f.geographieId
            ? [{ lot: { createdAt: "desc" } }, { createdAt: "desc" }, { numero: "desc" }]
            : ordre,
        }),
        db.autocollant.count({ where }),
      );
      elements = elements!.map((row) => {
        const autocollant = row as { numero: string; lot?: { serie?: string } | null };
        return {
          ...(row as object),
          numeroAffiche: afficherNumeroAutocollant(
            autocollant.numero,
            autocollant.lot?.serie,
          ),
        };
      });
      break;
    }
    case "types-moto": {
      autoriser(ctx, "RAPPORT_CONSULTER");
      const where = {
        ...cle,
        ...(f.recherche ? { nom: { contains: f.recherche } } : {}),
      };
      await paginer(
        db.typeMoto.findMany({ where, ...commun, orderBy: { nom: "asc" } }),
        db.typeMoto.count({ where }),
      );
      break;
    }
    case "tarifs": {
      autoriser(ctx, "RAPPORT_CONSULTER");
      const where: Prisma.TarifWhereInput = {
        ...cle,
        ...(ctx.geoIds === null
          ? {}
          : {
              OR: [
                { geographieId: null },
                { geographieId: { in: ctx.geoIds } },
              ],
            }),
      };
      await paginer(
        db.tarif.findMany({
          where,
          ...commun,
          include: { typeMoto: true },
          orderBy: { debut: "desc" },
        }),
        db.tarif.count({ where }),
      );
      break;
    }
    case "recouvrements": {
      if (!ctx.permissions.includes("RECOUVREMENT_CONSULTER"))
        autoriser(ctx, "RECOUVREMENT_VALIDER");
      const where: Prisma.RecouvrementWhereInput = {
        ...cle,
        ...site,
        ...(!ctx.permissions.includes("RECOUVREMENT_CONSULTER") ||
          ["MONITEUR_NATIONAL", "MONITEUR_PROVINCIAL"].includes(ctx.utilisateur.role.code)
          ? {
              OR: [
                { moniteurId: ctx.utilisateur.id },
                { utilisateurConcerneId: ctx.utilisateur.id },
              ],
            }
          : {}),
        ...(id
          ? {}
          : parametres.get("id")
            ? { id: parametres.get("id")! }
            : {}),
        createdAt: f.periode,
        ...(f.auteur ? { auteurId: f.auteur } : {}),
        ...(f.statut ? { statut: f.statut } : {}),
        ...(f.recherche ? { reference: { contains: f.recherche } } : {}),
        ...(f.montantMin !== undefined || f.montantMax !== undefined
          ? { montant: { gte: f.montantMin, lte: f.montantMax } }
          : {}),
      };
      await paginer(
        db.recouvrement.findMany({
          where,
          ...commun,
          include: {
            site: { include: { geographie: true } },
            validations: true,
          },
          orderBy: ordre,
        }),
        db.recouvrement.count({ where }),
      );
      break;
    }
    case "transactions": {
      autoriser(ctx, "RAPPORT_CONSULTER");
      const where = filtreTransactionsRapport(f, id);
      if (f.rapportVue && !id) {
        const rapport = await rapportNational(where, f.rapportVue, f.page, f.limite);
        elements = rapport.elements;
        total = rapport.total;
        statsRapport = rapport.statsRapport;
        break;
      }
      await paginer(
        db.transactionFinanciere.findMany({
          where,
          ...commun,
          include: {
            site: true,
            attribution: { include: { autocollant: true, assujetti: { select: {
              nom: true, postnom: true, prenom: true, photoUrl: true, typePiece: true,
              numeroPiece: true, moto: { select: { chassis: true, plaque: true, typeMoto: { select: { nom: true } } } },
            } } } },
          },
          orderBy: ordre,
        }),
        db.transactionFinanciere.count({ where }),
      );
      elements = elements!.map((d) => {
        const transaction = d as { montant: Prisma.Decimal };
        const partage = partagerGain(transaction.montant);
        return {
          ...(d as object),
          partDispromalt: partage.partDispromalt.toFixed(2),
          partProvince: partage.partProvince.toFixed(2),
        };
      });
      break;
    }
    case "audit": {
      autoriser(ctx, "AUDIT_CONSULTER");
      const where: Prisma.JournalAuditWhereInput = {
        ...cle,
        ...site,
        createdAt: f.periode,
        ...(f.auteur ? { utilisateurId: f.auteur } : {}),
        ...(f.recherche
          ? {
              OR: [
                { action: { contains: f.recherche } },
                { nomUtilisateur: { contains: f.recherche } },
                { objetId: { contains: f.recherche } },
              ],
            }
          : {}),
      };
      await paginer(
        db.journalAudit.findMany({ where, ...commun, orderBy: ordre }),
        db.journalAudit.count({ where }),
      );
      break;
    }
    case "notifications": {
      const where = { ...cle, utilisateurId: ctx.utilisateur.id };
      await paginer(
        db.notification.findMany({ where, ...commun, orderBy: ordre }),
        db.notification.count({ where }),
      );
      break;
    }
    case "parametres": {
      autoriser(ctx, "PARAMETRE_MODIFIER");
      const where = { ...cle, cle: { notIn: ["typesStock", "aiModel"] } };
      await paginer(
        db.parametreSysteme.findMany({
          where,
          ...commun,
          orderBy: { cle: "asc" },
        }),
        db.parametreSysteme.count({ where }),
      );
      break;
    }
    case "vols": {
      autoriser(ctx, "ASSUJETTI_CONSULTER");
      const where: Prisma.DeclarationVolWhereInput = {
        ...cle,
        moto: {
          assujetti: {
            ...site,
            ...(f.auteur ? { createurId: f.auteur } : {}),
            ...(terrain ? { attributions: { none: {} }, deletedAt: null } : {}),
          },
        },
        createdAt: f.periode,
      };
      await paginer(
        db.declarationVol.findMany({
          where,
          ...commun,
          include: {
            moto: {
              include: {
                assujetti: {
                  select: {
                    nom: true,
                    postnom: true,
                    reference: true,
                    siteId: true,
                  },
                },
              },
            },
          },
          orderBy: ordre,
        }),
        db.declarationVol.count({ where }),
      );
      break;
    }
    default:
      throw new ErreurMetier(404, "Module inconnu.");
  }
  if (id) {
    exiger(elements![0], "Dossier introuvable dans votre périmètre.", 404);
    return elements![0];
  }
  return {
    elements: elements!, total: total!, page: f.page, limite: f.limite,
    ...(statsRapport ? { statsRapport } : {}),
  };
}
export async function references(ctx: Contexte) {
  const [geographies, sites, typesMoto, roles, configuration] =
    await Promise.all([
      db.geographie.findMany({
        where: {
          actif: true,
          ...(ctx.geoIds === null ? {} : { id: { in: ctx.geoIds } }),
        },
        orderBy: { nom: "asc" },
        take: 1000,
      }),
      db.site.findMany({
        where: { ...(ctx.siteIds === null ? {} : { id: { in: ctx.siteIds } }) },
        include: { geographie: true },
        orderBy: { nom: "asc" },
        take: 1000,
      }),
      db.typeMoto.findMany({
        where: { actif: true },
        orderBy: { nom: "asc" },
        take: 100,
      }),
      db.role.findMany({
        where: national(ctx.utilisateur)
          ? {}
          : {
              code: {
                notIn: ["SUPER_ADMIN", "ADMIN_NATIONAL", "MONITEUR_NATIONAL"],
              },
            },
        include: { permissions: true },
        take: 100,
      }),
      db.parametreSysteme.findMany({
        where: {
          cle: {
            in: ["nomPlateforme", "logoUrl", "couleurPrimaire"],
          },
        },
      }),
    ]);
  return {
    geographies,
    sites,
    typesMoto,
    roles: roles.map((r) => ({
      ...r,
      permissions: r.permissions
        .map((p) => p.permissionCode)
        .filter((p) => PERMISSIONS.includes(p as (typeof PERMISSIONS)[number])),
    })),
    permissions: [...PERMISSIONS],
    exercice: await exerciceCourant(),
    identite: Object.fromEntries(configuration.map((p) => [p.cle, p.valeur])),
  };
}
