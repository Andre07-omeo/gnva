export const PERMISSIONS = [
  "ASSUJETTI_CREER",
  "ASSUJETTI_MODIFIER",
  "ASSUJETTI_SUPPRIMER",
  "ASSUJETTI_CONSULTER",
  "AUTOCOLLANT_CREER",
  "AUTOCOLLANT_ATTRIBUER",
  "AUTOCOLLANT_CONSULTER",
  "RECOUVREMENT_CREER",
  "RECOUVREMENT_VALIDER",
  "RECOUVREMENT_CONSULTER",
  "RAPPORT_CONSULTER",
  "RAPPORT_EXPORTER",
  "RAPPORT_IMPRIMER",
  "UTILISATEUR_CREER",
  "UTILISATEUR_MODIFIER",
  "UTILISATEUR_SUSPENDRE",
  "PARAMETRE_MODIFIER",
  "GEOGRAPHIE_GERER",
  "SITE_GERER",
  "AUDIT_CONSULTER",
  "VOL_DECLARER",
] as const;
export const ROLES: Record<
  string,
  { nom: string; permissions: readonly string[] }
> = {
  SUPER_ADMIN: { nom: "Super administrateur", permissions: PERMISSIONS },
  ADMIN_NATIONAL: { nom: "Administrateur national", permissions: PERMISSIONS },
  ADMIN_PROVINCIAL: {
    nom: "Administrateur provincial",
    permissions: PERMISSIONS.filter(
      (p) => !["PARAMETRE_MODIFIER", "GEOGRAPHIE_GERER"].includes(p),
    ),
  },
  ADMIN_ZONE: {
    nom: "Administrateur de zone",
    permissions: [
      "ASSUJETTI_CONSULTER",
      "UTILISATEUR_CREER",
      "UTILISATEUR_MODIFIER",
      "SITE_GERER",
      "RAPPORT_CONSULTER",
      "RAPPORT_EXPORTER",
      "AUDIT_CONSULTER",
    ],
  },
  MONITEUR_NATIONAL: {
    nom: "Moniteur national",
    permissions: [
      "ASSUJETTI_CONSULTER",
      "AUTOCOLLANT_CONSULTER",
      "RECOUVREMENT_CREER",
      "RECOUVREMENT_VALIDER",
      "RECOUVREMENT_CONSULTER",
      "RAPPORT_CONSULTER",
      "RAPPORT_EXPORTER",
      "RAPPORT_IMPRIMER",
    ],
  },
  MONITEUR_PROVINCIAL: {
    nom: "Moniteur provincial",
    permissions: [
      "ASSUJETTI_CONSULTER",
      "AUTOCOLLANT_CONSULTER",
      "RAPPORT_CONSULTER",
      "RAPPORT_EXPORTER",
      "RAPPORT_IMPRIMER",
    ],
  },
  AGENT: {
    nom: "Agent de terrain",
    permissions: [
      "ASSUJETTI_CREER",
      "ASSUJETTI_CONSULTER",
      "AUTOCOLLANT_ATTRIBUER",
      "AUTOCOLLANT_CONSULTER",
      "RAPPORT_CONSULTER",
      "RAPPORT_IMPRIMER",
    ],
  },
};
