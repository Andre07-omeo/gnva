import webpush from "web-push";
import { z } from "zod";
import { db } from "./db";
import { Contexte, national, auditer } from "./contexte";
import { exiger, journal } from "./erreurs";

export function configurationPush() {
  return {
    publicKey: process.env.WEB_PUSH_PRIVATE_KEY
      ? (process.env.WEB_PUSH_PUBLIC_KEY ?? null)
      : null,
  };
}
export async function abonnerPush(ctx: Contexte, corps: unknown) {
  exiger(
    configurationPush().publicKey,
    "Web Push n’est pas configuré sur ce serveur.",
    503,
  );
  const d = z
    .object({
      endpoint: z
        .string()
        .url()
        .max(500)
        .refine((v) => new URL(v).protocol === "https:"),
      keys: z.object({
        p256dh: z.string().max(255),
        auth: z.string().max(255),
      }),
    })
    .parse(corps);
  // Aucun endpoint arbitraire : évite d'utiliser le serveur push comme proxy SSRF.
  const host = new URL(d.endpoint).hostname;
  exiger(
    [
      "fcm.googleapis.com",
      "updates.push.services.mozilla.com",
      "web.push.apple.com",
      "wns.windows.com",
    ].some((h) => host === h || host.endsWith("." + h)),
    "Service push non autorisé.",
  );
  await db.abonnementPush.upsert({
    where: { endpoint: d.endpoint },
    create: {
      utilisateurId: ctx.utilisateur.id,
      endpoint: d.endpoint,
      ...d.keys,
    },
    update: { utilisateurId: ctx.utilisateur.id, ...d.keys },
  });
  return { message: "Abonnement enregistré." };
}
let livraisonEnCours = false;
export async function livrerPush() {
  if (
    livraisonEnCours ||
    !process.env.WEB_PUSH_PRIVATE_KEY ||
    !process.env.WEB_PUSH_PUBLIC_KEY
  )
    return;
  livraisonEnCours = true;
  try {
    webpush.setVapidDetails(
      process.env.WEB_PUSH_CONTACT ?? "mailto:admin@gnva.cd",
      process.env.WEB_PUSH_PUBLIC_KEY,
      process.env.WEB_PUSH_PRIVATE_KEY,
    );
    const file = await db.livraisonPush.findMany({
      where: {
        envoyeeAt: null,
        tentatives: { lt: 5 },
        prochaineTentative: { lte: new Date() },
      },
      orderBy: { createdAt: "asc" },
      take: 20,
    });
    for (const notification of file) {
      const utilisateur = await db.utilisateur.findUnique({
        where: { id: notification.utilisateurId },
        include: { site: true, abonnements: true },
      });
      if (!utilisateur?.actif || utilisateur.site?.actif === false) {
        await db.livraisonPush.update({
          where: { id: notification.id },
          data: { envoyeeAt: new Date() },
        });
        continue;
      }
      let echec = false;
      for (const abonnement of utilisateur.abonnements) {
        try {
          // Pas de donnée sensible sur l'écran verrouillé.
          await webpush.sendNotification(
            {
              endpoint: abonnement.endpoint,
              keys: { p256dh: abonnement.p256dh, auth: abonnement.auth },
            },
            JSON.stringify({
              title: "GNVA",
              body: "Une nouvelle notification vous attend.",
              url: "/notifications",
            }),
            { TTL: 3600, timeout: 5000 },
          );
        } catch (erreur) {
          const statut = (erreur as { statusCode?: number }).statusCode;
          if (statut === 404 || statut === 410)
            await db.abonnementPush.delete({ where: { id: abonnement.id } });
          else echec = true;
        }
      }
      await db.livraisonPush.update({
        where: { id: notification.id },
        data: {
          tentatives: { increment: 1 },
          ...(echec
            ? {
                prochaineTentative: new Date(
                  Date.now() + Math.pow(2, notification.tentatives) * 60000,
                ),
              }
            : { envoyeeAt: new Date() }),
        },
      });
    }
  } catch (err) {
    journal.error({ err }, "Livraison push différée");
  } finally {
    livraisonEnCours = false;
  }
}
export async function partagerPosition(ctx: Contexte, corps: unknown) {
  const d = z
    .object({
      consentement: z.boolean(),
      latitude: z.number().min(-90).max(90).optional(),
      longitude: z.number().min(-180).max(180).optional(),
    })
    .parse(corps);
  const config = await db.parametreSysteme.findUnique({
    where: { cle: "localisationActive" },
  });
  exiger(
    (config?.valeur !== false && config?.valeur !== "false") || !d.consentement,
    "La localisation est désactivée par l’administration.",
    403,
  );
  exiger(
    !d.consentement || (d.latitude !== undefined && d.longitude !== undefined),
    "Position manquante.",
  );
  await db.$transaction(async (tx) => {
    await tx.utilisateur.update({
      where: { id: ctx.utilisateur.id },
      data: {
        partagePosition: d.consentement,
        latitude: d.consentement ? d.latitude : null,
        longitude: d.consentement ? d.longitude : null,
        positionAt: d.consentement ? new Date() : null,
      },
    });
    await auditer(
      tx,
      ctx,
      d.consentement ? "CONSENTEMENT_POSITION" : "POSITION_EFFACEE",
      "compte",
      ctx.utilisateur.id,
      ctx.utilisateur.siteId ?? undefined,
    );
  });
  return {
    message: d.consentement
      ? "Dernière position partagée volontairement."
      : "Position supprimée et partage désactivé.",
  };
}
export async function positions(ctx: Contexte) {
  exiger(
    national(ctx.utilisateur),
    "La carte est réservée à la direction nationale.",
    403,
  );
  const donnees = await db.utilisateur.findMany({
    where: { partagePosition: true },
    select: {
      id: true,
      nom: true,
      actif: true,
      latitude: true,
      longitude: true,
      positionAt: true,
      role: { select: { nom: true } },
      site: { select: { nom: true } },
      sessions: {
        where: { revokedAt: null, expiresAt: { gt: new Date() } },
        select: { lastSeenAt: true },
        orderBy: { lastSeenAt: "desc" },
        take: 1,
      },
    },
    take: 1000,
  });
  return donnees.map((u) => ({
    id: u.id,
    nom: u.nom,
    role: u.role.nom,
    site: u.site?.nom ?? null,
    latitude: u.latitude,
    longitude: u.longitude,
    positionAt: u.positionAt,
    lastSeen: u.sessions[0]?.lastSeenAt ?? u.positionAt,
    partagePosition: true,
    connecte:
      u.actif &&
      !!u.sessions[0] &&
      Date.now() - u.sessions[0].lastSeenAt.getTime() < 15 * 60000,
  }));
}
