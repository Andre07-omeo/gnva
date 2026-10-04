import { randomBytes } from "node:crypto";
import { z } from "zod";
export const reference = (prefixe: string) =>
  `${prefixe}-${new Date().getUTCFullYear()}-${randomBytes(8).toString("hex").toUpperCase()}`;
export const normaliser = (valeur: string) =>
  valeur.replace(/\s/g, "").toUpperCase();
const identifiant = z.string().min(1).max(30);
const texte = z.string().trim().min(1).max(255);
const option = z
  .string()
  .max(255)
  .optional()
  .transform((v) => v?.trim() || undefined);
export const geographieSaisie = z.object({
  nom: texte,
  code: texte.transform(normaliser),
  niveau: texte,
  parentId: identifiant.optional(),
  actif: z.boolean().optional(),
});
export const siteSaisie = z.object({
  nom: texte,
  code: texte.transform(normaliser),
  geographieId: identifiant,
  adresse: option,
  actif: z.boolean().optional(),
});
export const typeMotoSaisie = z.object({
  nom: texte,
  roues: z.coerce.number().int().min(2).max(20),
  tarif: z.coerce.number().nonnegative().max(1e12).default(0),
  actif: z.boolean().optional(),
});
export const utilisateurSaisie = z.object({
  nom: texte,
  email: z
    .string()
    .email()
    .max(190)
    .transform((v) => v.toLowerCase()),
  motDePasse: z.string().min(12).max(200),
  roleId: identifiant,
  siteId: identifiant.optional(),
  zoneIds: z.array(identifiant).max(100).default([]),
  actif: z.boolean().optional(),
});
export const assujettiSaisie = z
  .object({
    nom: texte,
    postnom: texte,
    prenom: option,
    sexe: z.enum(["M", "F", "HOMME", "FEMME"]),
    naissance: z.string().date().optional(),
    telephone: z.string().trim().min(5).max(32),
    adresse: texte,
    typePiece: option,
    numeroPiece: option,
    photoUrl: z
      .string()
      .regex(
        /^\/api\/v1\/photos\/[a-f0-9]{32}\.jpg$/,
        "Une photo téléversée valide est obligatoire.",
      ),
    siteId: identifiant,
    typeMotoId: identifiant,
    plaque: z.string().trim().max(80).default("").transform(normaliser),
    chassis: z
      .string()
      .regex(
        /^[A-Za-z0-9]{10,100}$/,
        "Châssis : au moins 10 caractères alphanumériques sans espace.",
      )
      .optional(),
    moteur: z
      .string()
      .regex(
        /^[A-Za-z0-9]{5,100}$/,
        "Moteur : au moins 5 caractères alphanumériques sans espace.",
      )
      .optional(),
    marque: option,
    couleur: option,
  })
  .superRefine((d, c) => {
    if ([d.plaque, d.chassis, d.moteur].filter(Boolean).length < 2)
      c.addIssue({
        code: "custom",
        path: ["chassis"],
        message:
          "Renseignez au moins deux identifiants parmi plaque, châssis et moteur.",
      });
  });
export const recouvrementSaisie = z
  .object({
    siteId: identifiant,
    utilisateurConcerneId: identifiant.optional(),
    moniteurId: identifiant.optional(),
    montant: z.coerce.number().positive().max(1e12),
    debut: z.string().date(),
    fin: z.string().date(),
    commentaire: option,
  })
  .refine((v) => v.debut <= v.fin, {
    message: "La période de fin doit être après le début.",
  });
export const tarifSaisie = z.object({
  nom: texte,
  typeMotoId: identifiant,
  geographieId: identifiant.optional(),
  montant: z.coerce.number().nonnegative().max(1e12),
  debut: z.string().date(),
  fin: z.string().date().optional(),
  actif: z.boolean().optional(),
});
export const inclureAssujetti = {
  site: { include: { geographie: true } },
  moto: { include: { typeMoto: true } },
  attributions: { include: { autocollant: true } },
} as const;
export function aplatirAssujetti<T extends { moto?: unknown }>(d: T) {
  return {
    ...d,
    ...(typeof d.moto === "object" && d.moto !== null
      ? Object.fromEntries(
          Object.entries(d.moto).filter(
            ([k]) => !["id", "assujettiId"].includes(k),
          ),
        )
      : {}),
  };
}
