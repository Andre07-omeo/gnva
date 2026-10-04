export function afficherNumeroAutocollant(numero: unknown, serie: unknown) {
  if (numero === null || numero === undefined || String(numero).trim() === "")
    return "—";
  const valeur = String(numero);
  const libelleSerie = String(serie ?? "").trim();
  return libelleSerie ? `${valeur}/${libelleSerie}` : valeur;
}