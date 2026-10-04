import sharp from "sharp";
import { mkdir } from "node:fs/promises";
await mkdir("public/icons", { recursive: true });
for (const taille of [32, 48, 180, 192, 512])
  await sharp("public/icons/gnva.svg")
    .resize(taille, taille)
    .png()
    .toFile(`public/icons/icon-${taille}.png`);
await sharp("public/icons/gnva.svg")
  .resize(384, 384)
  .extend({ top: 64, bottom: 64, left: 64, right: 64, background: "#1757aa" })
  .png()
  .toFile("public/icons/maskable-512.png");
