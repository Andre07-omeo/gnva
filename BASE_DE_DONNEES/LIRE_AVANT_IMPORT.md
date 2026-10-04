# GNVA — structure de la base de données

## Ce qui est fourni

`GNVA_SCHEMA_VIDE.sql` contient la structure complète issue des migrations
MySQL du projet. Il crée les tables, index et relations, mais n'inclut
aucun dossier réel, photo, mot de passe, session, rôle ou utilisateur.
Ce fichier n'est pas une sauvegarde de la base locale.

La méthode recommandée reste Prisma. Choisir UNE des méthodes ci-dessous,
pas les deux successivement sans l'étape de reconnaissance des migrations.

## Méthode recommandée : migrations Prisma

1. Créer une base MySQL 8.4 neuve et un utilisateur dédié.
2. Configurer `MYSQL_DATABASE_URL` dans un gestionnaire sécurisé.
3. À la racine du projet, exécuter :

```sh
pnpm install --frozen-lockfile
pnpm --filter @workspace/gnva run db:generate
pnpm --filter @workspace/gnva run db:migrate
pnpm --filter @workspace/gnva run db:seed
```

Définir un `INITIAL_ADMIN_PASSWORD` robuste avant le seed. Celui-ci crée
les comptes initiaux documentés dans le README, les rôles et permissions,
mais aucun dossier commercial. Il ne réinitialise pas les comptes existants.
Le changement initial du mot de passe reste obligatoire.

## Alternative : importer le fichier SQL dans une base neuve

Cette méthode est réservée à un administrateur technique et à une base vide.
Ne jamais importer ce fichier dans une base existante ou déjà migrée.
Il n'inclut ni `DROP DATABASE`, ni reset, ni suppression de données.
Les opérations DDL MySQL ne sont pas annulables en bloc : après une erreur
sur une base neuve, ne pas continuer sans vérifier les tables créées.

1. Créer une base vide dans MySQL 8.4 avec utf8mb4.
2. Sélectionner cette base explicitement dans votre outil MySQL.
3. Importer `GNVA_SCHEMA_VIDE.sql` une seule fois.
4. Configurer `MYSQL_DATABASE_URL` pour cette même base.
5. Uniquement après réussite complète de l'import, déclarer les migrations
   déjà appliquées, puis lancer le seed :

```sh
pnpm --filter @workspace/gnva run db:generate
pnpm --filter @workspace/gnva exec prisma migrate resolve --applied 202610030001_initial
pnpm --filter @workspace/gnva exec prisma migrate resolve --applied 202610030002_metier
pnpm --filter @workspace/gnva exec prisma migrate resolve --applied 202610030003_simplification
pnpm --filter @workspace/gnva exec prisma migrate status
pnpm --filter @workspace/gnva run db:seed
```

Ne pas déclarer une migration appliquée si l'import a échoué. Les futures
migrations passent ensuite par `db:migrate`, sans `prisma migrate reset`.

## Données et photos existantes

Pour transférer une installation existante, il faut une sauvegarde MySQL
autorisée et une copie cohérente des photos locales ou objets S3. La structure
SQL seule ne reconstitue pas ces données. Ne pas diffuser un export contenant
des données personnelles ou des sessions dans un ZIP public.

## Production

Le SQL ne configure ni serveur, ni HTTPS, ni sauvegardes, ni stockage durable.
Suivre README.md et docs/VERIFICATION.md. Les vérifications de persistance,
restauration et QR sur la vraie URL publique restent à réaliser sur la cible.