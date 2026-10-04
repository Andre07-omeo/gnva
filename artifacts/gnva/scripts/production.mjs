import { spawn } from "node:child_process";
if (!process.env.MYSQL_DATABASE_URL)
  throw new Error(
    "MYSQL_DATABASE_URL est obligatoire en production. Aucune base temporaire ne sera créée.",
  );
if (!process.env.SESSION_SECRET || !process.env.APP_URL?.startsWith("https://"))
  throw new Error(
    "SESSION_SECRET et APP_URL (HTTPS) sont obligatoires en production.",
  );
const serveur = spawn(
  "pnpm",
  [
    "exec",
    "next",
    "start",
    "--hostname",
    "0.0.0.0",
    "--port",
    process.env.PORT ?? "3000",
  ],
  { stdio: "inherit" },
);
for (const signal of ["SIGTERM", "SIGINT"])
  process.on(signal, () => serveur.kill(signal));
serveur.on("exit", (code) => process.exit(code ?? 1));
