# GNVA — archive des sources prête à compiler

## Contenu

Le monorepo conserve ses sources, dépendances internes, verrouillage pnpm,
schéma et migrations Prisma, ressources publiques et configuration Docker.
Il ne contient ni dépendances installées, ni compilation préexistante, ni base
de données, ni photos enregistrées, ni secrets, ni captures de recette.

## Prérequis

- Node.js 22 et pnpm 10.26.1.
- Accès Internet pour télécharger les dépendances.
- MySQL 8.4 pour démarrer l'application, pas pour compiler les sources.
- Sous Linux, OpenSSL et certificats système pour Prisma.

## Compilation

Ouvrir un terminal à la racine du dossier `gnva`, puis :

```sh
corepack enable
corepack prepare pnpm@10.26.1 --activate
pnpm install --frozen-lockfile
pnpm --filter @workspace/gnva run db:generate
pnpm --filter @workspace/gnva run build
```

La commande ciblée compile GNVA, sans lancer les anciens artifacts API et Canvas.
Next.js régénère les déclarations de types des routes pendant la compilation.

## Démarrage

Renseigner les variables d'environnement dans votre gestionnaire de secrets :
`MYSQL_DATABASE_URL`, `SESSION_SECRET`, `APP_URL` (HTTPS) et le stockage durable.
Consulter `.env.example` pour les noms des variables. Un fichier `.env` à la
racine n'est pas chargé automatiquement par Next.js dans ce monorepo.

Après sauvegarde et autorisation de modifier la base cible :

```sh
pnpm --filter @workspace/gnva run db:migrate
pnpm --filter @workspace/gnva run db:seed
pnpm --filter @workspace/gnva run serve
```

Les migrations utilisent `prisma migrate deploy`, sans reset. Le seed crée
les comptes initiaux décrits dans README.md ; définir un mot de passe initial
robuste avec `INITIAL_ADMIN_PASSWORD` et changer les mots de passe temporaires.
Ne pas exécuter ces commandes sur une base existante sans autorisation.

Une alternative Docker Compose est documentée dans README.md pour un serveur
Linux équipé de Docker. Docker Compose n'a pas été exécuté dans ce workspace.

## Vérification réelle

La compilation Next.js de production et sa vérification TypeScript ont réussi
dans le workspace lors de la préparation de cette archive.
L'installation des dépendances sur une machine neuve n'a pas été testée.

Cette archive n'est pas un déploiement validé : l'hébergement, HTTPS, les
sauvegardes et leur restauration, la persistance après redémarrage et les QR
sur l'URL publique restent à configurer et vérifier sur l'infrastructure cible.
Les limites de charge et les essais sur téléphones physiques restent ceux
décrits dans docs/VERIFICATION.md. L’IA est retirée. Web Push reste optionnel.

## Mise à jour de votre base

Suivre `docs/MISE_A_JOUR.md`. Ne jamais importer le schéma vide dans une base existante.
Ne jamais utiliser `prisma migrate reset` ou `prisma db push --accept-data-loss`.