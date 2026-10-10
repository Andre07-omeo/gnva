import { Buffer } from "node:buffer";
import { Prisma } from "@prisma/client";
import { normaliser } from "./saisies";
import { exiger } from "./erreurs";

type ClientAutocollants = Pick<Prisma.TransactionClient, "autocollant">;

function champIdentite(valeur: string) {
  const octets = Buffer.from(valeur, "utf8");
  return [
    Buffer.from(`${octets.length.toString().padStart(4, "0")}:`, "ascii"),
    octets,
  ];
}

/** Le numéro contient déjà le préfixe; la série complète l'identifiant affiché. */
export function cleIdentiteAutocollant(numero: string, serie: string) {
  return Buffer.concat([
    ...champIdentite(normaliser(numero)),
    ...champIdentite(serie.trim()),
  ]);
}

export function decomposerNumeroSerie(valeur: string) {
  const separateur = valeur.lastIndexOf("/");
  if (separateur < 0) return null;
  const numero = valeur.slice(0, separateur).trim();
  const serie = valeur.slice(separateur + 1).trim();
  exiger(
    numero.length > 0 && serie.length > 0,
    "Saisissez le numéro complet au format numéro/série.",
  );
  return { numero: normaliser(numero), serie };
}

export async function trouverAutocollantParIdentifiant(
  client: ClientAutocollants,
  valeur: string,
  autoriserNumeroSansSerie = false,
) {
  const identifiant = valeur.trim();
  if (/^https?:\/\//i.test(identifiant)) {
    try {
      const lien = new URL(identifiant);
      const parUrl = await client.autocollant.findFirst({
        where: { urlPublique: identifiant },
        include: { lot: true },
      });
      if (parUrl) return parUrl;
      const jetonGnva = lien.pathname.match(
        /\/autocollant\/([a-f0-9]{48})\/?$/i,
      )?.[1];
      if (jetonGnva) {
        const parJetonUrl = await client.autocollant.findUnique({
          where: { jeton: jetonGnva },
          include: { lot: true },
        });
        if (parJetonUrl) return parJetonUrl;
      }
    } catch {
      // Une URL mal formée sera traitée comme un numéro inconnu.
    }
  }
  const composite = decomposerNumeroSerie(identifiant);
  if (composite)
    return client.autocollant.findFirst({
      where: {
        cleIdentite: cleIdentiteAutocollant(
          composite.numero,
          composite.serie,
        ),
      },
      include: { lot: true },
    });

  const parJeton = await client.autocollant.findUnique({
    where: { jeton: identifiant },
    include: { lot: true },
  });
  if (parJeton) return parJeton;
  const parId = await client.autocollant.findUnique({
    where: { id: identifiant },
    include: { lot: true },
  });
  if (parId || !autoriserNumeroSansSerie) return parId;

  const numeros = await client.autocollant.findMany({
    where: { numero: normaliser(identifiant) },
    include: { lot: true },
    take: 2,
  });
  exiger(numeros.length <= 1, "Précisez le numéro complet avec sa série.", 409);
  return numeros[0] ?? null;
}