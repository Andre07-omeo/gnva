export const VUES_RAPPORT = [
  { value: "NUMEROS", label: "Numéros attribués / vendus" },
  { value: "PROVINCE", label: "Rapport par province" },
  { value: "COMMUNE", label: "Rapport par commune" },
  { value: "DISTRICT_TERRITOIRE", label: "Rapport par district ou territoire" },
  { value: "JOUR", label: "Rapport par jour" },
  { value: "SITE", label: "Rapport par point de vente / site" },
] as const;
export const PIECES_IDENTITE = [
  { value: "ELECTEUR", label: "Carte d’électeur" },
  { value: "BIOMETRIQUE", label: "Carte biométrique" },
  { value: "PASSEPORT", label: "Passeport" },
  { value: "PERMIS_CONSTRUIRE", label: "Permis de construire" },
] as const;
export function libellePieces(valeur: unknown): string {
  return String(valeur ?? "").split("|").filter(Boolean)
    .map(v => PIECES_IDENTITE.find(p => p.value === v)?.label ?? v).join(", ");
}