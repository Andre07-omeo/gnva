import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

// Ce serveur de recette ne lance jamais le seed des administrateurs métier.
const nom = `gnva_recette_${process.pid}`;
const dossier = mkdtempSync(path.join(tmpdir(), "gnva-recette-"));
const compilation = `.next-recette-${process.pid}`;
const declarations = readFileSync("next-env.d.ts", "utf8");
const port = process.argv[2] ?? "3101";
const env = {
  ...process.env,
  MYSQL_DATABASE_URL: `mysql://root@127.0.0.1:3307/${nom}`,
  UPLOAD_DIR: dossier,
  STORAGE_MODE: "local",
  GNVA_TEST_DIST_DIR: compilation,
  PORT: port,
};
const sql = (commande) => {
  const r = spawnSync(
    "mysql",
    ["--no-defaults", "-h127.0.0.1", "-P3307", "-uroot", "-e", commande],
    { stdio: "inherit" },
  );
  if (r.status !== 0) throw new Error("MySQL local indisponible.");
};
let cree = false,
  serveur,
  nettoyage = false;
function nettoyer() {
  if (nettoyage) return;
  nettoyage = true;
  try {
    if (cree) sql(`DROP DATABASE ${nom}`);
  } finally {
    rmSync(dossier, { recursive: true, force: true });
    rmSync(compilation, { recursive: true, force: true });
    // Next ajoute ses types au tsconfig et réécrit next-env au démarrage.
    // Retirer seulement les chemins de cette instance, pas d'autres éditions.
    const config = JSON.parse(readFileSync("tsconfig.json", "utf8"));
    config.include = config.include.filter(
      (v) => !v.startsWith(`${compilation}/`),
    );
    writeFileSync("tsconfig.json", `${JSON.stringify(config, null, 2)}\n`);
    const courant = readFileSync("next-env.d.ts", "utf8");
    if (courant.includes(compilation))
      writeFileSync("next-env.d.ts", declarations);
  }
}
try {
  sql(
    `CREATE DATABASE ${nom} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
  );
  cree = true;
  for (const args of [
    ["exec", "prisma", "migrate", "deploy"],
    ["exec", "tsx", "tests/recette-fixtures.ts"],
  ]) {
    if (spawnSync("pnpm", args, { env, stdio: "inherit" }).status !== 0)
      throw new Error("Préparation de la recette impossible.");
  }
  writeFileSync(
    path.join(dossier, "contexte.json"),
    JSON.stringify({
      base: nom,
      photos: dossier,
      url: `http://127.0.0.1:${port}`,
    }),
  );
  console.log(`RECETTE_CONTEXTE=${path.join(dossier, "contexte.json")}`);
  serveur = spawn(
    process.execPath,
    [
      "node_modules/next/dist/bin/next",
      "dev",
      "--hostname",
      "0.0.0.0",
      "--port",
      port,
    ],
    { env, stdio: "inherit", detached: true },
  );
  for (const signal of ["SIGTERM", "SIGINT"])
    process.on(signal, () => process.kill(-serveur.pid, signal));
  serveur.on("exit", (code) => {
    nettoyer();
    process.exit(code ?? 0);
  });
} catch (e) {
  nettoyer();
  throw e;
}
