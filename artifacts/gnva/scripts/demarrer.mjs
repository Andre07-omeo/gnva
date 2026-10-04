import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import net from "node:net";

const racine = process.cwd();
const donnees = path.resolve(racine, "../../.local/gnva-mysql");
const portMysql = 3307;
const sousWindows = process.platform === "win32";
let mysql;

function commandeSynchrone(nom, args, options = {}) {
  const resultat = spawnSync(nom, args, {
    stdio: "inherit",
    env: process.env,
    ...(sousWindows && nom === "pnpm" ? { shell: true } : {}),
    ...options,
  });
  if (resultat.error) {
    const aide =
      nom === "mysqld" || nom === "mysql" || nom === "mysqladmin"
        ? "Installez MySQL 8.4 et ajoutez son dossier bin au PATH, ou définissez MYSQL_DATABASE_URL vers une base de développement locale."
        : "Vérifiez que pnpm est installé et accessible dans PATH.";
    throw new Error(`Impossible de lancer ${nom} : ${resultat.error.message}. ${aide}`);
  }
  return resultat;
}

// MySQL local ne fonctionne qu'en développement, sur l'interface loopback.
// La production exige explicitement MYSQL_DATABASE_URL pour une base persistante.
if (!process.env.MYSQL_DATABASE_URL) {
  mkdirSync(donnees, { recursive: true });
  if (!existsSync(path.join(donnees, "mysql"))) {
    const initialisation = commandeSynchrone(
      "mysqld",
      ["--no-defaults", "--initialize-insecure", `--datadir=${donnees}`],
    );
    if (initialisation.status !== 0)
      throw new Error(`L'initialisation de MySQL local a échoué (code ${initialisation.status}).`);
  }
  const ouvert = await new Promise((resolve) => {
    const socket = net.connect(portMysql, "127.0.0.1");
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("error", () => resolve(false));
  });
  if (!ouvert) {
    mysql = spawn(
      "mysqld",
      [
        "--no-defaults",
        `--datadir=${donnees}`,
        `--port=${portMysql}`,
        "--bind-address=127.0.0.1",
        `--socket=${donnees}/mysql.sock`,
        `--pid-file=${donnees}/mysql.pid`,
        "--mysqlx=0",
        "--innodb-buffer-pool-size=64M",
        "--max-connections=40",
        "--performance-schema=OFF",
      ],
      { stdio: "inherit" },
    );
    mysql.on("error", (erreur) => {
      console.error(
        `Impossible de démarrer MySQL local : ${erreur.message}. Installez MySQL 8.4 et ajoutez son dossier bin au PATH, ou définissez MYSQL_DATABASE_URL vers une base de développement locale.`,
      );
      process.exit(1);
    });
    let pret = false;
    for (let i = 0; i < 60; i++) {
      await new Promise((r) => setTimeout(r, 500));
      const p = commandeSynchrone(
        "mysqladmin",
        ["--no-defaults", "-h127.0.0.1", `-P${portMysql}`, "-uroot", "ping"],
        { stdio: "ignore" },
      );
      if (p.status === 0) {
        pret = true;
        break;
      }
    }
    if (!pret) throw new Error("Le serveur MySQL local ne répond pas.");
  }
  const creation = commandeSynchrone(
    "mysql",
    [
      "--no-defaults",
      "-h127.0.0.1",
      `-P${portMysql}`,
      "-uroot",
      "-e",
      "CREATE DATABASE IF NOT EXISTS gnva CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci",
    ],
  );
  if (creation.status !== 0)
    throw new Error(`La création de la base locale a échoué (code ${creation.status}).`);
  process.env.MYSQL_DATABASE_URL = `mysql://root@127.0.0.1:${portMysql}/gnva`;
}
for (const args of [
  ["exec", "prisma", "generate"],
  ["exec", "prisma", "migrate", "deploy"],
  ["run", "db:seed"],
]) {
  const resultat = commandeSynchrone("pnpm", args);
  if (resultat.status !== 0)
    throw new Error(`La commande pnpm ${args.join(" ")} a échoué (code ${resultat.status}).`);
}
const portApp = process.env.PORT ?? "3000";
if (!/^\d{1,5}$/.test(portApp) || Number(portApp) < 1 || Number(portApp) > 65535)
  throw new Error("PORT doit être un numéro de port compris entre 1 et 65535.");
const next = spawn(
  "pnpm",
  [
    "exec",
    "next",
    "dev",
    "--hostname",
    "0.0.0.0",
    "--port",
    portApp,
  ],
  {
    stdio: "inherit",
    env: process.env,
    ...(sousWindows ? { shell: true } : {}),
  },
);
next.on("error", (erreur) => {
  console.error(`Impossible de lancer Next.js via pnpm : ${erreur.message}`);
  mysql?.kill();
  process.exit(1);
});
for (const signal of ["SIGTERM", "SIGINT"])
  process.on(signal, () => {
    next.kill(signal);
    mysql?.kill(signal);
  });
next.on("exit", (code) => {
  mysql?.kill();
  process.exit(code ?? 1);
});
