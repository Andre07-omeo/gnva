import { Prisma } from "@prisma/client";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { parse } from "csv-parse/sync";
import { db } from "./db";
import {
  Contexte,
  Transaction,
  autoriser,
  siteAutorise,
  zoneAutorisee,
  auditer,
  empreinte,
} from "./contexte";
import { exiger } from "./erreurs";
import { reference, normaliser } from "./saisies";
import { exerciceCourant } from "./filtres";
import { verifierZoneLot } from "./territoires";

const attributionSaisie = z.object({
  assujettiId: z.string().max(30),
  numeroAutocollant: z.string().min(1).max(80),
  numeroTimbre: z
    .string()
    .regex(
      /^\S{1,80}$/,
      "Le numéro de timbre est obligatoire et ne doit contenir aucun espace.",
    ),
});
export async function attribuer(
  tx: Transaction,
  ctx: Contexte,
  corps: unknown,
  exercice: number,
) {
  autoriser(ctx, "AUTOCOLLANT_ATTRIBUER");
  const d = attributionSaisie.parse(corps);
  const a = await tx.assujetti.findUnique({
    where: { id: d.assujettiId },
    include: { moto: { include: { typeMoto: true } }, site: true },
  });
  exiger(a && !a.deletedAt, "Assujetti introuvable.", 404);
  siteAutorise(ctx, a.siteId);
  if (ctx.utilisateur.role.code === "AGENT")
    exiger(
      a.createurId === ctx.utilisateur.id,
      "Ce dossier ne fait pas partie de vos opérations.",
      403,
    );
  exiger(
    a.site.actif && a.moto?.typeMoto.actif,
    "Le site ou le type de moto est suspendu.",
  );
  exiger(!a.moto.vole, "Attribution interdite : moto déclarée volée.", 409);
  const numero = normaliser(d.numeroAutocollant);
  const qr = await tx.autocollant.findFirst({
    where: { OR: [{ numero }, { jeton: d.numeroAutocollant }] },
  });
  exiger(qr, "Autocollant inconnu.", 404);
  const territoire = await tx.fermetureGeographique.findUnique({
    where: {
      ancetreId_descendantId: {
        ancetreId: qr.geographieId,
        descendantId: a.site.geographieId,
      },
    },
    include: { ancetre: true },
  });
  exiger(
    territoire?.ancetre.actif,
    "Cet autocollant n’appartient pas au périmètre territorial de votre dossier.",
    403,
  );
  exiger(
    qr.typeAutocollant ===
      (a.moto.typeMoto.roues === 2 ? "AUTOCOLLANT_2R" : "AUTOCOLLANT_3R"),
    "L’autocollant ne correspond pas au type de moto.",
  );
  const reserve = await tx.autocollant.updateMany({
    where: { id: qr.id, statut: "DISPONIBLE" },
    data: { statut: "ATTRIBUE" },
  });
  exiger(
    reserve.count === 1,
    "Cet autocollant est déjà attribué, annulé ou réservé.",
    409,
  );
  const ancetres = await tx.fermetureGeographique.findMany({
    where: { descendantId: a.site.geographieId },
    orderBy: { profondeur: "asc" },
  });
  const tarifs = await tx.tarif.findMany({
    where: {
      typeMotoId: a.moto.typeMotoId,
      actif: true,
      debut: { lte: new Date() },
      AND: [
        { OR: [{ fin: null }, { fin: { gte: new Date() } }] },
        {
          OR: [
            { geographieId: null },
            { geographieId: { in: ancetres.map((g) => g.ancetreId) } },
          ],
        },
      ],
    },
    orderBy: { debut: "desc" },
  });
  const tarif =
    ancetres
      .map((g) => tarifs.find((t) => t.geographieId === g.ancetreId))
      .find(Boolean) ?? tarifs.find((t) => !t.geographieId);
  const montant = tarif?.montant ?? a.moto.typeMoto.tarif;
  await tx.timbre.create({
    data: { numero: d.numeroTimbre, siteId: a.siteId },
  });
  const attribution = await tx.attribution.create({
    data: {
      reference: reference("ATT"),
      assujettiId: a.id,
      autocollantId: qr.id,
      numeroTimbre: d.numeroTimbre,
      agentId: ctx.utilisateur.id,
      exercice,
      montant,
    },
    include: { autocollant: true },
  });
  const devise = await tx.parametreSysteme.findUnique({
    where: { cle: "devise" },
  });
  await tx.transactionFinanciere.create({
    data: {
      reference: reference("TX"),
      siteId: a.siteId,
      attributionId: attribution.id,
      auteurId: ctx.utilisateur.id,
      montant,
      devise:
        typeof devise?.valeur === "string" ? devise.valeur.slice(0, 10) : "CDF",
    },
  });
  await tx.assujetti.update({
    where: { id: a.id },
    data: { statut: "ATTRIBUE" },
  });
  await auditer(
    tx,
    ctx,
    "ATTRIBUTION",
    "autocollants",
    qr.id,
    a.siteId,
    undefined,
    {
      attributionId: attribution.id,
      assujettiId: a.id,
      numero: qr.numero,
      montant,
    },
  );
  return attribution;
}
export async function attribuerAutocollant(ctx: Contexte, corps: unknown) {
  const exercice = await exerciceCourant();
  return db.$transaction((tx) => attribuer(tx, ctx, corps, exercice), {
    isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    timeout: 15000,
  });
}
const generationSaisie = z.object({
  serie: z.string().min(1).max(60),
  prefixe: z.string().regex(/^[A-Za-z0-9_-]{1,30}$/),
  geographieId: z.string().max(30),
  siteId: z.string().min(1).max(30).optional(),
  debut: z.coerce.number().int().nonnegative(),
  fin: z.coerce.number().int().nonnegative(),
  longueur: z.coerce.number().int().min(1).max(20),
  typeAutocollant: z
    .enum(["AUTOCOLLANT_2R", "AUTOCOLLANT_3R"])
    .default("AUTOCOLLANT_2R"),
});
export async function generer(ctx: Contexte, corps: unknown) {
  autoriser(ctx, "AUTOCOLLANT_CREER");
  const d = generationSaisie.parse(corps);
  if (d.siteId) siteAutorise(ctx, d.siteId);
  zoneAutorisee(ctx, d.geographieId);
  exiger(
    d.fin >= d.debut && Number.isSafeInteger(d.fin) && d.fin - d.debut < 10000,
    "La plage doit être valide et limitée à 10 000 numéros par opération.",
  );
  exiger(
    String(d.fin).length <= d.longueur,
    "La plage disponible est épuisée. Veuillez définir une nouvelle série.",
  );
  const numeros = Array.from(
    { length: d.fin - d.debut + 1 },
    (_, i) =>
      `${normaliser(d.prefixe)}-${String(d.debut + i).padStart(d.longueur, "0")}`,
  );
  exiger(
    numeros.every((n) => n.length <= 80),
    "Le format dépasse la longueur maximale autorisée.",
  );
  return db.$transaction(
    async (tx) => {
      const site = await verifierZoneLot(tx, ctx, d.geographieId, d.siteId);
      const lot = await tx.lotAutocollants.create({
        data: {
          serie: d.serie,
          prefixe: d.prefixe,
          debut: d.debut,
          fin: d.fin,
          longueur: d.longueur,
          geographieId: d.geographieId,
          createurId: ctx.utilisateur.id,
        },
      });
      for (let i = 0; i < numeros.length; i += 500)
        await tx.autocollant.createMany({
          data: numeros.slice(i, i + 500).map((numero) => ({
            numero,
            jeton: randomBytes(24).toString("hex"),
            lotId: lot.id,
            siteId: site.id,
            geographieId: d.geographieId,
            typeAutocollant: d.typeAutocollant,
          })),
        });
      await auditer(
        tx,
        ctx,
        "GENERATION_SERIE",
        "autocollants",
        lot.id,
        site.id,
        undefined,
        { serie: d.serie, nombre: numeros.length },
      );
      return {
        message: "Série générée dans le périmètre territorial sélectionné.",
        nombre: numeros.length,
      };
    },
    {
      timeout: 30000,
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    },
  );
}
const importSaisie = z.object({
  csv: z.string().min(1).max(2_000_000),
  geographieId: z.string(),
  siteId: z.string().min(1).max(30).optional(),
  typeAutocollant: z.enum(["AUTOCOLLANT_2R", "AUTOCOLLANT_3R"]),
  serie: z.string().min(1).max(60),
  confirmer: z.boolean().default(false),
});
export async function importer(ctx: Contexte, corps: unknown) {
  autoriser(ctx, "AUTOCOLLANT_CREER");
  const d = importSaisie.parse(corps);
  if (d.siteId) siteAutorise(ctx, d.siteId);
  zoneAutorisee(ctx, d.geographieId);
  await db.$transaction((tx) =>
    verifierZoneLot(tx, ctx, d.geographieId, d.siteId),
  );
  const lignes = parse(d.csv, {
    columns: true,
    skip_empty_lines: true,
    bom: true,
    trim: true,
    delimiter: d.csv.split("\n")[0]?.includes(";") ? ";" : ",",
  }) as Record<string, string>[];
  exiger(
    lignes.length > 0 && lignes.length <= 10000,
    "L’import doit contenir entre 1 et 10 000 lignes.",
  );
  const valeurs = lignes.map((r, i) => {
    const numero = normaliser(r.numero ?? r.numeroQR ?? r["numéro QR"] ?? ""),
      url = r.url ?? r.urlPublique ?? r["URL publique"] ?? "";
    exiger(
      /^[A-Z0-9_-]{1,80}$/.test(numero),
      `Numéro QR invalide à la ligne ${i + 2}.`,
    );
    const publique = z.string().url().parse(url);
    exiger(
      new URL(publique).protocol === "https:",
      "Les URL publiques doivent utiliser HTTPS.",
    );
    return { numero, urlPublique: publique };
  });
  exiger(
    new Set(valeurs.map((v) => v.numero)).size === valeurs.length,
    "Le CSV contient des numéros en double.",
    409,
  );
  const existants = await db.autocollant.count({
    where: { numero: { in: valeurs.map((v) => v.numero) } },
  });
  exiger(
    existants === 0,
    "Certains numéros existent déjà. Aucun QR n’a été importé.",
    409,
  );
  if (!d.confirmer)
    return {
      message: "Import contrôlé. Confirmez pour enregistrer.",
      nombre: valeurs.length,
      apercu: valeurs.slice(0, 20),
      empreinte: empreinte(d.csv),
    };
  return db.$transaction(
    async (tx) => {
      const site = await verifierZoneLot(tx, ctx, d.geographieId, d.siteId);
      const lot = await tx.lotAutocollants.create({
        data: {
          serie: d.serie,
          prefixe: "IMPORT",
          debut: 0,
          fin: valeurs.length - 1,
          longueur: 1,
          geographieId: d.geographieId,
          createurId: ctx.utilisateur.id,
        },
      });
      for (let i = 0; i < valeurs.length; i += 500)
        await tx.autocollant.createMany({
          data: valeurs.slice(i, i + 500).map((v) => ({
            ...v,
            jeton: randomBytes(24).toString("hex"),
            lotId: lot.id,
            siteId: site.id,
            geographieId: d.geographieId,
            typeAutocollant: d.typeAutocollant,
          })),
        });
      await auditer(
        tx,
        ctx,
        "IMPORT_CSV",
        "autocollants",
        lot.id,
        site.id,
        undefined,
        { nombre: valeurs.length, empreinte: empreinte(d.csv) },
      );
      return {
        message: "Import enregistré intégralement.",
        nombre: valeurs.length,
      };
    },
    {
      timeout: 30000,
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    },
  );
}
export async function publicAutocollant(jeton: string) {
  const qr = await db.autocollant.findFirst({
    where: { OR: [{ jeton }, { numero: jeton }] },
    include: {
      attribution: { include: { assujetti: { include: { moto: true } } } },
    },
  });
  exiger(qr, "Autocollant introuvable.", 404);
  const attr = qr.attribution,
    a = attr?.assujetti;
  // Liste blanche explicite : aucune adresse, finance, pièce, session ou compte.
  return {
    numeroAutocollant: qr.numero,
    statut: qr.statut,
    nom: a?.nom ?? null,
    postnom: a?.postnom ?? null,
    prenom: a?.prenom ?? null,
    photoUrl: a?.photoUrl ?? null,
    numeroTimbre: attr?.numeroTimbre ?? null,
    plaque: a?.moto?.plaque ?? null,
    chassis: a?.moto?.chassis ?? null,
    moteur: a?.moto?.moteur ?? null,
    dateAttribution: attr?.createdAt ?? null,
    exercice: attr?.exercice ?? null,
    vole: a?.moto?.vole ?? false,
  };
}
