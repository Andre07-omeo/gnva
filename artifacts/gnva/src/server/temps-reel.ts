import { Contexte } from "./contexte";
import { db } from "./db";
export function fluxNotifications(ctx: Contexte) {
  const enc = new TextEncoder();
  let intervalle: ReturnType<typeof setInterval> | undefined,
    ferme = false,
    occupe = false;
  let depuis = new Date();
  const flux = new ReadableStream({
    start(controleur) {
      controleur.enqueue(enc.encode(": connexion GNVA\n\n"));
      const terminer = () => {
        if (ferme) return;
        ferme = true;
        if (intervalle) clearInterval(intervalle);
        controleur.close();
      };
      ctx.req.signal.addEventListener("abort", terminer, { once: true });
      intervalle = setInterval(async () => {
        if (ferme || occupe) return;
        occupe = true;
        try {
          const session = await db.session.findUnique({
            where: { id: ctx.sessionId },
            include: { utilisateur: { include: { site: true } } },
          });
          if (
            !session ||
            session.revokedAt ||
            session.expiresAt < new Date() ||
            !session.utilisateur.actif ||
            session.utilisateur.site?.actif === false
          ) {
            terminer();
            return;
          }
          const notifications = await db.notification.findMany({
            where: {
              utilisateurId: ctx.utilisateur.id,
              createdAt: { gt: depuis },
            },
            orderBy: { createdAt: "asc" },
            take: 100,
          });
          for (const n of notifications) {
            controleur.enqueue(
              enc.encode(
                `event: notification\ndata: ${JSON.stringify({ id: n.id, titre: n.titre })}\n\n`,
              ),
            );
            depuis = n.createdAt;
          }
          controleur.enqueue(enc.encode(": maintien connexion\n\n"));
        } catch {
          terminer();
        } finally {
          occupe = false;
        }
      }, 15000);
    },
    cancel() {
      ferme = true;
      if (intervalle) clearInterval(intervalle);
    },
  });
  return new Response(flux, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-store",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
