import { Prisma } from "@prisma/client";
import { hash } from "@node-rs/argon2";
import { z } from "zod";
import { db } from "./db";
import {
  Contexte,
  Transaction,
  auditer,
  autoriser,
  siteAutorise,
  zoneAutorisee,
  national,
  notifier,
} from "./contexte";
import { exiger, ErreurMetier } from "./erreurs";
import {
  geographieSaisie,
  siteSaisie,
  typeMotoSaisie,
  utilisateurSaisie,
  tarifSaisie,
} from "./saisies";
import { PERMISSIONS } from "./permissions";
import { utilisateurSelection } from "./filtres";
import { lister } from "./lecture";
import { normaliserTerritoire } from "../lib/territoire";

const permissionsSaisie = z
  .array(
    z
      .string()
      .refine(
        (p) => PERMISSIONS.includes(p as (typeof PERMISSIONS)[number]),
        "Permission inconnue.",
      ),
  )
  .max(100);
async function verifierAffectation(
  tx: Transaction,
  ctx: Contexte,
  roleId: string,
  siteId: string | undefined,
  zones: string[],
) {
  const role = await tx.role.findUniqueOrThrow({
    where: { id: roleId },
    include: { permissions: true },
  });
  if (!national(ctx.utilisateur)) {
    exiger(
      !["SUPER_ADMIN", "ADMIN_NATIONAL", "MONITEUR_NATIONAL"].includes(
        role.code,
      ),
      "Vous ne pouvez pas attribuer ce rôle.",
      403,
    );
    exiger(
      role.permissions.every((p) => ctx.permissions.includes(p.permissionCode)),
      "Vous ne pouvez pas accorder davantage de permissions que vous n’en possédez.",
      403,
    );
  }
  if (role.code === "SUPER_ADMIN")
    exiger(
      ctx.utilisateur.role.code === "SUPER_ADMIN",
      "Seul un super administrateur peut attribuer ce rôle.",
      403,
    );
  if (role.code === "AGENT")
    exiger(siteId, "Un agent doit être attaché à un site.");
  const provincial = ["ADMIN_PROVINCIAL", "MONITEUR_PROVINCIAL"].includes(
    role.code,
  );
  if (provincial) exiger(zones.length > 0, "Choisissez au moins une province.");
  if (siteId) {
    siteAutorise(ctx, siteId);
    await tx.site.findUniqueOrThrow({ where: { id: siteId } });
  }
  for (const zone of zones) {
    zoneAutorisee(ctx, zone);
    const g = await tx.geographie.findUniqueOrThrow({ where: { id: zone } });
    exiger(g.actif, "Une zone d’affectation est suspendue.");
    if (provincial)
      exiger(
        normaliserTerritoire(g.niveau) === "PROVINCE",
        "Un rôle provincial ne peut être affecté qu’à des provinces.",
      );
  }
  if (siteId && zones.length) {
    const site = await tx.site.findUniqueOrThrow({ where: { id: siteId } });
    exiger(
      await tx.fermetureGeographique.count({
        where: { ancetreId: { in: zones }, descendantId: site.geographieId },
      }),
      "Le site doit appartenir à une zone sélectionnée.",
    );
  }
  return role;
}
function permissionsAutorisees(ctx: Contexte, valeur: unknown) {
  const permissions = permissionsSaisie.parse(valeur);
  exiger(
    national(ctx.utilisateur) ||
      permissions.every((p) => ctx.permissions.includes(p)),
    "Vous ne pouvez pas accorder ces permissions.",
    403,
  );
  return permissions;
}
export async function creerAdministration(
  ctx: Contexte,
  ressource: string,
  corps: unknown,
) {
  return db.$transaction(async (tx) => {
    switch (ressource) {
      case "geographies": {
        autoriser(ctx, "GEOGRAPHIE_GERER");
        const d = geographieSaisie.parse(corps);
        if (d.parentId) zoneAutorisee(ctx, d.parentId);
        const g = await tx.geographie.create({ data: d });
        const ancetres = d.parentId
          ? await tx.fermetureGeographique.findMany({
              where: { descendantId: d.parentId },
            })
          : [];
        await tx.fermetureGeographique.createMany({
          data: [
            { ancetreId: g.id, descendantId: g.id, profondeur: 0 },
            ...ancetres.map((a) => ({
              ancetreId: a.ancetreId,
              descendantId: g.id,
              profondeur: a.profondeur + 1,
            })),
          ],
        });
        await auditer(
          tx,
          ctx,
          "CREATION",
          "geographies",
          g.id,
          undefined,
          undefined,
          g,
        );
        return g;
      }
      case "sites": {
        autoriser(ctx, "SITE_GERER");
        const d = siteSaisie.parse(corps);
        zoneAutorisee(ctx, d.geographieId);
        const s = await tx.site.create({ data: d });
        await auditer(tx, ctx, "CREATION", "sites", s.id, s.id, undefined, s);
        return s;
      }
      case "utilisateurs": {
        autoriser(ctx, "UTILISATEUR_CREER");
        const d = utilisateurSaisie.parse(corps);
        const complement = z
          .object({
            permissions: permissionsSaisie.nullable().optional(),
            porteeNationale: z.boolean().optional(),
          })
          .parse(corps);
        await verifierAffectation(tx, ctx, d.roleId, d.siteId, d.zoneIds);
        exiger(
          !complement.porteeNationale || national(ctx.utilisateur),
          "Seule la direction peut autoriser une portée nationale.",
          403,
        );
        const u = await tx.utilisateur.create({
          data: {
            nom: d.nom,
            email: d.email,
            roleId: d.roleId,
            siteId: d.siteId,
            actif: d.actif,
            motDePasseHash: await hash(d.motDePasse, {
              memoryCost: 19456,
              timeCost: 2,
              parallelism: 1,
            }),
            changementRequis: false,
            porteeNationale: complement.porteeNationale ?? false,
            permissionsPersonnalisees: complement.permissions
              ? permissionsAutorisees(ctx, complement.permissions)
              : undefined,
            zones: {
              create: d.zoneIds.map((geographieId) => ({ geographieId })),
            },
          },
          select: utilisateurSelection,
        });
        await auditer(
          tx,
          ctx,
          "CREATION",
          "utilisateurs",
          u.id,
          u.siteId ?? undefined,
          undefined,
          u,
        );
        return u;
      }
      case "roles": {
        autoriser(ctx, "PARAMETRE_MODIFIER");
        const d = z
          .object({
            nom: z.string().min(2).max(120),
            code: z.string().regex(/^[A-Z_]{3,60}$/),
            permissions: permissionsSaisie,
          })
          .parse(corps);
        const r = await tx.role.create({
          data: {
            nom: d.nom,
            code: d.code,
            permissions: {
              create: permissionsAutorisees(ctx, d.permissions).map(
                (permissionCode) => ({ permissionCode }),
              ),
            },
          },
        });
        await auditer(
          tx,
          ctx,
          "CREATION",
          "roles",
          r.id,
          undefined,
          undefined,
          d,
        );
        return { ...r, permissions: d.permissions };
      }
      case "types-moto": {
        autoriser(ctx, "PARAMETRE_MODIFIER");
        const d = typeMotoSaisie.parse(corps);
        const m = await tx.typeMoto.create({ data: d });
        await auditer(
          tx,
          ctx,
          "CREATION",
          "types-moto",
          m.id,
          undefined,
          undefined,
          m,
        );
        return m;
      }
      case "tarifs": {
        autoriser(ctx, "PARAMETRE_MODIFIER");
        const d = tarifSaisie.parse(corps);
        if (d.geographieId) zoneAutorisee(ctx, d.geographieId);
        const t = await tx.tarif.create({
          data: {
            ...d,
            debut: new Date(d.debut),
            fin: d.fin ? new Date(d.fin) : null,
          },
        });
        await auditer(
          tx,
          ctx,
          "CREATION",
          "tarifs",
          t.id,
          undefined,
          undefined,
          t,
        );
        return t;
      }
      case "parametres": {
        autoriser(ctx, "PARAMETRE_MODIFIER");
        const d = z
          .object({
            cle: z.string().regex(/^[A-Za-z][A-Za-z0-9_]{1,99}$/),
            valeur: z.unknown(),
          })
          .parse(corps);
        if (typeof d.valeur === "string") {
          try {
            d.valeur = JSON.parse(d.valeur);
          } catch {
            /* Une chaîne de configuration reste une chaîne. */
          }
        }
        exiger(
          !/secret|password|motdepasse$|api.?key|private|token/i.test(d.cle),
          "Les secrets sont configurés uniquement dans les variables sécurisées.",
        );
        if (d.cle === "exercice")
          exiger(
            Number.isInteger(Number(d.valeur)) &&
              Number(d.valeur) >= 2000 &&
              Number(d.valeur) <= 2200,
            "Exercice invalide.",
          );
        if (d.cle === "fuseauHoraire") {
          try {
            new Intl.DateTimeFormat("fr", { timeZone: String(d.valeur) });
          } catch {
            throw new ErreurMetier(400, "Fuseau horaire invalide.");
          }
        }
        if (d.cle === "nomPlateforme")
          z.string().min(2).max(100).parse(d.valeur);
        if (d.cle === "logoUrl") {
          const lien = z.string().min(1).max(500).parse(d.valeur);
          exiger(
            (lien.startsWith("/") && !lien.startsWith("//")) ||
              (z.string().url().safeParse(lien).success &&
                new URL(lien).protocol === "https:"),
            "Le logo doit être un fichier public local ou une URL HTTPS.",
          );
        }
        if (d.cle === "longueurMotDePasse")
          exiger(
            Number.isInteger(Number(d.valeur)) &&
              Number(d.valeur) >= 4 &&
              Number(d.valeur) <= 200,
            "Longueur minimale : 4 à 200 caractères.",
          );
        if (d.cle === "stockageMode")
          exiger(
            ["local", "s3"].includes(String(d.valeur)),
            "Stockage : local ou s3.",
          );
        exiger(
          !/^(typesStock|aiModel|assistant)/i.test(d.cle),
          "Ce module a été retiré de GNVA.",
        );
        if (d.cle === "couleurPrimaire")
          exiger(
            /^#[a-f0-9]{6}$/i.test(String(d.valeur)),
            "La couleur doit être au format #RRGGBB.",
          );
        const avant = await tx.parametreSysteme.findUnique({
          where: { cle: d.cle },
        });
        const p = await tx.parametreSysteme.upsert({
          where: { cle: d.cle },
          create: { cle: d.cle, valeur: d.valeur as Prisma.InputJsonValue },
          update: { valeur: d.valeur as Prisma.InputJsonValue },
        });
        await auditer(
          tx,
          ctx,
          "PARAMETRE_MODIFIE",
          "parametres",
          p.id,
          undefined,
          avant,
          p,
        );
        return p;
      }
      default:
        throw new ErreurMetier(
          405,
          "Cette ressource ne peut pas être créée directement.",
        );
    }
  });
}
export async function modifierAdministration(
  ctx: Contexte,
  ressource: string,
  id: string,
  corps: unknown,
) {
  const ancien = await lister(ctx, ressource, new URLSearchParams(), id);
  if (ressource === "parametres") {
    const precedent = ancien as { cle: string };
    const modification = z.object({ valeur: z.unknown() }).parse(corps);
    return creerAdministration(ctx, ressource, {
      cle: precedent.cle,
      valeur: modification.valeur,
    });
  }
  return db.$transaction(
    async (tx) => {
      let resultat: unknown, siteId: string | undefined;
      switch (ressource) {
        case "geographies": {
          autoriser(ctx, "GEOGRAPHIE_GERER");
          zoneAutorisee(ctx, id);
          const d = geographieSaisie.partial().parse(corps);
          if (d.parentId) {
            zoneAutorisee(ctx, d.parentId);
            const boucle = await tx.fermetureGeographique.findUnique({
              where: {
                ancetreId_descendantId: {
                  ancetreId: id,
                  descendantId: d.parentId,
                },
              },
            });
            exiger(
              !boucle,
              "Le parent choisi créerait une boucle dans la géographie.",
            );
            const sousArbre = await tx.fermetureGeographique.findMany({
              where: { ancetreId: id },
            });
            const ids = sousArbre.map((a) => a.descendantId);
            await tx.fermetureGeographique.deleteMany({
              where: { descendantId: { in: ids }, ancetreId: { notIn: ids } },
            });
            const nouveaux = await tx.fermetureGeographique.findMany({
              where: { descendantId: d.parentId },
            });
            await tx.fermetureGeographique.createMany({
              data: nouveaux.flatMap((a) =>
                sousArbre.map((s) => ({
                  ancetreId: a.ancetreId,
                  descendantId: s.descendantId,
                  profondeur: a.profondeur + s.profondeur + 1,
                })),
              ),
              skipDuplicates: true,
            });
          }
          resultat = await tx.geographie.update({ where: { id }, data: d });
          break;
        }
        case "sites": {
          autoriser(ctx, "SITE_GERER");
          siteAutorise(ctx, id);
          siteId = id;
          const d = siteSaisie.partial().parse(corps);
          if (d.geographieId) {
            zoneAutorisee(ctx, d.geographieId);
            exiger(
              (await tx.assujetti.count({ where: { siteId: id } })) === 0,
              "Un site avec des dossiers ne peut pas changer de zone sans une migration contrôlée.",
            );
          }
          if (d.actif !== undefined)
            exiger(
              national(ctx.utilisateur),
              "Seule la direction nationale peut suspendre ou réactiver un site.",
              403,
            );
          resultat = await tx.site.update({ where: { id }, data: d });
          if (d.actif !== undefined) {
            await tx.session.updateMany({
              where: { utilisateur: { siteId: id } },
              data: { revokedAt: new Date() },
            });
            await notifier(
              tx,
              id,
              d.actif ? "Site réactivé" : "Site suspendu",
              d.actif
                ? "Le site est de nouveau accessible."
                : "Ce site a été suspendu par la Direction Générale de Dispromalt. Veuillez contacter la direction pour plus d’informations.",
              "SITE",
            );
          }
          break;
        }
        case "utilisateurs": {
          autoriser(ctx, "UTILISATEUR_MODIFIER");
          const d = utilisateurSaisie
            .partial()
            .extend({
              permissions: permissionsSaisie.nullable().optional(),
              porteeNationale: z.boolean().optional(),
            })
            .parse(corps);
          const u = await tx.utilisateur.findUniqueOrThrow({
            where: { id },
            include: { zones: true, role: true },
          });
          exiger(
            u.role.code !== "SUPER_ADMIN" ||
              ctx.utilisateur.role.code === "SUPER_ADMIN",
            "Ce compte est protégé.",
            403,
          );
          if (d.actif !== undefined && d.actif !== u.actif) {
            autoriser(ctx, "UTILISATEUR_SUSPENDRE");
            exiger(
              id !== ctx.utilisateur.id,
              "Vous ne pouvez pas suspendre votre propre compte.",
            );
          }
          await verifierAffectation(
            tx,
            ctx,
            d.roleId ?? u.roleId,
            d.siteId ?? u.siteId ?? undefined,
            d.zoneIds ?? u.zones.map((v) => v.geographieId),
          );
          exiger(
            d.porteeNationale === undefined || national(ctx.utilisateur),
            "Vous ne pouvez pas élargir la portée nationale.",
            403,
          );
          resultat = await tx.utilisateur.update({
            where: { id },
            data: {
              nom: d.nom,
              email: d.email,
              roleId: d.roleId,
              siteId: d.siteId,
              actif: d.actif,
              porteeNationale: d.porteeNationale,
              ...(d.permissions
                ? {
                    permissionsPersonnalisees: permissionsAutorisees(
                      ctx,
                      d.permissions,
                    ),
                  }
                : {}),
              ...(d.permissions === null
                ? { permissionsPersonnalisees: Prisma.DbNull }
                : {}),
              ...(d.motDePasse
                ? {
                    motDePasseHash: await hash(d.motDePasse),
                    changementRequis: false,
                  }
                : {}),
              ...(d.zoneIds
                ? {
                    zones: {
                      deleteMany: {},
                      create: d.zoneIds.map((geographieId) => ({
                        geographieId,
                      })),
                    },
                  }
                : {}),
            },
            select: utilisateurSelection,
          });
          await tx.session.updateMany({
            where: { utilisateurId: id },
            data: { revokedAt: new Date() },
          });
          siteId = u.siteId ?? undefined;
          break;
        }
        case "roles": {
          autoriser(ctx, "PARAMETRE_MODIFIER");
          const role = await tx.role.findUniqueOrThrow({ where: { id } });
          exiger(
            role.code !== "SUPER_ADMIN",
            "Le rôle de secours super administrateur conserve toutes les permissions.",
          );
          const d = z
            .object({
              nom: z.string().min(2).max(120).optional(),
              permissions: permissionsSaisie.optional(),
            })
            .parse(corps);
          resultat = await tx.role.update({
            where: { id },
            data: {
              nom: d.nom,
              ...(d.permissions
                ? {
                    permissions: {
                      deleteMany: {},
                      create: permissionsAutorisees(ctx, d.permissions).map(
                        (permissionCode) => ({ permissionCode }),
                      ),
                    },
                  }
                : {}),
            },
          });
          await tx.session.updateMany({
            where: { utilisateur: { roleId: id } },
            data: { revokedAt: new Date() },
          });
          break;
        }
        case "types-moto": {
          autoriser(ctx, "PARAMETRE_MODIFIER");
          resultat = await tx.typeMoto.update({
            where: { id },
            data: typeMotoSaisie.partial().parse(corps),
          });
          break;
        }
        case "tarifs": {
          autoriser(ctx, "PARAMETRE_MODIFIER");
          const d = tarifSaisie.partial().parse(corps);
          if (d.geographieId) zoneAutorisee(ctx, d.geographieId);
          resultat = await tx.tarif.update({
            where: { id },
            data: {
              ...d,
              debut: d.debut ? new Date(d.debut) : undefined,
              fin: d.fin ? new Date(d.fin) : undefined,
            },
          });
          break;
        }
        case "notifications": {
          resultat = await tx.notification.update({
            where: { id, utilisateurId: ctx.utilisateur.id },
            data: { luAt: new Date() },
          });
          break;
        }
        case "parametres": {
          autoriser(ctx, "PARAMETRE_MODIFIER");
          const p = await tx.parametreSysteme.findUniqueOrThrow({
            where: { id },
          });
          // La voie upsert centralise la validation des paramètres.
          throw new ErreurMetier(
            400,
            `Utilisez l’enregistrement du paramètre « ${p.cle} » par sa clé.`,
          );
        }
        default:
          throw new ErreurMetier(
            405,
            "Cette ressource est immuable ou nécessite une action métier dédiée.",
          );
      }
      await auditer(
        tx,
        ctx,
        "MODIFICATION",
        ressource,
        id,
        siteId,
        ancien,
        resultat,
      );
      return resultat;
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}
