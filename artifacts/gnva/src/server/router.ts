import { NextRequest, after } from "next/server";
import { db } from "./db";
import {
  contexte,
  connexion,
  changerMotDePasse,
  utilisateurPublic,
  verifierOrigine,
  limiter,
  auditer,
} from "./contexte";
import { ErreurMetier, erreurHttp, exiger, json } from "./erreurs";
import { references, lister } from "./lecture";
import { creerAdministration, modifierAdministration } from "./administration";
import {
  creerAssujetti,
  modifierAssujetti,
  archiverAssujetti,
  declarerVol,
  doublons,
} from "./assujettis";
import {
  attribuerAutocollant,
  generer,
  importer,
  publicAutocollant,
} from "./autocollants";
import {
  creerRecouvrement,
  validerRecouvrement,
  responsablesRecouvrement,
} from "./finances";
import { tableauDeBord, exporter } from "./rapports";
import { televerserPhoto, lirePhoto } from "./photos";
import { imageQR, imprimer } from "./impression";
import {
  configurationPush,
  abonnerPush,
  partagerPosition,
  positions,
  livrerPush,
} from "./notifications";
import { fluxNotifications } from "./temps-reel";
import { imprimerRapport } from "./rapport-imprimable";

async function bornerCorps(req: NextRequest, max: number) {
  if (!req.body || ["GET", "HEAD"].includes(req.method)) return req;
  const lecteur = req.body.getReader(),
    morceaux: Uint8Array[] = [];
  let taille = 0;
  while (true) {
    const { done, value } = await lecteur.read();
    if (done) break;
    taille += value.byteLength;
    if (taille > max) {
      await lecteur.cancel();
      throw new ErreurMetier(413, "Le contenu dépasse la taille autorisée.");
    }
    morceaux.push(value);
  }
  return new NextRequest(req.url, {
    method: req.method,
    headers: req.headers,
    body: new Uint8Array(Buffer.concat(morceaux)).buffer,
  });
}
export async function traiter(requete: NextRequest, segments: string[]) {
  try {
    const req = await bornerCorps(
      requete,
      segments[0] === "photos" ? 6 * 1024 * 1024 : 3 * 1024 * 1024,
    );
    const [module, id, action] = segments;
    const get = req.method === "GET",
      post = req.method === "POST";
    if (module === "health" && get) {
      await db.$queryRaw`SELECT 1`;
      return json({ status: "ok", base: "mysql" });
    }
    if (module === "auth" && id === "connexion" && post)
      return await connexion(req);
    if (
      module === "auth" &&
      id === "session" &&
      get &&
      !req.cookies.get("gnva_session")
    )
      return json({ utilisateur: null });
    if (get && module === "photos" && id) return await lirePhoto(id);
    if (get && module === "public" && id) {
      await limiter(
        `public:${req.headers.get("x-forwarded-for") ?? "local"}`,
        60,
      );
      return json(await publicAutocollant(id));
    }
    if (get && module === "qr" && id) {
      await limiter(`qr:${req.headers.get("x-forwarded-for") ?? "local"}`, 200);
      return await imageQR(req, id);
    }
    let ctx;
    try {
      ctx = await contexte(req, module === "auth");
    } catch (e) {
      if (
        module === "auth" &&
        id === "session" &&
        e instanceof ErreurMetier &&
        e.statut === 401
      ) {
        const r = json({ utilisateur: null });
        r.cookies.delete("gnva_session");
        r.cookies.delete("gnva_csrf");
        return r;
      }
      throw e;
    }
    if (module === "auth") {
      if (id === "session" && get)
        return json({ utilisateur: utilisateurPublic(ctx.utilisateur) });
      if (id === "mot-de-passe" && post)
        return json(await changerMotDePasse(ctx));
      if (id === "deconnexion" && post) {
        await db.session.update({
          where: { id: ctx.sessionId },
          data: { revokedAt: new Date() },
        });
        await db.$transaction((tx) =>
          auditer(
            tx,
            ctx,
            "DECONNEXION",
            "auth",
            ctx.utilisateur.id,
            ctx.utilisateur.siteId ?? undefined,
          ),
        );
        const r = json({ message: "Déconnecté." });
        r.cookies.delete("gnva_session");
        r.cookies.delete("gnva_csrf");
        return r;
      }
      throw new ErreurMetier(404, "Route d’authentification inconnue.");
    }
    if (!get) {
      verifierOrigine(req);
      after(async () => livrerPush());
    }
    const q = req.nextUrl.searchParams;
    if (get && module === "references") return json(await references(ctx));
    if (get && module === "recouvrements" && id === "responsables" && action)
      return json(await responsablesRecouvrement(ctx, action));
    if (get && module === "notifications-stream") return fluxNotifications(ctx);
    if (get && module === "tableau-de-bord")
      return json(
        await tableauDeBord(ctx, q, { moniteurNationalToutPays: true }),
      );
    if (get && module === "positions") return json(await positions(ctx));
    if (post && module === "position")
      return json(await partagerPosition(ctx, await req.json()));
    if (get && module === "push" && id === "config")
      return json(configurationPush());
    if (post && module === "push" && id === "abonnement")
      return json(await abonnerPush(ctx, await req.json()));
    if (get && module === "exports" && id) return await exporter(ctx, id, q);
    if (get && module === "impression" && id === "rapport")
      return await imprimerRapport(ctx, q);
    if (get && module === "impression" && id && action)
      return await imprimer(ctx, id, action);
    if (get && module === "recherche-ticket" && id) {
      const a = await db.assujetti.findUnique({
        where: { reference: id },
        select: { id: true },
      });
      exiger(a, "Ticket introuvable.", 404);
      return json(await lister(ctx, "assujettis", new URLSearchParams(), a.id));
    }
    if (post && module === "photos" && !id)
      return json(await televerserPhoto(ctx), 201);
    if (post && module === "generation-qr")
      return json(await generer(ctx, await req.json()), 201);
    if (post && module === "import-qr")
      return json(await importer(ctx, await req.json()));
    if (post && module === "attributions")
      return json(await attribuerAutocollant(ctx, await req.json()), 201);
    if (post && module === "doublons")
      return json(await doublons(ctx, await req.json()));
    if (post && module === "recouvrements" && id && action === "validation")
      return json(await validerRecouvrement(ctx, id, await req.json()));
    exiger(module, "Module requis.", 404);
    if (get) return json(await lister(ctx, module, q, id));
    if (post && !id) {
      const corps: unknown = await req.json();
      const valeur =
        module === "assujettis"
          ? await creerAssujetti(ctx, corps)
          : module === "recouvrements"
            ? await creerRecouvrement(ctx, corps)
            : module === "vols"
              ? await declarerVol(ctx, corps)
              : await creerAdministration(ctx, module, corps);
      return json(valeur, 201);
    }
    if (req.method === "PATCH" && id) {
      const corps: unknown = await req.json();
      return json(
        module === "assujettis"
          ? await modifierAssujetti(ctx, id, corps)
          : await modifierAdministration(ctx, module, id, corps),
      );
    }
    if (req.method === "DELETE" && id && module === "assujettis")
      return json(await archiverAssujetti(ctx, id));
    throw new ErreurMetier(
      405,
      "Opération non autorisée pour cette ressource.",
    );
  } catch (e) {
    return erreurHttp(e);
  }
}
