# Vérification de la livraison simplifiée — 3 octobre 2026

## Résultats réels

- Compilation Next.js de production réussie; routes Stocks et Assistant absentes.
- TypeScript strict et contrôle de formatage réussis.
- 20 tests MySQL métier/API réussis sur une base créée et supprimée par le lanceur.
- 8 parcours navigateur réussis sur une instance MySQL/photos isolée :
  terrain à deux onglets, absence Stocks/IA/activité récente, zones provinciales,
  enregistrement et reprise préremplie avec Valider, génération territoriale,
  document de rapport sans cache, recouvrement avec détection des signataires,
  lien de notification et deux signatures, déconnexion suivie du bouton Retour,
  et présentation mobile sans débordement horizontal.

Le total de 8 correspond au regroupement des contrôles dans le script.
Les reprises ont concerné seulement les scénarios non confirmés. Des sélecteurs
du script ont été adaptés aux libellés réels : « Ajouter : utilisateur »,
champs de dossier sans identifiants et cases à cocher des zones.
Les résultats sont consolidés, pas une unique passe sans reprise.

Le script `artifacts/gnva/tests/recette-ui.mjs` utilise le contexte du lanceur
`scripts/recette.mjs`. Les photos et comptes de recette sont exclusivement
synthétiques; aucune base externe du propriétaire n’est utilisée.
Les captures prises juste après ouverture peuvent encore contenir les
indicateurs de chargement; elles ne prouvent pas à elles seules les montants.
Les montants/parts sont vérifiés par les tests métier et les deux signatures.

## Nettoyage SQL

Le schéma vide et le script de nettoyage ont été exécutés sur une base MySQL 8.4
isolée. La seconde exécution du nettoyage réussit aussi.
L’ancienne liaison étrangère logistique des QR est retirée avant la table des
mouvements, sans désactiver les contrôles étrangers.

Un autre contrôle a exécuté le nettoyage sur la base de recette contenant un QR
attribué, une transaction et un recouvrement doublement signé.
Les comptages comptes/dossiers/QR/attributions/transactions/recouvrements restent
identiques avant et après. Les six tables métier contrôlées restent présentes;
les quatre tables Stocks/IA disparaissent.

## Archive

Le ZIP inclut les nouveaux fichiers, migrations historiques inchangées,
migration additive, guide Word, guide de compilation, SQL de base vide et
instructions de mise à jour. Son intégrité ZIP a été contrôlée.
Les secrets, photos métier, base de données, dépendances installées, compilations,
captures et ancien serveur Stocks/IA sont exclus.

## Ce qui n’est pas validé

- Installation complète depuis Internet sur une machine neuve.
- Exécution Docker Compose et reverse proxy sur l’infrastructure cible.
- Production MySQL, HTTPS et stockage durable local/S3.
- Sauvegardes et restauration de la vraie production.
- Persistance de production après redémarrage et QR sur URL publique réelle.
- Web Push sans clés VAPID volontairement fournies.
- Caméra, imprimante, PWA et notifications sur téléphones physiques.
- Charge nationale, volumétrie importante et haute disponibilité.

La configuration et validation de production restent bloquées par l’absence
de choix/informations sur l’infrastructure cible. Cette archive ne signifie
ni que GNVA est publié, ni que cette étape de production est terminée.