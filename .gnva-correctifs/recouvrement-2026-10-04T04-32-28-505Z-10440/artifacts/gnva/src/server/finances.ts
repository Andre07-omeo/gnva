import { createHmac } from "node:crypto";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "./db";
import {
  Contexte,
  autoriser,
  siteAutorise,
  auditer,
  notifier,
  national,
  permissionsEffectives,
  Transaction,
} from "./contexte";
import { recouvrementSaisie, reference } from "./saisies";
import { exiger } from "./erreurs";
import { filtres } from "./filtres";

async function rechercherResponsables(tx: Transaction, siteId: string) {
  const site = await tx.site.findUniqueOrThrow({ where: { id: siteId } });
  exiger(site.actif, "Le site est suspendu.");
  const ascendants = await tx.fermetureGeographique.findMany({
    where: { descendantId: site.geographieId },
  });
  const candidats = await tx.utilisateur.findMany({
    where: {
      actif: true,
      OR: [{ role: { code: "MONITEUR_NATIONAL" } }, { siteId }],
    },
    include: {
      role: { include: { permissions: true } },
      zones: true,
      site: true,
    },
  });
  const habilites = candidats.filter(
    (u) =>
      (!u.site || u.site.actif) &&
      permissionsEffectives(u).includes("RECOUVREMENT_VALIDER"),
  );
  const moniteurs = habilites
    .filter((u) => u.role.code === "MONITEUR_NATIONAL")
    .map((u) => ({
      id: u.id,
      nom: u.nom,
      distance:
        u.siteId === siteId
          ? 0
          : Math.min(
              ...u.zones.flatMap((z) =>
                ascendants
                  .filter((g) => g.ancetreId === z.geographieId)
                  .map((g) => g.profondeur + 1),
              ),
              ...(u.porteeNationale ? [100000] : []),
            ),
    }))
    .filter((u) => Number.isFinite(u.distance));
  const minimum = Math.min(...moniteurs.map((u) => u.distance));
  return {
    moniteurs: moniteurs.filter((u) => u.distance === minimum),
    responsables: habilites
      .filter((u) => u.siteId === siteId)
      .map((u) => ({ id: u.id, nom: u.nom })),
  };
}
export async function responsablesRecouvrement(ctx: Contexte, siteId: string) {
  autoriser(ctx, "RECOUVREMENT_CREER");
  siteAutorise(ctx, siteId);
  return db.$transaction((tx) => rechercherResponsables(tx, siteId));
}
async function avertirSignataire(
  tx: Transaction,
  utilisateurId: string,
  id: string,
  titre: string,
  message: string,
) {
  const lien = `/recouvrements?id=${encodeURIComponent(id)}`;
  await tx.notification.create({
    data: { utilisateurId, titre, message, type: "RECOUVREMENT", lien },
  });
  await tx.livraisonPush.create({
    data: { utilisateurId, titre, message: `${message} · ${lien}` },
  });
}
export async function creerRecouvrement(ctx: Contexte, corps: unknown) {
  autoriser(ctx, "RECOUVREMENT_CREER");
  exiger(
    national(ctx.utilisateur) ||
      ctx.utilisateur.role.code === "MONITEUR_NATIONAL",
    "Le recouvrement nécessite un moniteur national autorisé.",
    403,
  );
  const d = recouvrementSaisie.parse(corps);
  siteAutorise(ctx, d.siteId);
  const montant = new Prisma.Decimal(d.montant);
  exiger(
    montant.decimalPlaces() <= 2,
    "Le montant doit avoir au maximum deux décimales.",
  );
  const periode = (
    await filtres(ctx, new URLSearchParams({ debut: d.debut, fin: d.fin }))
  ).periode;
  return db.$transaction(
    async (tx) => {
      exiger(
        (await tx.site.findUniqueOrThrow({ where: { id: d.siteId } })).actif,
        "Le site est suspendu.",
      );
      const candidats = await rechercherResponsables(tx, d.siteId);
      const moniteur = d.moniteurId
        ? candidats.moniteurs.find((u) => u.id === d.moniteurId)
        : candidats.moniteurs.length === 1
          ? candidats.moniteurs[0]
          : undefined;
      exiger(
        moniteur,
        candidats.moniteurs.length
          ? "Plusieurs moniteurs couvrent ce site : choisissez le moniteur responsable."
          : "Aucun moniteur national actif et habilité ne couvre ce site.",
      );
      const autres = candidats.responsables.filter((u) => u.id !== moniteur.id);
      const responsable = d.utilisateurConcerneId
        ? autres.find((u) => u.id === d.utilisateurConcerneId)
        : autres.length === 1
          ? autres[0]
          : undefined;
      exiger(
        responsable,
        autres.length
          ? "Choisissez le responsable du site pour la seconde signature."
          : "Aucun second signataire actif et habilité n’est rattaché à ce site.",
      );
      const debut = new Date(d.debut),
        fin = new Date(d.fin);
      const [recettes, reservations, recettesPeriode, reservationsPeriode] =
        await Promise.all([
          tx.transactionFinanciere.aggregate({
            where: { siteId: d.siteId },
            _sum: { montant: true },
          }),
          tx.recouvrement.aggregate({
            where: { siteId: d.siteId, statut: { not: "REJETE" } },
            _sum: { montant: true },
          }),
          tx.transactionFinanciere.aggregate({
            where: { siteId: d.siteId, createdAt: periode },
            _sum: { montant: true },
          }),
          tx.recouvrement.aggregate({
            where: {
              siteId: d.siteId,
              statut: { not: "REJETE" },
              debut: { lte: fin },
              fin: { gte: debut },
            },
            _sum: { montant: true },
          }),
        ]);
      const disponible = new Prisma.Decimal(recettes._sum.montant ?? 0).minus(
        reservations._sum.montant ?? 0,
      );
      const disponiblePeriode = new Prisma.Decimal(
        recettesPeriode._sum.montant ?? 0,
      ).minus(reservationsPeriode._sum.montant ?? 0);
      exiger(
        montant.lte(disponible) && montant.lte(disponiblePeriode),
        "Le montant dépasse les recettes disponibles, après les recouvrements déjà validés ou en attente.",
        409,
      );
      const partDispromalt = montant
        .dividedBy(2)
        .toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
      const r = await tx.recouvrement.create({
        data: {
          siteId: d.siteId,
          utilisateurConcerneId: responsable.id,
          moniteurId: moniteur.id,
          debut,
          fin,
          commentaire: d.commentaire,
          reference: reference("REC"),
          auteurId: ctx.utilisateur.id,
          montant,
          partDispromalt,
          partProvince: montant.minus(partDispromalt),
        },
      });
      await auditer(
        tx,
        ctx,
        "DEMANDE_RECOUVREMENT",
        "recouvrements",
        r.id,
        r.siteId,
        undefined,
        r,
      );
      await avertirSignataire(
        tx,
        moniteur.id,
        r.id,
        "Recouvrement à valider",
        `${r.reference} · ${r.montant.toFixed(2)} · première signature requise`,
      );
      return r;
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}
export async function validerRecouvrement(
  ctx: Contexte,
  id: string,
  corps: unknown,
) {
  autoriser(ctx, "RECOUVREMENT_VALIDER");
  const d = z
    .object({
      statut: z.enum(["VALIDER", "VALIDATED", "REJETE"]),
      commentaire: z.string().max(4000).optional(),
    })
    .parse(corps);
  return db.$transaction(
    async (tx) => {
      const r = await tx.recouvrement.findUniqueOrThrow({
        where: { id },
        include: {
          validations: { orderBy: { etape: "asc" } },
          site: { include: { geographie: true } },
        },
      });
      siteAutorise(ctx, r.siteId);
      exiger(r.site.actif, "Le site est suspendu.");
      exiger(
        !["VALIDE", "REJETE"].includes(r.statut),
        "Un recouvrement finalisé est définitivement immuable.",
        409,
      );
      const etape = r.validations.length + 1;
      if (d.statut === "REJETE") {
        exiger(
          etape === 1,
          "Un recouvrement déjà signé doit suivre sa validation; une correction nécessite une écriture compensatrice.",
        );
        exiger(
          national(ctx.utilisateur) ||
            ctx.utilisateur.role.code === "MONITEUR_NATIONAL",
          "Rejet réservé au moniteur national autorisé.",
          403,
        );
        exiger(
          !r.moniteurId || r.moniteurId === ctx.utilisateur.id,
          "Le rejet appartient au moniteur désigné.",
          403,
        );
        await tx.recouvrement.update({
          where: { id },
          data: { statut: "REJETE" },
        });
        await auditer(
          tx,
          ctx,
          "RECOUVREMENT_REJETE",
          "recouvrements",
          id,
          r.siteId,
          undefined,
          { commentaire: d.commentaire },
        );
        return { ...r, statut: "REJETE" };
      }
      if (etape === 1) {
        exiger(
          d.statut === "VALIDER",
          "La signature du moniteur national est requise en premier.",
        );
        exiger(
          national(ctx.utilisateur) ||
            ctx.utilisateur.role.code === "MONITEUR_NATIONAL",
          "Première signature réservée au moniteur national autorisé.",
          403,
        );
        exiger(
          !r.moniteurId || r.moniteurId === ctx.utilisateur.id,
          "La première signature appartient au moniteur désigné.",
          403,
        );
      } else {
        exiger(
          d.statut === "VALIDATED" && etape === 2,
          "La seconde signature du responsable est requise.",
        );
        exiger(
          ctx.utilisateur.siteId === r.siteId,
          "La seconde signature doit être celle d’un responsable rattaché au site concerné.",
          403,
        );
        if (r.utilisateurConcerneId)
          exiger(
            ctx.utilisateur.id === r.utilisateurConcerneId,
            "Ce recouvrement doit être signé par le responsable désigné.",
            403,
          );
        exiger(
          !r.validations.some((v) => v.utilisateurId === ctx.utilisateur.id),
          "Les deux signataires doivent être des personnes différentes.",
          409,
        );
      }
      const secret = process.env.SESSION_SECRET;
      exiger(secret, "La clé de signature serveur doit être configurée.", 503);
      const instant = new Date();
      const signature = createHmac("sha256", secret)
        .update(
          JSON.stringify({
            reference: r.reference,
            montant: r.montant.toFixed(2),
            siteId: r.siteId,
            utilisateurId: ctx.utilisateur.id,
            etape,
            date: instant.toISOString(),
          }),
        )
        .digest("hex");
      await tx.validationRecouvrement.create({
        data: {
          recouvrementId: id,
          utilisateurId: ctx.utilisateur.id,
          nomValidateur: ctx.utilisateur.nom,
          etape,
          signature,
          createdAt: instant,
        },
      });
      const statut = etape === 2 ? "VALIDE" : "SIGNE_MONITEUR";
      const miseAJour = await tx.recouvrement.updateMany({
        where: { id, statut: r.statut },
        data: { statut },
      });
      exiger(
        miseAJour.count === 1,
        "Le recouvrement a été validé simultanément. Rechargez la page.",
        409,
      );
      await auditer(
        tx,
        ctx,
        "SIGNATURE_RECOUVREMENT",
        "recouvrements",
        id,
        r.siteId,
        { statut: r.statut },
        { statut, etape, signature },
      );
      await notifier(
        tx,
        r.siteId,
        etape === 2
          ? "Recouvrement validé"
          : "Signature du responsable requise",
        `${r.reference} · ${ctx.utilisateur.nom}`,
        "RECOUVREMENT",
      );
      if (etape === 1 && r.utilisateurConcerneId)
        await avertirSignataire(
          tx,
          r.utilisateurConcerneId,
          r.id,
          "Votre signature est requise",
          `${r.reference} · signé par ${ctx.utilisateur.nom}`,
        );
      return tx.recouvrement.findUniqueOrThrow({
        where: { id },
        include: { site: { include: { geographie: true } }, validations: true },
      });
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}
