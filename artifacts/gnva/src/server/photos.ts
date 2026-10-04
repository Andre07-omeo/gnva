import { randomBytes } from "node:crypto";
import path from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import sharp from "sharp";
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
} from "@aws-sdk/client-s3";
import { db } from "./db";
import { Contexte, autoriser, auditer } from "./contexte";
import { exiger } from "./erreurs";

const dossier = () =>
  path.resolve(
    /*turbopackIgnore: true*/ process.env.UPLOAD_DIR ??
      "public/uploads/assujettis",
  );
async function distant() {
  const config = await db.parametreSysteme.findUnique({
    where: { cle: "stockageMode" },
  });
  const mode =
    typeof config?.valeur === "string"
      ? config.valeur
      : (process.env.STORAGE_MODE ?? "local");
  exiger(
    ["local", "s3"].includes(mode),
    "Mode de stockage non supporté. Configurez local ou s3.",
    503,
  );
  return mode === "s3";
}
function clientS3() {
  exiger(
    process.env.S3_BUCKET && process.env.S3_REGION,
    "Le stockage S3 est incomplet.",
    503,
  );
  return new S3Client({
    region: process.env.S3_REGION,
    endpoint: process.env.S3_ENDPOINT,
    forcePathStyle: !!process.env.S3_ENDPOINT,
  });
}
export async function photoExiste(url: string) {
  const nom = path.basename(url);
  try {
    if (await distant()) {
      await clientS3().send(
        new GetObjectCommand({
          Bucket: process.env.S3_BUCKET,
          Key: `assujettis/${nom}`,
          Range: "bytes=0-0",
        }),
      );
    } else
      await readFile(
        /*turbopackIgnore: true*/ path.join(
          /*turbopackIgnore: true*/ dossier(),
          nom,
        ),
      );
    return true;
  } catch {
    return false;
  }
}
export async function televerserPhoto(ctx: Contexte) {
  autoriser(ctx, "ASSUJETTI_CREER");
  exiger(
    Number(ctx.req.headers.get("content-length") ?? 0) <= 6 * 1024 * 1024,
    "Photo trop volumineuse (maximum 5 Mo).",
    413,
  );
  const form = await ctx.req.formData(),
    fichier = form.get("file");
  exiger(fichier instanceof File, "Sélectionnez une photo.");
  exiger(
    fichier.size > 0 && fichier.size <= 5 * 1024 * 1024,
    "Photo trop volumineuse (maximum 5 Mo).",
    413,
  );
  exiger(
    ["image/jpeg", "image/png", "image/webp"].includes(fichier.type),
    "Formats acceptés : JPEG, PNG ou WebP.",
  );
  const source = Buffer.from(await fichier.arrayBuffer());
  let photo: Buffer;
  try {
    const image = sharp(source, { limitInputPixels: 24_000_000 });
    const meta = await image.metadata();
    exiger(
      ["jpeg", "png", "webp"].includes(meta.format ?? ""),
      "Le contenu du fichier n’est pas une image autorisée.",
    );
    photo = await image
      .rotate()
      .resize({
        width: 1200,
        height: 1200,
        fit: "inside",
        withoutEnlargement: true,
      })
      .jpeg({ quality: 82 })
      .toBuffer();
  } catch {
    exiger(false, "Image illisible ou dimensions excessives.");
  }
  const nom = randomBytes(16).toString("hex") + ".jpg";
  if (await distant())
    await clientS3().send(
      new PutObjectCommand({
        Bucket: process.env.S3_BUCKET,
        Key: `assujettis/${nom}`,
        Body: photo!,
        ContentType: "image/jpeg",
      }),
    );
  else {
    await mkdir(dossier(), { recursive: true });
    await writeFile(path.join(dossier(), nom), photo!);
  }
  await db.$transaction((tx) =>
    auditer(
      tx,
      ctx,
      "PHOTO_TELEVERSEE",
      "photos",
      nom,
      ctx.utilisateur.siteId ?? undefined,
    ),
  );
  return { url: `/api/v1/photos/${nom}` };
}
export async function lirePhoto(nom: string) {
  exiger(/^[a-f0-9]{32}\.jpg$/.test(nom), "Photo introuvable.", 404);
  let image: Uint8Array;
  try {
    if (await distant()) {
      const retour = await clientS3().send(
        new GetObjectCommand({
          Bucket: process.env.S3_BUCKET,
          Key: `assujettis/${nom}`,
        }),
      );
      exiger(retour.Body, "Photo introuvable.", 404);
      image = await retour.Body.transformToByteArray();
    } else
      image = await readFile(
        /*turbopackIgnore: true*/ path.join(
          /*turbopackIgnore: true*/ dossier(),
          nom,
        ),
      );
  } catch {
    exiger(false, "Photo introuvable.", 404);
  }
  return new Response(new Uint8Array(image!).buffer, {
    headers: {
      "Content-Type": "image/jpeg",
      "Cache-Control": "no-store, private, max-age=0",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
