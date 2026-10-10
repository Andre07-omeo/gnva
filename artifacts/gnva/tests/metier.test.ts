import test from "node:test";
import assert from "node:assert/strict";
import { hash } from "@node-rs/argon2";
import { NextRequest } from "next/server";
import sharp from "sharp";
import { db } from "../src/server/db";
import { PERMISSIONS, ROLES } from "../src/server/permissions";
import {
  contexte,
  connexion,
  empreinte,
  autoriser,
  changerMotDePasse,
  type Contexte,
} from "../src/server/contexte";
import {
  creerAdministration,
  modifierAdministration,
} from "../src/server/administration";
import {
  creerAssujetti,
  modifierAssujetti,
  archiverAssujetti,
  declarerVol,
  doublons,
} from "../src/server/assujettis";
import {
  generer,
  attribuerAutocollant,
  publicAutocollant,
  importer,
} from "../src/server/autocollants";
import {
  creerRecouvrement,
  validerRecouvrement,
  responsablesRecouvrement,
} from "../src/server/finances";
import { imprimerRapport } from "../src/server/rapport-imprimable";
import { lister, references } from "../src/server/lecture";
import { tableauDeBord, exporter } from "../src/server/rapports";
import { televerserPhoto } from "../src/server/photos";
import { imageQR, imprimer } from "../src/server/impression";
import {
  partagerPosition,
  positions,
  configurationPush,
} from "../src/server/notifications";
import { traiter } from "../src/server/router";
import { assujettiSaisie, normaliser } from "../src/server/saisies";
import { ErreurMetier } from "../src/server/erreurs";

const rejet = async (p: Promise<unknown>, texte?: RegExp) =>
  texte ? assert.rejects(p, texte) : assert.rejects(p);
const page = (d: unknown) => d as { elements: unknown[]; total: number };
const req = (chemin: string, corps?: unknown, headers?: HeadersInit) =>
  new NextRequest(`http://localhost/api/v1/${chemin}`, {
    method: corps === undefined ? "GET" : "POST",
    headers,
    body: corps === undefined ? undefined : JSON.stringify(corps),
  });

test("GNVA : MySQL isolé, contrats et invariants métier", async (t) => {
  assert.match(
    new URL(process.env.MYSQL_DATABASE_URL ?? "").pathname,
    /^\/gnva_test_[0-9]+$/,
  );
  const mdp = "Mot-de-passe-Test-2026";
  try {
    for (const code of PERMISSIONS)
      await db.permission.create({ data: { code, nom: code } });
    for (const [code, r] of Object.entries(ROLES))
      await db.role.create({
        data: {
          code,
          nom: r.nom,
          permissions: {
            create: r.permissions.map((permissionCode) => ({ permissionCode })),
          },
        },
      });
    const compte = async (
      nom: string,
      roleCode: string,
      siteId?: string,
      zoneIds: string[] = [],
      extra: string[] = [],
    ) => {
      const role = await db.role.findUniqueOrThrow({
        where: { code: roleCode },
      });
      return db.utilisateur.create({
        data: {
          nom,
          email: `${nom}@test.invalid`,
          roleId: role.id,
          siteId,
          motDePasseHash: await hash(mdp),
          changementRequis: false,
          porteeNationale: roleCode === "MONITEUR_NATIONAL",
          ...(extra.length
            ? {
                permissionsPersonnalisees: [
                  ...ROLES[roleCode].permissions,
                  ...extra,
                ],
              }
            : {}),
          zones: { create: zoneIds.map((geographieId) => ({ geographieId })) },
        },
      });
    };
    const connecter = async (email: string) => {
      const r = await connexion(
        req("auth/connexion", { email, motDePasse: mdp }),
      );
      const session = r.cookies.get("gnva_session")!.value,
        csrf = r.cookies.get("gnva_csrf")!.value;
      const headers = {
        cookie: `gnva_session=${session}; gnva_csrf=${csrf}`,
        "x-csrf-token": csrf,
      };
      return {
        ctx: await contexte(req("references", undefined, headers)),
        headers,
      };
    };
    const root = await compte("root", "SUPER_ADMIN");
    const { ctx: admin } = await connecter(root.email);
    await creerAdministration(admin, "geographies", {
      nom: "Région test A",
      code: "TEST_A",
      niveau: "PROVINCE",
    });
    await creerAdministration(admin, "geographies", {
      nom: "Région test B",
      code: "TEST_B",
      niveau: "PROVINCE",
    });
    const ga = await db.geographie.findUniqueOrThrow({
      where: { code: "TEST_A" },
    });
    const gb = await db.geographie.findUniqueOrThrow({
      where: { code: "TEST_B" },
    });
    await creerAdministration(admin, "geographies", {
      nom: "Commune test",
      code: "TEST_COMMUNE",
      niveau: "COMMUNE",
      parentId: ga.id,
    });
    const commune = await db.geographie.findUniqueOrThrow({
      where: { code: "TEST_COMMUNE" },
    });
    for (const [code, geographieId] of [
      ["SITE_A", commune.id],
      ["SITE_B", ga.id],
      ["SITE_C", gb.id],
    ])
      await creerAdministration(admin, "sites", {
        nom: code,
        code,
        geographieId,
      });
    const sa = await db.site.findUniqueOrThrow({ where: { code: "SITE_A" } });
    const sb = await db.site.findUniqueOrThrow({ where: { code: "SITE_B" } });
    const sc = await db.site.findUniqueOrThrow({ where: { code: "SITE_C" } });
    await creerAdministration(admin, "types-moto", {
      nom: "Type test",
      roues: 2,
      tarif: 100,
    });
    const type = await db.typeMoto.findFirstOrThrow();
    const agent = await compte(
      "agent",
      "AGENT",
      sa.id,
      [],
      ["RECOUVREMENT_VALIDER", "VOL_DECLARER"],
    );
    const autre = await compte("autre", "AGENT", sa.id);
    const responsable = await compte(
      "receveur",
      "AGENT",
      sb.id,
      [],
      ["RECOUVREMENT_VALIDER"],
    );
    const provincial = await compte(
      "provincial",
      "ADMIN_PROVINCIAL",
      undefined,
      [ga.id],
    );
    const moniteur = await compte("moniteur", "MONITEUR_NATIONAL");
    const { ctx: ac, headers: ah } = await connecter(agent.email);
    const { ctx: bc } = await connecter(autre.email);
    let { ctx: rc } = await connecter(responsable.email);
    const { ctx: pc } = await connecter(provincial.email);
    const { ctx: mc } = await connecter(moniteur.email);

    await t.test(
      "API : santé, session anonyme, accès protégé et validation des identifiants",
      async () => {
        assert.equal((await traiter(req("health"), ["health"])).status, 200);
        const anonyme = await traiter(req("auth/session"), ["auth", "session"]);
        assert.deepEqual(await anonyme.json(), { utilisateur: null });
        assert.equal(
          (await traiter(req("assujettis"), ["assujettis"])).status,
          401,
        );
        await rejet(
          connexion(
            req("auth/connexion", {
              email: agent.email,
              motDePasse: "incorrect",
            }),
          ),
          /Identifiants/,
        );
        const r = await traiter(req("assujettis", undefined, ah), [
          "assujettis",
        ]);
        assert.equal(r.status, 200);
      },
    );
    await t.test(
      "Arbre territorial, permission et absence d’escalade",
      async () => {
        assert.deepEqual(new Set(pc.siteIds), new Set([sa.id, sb.id]));
        await rejet(
          lister(pc, "assujettis", new URLSearchParams({ siteId: sc.id })),
          /périmètre/,
        );
        assert.throws(() => autoriser(bc, "ASSUJETTI_MODIFIER"), ErreurMetier);
        const role = await db.role.findUniqueOrThrow({
          where: { code: "SUPER_ADMIN" },
        });
        await rejet(
          creerAdministration(pc, "utilisateurs", {
            nom: "interdit",
            email: "interdit@test.invalid",
            motDePasse: mdp,
            roleId: role.id,
          }),
          /attribuer ce rôle/,
        );
        await rejet(
          modifierAdministration(admin, "geographies", ga.id, {
            parentId: commune.id,
          }),
          /boucle/,
        );
        await modifierAdministration(admin, "utilisateurs", responsable.id, {
          permissions: null,
        });
        assert.equal(
          (
            await db.utilisateur.findUniqueOrThrow({
              where: { id: responsable.id },
            })
          ).permissionsPersonnalisees,
          null,
        );
        // Restaurer ses habilitations explicites.
        await modifierAdministration(admin, "utilisateurs", responsable.id, {
          permissions: [...ROLES.AGENT.permissions, "RECOUVREMENT_VALIDER"],
        });
        rc = (await connecter(responsable.email)).ctx;
      },
    );
    await t.test(
      "Configuration : identité validée et modules retirés indisponibles",
      async () => {
        await creerAdministration(admin, "parametres", {
          cle: "nomPlateforme",
          valeur: "GNVA de test",
        });
        await creerAdministration(admin, "parametres", {
          cle: "couleurPrimaire",
          valeur: "#123456",
        });
        await rejet(
          creerAdministration(admin, "parametres", {
            cle: "typesStock",
            valeur: ["FORMULAIRE"],
          }),
          /retiré/,
        );
        await rejet(
          creerAdministration(admin, "parametres", {
            cle: "logoUrl",
            valeur: "javascript:alert(1)",
          }),
          /HTTPS/,
        );
        const r = await references(ac);
        assert.equal(r.identite.nomPlateforme, "GNVA de test");
        assert.equal("typesStock" in r, false);
      },
    );
    let photo: string;
    await t.test(
      "Photo réelle redimensionnée et validation des deux identifiants",
      async () => {
        const fd = new FormData();
        const png = await sharp({
          create: { width: 40, height: 40, channels: 3, background: "#1757aa" },
        })
          .png()
          .toBuffer();
        fd.append(
          "file",
          new Blob([new Uint8Array(png)], { type: "image/png" }),
          "test.png",
        );
        const r = await televerserPhoto({
          ...admin,
          req: new NextRequest("http://localhost/api/v1/photos", {
            method: "POST",
            body: fd,
          }),
        });
        photo = r.url;
        const base = {
          nom: "Test",
          postnom: "Identité",
          sexe: "M",
          telephone: "123456789",
          adresse: "Adresse de test",
          siteId: sa.id,
          typeMotoId: type.id,
          photoUrl: photo,
        };
        assert.ok(
          assujettiSaisie.safeParse({
            ...base,
            chassis: "CHASSIS000001",
            moteur: "MOT000001",
          }).success,
        );
        assert.equal(
          assujettiSaisie.safeParse({ ...base, plaque: "TEST1" }).success,
          false,
        );
        assert.equal(normaliser(" ab 123 "), "AB123");
      },
    );
    const dossier = (n: number) => ({
      nom: `Test${n}`,
      postnom: "Famille",
      sexe: "M",
      telephone: `12345678${n}`,
      adresse: "Adresse de test",
      photoUrl: photo,
      siteId: sa.id,
      typeMotoId: type.id,
      plaque: `TEST${n}`,
      chassis: `CHASSIS00000${n}`,
      moteur: `MOT00000${n}`,
    });
    const a1 = await creerAssujetti(ac, dossier(1));
    const a2 = await creerAssujetti(bc, dossier(2));
    const a3 = await creerAssujetti(ac, dossier(3));
    await t.test(
      "Deux droits terrain indépendants et reprise d’un dossier propre",
      async () => {
        const creationSeule = { ...ac, permissions: ["ASSUJETTI_CREER"] };
        assert.equal(
          page(await lister(creationSeule, "assujettis", new URLSearchParams()))
            .total,
          2,
        );
        const repris = await modifierAssujetti(creationSeule, a3.id, {
          ...dossier(3),
          nom: "Repris",
        });
        assert.equal(repris.nom, "Repris");
        await rejet(
          modifierAssujetti(creationSeule, a2.id, dossier(2)),
          /propres|introuvable/,
        );
        await rejet(
          attribuerAutocollant(creationSeule, {
            assujettiId: a3.id,
            numeroAutocollant: "INCONNU",
            numeroTimbre: "CREATION-SEULE",
          }),
          /permission/,
        );
        const assignationSeule = {
          ...ac,
          permissions: ["AUTOCOLLANT_ATTRIBUER"],
        };
        assert.equal(
          page(
            await lister(assignationSeule, "assujettis", new URLSearchParams()),
          ).total,
          2,
        );
        assert.equal(
          (await tableauDeBord(assignationSeule, new URLSearchParams()))
            .assujettis,
          2,
        );
        await rejet(
          modifierAssujetti(assignationSeule, a3.id, dossier(3)),
          /permission/,
        );
        await rejet(
          lister(
            { ...ac, permissions: [] },
            "assujettis",
            new URLSearchParams(),
          ),
          /permission/,
        );
        await rejet(
          modifierAdministration(admin, "utilisateurs", provincial.id, {
            zoneIds: [commune.id],
          }),
          /provinces/,
        );
      },
    );
    await t.test(
      "Province : descendants futurs accessibles à la prochaine requête",
      async () => {
        await creerAdministration(admin, "geographies", {
          nom: "Quartier futur",
          code: "FUTUR",
          niveau: "QUARTIER",
          parentId: commune.id,
        });
        const g = await db.geographie.findUniqueOrThrow({
          where: { code: "FUTUR" },
        });
        await creerAdministration(admin, "sites", {
          nom: "Site futur",
          code: "FUTUR_SITE",
          geographieId: g.id,
        });
        const site = await db.site.findUniqueOrThrow({
          where: { code: "FUTUR_SITE" },
        });
        const actualise = (await connecter(provincial.email)).ctx;
        assert.ok(actualise.siteIds?.includes(site.id));
        assert.ok(!actualise.siteIds?.includes(sc.id));
      },
    );
    await t.test(
      "Créateur imposé par serveur et visibilité propre à chaque agent",
      async () => {
        assert.equal(a1.createurId, agent.id);
        assert.equal(
          page(await lister(ac, "assujettis", new URLSearchParams())).total,
          2,
        );
        await rejet(
          lister(ac, "assujettis", new URLSearchParams(), a2.id),
          /introuvable/,
        );
        await rejet(creerAssujetti(ac, dossier(1)), /existe déjà/);
        const d = await doublons(ac, { plaque: "TEST1" });
        assert.ok(d.some((c) => c.exact));
      },
    );
    await t.test(
      "Génération QR : plage bornée et numéros uniques",
      async () => {
        await generer(admin, {
          serie: "TEST_SERIE",
          prefixe: "TEST",
          siteId: sa.id,
          geographieId: ga.id,
          debut: 1,
          fin: 8,
          longueur: 3,
        });
        assert.equal(await db.autocollant.count(), 8);
        await rejet(
          generer(admin, {
            serie: "TEST_REPETITION",
            prefixe: "TEST",
            siteId: sa.id,
            geographieId: ga.id,
            debut: 1,
            fin: 8,
            longueur: 3,
          }),
        );
        await rejet(
          generer(admin, {
            serie: "TEST_EPUISE",
            prefixe: "EPUISE",
            siteId: sa.id,
            geographieId: ga.id,
            debut: 1,
            fin: 1000,
            longueur: 2,
          }),
          /épuisée/,
        );
      },
    );
    await t.test(
      "Attribution concurrente : une seule écriture financière et rollback complet",
      async () => {
        const d = {
          assujettiId: a1.id,
          numeroAutocollant: "TEST-001",
          numeroTimbre: "TIMBRE001",
        };
        const resultat = await Promise.allSettled([
          attribuerAutocollant(ac, d),
          attribuerAutocollant(ac, d),
        ]);
        assert.equal(
          resultat.filter((r) => r.status === "fulfilled").length,
          1,
        );
        assert.equal(await db.transactionFinanciere.count(), 1);
        assert.equal(await db.timbre.count(), 1);
        assert.equal(await db.attribution.count(), 1);
        await rejet(
          modifierAssujetti(
            { ...ac, permissions: ["ASSUJETTI_CREER"] },
            a1.id,
            dossier(1),
          ),
          /modifié|attribution|définitif/,
        );
        await rejet(
          attribuerAutocollant(bc, {
            assujettiId: a2.id,
            numeroAutocollant: "TEST-001",
            numeroTimbre: "TIMBRE002",
          }),
          /attribué|réservé/,
        );
        assert.equal(await db.transactionFinanciere.count(), 1);
        await rejet(archiverAssujetti(admin, a1.id), /définitive/);
      },
    );
    await t.test(
      "QR public : liste blanche, aucune donnée financière ou de compte",
      async () => {
        const qr = await db.autocollant.findFirstOrThrow({ where: { numero: "TEST-001", lot: { is: { serie: "TEST_SERIE" } } },
        });
        const publicR = await publicAutocollant(qr.jeton);
        assert.equal(publicR.nom, a1.nom);
        for (const cle of [
          "email",
          "telephone",
          "adresse",
          "montant",
          "siteId",
          "agentId",
          "motDePasseHash",
        ])
          assert.equal(cle in publicR, false);
        const png = await imageQR(req("qr/TEST-001"), "TEST-001");
        assert.equal(png.headers.get("Content-Type"), "image/png");
        assert.ok((await png.arrayBuffer()).byteLength > 500);
      },
    );
    await t.test(
      "CSV : contrôle sans écriture, doublons et import confirmé atomique",
      async () => {
        const d = {
          csv: "numero;url\nCSV-001;https://example.invalid/qr/CSV-001",
          geographieId: ga.id,
          siteId: sa.id,
          typeAutocollant: "AUTOCOLLANT_2R",
          serie: "IMPORT_TEST",
        };
        assert.equal((await importer(admin, d)).nombre, 1);
        assert.equal(
          await db.autocollant.count({ where: { numero: "CSV-001" } }),
          0,
        );
        await importer(admin, { ...d, confirmer: true });
        assert.equal(
          await db.autocollant.count({ where: { numero: "CSV-001" } }),
          1,
        );
        await rejet(
          importer(admin, { ...d, serie: "IMPORT_DOUBLE", confirmer: true }),
          /déjà/,
        );
      },
    );
    await t.test(
      "Recouvrement : 50/50 serveur, signatures distinctes et immuabilité",
      async () => {
        const jour = new Intl.DateTimeFormat("en-CA", {
          timeZone: "Africa/Kinshasa",
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        }).format();
        const r = await creerRecouvrement(mc, {
          siteId: sa.id,
          utilisateurConcerneId: agent.id,
          montant: 80,
          debut: jour,
          fin: jour,
          partDispromalt: 79,
          partProvince: 1,
        });
        assert.equal(r.partDispromalt.toFixed(2), "40.00");
        assert.equal(r.partProvince.toFixed(2), "40.00");
        assert.equal(r.moniteurId, moniteur.id);
        const notification = await db.notification.findFirstOrThrow({
          where: {
            utilisateurId: moniteur.id,
            lien: `/recouvrements?id=${r.id}`,
          },
        });
        assert.equal(notification.type, "RECOUVREMENT");
        assert.equal(
          (await responsablesRecouvrement(mc, sa.id)).moniteurs[0].id,
          moniteur.id,
        );
        await rejet(
          validerRecouvrement(ac, r.id, { statut: "VALIDER" }),
          /Première signature/,
        );
        await validerRecouvrement(mc, r.id, { statut: "VALIDER" });
        await rejet(
          validerRecouvrement(mc, r.id, { statut: "VALIDATED" }),
          /rattaché/,
        );
        const final = await validerRecouvrement(ac, r.id, {
          statut: "VALIDATED",
        });
        assert.equal(final.statut, "VALIDE");
        assert.equal(final.validations.length, 2);
        const bilan = await tableauDeBord(pc, new URLSearchParams());
        assert.equal(bilan.partDispromalt, "40.00");
        assert.equal(bilan.partProvince, "40.00");
        const rapport = await imprimerRapport(mc, new URLSearchParams());
        assert.match(rapport.headers.get("Cache-Control")!, /no-store/);
        const html = await rapport.text();
        assert.match(html, /Part Dispromalt/);
        assert.match(html, /Transactions journalières/);
        assert.match(html, /TX-/);
        assert.ok(
          final.validations.every((v) => /^[a-f0-9]{64}$/.test(v.signature)),
        );
        await rejet(
          validerRecouvrement(ac, r.id, { statut: "VALIDATED" }),
          /immuable/,
        );
        await rejet(
          creerRecouvrement(mc, {
            siteId: sa.id,
            montant: 30,
            debut: jour,
            fin: jour,
          }),
          /dépasse/,
        );
      },
    );
    await t.test(
      "Rapports : revenus propres, filtres QR/timbre/type/montant et exports",
      async () => {
        const non = await tableauDeBord(bc, new URLSearchParams());
        assert.equal(non.recettes, "0.00");
        const oui = await tableauDeBord(
          ac,
          new URLSearchParams({
            autocollant: "TEST-001",
            timbre: "TIMBRE001",
            typeMotoId: type.id,
            montantMin: "90",
          }),
        );
        assert.equal(oui.recettes, "100.00");
        assert.equal(
          (
            await tableauDeBord(
              ac,
              new URLSearchParams({ timbre: "INEXISTANT" }),
            )
          ).recettes,
          "0.00",
        );
        const csv = await exporter(
          admin,
          "transactions",
          new URLSearchParams(),
        );
        assert.match(await csv.text(), /100/);
        const ticket = await imprimer(admin, "ticket", a1.id);
        assert.match(await ticket.text(), /<!doctype html>/);
      },
    );
    await t.test(
      "Vol : avertissement exact et aucune nouvelle attribution",
      async () => {
        await declarerVol(ac, {
          assujettiId: a3.id,
          commentaire: "Fixture de test uniquement",
        });
        await rejet(
          attribuerAutocollant(ac, {
            assujettiId: a3.id,
            numeroAutocollant: "TEST-002",
            numeroTimbre: "TIMBRE003",
          }),
          /volée/,
        );
        const d = await doublons(ac, { plaque: "TEST3" });
        assert.ok(d.some((x) => x.vole));
      },
    );
    await t.test(
      "Consentement position, retrait effectif et carte réservée aux administrateurs nationaux",
      async () => {
        await rejet(positions(ac), /réserv|nation|autorisé/i);
        await partagerPosition(ac, {
          consentement: true,
          latitude: -4.3,
          longitude: 15.3,
        });
        assert.ok((await positions(admin)).some((x) => x.id === agent.id));
        await partagerPosition(ac, { consentement: false });
        assert.ok(!(await positions(admin)).some((x) => x.id === agent.id));
      },
    );
    await t.test(
      "CSRF : rejet en mutation sans jeton et première connexion bloquante",
      async () => {
        await rejet(
          contexte(req("stocks", {}, { cookie: ah.cookie })),
          /sécurité/,
        );
        await db.utilisateur.update({
          where: { id: autre.id },
          data: { changementRequis: true },
        });
        const c = await connexion(
          req("auth/connexion", { email: autre.email, motDePasse: mdp }),
        );
        const cookie = `gnva_session=${c.cookies.get("gnva_session")!.value}`;
        await rejet(
          contexte(req("references", undefined, { cookie })),
          /changer votre mot de passe/,
        );
        const csrf = c.cookies.get("gnva_csrf")!.value;
        const cc = await contexte(
          req(
            "auth/mot-de-passe",
            { actuel: mdp, nouveau: "Nouveau-mot-de-passe-Test" },
            { cookie, "x-csrf-token": csrf },
          ),
          true,
        );
        await changerMotDePasse(cc);
        assert.equal(
          (await db.utilisateur.findUniqueOrThrow({ where: { id: autre.id } }))
            .changementRequis,
          false,
        );
      },
    );
    await t.test(
      "Suspension de site : blocage serveur, révocation et message explicite à la connexion",
      async () => {
        await modifierAdministration(admin, "sites", sa.id, { actif: false });
        await rejet(
          connexion(
            req("auth/connexion", { email: agent.email, motDePasse: mdp }),
          ),
          /Direction Générale de Dispromalt/,
        );
        await rejet(
          contexte(req("references", undefined, ah)),
          /suspendu|expiré/,
        );
        await modifierAdministration(admin, "sites", sa.id, { actif: true });
      },
    );
    await t.test(
      "Audit persistant et dépendances optionnelles explicitement indisponibles",
      async () => {
        for (const action of [
          "ENREGISTREMENT",
          "ATTRIBUTION",
          "SIGNATURE_RECOUVREMENT",
          "EXPORT_CSV",
          "IMPRESSION",
          "CONNEXION",
        ])
          assert.ok(
            (await db.journalAudit.count({ where: { action } })) > 0,
            action,
          );
        assert.ok((await db.notification.count()) > 0);
        if (!configurationPush().publicKey)
          assert.equal(configurationPush().publicKey, null);
        assert.equal(empreinte("a").length, 64);
      },
    );
    await t.test(
      "Territoire QR : partage au sein de la province, refus hors province et district obligatoire à Kinshasa",
      async () => {
        const local = await creerAssujetti(rc, {
          ...dossier(81),
          siteId: sb.id,
        });
        // Le QR a été généré avec le site A comme origine, mais la province est son périmètre.
        await attribuerAutocollant(rc, {
          assujettiId: local.id,
          numeroAutocollant: "TEST-008",
          numeroTimbre: "PROVINCE-PARTAGE",
        });
        const distant = await compte("distant", "AGENT", sc.id);
        const dc = (await connecter(distant.email)).ctx;
        const hors = await creerAssujetti(dc, {
          ...dossier(82),
          siteId: sc.id,
        });
        await rejet(
          attribuerAutocollant(dc, {
            assujettiId: hors.id,
            numeroAutocollant: "TEST-007",
            numeroTimbre: "HORS-PROVINCE",
          }),
          /territorial/,
        );
        await rejet(
          generer(admin, {
            serie: "COMMUNE_INTERDITE",
            prefixe: "CI",
            geographieId: commune.id,
            debut: 1,
            fin: 1,
            longueur: 3,
          }),
          /uniquement la province/,
        );
        await creerAdministration(admin, "geographies", {
          nom: "Kinshasa",
          code: "KIN",
          niveau: "PROVINCE",
        });
        const kin = await db.geographie.findUniqueOrThrow({
          where: { code: "KIN" },
        });
        await creerAdministration(admin, "geographies", {
          nom: "Lukunga",
          code: "LUK",
          niveau: "DISTRICT",
          parentId: kin.id,
        });
        const district = await db.geographie.findUniqueOrThrow({
          where: { code: "LUK" },
        });
        await creerAdministration(admin, "sites", {
          nom: "Site Lukunga",
          code: "KIN_SITE",
          geographieId: district.id,
        });
        const lot = {
          serie: "KIN_TEST",
          prefixe: "KIN_TEST",
          debut: 1,
          fin: 1,
          longueur: 3,
        };
        await rejet(
          generer(admin, { ...lot, geographieId: kin.id }),
          /district/,
        );
        await generer(admin, { ...lot, geographieId: district.id });
        assert.equal(
          (
            await db.autocollant.findFirstOrThrow({ where: { numero: "KIN_TEST-001", lot: { is: { serie: "KIN_TEST" } } },
            })
          ).geographieId,
          district.id,
        );
      },
    );
  } finally {
    await db.$disconnect();
  }
});
