# Vérification et mise en production

## Contrôles automatisés disponibles

- TypeScript strict et compilation Next de production.
- Contrôle de formatage/analyse syntaxique Prettier via `lint`.
- Suite MySQL isolée : API santé/session/anonyme/protégée; permissions terrain indépendantes; reprise de dossier; descendants futurs; photo; doublons; attribution concurrente et rollback; whitelist publique; génération/import territorial; double signature et immuabilité; lien de notification; parts financières et impression complète; rapports filtrés; vol; consentement position; CSRF; changement initial; suspension; audit.
- Recette connectée desktop/mobile réalisée le 3 octobre 2026 sur une instance MySQL/photo isolée : voir `docs/recette/rapport.md`, son bilan consolidé et les captures. Lanceur : `scripts/recette.mjs`; parcours reproductibles : `tests/recette-ui.mjs`.

Les tests créent puis suppriment une base dédiée et ne génèrent pas de données commerciales dans GNVA. Ils utilisent de vraies transactions Prisma/MySQL et des photos temporaires.

## Contrôles qui exigent l’environnement cible

Ne pas déclarer ces points validés sans les réaliser :

- Exécution réelle du Docker Compose et du reverse proxy sur le VPS.
- Migrations avec l’utilisateur de production à droits minimaux.
- Persistance des photos après redémarrage/redéploiement.
- Restauration complète à partir d’une sauvegarde.
- Installation PWA Android et iOS, ouverture hors connexion.
- Prise de photo, caméra QR, consentement/retrait de position et Web Push sur téléphones physiques.
- Répéter la recette connectée sur l'environnement cible après configuration (la recette locale isolée est réalisée; elle ne valide pas le déploiement).
- Charge concurrente représentative et volumétrie nationale.

## Checklist de recette

1. Changer les mots de passe temporaires; vérifier que les autres sessions sont révoquées.
2. Créer deux territoires et vérifier qu’un compte territorial ne lit pas l’autre.
3. Créer deux agents sur un site et vérifier leurs chiffres séparés.
4. Enregistrer un dossier avec photo, puis imprimer son ticket.
5. Générer/importer des QR provinciaux; vérifier l’obligation d’un district à Kinshasa et le refus d’utilisation hors territoire.
6. Tenter une attribution simultanée; vérifier une seule transaction financière.
7. Vérifier le lien public depuis une session anonyme.
8. Faire les deux signatures d’un recouvrement; vérifier montant, parts et impossibilité de le rejouer.
9. Suspendre un site, tester une session ouverte et une nouvelle connexion.
10. Tester filtre, rechargement, CSV et impression.
11. Tester offline : aucun message de réussite d’écriture sans serveur.
12. Restaurer une sauvegarde sur une machine isolée et rapprocher les totaux.

La production n’est pas publiée/configurée automatiquement par les fichiers du dépôt.
L’IA est retirée. Web Push reste désactivé sans configuration VAPID volontaire.
Le bilan de recette antérieur décrit également des modules depuis retirés : il n’est
pas une preuve de validation de la présente version. Voir `docs/recette/simplification.md`.