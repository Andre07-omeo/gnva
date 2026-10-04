# Mise à jour GNVA — sans réinitialiser la base

Les modules Stocks et IA sont retirés du code. Le recouvrement reste en place.
La migration ajoute seulement `Recouvrement.moniteurId` et `Notification.lien`,
tous deux facultatifs pour préserver les enregistrements historiques.
Les nouveaux recouvrements désignent obligatoirement leurs deux signataires.

## 1. Sauvegarder

Arrêter temporairement les écritures métier. Sauvegarder séparément :
- la base MySQL, y compris `_prisma_migrations`;
- le volume des photos ou le bucket S3;
- les paramètres de votre service, sans les joindre à une archive publique.

Exemple terminal, sur votre machine, en remplaçant les noms en majuscules :

```sh
mysqldump -h HOTE_MYSQL -u UTILISATEUR -p --single-transaction \
  --routines --triggers NOM_BASE > gnva-avant-mise-a-jour.sql
```

`-p` demande le mot de passe sans l’inscrire dans la commande.
Ne pas envoyer ce dump ni vos secrets dans le chat. Tester sa restauration dans
une base isolée avant la mise à jour. Ne pas continuer si la sauvegarde est incomplète.

## 2. Installer et compiler les nouvelles sources

Extraire le ZIP, se placer dans `gnva`, conserver votre configuration sécurisée
`MYSQL_DATABASE_URL`, `SESSION_SECRET`, `APP_URL`, stockage local/S3.

```sh
corepack enable
corepack prepare pnpm@10.26.1 --activate
pnpm install --frozen-lockfile
pnpm --filter @workspace/gnva run db:generate
pnpm --filter @workspace/gnva run build
```

La compilation n’exige pas de connexion à MySQL. Le serveur en exige une.

## 3. Mettre à jour la base EXISTANTE

Vérifier que votre variable sécurisée `MYSQL_DATABASE_URL` cible la bonne base,
puis appliquer les migrations (aucun reset) :

```sh
pnpm --filter @workspace/gnva exec prisma migrate status
pnpm --filter @workspace/gnva run db:migrate
```

Les fichiers des anciennes migrations doivent rester inchangés. Ne pas importer
`GNVA_SCHEMA_VIDE.sql` dans une base existante et ne jamais lancer `migrate reset`.
Le seed n’est pas nécessaire pour cette mise à jour : les droits Stocks/IA
historiques sont ignorés et les autres rôles/droits personnalisés sont conservés.
Un dump importé manuellement sans historique Prisma nécessite un baselining
contrôlé; ne pas inventer une migration « déjà appliquée » sans rapprocher le schéma.

## 4. Nettoyage SQL FACULTATIF

Le nouveau code fonctionne même si les anciennes tables inutilisées existent.
Pour les supprimer physiquement, après sauvegarde et accord du propriétaire :

```sh
mysql -h HOTE_MYSQL -u UTILISATEUR -p NOM_BASE \
  < docs/sql/NETTOYAGE_STOCK_IA.sql
```

Le script supprime exclusivement les tables Stocks/IA et leurs métadonnées.
Il retire aussi l’ancienne référence logistique `Autocollant.mouvementId`
et sa contrainte : cela permet le nettoyage sans supprimer les QR.
MySQL effectue des commits implicites pour `DROP TABLE` : un `ROLLBACK` ne permet
pas de les récupérer. Restaurer la sauvegarde si ces historiques doivent revenir.
Le champ SQL `Autocollant.typeStock` ne doit PAS être supprimé : il contient
le type d’autocollant historique et est mappé au nouveau nom dans Prisma.

Dans phpMyAdmin : sélectionner explicitement la base, onglet SQL, coller le
contenu du script, contrôler les quatre noms de tables, puis exécuter.
Ne pas le coller avant la sauvegarde. Le script n’efface aucun recouvrement.

## 5. Redémarrer et contrôler

Redémarrer votre service habituel; exemple hors Docker :

```sh
pnpm --filter @workspace/gnva run serve
```

Le serveur de production refuse un démarrage sans `APP_URL` HTTPS et
`SESSION_SECRET`. `docker-compose.yml` est fourni, mais son exécution n’est
pas validée dans ce workspace. Ne pas lancer `docker compose down -v` :
cela détruirait les volumes persistants.

Contrôler la connexion, les photos, une attribution et un recouvrement historique,
puis les nouvelles opérations. Revoir les comptes provinciaux :
**Utilisateurs → Modifier → Zones d’accès → province(s) → Enregistrer**.
Les sites futurs sous ces provinces seront accessibles automatiquement.

Pour Kinshasa, créer les districts et rattacher les sites à leurs descendants
avant génération/import. Ailleurs, sélectionner uniquement la province.
Le timbre est toujours identifié à l’attribution et reste unique, sans stock.

Le moniteur national doit couvrir le site, être actif et avoir
`RECOUVREMENT_VALIDER`; le responsable distinct doit être rattaché au site
et disposer de ce même droit. La consultation liée est permise pour un signataire
habilité même s’il n’a pas la consultation générale.

## Nouvelle installation

Préférer une base MySQL vide, `db:migrate`, puis `db:seed`.
Le nettoyage facultatif peut être exécuté après migration pour retirer les
tables historiques recréées par les anciennes migrations.
Le fichier SQL vide est une alternative à Prisma, jamais une mise à jour.
Lire `BASE_DE_DONNEES/LIRE_AVANT_IMPORT.md` avant de l’importer.

## Limites réelles

Aucune modification de votre base externe n’a été exécutée ici.
Cette livraison n’est pas une production publiée : infrastructure, HTTPS,
sauvegardes/restauration, persistance après redémarrage, QR sur URL publique réelle,
charge nationale et essais sur téléphones physiques restent à valider sur la cible.