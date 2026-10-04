# Architecture GNVA

## Structure

`artifacts/gnva/src/app` contient les pages App Router et le Route Handler `/api/v1/[[...segments]]`. Les composants français sont dans `src/components`; les services métier dans `src/server`. Le schéma normalisé est `prisma/schema.prisma`; les migrations sont versionnées. Les hooks React sont générés dans `lib/api-client-react` depuis OpenAPI.

Le serveur API Express et la bibliothèque PostgreSQL initiaux sont conservés pour ne pas remplacer silencieusement leur stockage. GNVA utilise exclusivement sa base MySQL et ses services Next.

## Autorisation

Chaque requête authentifiée recharge le compte, le rôle, ses permissions/overrides, le site, les affectations et la session. Une fermeture transitive géographique détermine les descendants; les services contrôlent à nouveau les ressources concernées. Les agents sont filtrés par créateur/auteur pour leurs opérations.

Les protections serveur ne dépendent jamais de la visibilité d’un bouton. Les comptes et rôles nationaux sont protégés contre une délégation territoriale. La carte possède une règle distincte : administrateurs nationaux uniquement.

## Transactions et concurrence

Attributions et recouvrements utilisent des transactions MySQL sérialisables. Les contraintes uniques et mises à jour conditionnelles empêchent la réattribution, le réemploi d’un timbre, le rejeu d’une étape et les signatures multiples. Les décimaux Prisma évitent l’addition financière en virgule flottante.

Un conflit de sérialisation renvoie 409 et demande une nouvelle lecture; aucune réussite n’est fabriquée. La transaction inclut les écritures métier et leur audit. Les recouvrements finalisés n’ont pas d’endpoint de modification/suppression.

## Authentification et sécurité

Mots de passe Argon2id; cookies de session opaques HttpOnly, SameSite et Secure en production; seules les empreintes sont stockées. Les mutations vérifient le CSRF et l’origine. Les requêtes et corps sont bornés. Rate limiting Redis en déploiement multi-instance, local en développement.

Prisma protège les requêtes; Zod valide les entrées. Les impressions échappent le contenu, les CSV neutralisent les formules, les photos sont réellement décodées/recompressées. CSP à nonce pour les pages, absence de cache des réponses privées. Les origines d’encadrement du développement permettent le Preview; la production restreint les frames à sa propre origine.

## Données publiques

L’API QR construit un objet en liste blanche, sans sérialiser un modèle Prisma complet. Les photos de ces contrôles sont publiques par URL aléatoire. Aucun téléphone, adresse, compte ou total financier n’est exposé.

## Notifications et temps réel

Les événements génèrent notifications et outbox dans la transaction métier. Les abonnements push sont limités à des fournisseurs reconnus pour éviter un proxy SSRF. SSE fournit les notifications lorsque la session est valide. Le travailleur durable traite les reprises des livraisons.

## Simplification métier

Stocks et IA sont retirés. Le périmètre du lot (province ou district de Kinshasa)
autorise son attribution, pas le site d’origine. Le champ SQL historique
`Autocollant.typeStock` reste mappé à `typeAutocollant` afin de conserver les QR.
Le nettoyage physique facultatif est séparé des migrations : voir `MISE_A_JOUR.md`.
Les descendants des affectations provinciales sont recalculés à chaque requête.
La reprise d’un dossier propre jamais attribué utilise le droit de création de l’agent.
Le moniteur responsable est le candidat habilité dont l’affectation territoriale
est la plus proche du site, sans GPS; une égalité exige un choix explicite.

## Typage

TypeScript strict sur les services et les composants. Une exception `Row` à la frontière des vues polymorphes permet d’afficher les structures JSON du contrat générique `Donnees`; elle est documentée à son point de déclaration. Cette exception n’est pas utilisée pour contourner le typage Prisma des transactions.

## Limites à vérifier avant ouverture nationale

Pagination indexée; génération/import par lots bornés; export synchrone limité. L’échelle de millions de dossiers n’a pas été éprouvée par un test de charge. La haute disponibilité, les exports asynchrones volumineux, les sauvegardes/restaurations et le dimensionnement doivent être validés sur l’infrastructure cible.