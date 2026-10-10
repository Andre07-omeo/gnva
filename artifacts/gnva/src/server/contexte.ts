import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { hash, verify } from "@node-rs/argon2";
import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import Redis from "ioredis";
import { z } from "zod";
import { db } from "./db";
import { exiger } from "./erreurs";
import { PERMISSIONS } from "./permissions";

export type Transaction = Prisma.TransactionClient;
export const empreinte = (valeur: string) =>
  createHash("sha256").update(valeur).digest("hex");
const redis = process.env.REDIS_URL
  ? new Redis(process.env.REDIS_URL, { maxRetriesPerRequest: 1 })
  : null;
const compteurs = new Map<string, { nombre: number; fin: number }>();
export async function limiter(cle: string, maximum = 100) {
  const tranche = Math.floor(Date.now() / 60000);
  if (redis) {
    const key = `gnva:limite:${cle}:${tranche}`;
    const nombre = await redis.incr(key);
    if (nombre === 1) await redis.expire(key, 70);
    exiger(
      nombre <= maximum,
      "Trop de tentatives. Réessayez dans une minute.",
      429,
    );
    return;
  }
  const maintenant = Date.now();
  if (compteurs.size > 10000)
    for (const [k, v] of compteurs) if (v.fin < maintenant) compteurs.delete(k);
  const entree = compteurs.get(cle);
  if (!entree || entree.fin < maintenant)
    compteurs.set(cle, { nombre: 1, fin: maintenant + 60000 });
  else {
    entree.nombre++;
    exiger(
      entree.nombre <= maximum,
      "Trop de tentatives. Réessayez dans une minute.",
      429,
    );
  }
}
export function verifierOrigine(req: NextRequest) {
  const origine = req.headers.get("origin");
  // Les clients API sans Origin utilisent encore le contrôle CSRF/session.
  if (!origine) return;
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  exiger(
    new URL(origine).host === host,
    "Origine de requête non autorisée.",
    403,
  );
}
const inclusionUtilisateur = {
  role: { include: { permissions: true } },
  site: true,
  zones: true,
} as const;
export type Identite = Prisma.UtilisateurGetPayload<{
  include: typeof inclusionUtilisateur;
}>;
export type Contexte = {
  utilisateur: Identite;
  sessionId: string;
  req: NextRequest;
  siteIds: string[] | null;
  geoIds: string[] | null;
  permissions: string[];
};
export const national = (u: Identite) =>
  ["SUPER_ADMIN", "ADMIN_NATIONAL"].includes(u.role.code);
export const permissionsEffectives = (u: Identite): string[] =>
  (Array.isArray(u.permissionsPersonnalisees)
    ? u.permissionsPersonnalisees.filter(
        (p): p is string => typeof p === "string",
      )
    : [...new Set([
        ...u.role.permissions.map((p) => p.permissionCode),
        // Compatibilité des comptes provinciaux existants, sans seed/reset.
        // Une liste de permissions personnalisées explicite reste prioritaire.
        ...(u.role.code === "MONITEUR_PROVINCIAL"
          ? ["RECOUVREMENT_CONSULTER", "RECOUVREMENT_VALIDER"] : []),
      ])]
  ).filter((p) => PERMISSIONS.includes(p as (typeof PERMISSIONS)[number]));
export function autoriserTerrain(
  ctx: Contexte,
  permission = "ASSUJETTI_CONSULTER",
) {
  if (
    ctx.utilisateur.role.code === "AGENT" &&
    ctx.permissions.some((p) =>
      ["ASSUJETTI_CREER", "AUTOCOLLANT_ATTRIBUER"].includes(p),
    )
  )
    return;
  autoriser(ctx, permission);
}
export function autoriser(ctx: Contexte, permission: string) {
  exiger(
    ctx.permissions.includes(permission),
    "Votre compte ne dispose pas de la permission nécessaire.",
    403,
  );
}
export function siteAutorise(ctx: Contexte, siteId: string) {
  exiger(
    ctx.siteIds === null || ctx.siteIds.includes(siteId),
    "Ce site est en dehors de votre périmètre.",
    403,
  );
}
export function zoneAutorisee(ctx: Contexte, geographieId: string) {
  exiger(
    ctx.geoIds === null || ctx.geoIds.includes(geographieId),
    "Cette zone est en dehors de votre périmètre.",
    403,
  );
}
export const filtreSite = (ctx: Contexte): Prisma.SiteWhereInput =>
  ctx.siteIds === null ? {} : { id: { in: ctx.siteIds } };
export const filtreOperation = (
  ctx: Contexte,
): { siteId?: { in: string[] }; createurId?: string } => ({
  ...(ctx.siteIds === null ? {} : { siteId: { in: ctx.siteIds } }),
  ...(ctx.utilisateur.role.code === "AGENT"
    ? { createurId: ctx.utilisateur.id }
    : {}),
});
export async function contexte(
  req: NextRequest,
  autoriserChangement = false,
): Promise<Contexte> {
  const jeton = req.cookies.get("gnva_session")?.value;
  exiger(jeton, "Connectez-vous pour accéder à cette page.", 401);
  const session = await db.session.findUnique({
    where: { empreinte: empreinte(jeton) },
    include: { utilisateur: { include: inclusionUtilisateur } },
  });
  exiger(
    session &&
      !session.revokedAt &&
      session.expiresAt.getTime() > Date.now() &&
      session.utilisateur.actif,
    "Votre session a expiré ou votre compte est suspendu.",
    401,
  );
  const u = session.utilisateur;
  if (Date.now() - session.lastSeenAt.getTime() > 60000)
    await db.session.update({
      where: { id: session.id },
      data: { lastSeenAt: new Date() },
    });
  exiger(
    !u.site || u.site.actif,
    "Ce site a été suspendu par la Direction Générale de Dispromalt. Veuillez contacter la direction pour plus d’informations.",
    403,
  );
  if (!["GET", "HEAD"].includes(req.method)) {
    verifierOrigine(req);
    const csrf = req.headers.get("x-csrf-token") ?? "";
    const hashCsrf = empreinte(csrf);
    exiger(
      csrf &&
        timingSafeEqual(Buffer.from(hashCsrf), Buffer.from(session.csrfHash)),
      "Jeton de sécurité absent ou invalide. Reconnectez-vous.",
      403,
    );
  }
  const global =
    national(u) || (u.role.code === "MONITEUR_NATIONAL" && u.porteeNationale);
  const geoIds = global
    ? null
    : (
        await db.fermetureGeographique.findMany({
          where: {
            ancetreId: {
              in: u.zones.length
                ? u.zones.map((z) => z.geographieId)
                : u.role.code === "AGENT" && u.site
                  ? [u.site.geographieId]
                  : [],
            },
          },
          select: { descendantId: true },
        })
      ).map((g) => g.descendantId);
  const siteIds = global
    ? null
    : u.role.code === "AGENT"
      ? u.siteId
        ? [u.siteId]
        : []
      : (
          await db.site.findMany({
            where: { geographieId: { in: geoIds ?? [] } },
            select: { id: true },
          })
        ).map((s) => s.id);
  const ctx = {
    utilisateur: u,
    sessionId: session.id,
    req,
    geoIds,
    siteIds,
    permissions: permissionsEffectives(u),
  };
  await limiter(`utilisateur:${u.id}`, 200);
  return ctx;
}
export function utilisateurPublic(u: Identite) {
  return {
    id: u.id,
    nom: u.nom,
    email: u.email,
    role: u.role.nom,
    roleCode: u.role.code,
    porteeNationale:
      national(u) || (u.role.code === "MONITEUR_NATIONAL" && u.porteeNationale),
    siteId: u.siteId,
    siteNom: u.site?.nom ?? null,
    actif: u.actif,
    changementRequis: false,
    permissions: permissionsEffectives(u),
  };
}
export async function auditer(
  tx: Transaction,
  ctx: Contexte,
  action: string,
  module: string,
  objetId?: string,
  siteId?: string,
  avant?: unknown,
  apres?: unknown,
) {
  const serialiser = (v: unknown) =>
    v === undefined
      ? undefined
      : (JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue);
  await tx.journalAudit.create({
    data: {
      utilisateurId: ctx.utilisateur.id,
      nomUtilisateur: ctx.utilisateur.nom,
      role: ctx.utilisateur.role.code,
      action,
      module,
      objetId,
      siteId,
      avant: serialiser(avant),
      apres: serialiser(apres),
      sessionId: ctx.sessionId,
      ip: (ctx.req.headers.get("x-forwarded-for") ?? "")
        .split(",")[0]
        ?.slice(0, 45),
      appareil: ctx.req.headers.get("user-agent")?.slice(0, 255),
    },
  });
}
export async function notifier(
  tx: Transaction,
  siteId: string,
  titre: string,
  message: string,
  type: string,
) {
  const site = await tx.site.findUniqueOrThrow({ where: { id: siteId } });
  const ancetres = await tx.fermetureGeographique.findMany({
    where: { descendantId: site.geographieId },
    select: { ancetreId: true },
  });
  const destinataires = await tx.utilisateur.findMany({
    where: {
      actif: true,
      OR: [
        { siteId },
        { role: { code: { in: ["SUPER_ADMIN", "ADMIN_NATIONAL"] } } },
        {
          zones: {
            some: { geographieId: { in: ancetres.map((g) => g.ancetreId) } },
          },
        },
      ],
    },
    select: { id: true },
  });
  await tx.notification.createMany({
    data: destinataires.map((u) => ({
      utilisateurId: u.id,
      titre,
      message,
      type,
    })),
  });
  await tx.livraisonPush.createMany({
    data: destinataires.map((u) => ({ utilisateurId: u.id, titre, message })),
  });
}
async function nouvelleSession(req: NextRequest, u: Identite) {
  const jeton = randomBytes(32).toString("base64url"),
    csrf = randomBytes(32).toString("base64url");
  await db.$transaction(async (tx) => {
    const session = await tx.session.create({
      data: {
        utilisateurId: u.id,
        empreinte: empreinte(jeton),
        csrfHash: empreinte(csrf),
        expiresAt: new Date(Date.now() + 12 * 3600000),
        appareil: req.headers.get("user-agent")?.slice(0, 255),
      },
    });
    await auditer(
      tx,
      {
        utilisateur: u,
        sessionId: session.id,
        req,
        siteIds: [],
        geoIds: [],
        permissions: permissionsEffectives(u),
      },
      "CONNEXION",
      "auth",
      u.id,
      u.siteId ?? undefined,
    );
  });
  const resultat = NextResponse.json({ utilisateur: utilisateurPublic(u) });
  const options = {
    httpOnly: true,
    //secure: process.env.NODE_ENV === "production",
    secure: req.nextUrl.protocol === "https:",
    sameSite: "lax" as const,
    path: "/",
    maxAge: 12 * 3600,
  };
  resultat.cookies.set("gnva_session", jeton, options);
  resultat.cookies.set("gnva_csrf", csrf, { ...options, httpOnly: false });
  return resultat;
}
const hashLeurre = hash("verification-identite-inexistante", {
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
});
export async function connexion(req: NextRequest) {
  verifierOrigine(req);
  const saisie = z
    .object({
      email: z
        .string()
        .email()
        .max(190)
        .transform((v) => v.toLowerCase()),
      motDePasse: z.string().min(1).max(200),
    })
    .parse(await req.json());
  await limiter(
    `connexion:${empreinte(saisie.email)}:${(req.headers.get("x-forwarded-for") ?? "local").split(",")[0]}`,
    10,
  );
  await limiter(`connexion-compte:${empreinte(saisie.email)}`, 20);
  await limiter(
    `connexion-ip:${(req.headers.get("x-forwarded-for") ?? "local").split(",")[0]}`,
    60,
  );
  const u = await db.utilisateur.findUnique({
    where: { email: saisie.email },
    include: inclusionUtilisateur,
  });
  const valide = await verify(
    u?.motDePasseHash ?? (await hashLeurre),
    saisie.motDePasse,
  ).catch(() => false);
  exiger(
    u && valide && u.actif,
    "Identifiants invalides ou compte suspendu.",
    401,
  );
  exiger(
    !u.site || u.site.actif,
    "Ce site a été suspendu par la Direction Générale de Dispromalt. Veuillez contacter la direction pour plus d’informations.",
    403,
  );
  return nouvelleSession(req, u);
}
export async function changerMotDePasse(ctx: Contexte) {
  const saisie = z
    .object({
      actuel: z.string().max(200),
      nouveau: z
        .string()
        .min(
          4,
          "Le nouveau mot de passe doit contenir au moins 4 caractères.",
        )
        .max(200),
    })
    .parse(await ctx.req.json());
  const configuration = await db.parametreSysteme.findUnique({
    where: { cle: "longueurMotDePasse" },
  });
  const minimum = Math.max(4, Number(configuration?.valeur ?? 4));
  exiger(
    saisie.nouveau.length >= minimum,
    `Le mot de passe doit contenir au moins ${minimum} caractères.`,
  );
  exiger(
    saisie.actuel !== saisie.nouveau,
    "Le nouveau mot de passe doit être différent.",
  );
  exiger(
    await verify(ctx.utilisateur.motDePasseHash, saisie.actuel),
    "Mot de passe actuel incorrect.",
  );
  await db.$transaction(async (tx) => {
    await tx.utilisateur.update({
      where: { id: ctx.utilisateur.id },
      data: {
        motDePasseHash: await hash(saisie.nouveau, {
          memoryCost: 19456,
          timeCost: 2,
          parallelism: 1,
        }),
        changementRequis: false,
      },
    });
    await tx.session.updateMany({
      where: { utilisateurId: ctx.utilisateur.id, id: { not: ctx.sessionId } },
      data: { revokedAt: new Date() },
    });
    await auditer(tx, ctx, "MOT_DE_PASSE_CHANGE", "auth", ctx.utilisateur.id);
  });
  return {
    message: "Mot de passe modifié. Les autres sessions ont été révoquées.",
  };
}



