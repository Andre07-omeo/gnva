import { chromium } from "playwright";
import assert from "node:assert/strict";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
const fichier = process.argv[2];
assert(
  fichier?.startsWith("/tmp/gnva-recette-"),
  "Utiliser le lanceur recette.mjs.",
);
const contexte = JSON.parse(readFileSync(fichier, "utf8"));
assert.match(contexte.base, /^gnva_recette_\d+$/);
assert.match(contexte.url, /^http:\/\/127\.0\.0\.1:\d+$/);
const preuve = path.resolve("../../docs/recette/simplification");
mkdirSync(preuve, { recursive: true });
const ancien = process.argv.includes("--reprise")
  ? JSON.parse(
      readFileSync(path.join(preuve, "resultats.json"), "utf8"),
    ).filter((r) => r.resultat === "PASS")
  : [];
const resultats = [...ancien];
const browser = await chromium.launch({
  headless: true,
  ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
    ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH }
    : {}),
});
async function compte(nom, width = 1360) {
  const ctx = await browser.newContext({ viewport: { width, height: 900 } });
  const page = await ctx.newPage();
  page.setDefaultTimeout(15000);
  await page.goto(contexte.url, { waitUntil: "domcontentloaded" });
  await page.locator('input[type="email"]').fill(`${nom}@recette.invalid`);
  await page.locator('input[type="password"]').fill("Recette-GNVA-2026!");
  await page.getByRole("button", { name: /Se connecter/ }).click();
  await page.locator(".frame").waitFor();
  return { ctx, page };
}
async function api(c, route, method = "GET", body) {
  return c.page.evaluate(
    async ({ route, method, body }) => {
      const csrf = document.cookie
        .split("; ")
        .find((x) => x.startsWith("gnva_csrf="))
        ?.split("=")[1];
      const res = await fetch(`/api/v1/${route}`, {
        method,
        headers: {
          "Content-Type": "application/json",
          ...(csrf ? { "x-csrf-token": decodeURIComponent(csrf) } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      const text = await res.text();
      return {
        status: res.status,
        text,
        cache: res.headers.get("Cache-Control"),
      };
    },
    { route, method, body },
  );
}
async function etape(nom, run) {
  if (ancien.some((r) => r.nom === nom)) return;
  try {
    await run();
    resultats.push({ nom, resultat: "PASS" });
    console.log("PASS", nom);
  } catch (e) {
    resultats.push({ nom, resultat: "FAIL", erreur: String(e) });
    console.error("FAIL", nom, String(e));
  }
  writeFileSync(
    path.join(preuve, "resultats.json"),
    JSON.stringify(resultats, null, 2),
  );
}
try {
  const root = await compte("super_admin");
  const agent = await compte("agent");
  await etape(
    "Terrain : deux onglets et absence Stocks/IA/activité récente",
    async () => {
      await agent.page.getByRole("heading", { name: "Ma journée" }).waitFor();
      assert.equal(await agent.page.getByRole("tab").count(), 2);
      const nav = await root.page.locator(".side").innerText();
      assert(!/\bStocks\b|\bAssistant\b/.test(nav));
      assert(
        !(await root.page.locator("main").innerText()).includes(
          "Activité récente",
        ),
      );
      await agent.page.screenshot({
        path: path.join(preuve, "terrain-desktop.png"),
        fullPage: true,
      });
    },
  );
  await etape(
    "Affectation provinciale : sélecteur limité aux provinces",
    async () => {
      await root.page.goto(`${contexte.url}/utilisateurs`, {
        waitUntil: "domcontentloaded",
      });
      await root.page
        .getByRole("button", { name: "Ajouter : utilisateur", exact: true })
        .click();
      const refs = JSON.parse((await api(root, "references")).text);
      const role = refs.roles.find((r) => r.code === "MONITEUR_PROVINCIAL");
      await root.page.locator("#f-roleId").selectOption(role.id);
      const options = await root.page
        .locator(".modal .field")
        .filter({
          has: root.page
            .locator("label")
            .filter({ hasText: /^Zones d'accès$/ }),
        })
        .locator(".chips label")
        .allTextContents();
      assert(options.some((v) => v.includes("Recette province A")));
      assert(!options.some((v) => v.includes("commune")));
      await root.page
        .getByRole("button", { name: "Annuler", exact: true })
        .click();
    },
  );
  await etape("Enregistrement et reprise préremplie avec Valider", async () => {
    await agent.page.getByRole("button", { name: "Nouvel assujetti" }).click();
    const modal = agent.page.locator(".modal");
    const refs = JSON.parse((await api(agent, "references")).text);
    const png = readFileSync(path.join(contexte.photos, "photo-recette.png"));
    await modal
      .locator('input[type="file"]')
      .setInputFiles({ name: "photo.png", mimeType: "image/png", buffer: png });
    const field = (label) =>
      modal.locator(".field").filter({
        has: agent.page.locator("label").filter({ hasText: label }),
      });
    for (const [label, value] of [
      [/^Nom \*$/, "Terrain"],
      [/^Postnom \*$/, "Reprise"],
      [/^Téléphone \*$/, "0812345678"],
      [/^Adresse \*$/, "Adresse recette"],
      [/^Plaque$/, "RECUI123"],
      [/^Châssis$/, "CHASSISRECUI123"],
    ])
      await field(label).locator("input").fill(value);
    await field(/^Sexe/).locator("select").selectOption("M");
    await field(/^Type de moto/)
      .locator("select")
      .selectOption(refs.typesMoto[0].id);
    await modal
      .getByRole("button", { name: "Enregistrer", exact: true })
      .click();
    await agent.page
      .getByRole("button", { name: /Terrain Reprise/ })
      .first()
      .waitFor();
    await agent.page
      .getByRole("button", { name: /Terrain Reprise/ })
      .first()
      .click();
    assert.equal(
      await field(/^Nom \*$/)
        .locator("input")
        .inputValue(),
      "Terrain",
    );
    await field(/^Nom \*$/)
      .locator("input")
      .fill("Corrigé");
    await agent.page
      .getByRole("button", { name: "Valider", exact: true })
      .click();
    await agent.page
      .getByRole("button", { name: /Corrigé Reprise/ })
      .first()
      .waitFor();
    await agent.page.getByRole("tab", { name: /Assignation QR/ }).click();
    await agent.page
      .getByRole("button", { name: "Attribuer", exact: true })
      .first()
      .waitFor();
  });
  await etape("Génération : province uniquement hors Kinshasa", async () => {
    await root.page.goto(`${contexte.url}/autocollants`, {
      waitUntil: "domcontentloaded",
    });
    await root.page.getByRole("button", { name: /Générer une série/ }).click();
    const modal = root.page.locator(".modal");
    assert(!(await modal.innerText()).includes("Site *"));
    await modal
      .locator("select")
      .first()
      .selectOption({ label: "Recette province A" });
    assert(!(await modal.innerText()).includes("District de Kinshasa"));
    await root.page
      .getByRole("button", { name: "Annuler", exact: true })
      .click();
  });
  await etape("Rapport : document complet sans cache", async () => {
    const m = await compte("moniteur_national");
    await m.page.goto(`${contexte.url}/rapports`, {
      waitUntil: "domcontentloaded",
    });
    await m.page
      .getByRole("link", { name: /Imprimer le rapport complet/ })
      .waitFor();
    const res = await api(m, "impression/rapport");
    assert.equal(res.status, 200);
    assert.match(res.cache, /no-store/);
    assert.match(res.text, /Transactions journalières/);
    assert.match(res.text, /Part Dispromalt/);
  });
  await etape(
    "Recouvrement : site détecté, lien et deux signatures dans l’interface",
    async () => {
      const refs = JSON.parse((await api(root, "references")).text);
      const site = refs.sites.find((s) => s.code === "REC_SITE_A");
      const province = refs.geographies.find((g) => g.code === "REC_A");
      const dossiers = JSON.parse(
        (await api(agent, "assujettis")).text,
      ).elements;
      const dossier = dossiers.find(
        (d) => d.nom === "Corrigé" && !d.attributions.length,
      );
      assert(
        dossier,
        "Le dossier de reprise doit exister et être non attribué.",
      );
      const lot = await api(root, "generation-qr", "POST", {
        serie: "REC_FINANCE_UI",
        prefixe: "REC_FINANCE_UI",
        geographieId: province.id,
        debut: 1,
        fin: 1,
        longueur: 3,
      });
      assert.equal(lot.status, 201, lot.text);
      const attribution = await api(agent, "attributions", "POST", {
        assujettiId: dossier.id,
        numeroAutocollant: "REC_FINANCE_UI-001",
        numeroTimbre: "REC_FINANCE_TIMBRE",
      });
      assert.equal(attribution.status, 201, attribution.text);
      const m = await compte("moniteur_national");
      const jour = JSON.parse((await api(m, "tableau-de-bord")).text).jour;
      await m.page.goto(`${contexte.url}/recouvrements`, {
        waitUntil: "domcontentloaded",
      });
      await m.page
        .getByRole("button", { name: "Nouveau", exact: true })
        .click();
      const modal = m.page.locator(".modal");
      const field = (label) =>
        modal.locator(".field").filter({
          has: m.page.locator("label").filter({ hasText: label }),
        });
      await field(/^Site/).locator("select").selectOption(site.id);
      await field(/^Moniteur responsable/)
        .locator("select")
        .waitFor();
      assert(
        await field(/^Moniteur responsable/)
          .locator("select")
          .inputValue(),
      );
      assert(
        await field(/^Responsable du site/)
          .locator("select")
          .inputValue(),
      );
      await field(/^Montant total/)
        .locator("input")
        .fill("80");
      await field(/^Début de période/)
        .locator("input")
        .fill(jour);
      await field(/^Fin de période/)
        .locator("input")
        .fill(jour);
      await modal
        .getByRole("button", { name: "Créer et notifier", exact: true })
        .click();
      await m.page
        .getByRole("button", { name: "Valider (1/2)", exact: true })
        .waitFor();
      const rec = JSON.parse((await api(m, "recouvrements")).text).elements[0];
      const notifications = JSON.parse(
        (await api(m, "notifications")).text,
      ).elements;
      assert(
        notifications.some((n) => n.lien === `/recouvrements?id=${rec.id}`),
      );
      await m.page
        .getByRole("button", { name: "Valider (1/2)", exact: true })
        .click();
      await m.page
        .getByRole("button", { name: "Confirmer la validation", exact: true })
        .click();
      await m.page.locator(".modal").waitFor({ state: "hidden" });
      const r = await compte("responsable");
      await r.page.goto(`${contexte.url}/recouvrements?id=${rec.id}`, {
        waitUntil: "domcontentloaded",
      });
      await r.page
        .getByRole("button", { name: "Valider (2/2)", exact: true })
        .click();
      await r.page
        .getByRole("button", { name: "Confirmer la validation", exact: true })
        .click();
      await r.page.locator(".modal").waitFor({ state: "hidden" });
      const final = JSON.parse((await api(m, `recouvrements/${rec.id}`)).text);
      assert.equal(final.statut, "VALIDE");
      assert.equal(final.validations.length, 2);
    },
  );
  await etape(
    "Déconnexion : serveur révoqué, login et Retour sans données privées",
    async () => {
      await agent.page.goto(`${contexte.url}/compte`, {
        waitUntil: "domcontentloaded",
      });
      await agent.page
        .getByRole("button", { name: "Déconnexion", exact: true })
        .click();
      await agent.page.waitForURL("**/login");
      await agent.page.locator('input[type="email"]').waitFor();
      await agent.page.goBack({ waitUntil: "domcontentloaded" });
      await agent.page.locator('input[type="email"]').waitFor();
      assert.equal(await agent.page.locator(".frame").count(), 0);
      assert.equal((await api(agent, "assujettis")).status, 401);
    },
  );
  await etape(
    "Terrain mobile : deux onglets et aucun débordement",
    async () => {
      const mobile = await compte("agent", 390);
      await mobile.page.getByRole("heading", { name: "Ma journée" }).waitFor();
      assert(
        await mobile.page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      );
      await mobile.page.screenshot({
        path: path.join(preuve, "terrain-mobile.png"),
        fullPage: true,
      });
    },
  );
} finally {
  await browser.close();
}
if (resultats.some((r) => r.resultat === "FAIL")) process.exitCode = 1;
