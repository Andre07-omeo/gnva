import { cpSync, existsSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const racine = resolve(__dirname, "..");

const sourceStatic = resolve(racine, ".next/static");
const sourcePublic = resolve(racine, "public");

// Attention : le chemin du standalone varie selon l'emplacement du workspace dans le monorepo.
// Pour un monorepo pnpm, Next.js reproduit la structure : standalone/artifacts/gnva/.next/static
const destStatic = resolve(
  racine,
  ".next/standalone/artifacts/gnva/.next/static"
);
const destPublic = resolve(racine, ".next/standalone/artifacts/gnva/public");

function copier(source, destination, nom) {
  if (!existsSync(source)) {
    console.warn(`⚠️  ${nom} introuvable : ${source}`);
    return;
  }

  mkdirSync(dirname(destination), { recursive: true });

  try {
    cpSync(source, destination, { recursive: true, force: true });
    console.log(`✅ ${nom} copié vers ${destination}`);
  } catch (err) {
    console.error(`❌ Erreur copie ${nom} :`, err.message);
    process.exit(1);
  }
}

console.log("📦 Copie des assets statiques dans le standalone...");
copier(sourceStatic, destStatic, ".next/static");
copier(sourcePublic, destPublic, "public");
console.log("✨ Terminé.");