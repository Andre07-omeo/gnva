import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import net from "node:net";

const racine = process.cwd();
const donnees = path.resolve(racine, "../../.local/gnva-mysql");
const portMysql = 3307;
let mysql;
// MySQL local ne fonctionne qu'en développement, sur l'interface loopback.
// La production exige explicitement MYSQL_DATABASE_URL pour une base persistante.
if (!process.env.MYSQL_DATABASE_URL) {
  mkdirSync(donnees, { recursive: true });
  if (!existsSync(path.join(donnees, "mysql"))) {
    const initialisation = spawnSync(
      "mysqld",
      ["--no-defaults", "--initialize-insecure", `--datadir=${donnees}`],
      { stdio: "inherit" },
    );
    if (initialisation.status !== 0) process.exit(1);
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
    let pret = false;
    for (let i = 0; i < 60; i++) {
      await new Promise((r) => setTimeout(r, 500));
      const p = spawnSync(
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
  const creation = spawnSync(
    "mysql",
    [
      "--no-defaults",
      "-h127.0.0.1",
      `-P${portMysql}`,
      "-uroot",
      "-e",
      "CREATE DATABASE IF NOT EXISTS gnva CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci",
    ],
    { stdio: "inherit" },
  );
  if (creation.status !== 0) process.exit(1);
  process.env.MYSQL_DATABASE_URL = `mysql://root@127.0.0.1:${portMysql}/gnva`;
}
for (const args of [
  ["exec", "prisma", "generate"],
  ["exec", "prisma", "migrate", "deploy"],
  ["run", "db:seed"],
]) {
  const resultat = spawnSync("pnpm", args, {
    stdio: "inherit",
    env: process.env,
  });
  if (resultat.status !== 0) process.exit(1);
}
const next = spawn(
  "pnpm",
  [
    "exec",
    "next",
    "dev",
    "--hostname",
    "0.0.0.0",
    "--port",
    process.env.PORT ?? "3000",
  ],
  { stdio: "inherit", env: process.env },
);
for (const signal of ["SIGTERM", "SIGINT"])
  process.on(signal, () => {
    next.kill(signal);
    mysql?.kill(signal);
  });
next.on("exit", (code) => {
  mysql?.kill();
  process.exit(code ?? 1);
});
