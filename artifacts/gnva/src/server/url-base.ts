import type { NextRequest } from "next/server";
import { exiger } from "./erreurs";

export function urlBase(req: NextRequest) {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, "");
  exiger(
    process.env.NODE_ENV !== "production",
    "APP_URL doit désigner votre URL HTTPS publique en production.",
    503,
  );
  const host =
    req.headers.get("x-forwarded-host") ??
    req.headers.get("host") ??
    new URL(req.url).host;
  const proto =
    req.headers.get("x-forwarded-proto") ??
    new URL(req.url).protocol.replace(":", "");
  return `${proto}://${host}`;
}
