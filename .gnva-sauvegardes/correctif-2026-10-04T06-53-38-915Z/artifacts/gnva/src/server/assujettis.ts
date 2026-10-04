import { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "./db";
import {
  Contexte,
  Transaction,
  autoriser,
  autoriserTerrain,
  siteAutorise,
  auditer,
} from "./contexte";
import { exiger } from "./erreurs";
import {
  assujettiSaisie,
  reference,
  normaliser,
  inclureAssujetti,
  aplatirAssujetti,
} from "./saisies";
import { exerciceCourant } from "./filtres";
import { attribuer } from "./autocollants";
import { lister } from "./lecture";
import { photoExiste } from "./photos";

export async function doublons(ctx: Contexte, corps: unknown) {
  autoriserTerrain(ctx);
  const d = z
    .object({
      nom: z.string().max(100).optional(),
      postnom: z.string().max(100).optional(),
      telephone: z.string().max(32).optional(),
      plaque: z.string().max(80).optional(),
      chassis: z.string().max(100).optional(),
      moteur: z.string().max(100).optional(),
      excludeId: z.string().max(30).optional(),
    })
    .parse(corps);
  const identifiants = [d.plaque, d.chassis, d.moteur]
    .filter((v): v is string => !!v)
    .map(normaliser);
  if (!identifiants.length && !d.nom && !d.telephone) return [];
  const or: Prisma.AssujettiWhereInput[] = [
    ...identifiants.flatMap((v) => [
      { moto: { plaque: { contains: v.slice(0, Math.max(4, v.length - 3)) } } },
      {
        moto: { chassis: { contains: v.slice(0, Math.max(4, v.length - 3)) } },
      },
      { moto: { moteur: { contains: v.slice(0, Math.max(4, v.length - 3)) } } },
    ]),
    ...(d.nom && d.postnom ? [{ nom: d.nom, postnom: d.postnom }] : []),
    ...(d.telephone ? [{ telephone: d.telephone }] : []),
  ];
  const candidats = await db.assujetti.findMany({
    where: {
      deletedAt: null,
      id: { not: d.excludeId },
      ...(ctx.siteIds === null ? {} : { siteId: { in: ctx.siteIds } }),
      OR: or,
    },
    include: { moto: true },
    take: 30,
  });
  return candidats.map((c) => {
    const valeurs = [c.moto?.plaque, c.moto?.chassis, c.moto?.moteur]
      .filter((v): v is string => !!v)
      .map(normaliser);
    if (ctx.utilisateur.role.code === "AGENT")
      return {
        vole: c.moto?.vole ?? false,
        exact: identifiants.some((v) => valeurs.includes(v)),
        similarite: identifiants.some((v) =>
          valeurs.some((w) => w.includes(v) || v.includes(w)),
        ),
        message: "Correspondance détectée. Contactez un administrateur pour vérification.",
      };
    return {
      id: c.id,
      reference: c.reference,
      nom: c.nom,
      postnom: c.postnom,
      plaque: c.moto?.plaque,
      vole: c.moto?.vole ?? false,
      exact: identifiants.some((v) => valeurs.includes(v)),
      similarite: identifiants.some((v) =>
        valeurs.some((w) => w.includes(v) || v.includes(w)),
      ),
    };
  });
}
async function enregistrer(
  tx: Transaction,
  ctx: Contexte,
  corps: unknown,
  exercice: number,
) {
  autoriser(ctx, "ASSUJETTI_CREER");
  const d = assujettiSaisie.parse(corps);
  siteAutorise(ctx, d.siteId);
  const [site, type] = await Promise.all([
    tx.site.findUnique({ where: { id: d.siteId } }),
    tx.typeMoto.findUnique({ where: { id: d.typeMotoId } }),
  ]);
  exiger(site?.actif, "Le site n’est pas actif.");
  exiger(type?.actif, "Le type de moto n’est pas actif.");
  // Une correspondance exacte bloque le doublon; une ressemblance ne le bloque jamais.
  const collisions = await tx.moto.findFirst({
    where: {
      assujetti: { deletedAt: null },
      OR: [
        ...(d.plaque ? [{ plaque: d.plaque }] : []),
        ...(d.chassis ? [{ chassis: normaliser(d.chassis) }] : []),
        ...(d.moteur ? [{ moteur: normaliser(d.moteur) }] : []),
      ],
    },
  });
  exiger(
    !collisions,
    collisions?.vole
      ? "Attention : les informations saisies présentent une correspondance avec une moto déclarée volée. Veuillez contacter un administrateur pour vérification du dossier."
      : "Un dossier existe déjà pour un identifiant exact de cette moto. Consultez le dossier au lieu de le recréer.",
    409,
  );
  const {
    typeMotoId,
    plaque,
    chassis,
    moteur,
    marque,
    couleur,
    naissance,
    ...identite
  } = d;
  const a = await tx.assujetti.create({
    data: {
      ...identite,
      naissance: naissance ? new Date(naissance) : null,
      reference: reference("TKT"),
      createurId: ctx.utilisateur.id,
      exercice,
      moto: {
        create: {
          typeMotoId,
          plaque,
          chassis: chassis ? normaliser(chassis) : undefined,
          moteur: moteur ? normaliser(moteur) : undefined,
          marque,
          couleur,
        },
      },
    },
    include: inclureAssujetti,
  });
  await auditer(
    tx,
    ctx,
    "ENREGISTREMENT",
    "assujettis",
    a.id,
    a.siteId,
    undefined,
    aplatirAssujetti(a),
  );
  const complement = z
    .object({
      attribution: z
        .object({ numeroAutocollant: z.string(), numeroTimbre: z.string() })
        .optional(),
    })
    .parse(corps);
  if (complement.attribution)
    await attribuer(
      tx,
      ctx,
      { ...complement.attribution, assujettiId: a.id },
      exercice,
    );
  return aplatirAssujetti(
    await tx.assujetti.findUniqueOrThrow({
      where: { id: a.id },
      include: inclureAssujetti,
    }),
  );
}
export async function creerAssujetti(ctx: Contexte, corps: unknown) {
  const d = assujettiSaisie.parse(corps);
  exiger(
    await photoExiste(d.photoUrl),
    "La photo téléversée n’existe pas. Téléversez une nouvelle photo.",
  );
  const exercice = await exerciceCourant();
  return db.$transaction((tx) => enregistrer(tx, ctx, corps, exercice), {
    isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    timeout: 15000,
  });
}
export async function modifierAssujetti(
  ctx: Contexte,
  id: string,
  corps: unknown,
) {
  if (ctx.utilisateur.role.code === "AGENT") autoriser(ctx, "ASSUJETTI_CREER");
  else autoriser(ctx, "ASSUJETTI_MODIFIER");
  const avant = await lister(ctx, "assujettis", new URLSearchParams(), id);
  const d = assujettiSaisie.parse(corps);
  siteAutorise(ctx, d.siteId);
  exiger(await photoExiste(d.photoUrl), "La photo téléversée n’existe pas.");
  return db.$transaction(
    async (tx) => {
      const a = await tx.assujetti.findUniqueOrThrow({
        where: { id },
        include: { attributions: true },
      });
      exiger(
        !a.attributions.length,
        "Un dossier attribué ne peut plus être modifié par le formulaire courant.",
        409,
      );
      exiger(
        ctx.utilisateur.role.code !== "AGENT" ||
          a.createurId === ctx.utilisateur.id,
        "Vous ne pouvez reprendre que vos propres enregistrements.",
        403,
      );
      const [site, type] = await Promise.all([
        tx.site.findUnique({ where: { id: d.siteId } }),
        tx.typeMoto.findUnique({ where: { id: d.typeMotoId } }),
      ]);
      exiger(
        site?.actif && type?.actif,
        "Le site ou le type de moto est suspendu.",
      );
      const collisions = await tx.moto.findFirst({
        where: {
          assujettiId: { not: id },
          assujetti: { deletedAt: null },
          OR: [
            ...(d.plaque ? [{ plaque: d.plaque }] : []),
            ...(d.chassis ? [{ chassis: normaliser(d.chassis) }] : []),
            ...(d.moteur ? [{ moteur: normaliser(d.moteur) }] : []),
          ],
        },
      });
      exiger(
        !collisions,
        "Un identifiant exact de cette moto appartient déjà à un autre dossier.",
        409,
      );
      const {
        typeMotoId,
        plaque,
        chassis,
        moteur,
        marque,
        couleur,
        naissance,
        ...identite
      } = d;
      const resultat = await tx.assujetti.update({
        where: { id },
        data: {
          ...identite,
          naissance: naissance ? new Date(naissance) : null,
          moto: {
            update: {
              typeMotoId,
              plaque,
              chassis: chassis ? normaliser(chassis) : null,
              moteur: moteur ? normaliser(moteur) : null,
              marque: marque ?? null,
              couleur: couleur ?? null,
            },
          },
        },
        include: inclureAssujetti,
      });
      await auditer(
        tx,
        ctx,
        "MODIFICATION",
        "assujettis",
        id,
        a.siteId,
        avant,
        resultat,
      );
      return aplatirAssujetti(resultat);
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}
export async function archiverAssujetti(ctx: Contexte, id: string) {
  autoriser(ctx, "ASSUJETTI_SUPPRIMER");
  await lister(ctx, "assujettis", new URLSearchParams(), id);
  await db.$transaction(
    async (tx) => {
      const a = await tx.assujetti.findUniqueOrThrow({
        where: { id },
        include: { attributions: true },
      });
      exiger(
        !a.attributions.length,
        "Ce dossier a une attribution définitive et ne peut pas être supprimé.",
        409,
      );
      await tx.assujetti.update({
        where: { id },
        data: { deletedAt: new Date(), statut: "ARCHIVE" },
      });
      await auditer(tx, ctx, "ARCHIVAGE", "assujettis", id, a.siteId, a, {
        statut: "ARCHIVE",
      });
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
  return { message: "Dossier archivé avec conservation de la trace d’audit." };
}
export async function declarerVol(ctx: Contexte, corps: unknown) {
  autoriser(ctx, "VOL_DECLARER");
  const d = z
    .object({
      assujettiId: z.string(),
      commentaire: z.string().max(4000).optional(),
    })
    .parse(corps);
  await lister(ctx, "assujettis", new URLSearchParams(), d.assujettiId);
  return db.$transaction(async (tx) => {
    const a = await tx.assujetti.findUniqueOrThrow({
      where: { id: d.assujettiId },
      include: { moto: true },
    });
    exiger(a.moto, "Moto introuvable.");
    exiger(!a.moto.vole, "Cette moto est déjà déclarée volée.", 409);
    const v = await tx.declarationVol.create({
      data: {
        motoId: a.moto.id,
        auteurId: ctx.utilisateur.id,
        reference: reference("VOL"),
        commentaire: d.commentaire,
      },
    });
    await tx.moto.update({ where: { id: a.moto.id }, data: { vole: true } });
    await auditer(tx, ctx, "VOL_DECLARE", "vols", v.id, a.siteId, undefined, v);
    return v;
  });
}
