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
import { ErreurMetier, exiger } from "./erreurs";
import { reference, normaliser } from "./saisies";
import { afficherNumeroAutocollant } from "@/lib/numero-autocollant";
import { exerciceCourant } from "./filtres";
import { verifierZoneLot } from "./territoires";
import {
  cleIdentiteAutocollant,
  trouverAutocollantParIdentifiant,
} from "./identite-autocollant";
import { urlBase } from "./url-base";

function erreurCreationAutocollant(erreur: unknown): never {
  if (
    typeof erreur === "object" &&
    erreur !== null &&
    "code" in erreur &&
    erreur.code === "P2002"
  )
    throw new ErreurMetier(
      409,
      "Un autocollant portant exactement le même numéro et la même série existe déjà.",
    );
  throw erreur;
}

const attributionSaisie = z.object({
  assujettiId: z.string().max(30),
  numeroAutocollant: z.string().trim().min(1).max(500),
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
  exiger(
    [2, 3].includes(a.moto.typeMoto.roues),
    "L’attribution est réservée aux motos à 2 ou 3 roues.",
    409,
  );
  exiger(!a.moto.vole, "Attribution interdite : moto déclarée volée.", 409);
  const qr = await trouverAutocollantParIdentifiant(
    tx,
    d.numeroAutocollant,
  );
  exiger(
    qr,
    "Autocollant inconnu. Saisissez numéro/série ou scannez le QR.",
    404,
  );
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
  serie: z.string().trim().min(1).max(60),
  prefixe: z
    .string()
    .regex(/^[A-Za-z0-9_-]{1,30}$/)
    .transform(normaliser),
  geographieId: z.string().max(30),
  siteId: z.string().min(1).max(30).optional(),
  debut: z.coerce.number().int().nonnegative(),
  fin: z.coerce.number().int().nonnegative(),
  longueur: z.coerce.number().int().min(1).max(20).default(4),
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
      const baseUrl = urlBase(ctx.req);
      const autocollants = numeros.map((numero) => {
        const jeton = randomBytes(24).toString("hex");
        return {
          numero,
          jeton,
          urlPublique: `${baseUrl}/autocollant/${jeton}`,
        };
      });
      exiger(
        autocollants.every((autocollant) => autocollant.urlPublique.length <= 500),
        "APP_URL est trop longue pour enregistrer les URL QR des autocollants.",
        503,
      );
      const cles = numeros.map((numero) =>
        cleIdentiteAutocollant(numero, d.serie),
      );
      for (let i = 0; i < cles.length; i += 500) {
        const doublon = await tx.autocollant.findFirst({
          where: { cleIdentite: { in: cles.slice(i, i + 500) } },
          select: { id: true },
        });
        exiger(
          !doublon,
          "Un autocollant de cette série porte déjà exactement le même numéro.",
          409,
        );
      }
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
      for (let i = 0; i < numeros.length; i += 500) {
        try {
          await tx.autocollant.createMany({
            data: autocollants.slice(i, i + 500).map((autocollant) => ({
              ...autocollant,
              cleIdentite: cleIdentiteAutocollant(autocollant.numero, d.serie),
              lotId: lot.id,
              siteId: site.id,
              geographieId: d.geographieId,
              typeAutocollant: d.typeAutocollant,
            })),
          });
        } catch (erreur) {
          erreurCreationAutocollant(erreur);
        }
      }
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
        autocollants: autocollants.map(({ numero, urlPublique }) => ({
          numero,
          urlPublique,
        })),
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
  serie: z.string().trim().min(1).max(60),
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
    const publique = z.string().max(500).url().parse(url);
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
  exiger(
    new Set(valeurs.map((v) => v.urlPublique)).size === valeurs.length,
    "Le CSV contient des URL QR en double.",
    409,
  );
  let existant = false;
  const cles = valeurs.map((v) => cleIdentiteAutocollant(v.numero, d.serie));
  const urls = valeurs.map((v) => v.urlPublique);
  for (let i = 0; i < cles.length; i += 500) {
    if (
      await db.autocollant.findFirst({
        where: { cleIdentite: { in: cles.slice(i, i + 500) } },
        select: { id: true },
      })
    ) {
      existant = true;
      break;
    }
  }
  for (let i = 0; !existant && i < urls.length; i += 500) {
    if (
      await db.autocollant.findFirst({
        where: { urlPublique: { in: urls.slice(i, i + 500) } },
        select: { id: true },
      })
    ) {
      existant = true;
      break;
    }
  }
  exiger(
    !existant,
    "Un numéro/série ou une URL QR existe déjà. Aucun autocollant n’a été importé.",
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
      for (let i = 0; i < urls.length; i += 500) {
        const collisionUrl = await tx.autocollant.findFirst({
          where: { urlPublique: { in: urls.slice(i, i + 500) } },
          select: { id: true },
        });
        exiger(!collisionUrl, "Une URL QR a déjà été importée.", 409);
      }
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
      for (let i = 0; i < valeurs.length; i += 500) {
        try {
          await tx.autocollant.createMany({
            data: valeurs.slice(i, i + 500).map((v) => ({
              ...v,
              cleIdentite: cleIdentiteAutocollant(v.numero, d.serie),
              jeton: randomBytes(24).toString("hex"),
              lotId: lot.id,
              siteId: site.id,
              geographieId: d.geographieId,
              typeAutocollant: d.typeAutocollant,
            })),
          });
        } catch (erreur) {
          erreurCreationAutocollant(erreur);
        }
      }
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
  const trouve = await trouverAutocollantParIdentifiant(db, jeton, true);
  exiger(trouve, "Autocollant introuvable.", 404);
  const qr = await db.autocollant.findUniqueOrThrow({
    where: { id: trouve.id },
    include: {
      lot: true,
      attribution: { include: { assujetti: { include: { moto: true } } } },
    },
  });
  exiger(qr, "Autocollant introuvable.", 404);
  const attr = qr.attribution,
    a = attr?.assujetti;
  // Liste blanche explicite : aucune adresse, finance, pièce, session ou compte.
  return {
    autocollantId: qr.id,
    numeroAutocollant: afficherNumeroAutocollant(qr.numero, qr.lot?.serie),
    numeroQR: qr.numero,
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
