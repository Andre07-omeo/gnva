import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
const nom = `gnva_test_${process.pid}`,
  photos = mkdtempSync(path.join(tmpdir(), "gnva-tests-"));
const env = {
  ...process.env,
  MYSQL_DATABASE_URL: `mysql://root@127.0.0.1:3307/${nom}`,
  UPLOAD_DIR: photos,
  STORAGE_MODE: "local",
};
// Uniquement le MySQL loopback de développement. Aucune base externe/production.
const sql = (commande) =>
  spawnSync(
    "mysql",
    ["--no-defaults", "-h127.0.0.1", "-P3307", "-uroot", "-e", commande],
    { stdio: "inherit" },
  );
let statut = 1,
  cree = false;
try {
  if (
    sql(
      `CREATE DATABASE ${nom} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
    ).status !== 0
  )
    throw new Error(
      "Démarrez GNVA en développement avant de lancer les tests MySQL.",
    );
  cree = true;
  const migration = spawnSync("pnpm", ["exec", "prisma", "migrate", "deploy"], {
    env,
    stdio: "inherit",
  });
  if (migration.status !== 0)
    throw new Error("Migration de la base de test impossible.");
  statut =
    spawnSync("pnpm", ["exec", "tsx", "--test", "tests/metier.test.ts"], {
      env,
      stdio: "inherit",
    }).status ?? 1;
} finally {
  if (cree) sql(`DROP DATABASE ${nom}`);
  rmSync(photos, { recursive: true, force: true });
}
process.exit(statut);
