import { hash } from "@node-rs/argon2";
import sharp from "sharp";
import { db } from "../src/server/db";
import { PERMISSIONS, ROLES } from "../src/server/permissions";
import path from "node:path";

if (
  !/^\/gnva_recette_\d+$/.test(
    new URL(process.env.MYSQL_DATABASE_URL ?? "").pathname,
  )
)
  throw new Error("Les fixtures exigent une base de recette isolée.");
try {
  for (const code of PERMISSIONS)
    await db.permission.create({ data: { code, nom: code } });
  for (const [code, role] of Object.entries(ROLES))
    await db.role.create({
      data: {
        code,
        nom: role.nom,
        permissions: {
          create: role.permissions.map((permissionCode) => ({
            permissionCode,
          })),
        },
      },
    });
  const a = await db.geographie.create({
    data: { nom: "Recette province A", code: "REC_A", niveau: "PROVINCE" },
  });
  const b = await db.geographie.create({
    data: { nom: "Recette province B", code: "REC_B", niveau: "PROVINCE" },
  });
  const zone = await db.geographie.create({
    data: {
      nom: "Recette commune A",
      code: "REC_ZONE",
      niveau: "COMMUNE",
      parentId: a.id,
    },
  });
  await db.fermetureGeographique.createMany({
    data: [
      ...[a, b, zone].map((g) => ({
        ancetreId: g.id,
        descendantId: g.id,
        profondeur: 0,
      })),
      { ancetreId: a.id, descendantId: zone.id, profondeur: 1 },
    ],
  });
  const sa = await db.site.create({
    data: { nom: "Recette site A", code: "REC_SITE_A", geographieId: zone.id },
  });
  await db.site.create({
    data: { nom: "Recette site B", code: "REC_SITE_B", geographieId: a.id },
  });
  await db.site.create({
    data: { nom: "Recette site C", code: "REC_SITE_C", geographieId: b.id },
  });
  await db.typeMoto.create({
    data: { nom: "Moto recette", roues: 2, tarif: 100 },
  });
  const roles = Object.keys(ROLES);
  const comptes = [
    ...roles.map((role) => ({ nom: role.toLowerCase(), role })),
    { nom: "agent2", role: "AGENT" },
    { nom: "responsable", role: "ADMIN_PROVINCIAL" },
    { nom: "initial", role: "AGENT" },
  ];
  const motDePasseHash = await hash("Recette-GNVA-2026!");
  for (const c of comptes) {
    const role = await db.role.findUniqueOrThrow({ where: { code: c.role } });
    const territorial = [
      "ADMIN_PROVINCIAL",
      "ADMIN_ZONE",
      "MONITEUR_PROVINCIAL",
    ].includes(c.role);
    await db.utilisateur.create({
      data: {
        nom: c.nom,
        email: `${c.nom}@recette.invalid`,
        roleId: role.id,
        motDePasseHash,
        changementRequis: c.nom === "initial",
        porteeNationale: c.role === "MONITEUR_NATIONAL",
        siteId:
          c.role === "AGENT" || c.nom === "responsable" ? sa.id : undefined,
        zones: {
          create: territorial
            ? [{ geographieId: c.role === "ADMIN_ZONE" ? zone.id : a.id }]
            : [],
        },
      },
    });
  }
  await sharp({
    create: { width: 160, height: 160, channels: 3, background: "#173f8a" },
  })
    .png()
    .toFile(path.join(process.env.UPLOAD_DIR!, "photo-recette.png"));
  console.log(
    "Fixtures isolées prêtes : sept rôles et comptes initial/agent2/responsable.",
  );
} finally {
  await db.$disconnect();
}
