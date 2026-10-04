import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { Prisma } from "@prisma/client";
import pino from "pino";
export const journal = pino({
  redact: [
    "password",
    "motDePasse",
    "motDePasseHash",
    "cookie",
    "authorization",
  ],
});
export class ErreurMetier extends Error {
  constructor(
    public statut: number,
    message: string,
  ) {
    super(message);
  }
}
export function exiger(
  condition: unknown,
  message: string,
  statut = 400,
): asserts condition {
  if (!condition) throw new ErreurMetier(statut, message);
}
export function erreurHttp(erreur: unknown) {
  if (erreur instanceof SyntaxError)
    return NextResponse.json(
      { error: "Le contenu de la requête n’est pas un JSON valide." },
      { status: 400 },
    );
  if (erreur instanceof ErreurMetier)
    return NextResponse.json(
      { error: erreur.message },
      { status: erreur.statut },
    );
  if (erreur instanceof ZodError)
    return NextResponse.json(
      {
        error: erreur.issues
          .map((i) => `${i.path.join(".")}: ${i.message}`)
          .join(" · "),
      },
      { status: 400 },
    );
  if (
    erreur instanceof Prisma.PrismaClientKnownRequestError &&
    erreur.code === "P2002"
  )
    return NextResponse.json(
      {
        error:
          "Cette référence existe déjà ou cette opération a déjà été enregistrée.",
      },
      { status: 409 },
    );
  if (
    erreur instanceof Prisma.PrismaClientKnownRequestError &&
    erreur.code === "P2003"
  )
    return NextResponse.json(
      { error: "Référence inconnue ou encore utilisée par un dossier." },
      { status: 409 },
    );
  if (
    erreur instanceof Prisma.PrismaClientKnownRequestError &&
    erreur.code === "P2034"
  )
    return NextResponse.json(
      {
        error:
          "Une opération simultanée a empêché cette écriture. Rechargez les données puis réessayez.",
      },
      { status: 409 },
    );
  journal.error({ err: erreur }, "Échec de la requête GNVA");
  return NextResponse.json(
    { error: "Service indisponible. L’opération n’a pas été confirmée." },
    { status: 503 },
  );
}
export function json(valeur: unknown, statut = 200) {
  return new NextResponse(JSON.stringify(valeur), {
    status: statut,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
