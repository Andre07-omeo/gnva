import { PrismaClient } from '@prisma/client';
import { hash } from '@node-rs/argon2';
import { PERMISSIONS, ROLES } from '../src/server/permissions';

const prisma = new PrismaClient();
async function initialiser() {
  // Les rôles/permissions sont des métadonnées, pas des données géographiques inventées.
  for (const code of PERMISSIONS) await prisma.permission.upsert({where:{code},create:{code,nom:code.replaceAll('_',' ')},update:{}});
  for (const [code, configuration] of Object.entries(ROLES)) {
    const existant=await prisma.role.findUnique({where:{code}});
    const role = await prisma.role.upsert({where:{code},create:{code,nom:configuration.nom},update:{}});
    // Une relance ne restaure pas des permissions retirées par l'administration.
    for (const permissionCode of existant?[]:configuration.permissions)
      await prisma.rolePermission.upsert({where:{roleId_permissionCode:{roleId:role.id,permissionCode}},create:{roleId:role.id,permissionCode},update:{}});
  }
  for (const compte of [
    {email:'admin@gnva.cd',nom:'Administrateur national',role:'ADMIN_NATIONAL'},
    {email:'omeongaandre2@gmail.com',nom:'Super administrateur',role:'SUPER_ADMIN'},
  ]) {
    const role = await prisma.role.findUniqueOrThrow({where:{code:compte.role}});
    // Le mot de passe temporaire demandé n'est écrit en base que sous forme Argon2id.
    // Un seed répété ne réinitialise jamais le mot de passe d'un compte existant.
    await prisma.utilisateur.upsert({where:{email:compte.email},create:{
      email:compte.email,nom:compte.nom,roleId:role.id,
      motDePasseHash:await hash(process.env.INITIAL_ADMIN_PASSWORD ?? '1234', {memoryCost:19456,timeCost:2,parallelism:1}),
      changementRequis:false,
    },update:{}});
  }
}
initialiser().finally(() => prisma.$disconnect());