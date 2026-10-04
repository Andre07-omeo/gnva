# Guide d’utilisation GNVA

## Connexion et sécurité

Se connecter avec son compte nominatif. Lors de la première connexion, changer
le mot de passe temporaire avant toute opération. Les écrans et boutons
dépendent des droits et du périmètre attribués au compte.
Sur un poste partagé, utiliser **Déconnexion**, pas seulement fermer l’onglet.
Après confirmation du serveur, la page de connexion s’affiche; le bouton Retour
ne permet pas de réutiliser la session ou de revoir une interface privée en cache.

## Préparation par l’administrateur

1. Créer les provinces dans **Géographies**.
2. Pour Kinshasa, créer les districts sous la province, puis les sous-zones réelles.
3. Créer les **Sites** et les rattacher à ces géographies.
4. Définir les types de moto, les tarifs, la devise, l’exercice et le fuseau horaire.
5. Créer les comptes nominatifs et leurs habilitations.
6. Générer ou importer les QR dans leur périmètre territorial.
7. Vérifier un dossier, une attribution, un lien public et un recouvrement.

Il n’existe plus d’écran Stocks ni d’assistant IA. Aucun solde logistique ne bloque
l’attribution. Le timbre physique reste identifié par son numéro unique.
Ne pas distribuer les QR avant de configurer la vraie URL publique HTTPS.

## Rôles et affectations

| Rôle | Responsabilité principale |
|---|---|
| Super administrateur | Administration complète et habilitations |
| Administrateur national | Gestion nationale |
| Administrateur provincial | Gestion des provinces affectées |
| Administrateur de zone | Gestion territoriale selon les droits |
| Moniteur national | Rapports, recouvrements et première signature |
| Moniteur provincial | Consultation et rapports provinciaux |
| Agent | Enregistrement et/ou assignation QR de ses propres dossiers |

Les rôles provinciaux sélectionnent uniquement des **provinces** dans Zones
d’accès. Ils voient leurs sous-zones et sites, y compris ceux créés plus tard.
La date de création du compte ne limite pas l’historique accessible.
Les filtres de période peuvent cependant limiter les données affichées.
Les permissions personnalisées remplacent les droits du rôle; un tableau vide
retire tous les droits. Utiliser le rétablissement des droits du rôle si nécessaire.

## Tableau de bord terrain

Deux onglets seulement :
- **Enregistrement**, si le compte a `ASSUJETTI_CREER`;
- **Assignation QR**, s’il a `AUTOCOLLANT_ATTRIBUER`.

Sans le premier droit, l’agent ne peut ni créer ni reprendre un dossier.
Sans le second, il ne peut pas attribuer un autocollant.
Les indicateurs sont personnels et journaliers dans le fuseau configuré :
enregistrements, attributions, timbres et recettes. Ils se rafraîchissent
périodiquement et après une opération. Aucun fil d’activité récente n’est affiché.
Le journal d’audit reste conservé pour les utilisateurs habilités.

## Enregistrer et reprendre un dossier

Dans **Enregistrement**, choisir **Nouvel assujetti**. Renseigner identité,
téléphone, adresse, photo et moto. Fournir soit la plaque avec le châssis,
soit le châssis avec le moteur. Le site et le type de moto doivent être actifs.
La photo est contrôlée et recompressée par le serveur.

La vérification des doublons bloque une correspondance exacte; une ressemblance
demande une vérification explicite. Aucun succès n’est annoncé si le serveur
n’a pas confirmé l’écriture.

Pour reprendre un dossier propre jamais attribué, cliquer sur son nom dans la
liste/tableau/carte, ou sur **Reprendre l’enregistrement**. Le même formulaire
s’ouvre avec les données préremplies et le bouton **Valider**.
Il n’exige pas un droit séparé de modification pour l’agent.
Un dossier ayant déjà reçu un autocollant n’est plus modifiable, même avec le
droit de création. Les dossiers des autres agents restent inaccessibles.

## Assigner un QR

Dans **Assignation QR**, ouvrir son dossier puis **Attribuer**.
Saisir le numéro réel de l’autocollant et celui du timbre. Le serveur vérifie :
- le dossier appartient à l’agent;
- moto, site et type sont actifs, la moto n’est pas déclarée volée;
- l’autocollant est disponible et correspond au type de moto;
- son territoire couvre le site du dossier;
- le timbre et l’attribution ne sont pas déjà utilisés.

L’écriture financière et la réservation du QR sont atomiques. Une tentative
simultanée ne peut pas produire deux paiements ou deux attributions.
Les tarifs sont déterminés côté serveur, pas par le formulaire.

## Générer et importer les autocollants

Dans **Autocollants**, utiliser **Générer une série** ou **Importer CSV**.
Pour une province autre que Kinshasa, choisir seulement la province.
Pour Kinshasa, choisir obligatoirement un district.
Les QR ne sont utilisables que dans ce périmètre, quel que soit leur site
d’origine conservé pour la traçabilité. Un site actif doit exister dans la zone.

Une plage de génération est limitée à 10 000 QR; le préfixe, la série et les
numéros doivent être valides et uniques. L’import affiche un aperçu sans écriture;
**Confirmer l’import** réalise l’écriture. Modifier un champ annule l’aperçu.
Un numéro déjà enregistré fait échouer l’opération, sans import partiel.

## Recouvrement et notifications

Le moniteur habilité crée une demande par site et période, sans dépasser les
recettes disponibles après les demandes déjà réservées ou validées.
Choisir le site déclenche la recherche du moniteur responsable :
l’affectation territoriale la plus proche est retenue, sans géolocalisation.
Si plusieurs moniteurs sont équivalents, choisir explicitement l’un d’eux.

Le responsable du site doit être une autre personne, active, rattachée au site
et habilitée à valider. S’il manque un signataire, corriger les affectations
dans Utilisateurs avant la création.

1. Le moniteur désigné reçoit une notification avec **Ouvrir le recouvrement**.
2. Il se connecte, contrôle la demande puis **Valider (1/2)**.
3. Le responsable du site reçoit son lien, puis **Valider (2/2)**.
4. Le reçu affiche les deux signatures. Le recouvrement devient immuable.

La répartition est automatique : **50 % Dispromalt et 50 % province**.
Les tableaux de bord présentent les parts réellement validées, pas les
demandes en attente. Le serveur interdit le rejeu et une double signature
par la même personne. Une notification contient un lien, jamais une
validation automatique ou une URL permettant de se passer d’authentification.
Le Web Push nécessite une configuration VAPID volontaire; les notifications
dans l’application restent disponibles sans ces clés.

## Rapports, transactions et impression

Choisir la période et les filtres autorisés. Sans période, les statistiques et
transactions portent sur la journée du fuseau configuré.
Les montants Dispromalt/province concernent les recouvrements validés.
Les tableaux de bord provinciaux ne contiennent pas d’activité récente.

**Imprimer le rapport complet** ouvre un document comprenant les statistiques,
la liste des sites et toutes les transactions filtrées, pas uniquement la page
courante de la liste. La limite est de 10 000 transactions; au-delà, réduire la
période. Dans le document, choisir **Imprimer / Enregistrer en PDF**.
Les transactions à l’écran sont paginées; **CSV** exporte les données filtrées.
Les impressions individuelles (ticket, QR, attribution, reçu) restent séparées.

## Vérification publique, vol et audit

Un QR ouvre une page de contrôle public à données limitées. Les comptes,
téléphone, adresse et totaux financiers n’y sont pas exposés.
La caméra demande une permission du navigateur et HTTPS sur l’appareil.
Une déclaration de vol affiche l’avertissement public et bloque une nouvelle
attribution. Le **Journal d’audit** conserve les actions sensibles.

## Mon compte, carte et suspension

**Mon compte** permet de changer son mot de passe, de se déconnecter et de
partager volontairement sa position. Le partage peut être retiré. Aucun suivi
GPS permanent n’est imposé. La carte nationale reste réservée aux comptes habilités.
La suspension d’un site bloque ses utilisateurs et sessions.

## Installation, mise à jour et limites

Suivre `COMPILATION.md` pour compiler et `docs/MISE_A_JOUR.md` pour mettre à jour
MySQL sans reset. Le nettoyage physique Stocks/IA est facultatif et destructif
pour leurs seuls historiques : sauvegarde préalable obligatoire.

La livraison des sources n’est pas une mise en production. L’infrastructure,
HTTPS, stockage durable, sauvegardes et restauration, charge et tests sur
téléphones physiques restent à valider sur l’environnement cible.