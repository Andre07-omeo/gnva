type Zone = { id: string; nom: string; code: string; niveau: string; parentId?: string | null };
export const normaliserTerritoire = (v: string) =>
  v.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toUpperCase();
export const estKinshasa = (g: Pick<Zone, "nom" | "code">) =>
  ["KIN", "KINSHASA"].includes(normaliserTerritoire(g.code)) ||
  normaliserTerritoire(g.nom) === "KINSHASA";
export function provinceDe(g: Zone, zones: Zone[]): Zone | undefined {
  const visites = new Set<string>();
  let courant: Zone | undefined = g;
  while (courant && !visites.has(courant.id)) {
    visites.add(courant.id);
    if (normaliserTerritoire(courant.niveau) === "PROVINCE") return courant;
    courant = zones.find(p => p.id === courant?.parentId);
  }
}
export function zonesDuRole(code: string, zones: Zone[]) {
  if (["ADMIN_PROVINCIAL", "MONITEUR_PROVINCIAL"].includes(code))
    return zones.filter(g => normaliserTerritoire(g.niveau) === "PROVINCE");
  return zones;
}