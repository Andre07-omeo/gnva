-- GNVA : STRUCTURE VIDE MySQL 8.4. Aucune donnée existante.
-- Importer UNE SEULE FOIS, uniquement dans une base neuve sélectionnée.
-- Lire LIRE_AVANT_IMPORT.md ; utiliser Prisma de préférence.

SET NAMES utf8mb4;

-- Migration : 202610030001_initial
-- CreateTable
CREATE TABLE `Role` (
    `id` VARCHAR(30) NOT NULL,
    `code` VARCHAR(60) NOT NULL,
    `nom` VARCHAR(120) NOT NULL,

    UNIQUE INDEX `Role_code_key`(`code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Permission` (
    `code` VARCHAR(80) NOT NULL,
    `nom` VARCHAR(160) NOT NULL,

    PRIMARY KEY (`code`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `RolePermission` (
    `roleId` VARCHAR(30) NOT NULL,
    `permissionCode` VARCHAR(80) NOT NULL,

    PRIMARY KEY (`roleId`, `permissionCode`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Utilisateur` (
    `id` VARCHAR(30) NOT NULL,
    `nom` VARCHAR(140) NOT NULL,
    `email` VARCHAR(190) NOT NULL,
    `motDePasseHash` VARCHAR(255) NOT NULL,
    `changementRequis` BOOLEAN NOT NULL DEFAULT true,
    `actif` BOOLEAN NOT NULL DEFAULT true,
    `roleId` VARCHAR(30) NOT NULL,
    `siteId` VARCHAR(30) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Utilisateur_email_key`(`email`),
    INDEX `Utilisateur_siteId_actif_idx`(`siteId`, `actif`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AffectationZone` (
    `utilisateurId` VARCHAR(30) NOT NULL,
    `geographieId` VARCHAR(30) NOT NULL,

    PRIMARY KEY (`utilisateurId`, `geographieId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Session` (
    `id` VARCHAR(30) NOT NULL,
    `utilisateurId` VARCHAR(30) NOT NULL,
    `empreinte` CHAR(64) NOT NULL,
    `csrfHash` CHAR(64) NOT NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `revokedAt` DATETIME(3) NULL,
    `appareil` VARCHAR(255) NULL,
    `ip` VARCHAR(45) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `Session_empreinte_key`(`empreinte`),
    INDEX `Session_utilisateurId_expiresAt_idx`(`utilisateurId`, `expiresAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Geographie` (
    `id` VARCHAR(30) NOT NULL,
    `nom` VARCHAR(140) NOT NULL,
    `code` VARCHAR(50) NOT NULL,
    `niveau` VARCHAR(60) NOT NULL,
    `parentId` VARCHAR(30) NULL,
    `actif` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `Geographie_code_key`(`code`),
    INDEX `Geographie_parentId_actif_idx`(`parentId`, `actif`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `FermetureGeographique` (
    `ancetreId` VARCHAR(30) NOT NULL,
    `descendantId` VARCHAR(30) NOT NULL,
    `profondeur` INTEGER NOT NULL,

    INDEX `FermetureGeographique_descendantId_ancetreId_idx`(`descendantId`, `ancetreId`),
    PRIMARY KEY (`ancetreId`, `descendantId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Site` (
    `id` VARCHAR(30) NOT NULL,
    `nom` VARCHAR(140) NOT NULL,
    `code` VARCHAR(50) NOT NULL,
    `geographieId` VARCHAR(30) NOT NULL,
    `adresse` VARCHAR(255) NULL,
    `actif` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `Site_code_key`(`code`),
    INDEX `Site_geographieId_actif_idx`(`geographieId`, `actif`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `TypeMoto` (
    `id` VARCHAR(30) NOT NULL,
    `nom` VARCHAR(120) NOT NULL,
    `roues` INTEGER NOT NULL,
    `tarif` DECIMAL(15, 2) NOT NULL DEFAULT 0,
    `actif` BOOLEAN NOT NULL DEFAULT true,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Tarif` (
    `id` VARCHAR(30) NOT NULL,
    `nom` VARCHAR(140) NOT NULL,
    `typeMotoId` VARCHAR(30) NOT NULL,
    `geographieId` VARCHAR(30) NULL,
    `montant` DECIMAL(15, 2) NOT NULL,
    `debut` DATE NOT NULL,
    `fin` DATE NULL,
    `actif` BOOLEAN NOT NULL DEFAULT true,

    INDEX `Tarif_typeMotoId_geographieId_debut_idx`(`typeMotoId`, `geographieId`, `debut`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Assujetti` (
    `id` VARCHAR(30) NOT NULL,
    `reference` VARCHAR(60) NOT NULL,
    `nom` VARCHAR(100) NOT NULL,
    `postnom` VARCHAR(100) NOT NULL,
    `prenom` VARCHAR(100) NULL,
    `sexe` VARCHAR(20) NOT NULL,
    `naissance` DATE NULL,
    `telephone` VARCHAR(32) NOT NULL,
    `adresse` VARCHAR(255) NOT NULL,
    `typePiece` VARCHAR(60) NULL,
    `numeroPiece` VARCHAR(100) NULL,
    `photoUrl` VARCHAR(255) NOT NULL,
    `siteId` VARCHAR(30) NOT NULL,
    `createurId` VARCHAR(30) NOT NULL,
    `exercice` INTEGER NOT NULL,
    `statut` VARCHAR(30) NOT NULL DEFAULT 'ACTIF',
    `deletedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Assujetti_reference_key`(`reference`),
    INDEX `Assujetti_siteId_createdAt_idx`(`siteId`, `createdAt`),
    INDEX `Assujetti_createurId_createdAt_idx`(`createurId`, `createdAt`),
    INDEX `Assujetti_telephone_idx`(`telephone`),
    INDEX `Assujetti_nom_postnom_idx`(`nom`, `postnom`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Moto` (
    `id` VARCHAR(30) NOT NULL,
    `assujettiId` VARCHAR(30) NOT NULL,
    `typeMotoId` VARCHAR(30) NOT NULL,
    `plaque` VARCHAR(80) NOT NULL,
    `chassis` VARCHAR(100) NULL,
    `moteur` VARCHAR(100) NULL,
    `marque` VARCHAR(100) NULL,
    `couleur` VARCHAR(80) NULL,
    `vole` BOOLEAN NOT NULL DEFAULT false,

    UNIQUE INDEX `Moto_assujettiId_key`(`assujettiId`),
    INDEX `Moto_plaque_idx`(`plaque`),
    INDEX `Moto_chassis_idx`(`chassis`),
    INDEX `Moto_moteur_idx`(`moteur`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `DeclarationVol` (
    `id` VARCHAR(30) NOT NULL,
    `motoId` VARCHAR(30) NOT NULL,
    `reference` VARCHAR(60) NOT NULL,
    `auteurId` VARCHAR(30) NOT NULL,
    `commentaire` TEXT NULL,
    `statut` VARCHAR(30) NOT NULL DEFAULT 'DECLARE',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `DeclarationVol_reference_key`(`reference`),
    INDEX `DeclarationVol_motoId_statut_idx`(`motoId`, `statut`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `LotAutocollants` (
    `id` VARCHAR(30) NOT NULL,
    `serie` VARCHAR(60) NOT NULL,
    `prefixe` VARCHAR(30) NOT NULL,
    `debut` INTEGER NOT NULL,
    `fin` INTEGER NOT NULL,
    `longueur` INTEGER NOT NULL,
    `geographieId` VARCHAR(30) NOT NULL,
    `createurId` VARCHAR(30) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `LotAutocollants_serie_key`(`serie`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Autocollant` (
    `id` VARCHAR(30) NOT NULL,
    `numero` VARCHAR(80) NOT NULL,
    `jeton` VARCHAR(64) NOT NULL,
    `lotId` VARCHAR(30) NULL,
    `geographieId` VARCHAR(30) NOT NULL,
    `siteId` VARCHAR(30) NOT NULL,
    `typeStock` VARCHAR(40) NOT NULL,
    `statut` VARCHAR(30) NOT NULL DEFAULT 'DISPONIBLE',
    `urlPublique` VARCHAR(500) NULL,
    `mouvementId` VARCHAR(30) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `Autocollant_numero_key`(`numero`),
    UNIQUE INDEX `Autocollant_jeton_key`(`jeton`),
    INDEX `Autocollant_siteId_typeStock_statut_idx`(`siteId`, `typeStock`, `statut`),
    INDEX `Autocollant_geographieId_statut_idx`(`geographieId`, `statut`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Attribution` (
    `id` VARCHAR(30) NOT NULL,
    `reference` VARCHAR(60) NOT NULL,
    `assujettiId` VARCHAR(30) NOT NULL,
    `autocollantId` VARCHAR(30) NOT NULL,
    `numeroTimbre` VARCHAR(80) NOT NULL,
    `agentId` VARCHAR(30) NOT NULL,
    `exercice` INTEGER NOT NULL,
    `montant` DECIMAL(15, 2) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `Attribution_reference_key`(`reference`),
    UNIQUE INDEX `Attribution_autocollantId_key`(`autocollantId`),
    UNIQUE INDEX `Attribution_numeroTimbre_key`(`numeroTimbre`),
    INDEX `Attribution_agentId_createdAt_idx`(`agentId`, `createdAt`),
    UNIQUE INDEX `Attribution_assujettiId_exercice_key`(`assujettiId`, `exercice`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `SoldeStock` (
    `siteId` VARCHAR(30) NOT NULL,
    `typeStock` VARCHAR(40) NOT NULL,
    `quantite` INTEGER NOT NULL DEFAULT 0,

    PRIMARY KEY (`siteId`, `typeStock`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `MouvementStock` (
    `id` VARCHAR(30) NOT NULL,
    `reference` VARCHAR(60) NOT NULL,
    `typeStock` VARCHAR(40) NOT NULL,
    `quantite` INTEGER NOT NULL,
    `sourceId` VARCHAR(30) NULL,
    `destinationId` VARCHAR(30) NOT NULL,
    `auteurId` VARCHAR(30) NOT NULL,
    `commentaire` TEXT NULL,
    `statut` VARCHAR(30) NOT NULL DEFAULT 'EN_PREPARATION',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `MouvementStock_reference_key`(`reference`),
    INDEX `MouvementStock_destinationId_statut_createdAt_idx`(`destinationId`, `statut`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ValidationStock` (
    `id` VARCHAR(30) NOT NULL,
    `mouvementId` VARCHAR(30) NOT NULL,
    `utilisateurId` VARCHAR(30) NOT NULL,
    `statut` VARCHAR(30) NOT NULL,
    `commentaire` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `TransactionFinanciere` (
    `id` VARCHAR(30) NOT NULL,
    `reference` VARCHAR(60) NOT NULL,
    `siteId` VARCHAR(30) NOT NULL,
    `attributionId` VARCHAR(30) NOT NULL,
    `auteurId` VARCHAR(30) NOT NULL,
    `montant` DECIMAL(15, 2) NOT NULL,
    `devise` VARCHAR(10) NOT NULL DEFAULT 'CDF',
    `statut` VARCHAR(30) NOT NULL DEFAULT 'ENCAISSE',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `TransactionFinanciere_reference_key`(`reference`),
    UNIQUE INDEX `TransactionFinanciere_attributionId_key`(`attributionId`),
    INDEX `TransactionFinanciere_siteId_createdAt_idx`(`siteId`, `createdAt`),
    INDEX `TransactionFinanciere_auteurId_createdAt_idx`(`auteurId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Recouvrement` (
    `id` VARCHAR(30) NOT NULL,
    `reference` VARCHAR(60) NOT NULL,
    `siteId` VARCHAR(30) NOT NULL,
    `montant` DECIMAL(15, 2) NOT NULL,
    `partDispromalt` DECIMAL(15, 2) NOT NULL,
    `partProvince` DECIMAL(15, 2) NOT NULL,
    `debut` DATE NOT NULL,
    `fin` DATE NOT NULL,
    `auteurId` VARCHAR(30) NOT NULL,
    `statut` VARCHAR(30) NOT NULL DEFAULT 'EN_ATTENTE',
    `commentaire` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `Recouvrement_reference_key`(`reference`),
    INDEX `Recouvrement_siteId_statut_createdAt_idx`(`siteId`, `statut`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ValidationRecouvrement` (
    `id` VARCHAR(30) NOT NULL,
    `recouvrementId` VARCHAR(30) NOT NULL,
    `utilisateurId` VARCHAR(30) NOT NULL,
    `nomValidateur` VARCHAR(140) NOT NULL,
    `etape` INTEGER NOT NULL,
    `signature` CHAR(64) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `ValidationRecouvrement_recouvrementId_etape_key`(`recouvrementId`, `etape`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `JournalAudit` (
    `id` VARCHAR(30) NOT NULL,
    `utilisateurId` VARCHAR(30) NULL,
    `nomUtilisateur` VARCHAR(140) NOT NULL,
    `role` VARCHAR(60) NOT NULL,
    `action` VARCHAR(80) NOT NULL,
    `module` VARCHAR(60) NOT NULL,
    `objetId` VARCHAR(80) NULL,
    `siteId` VARCHAR(30) NULL,
    `avant` JSON NULL,
    `apres` JSON NULL,
    `ip` VARCHAR(45) NULL,
    `appareil` VARCHAR(255) NULL,
    `sessionId` VARCHAR(30) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `JournalAudit_siteId_createdAt_idx`(`siteId`, `createdAt`),
    INDEX `JournalAudit_utilisateurId_createdAt_idx`(`utilisateurId`, `createdAt`),
    INDEX `JournalAudit_module_createdAt_idx`(`module`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Notification` (
    `id` VARCHAR(30) NOT NULL,
    `utilisateurId` VARCHAR(30) NOT NULL,
    `titre` VARCHAR(200) NOT NULL,
    `message` TEXT NOT NULL,
    `type` VARCHAR(50) NOT NULL,
    `luAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `Notification_utilisateurId_createdAt_idx`(`utilisateurId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AbonnementPush` (
    `id` VARCHAR(30) NOT NULL,
    `utilisateurId` VARCHAR(30) NOT NULL,
    `endpoint` VARCHAR(500) NOT NULL,
    `p256dh` VARCHAR(255) NOT NULL,
    `auth` VARCHAR(255) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `AbonnementPush_endpoint_key`(`endpoint`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ParametreSysteme` (
    `id` VARCHAR(30) NOT NULL,
    `cle` VARCHAR(100) NOT NULL,
    `valeur` JSON NOT NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `ParametreSysteme_cle_key`(`cle`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `RolePermission` ADD CONSTRAINT `RolePermission_roleId_fkey` FOREIGN KEY (`roleId`) REFERENCES `Role`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `RolePermission` ADD CONSTRAINT `RolePermission_permissionCode_fkey` FOREIGN KEY (`permissionCode`) REFERENCES `Permission`(`code`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Utilisateur` ADD CONSTRAINT `Utilisateur_roleId_fkey` FOREIGN KEY (`roleId`) REFERENCES `Role`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Utilisateur` ADD CONSTRAINT `Utilisateur_siteId_fkey` FOREIGN KEY (`siteId`) REFERENCES `Site`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AffectationZone` ADD CONSTRAINT `AffectationZone_utilisateurId_fkey` FOREIGN KEY (`utilisateurId`) REFERENCES `Utilisateur`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AffectationZone` ADD CONSTRAINT `AffectationZone_geographieId_fkey` FOREIGN KEY (`geographieId`) REFERENCES `Geographie`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Session` ADD CONSTRAINT `Session_utilisateurId_fkey` FOREIGN KEY (`utilisateurId`) REFERENCES `Utilisateur`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Geographie` ADD CONSTRAINT `Geographie_parentId_fkey` FOREIGN KEY (`parentId`) REFERENCES `Geographie`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `FermetureGeographique` ADD CONSTRAINT `FermetureGeographique_ancetreId_fkey` FOREIGN KEY (`ancetreId`) REFERENCES `Geographie`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `FermetureGeographique` ADD CONSTRAINT `FermetureGeographique_descendantId_fkey` FOREIGN KEY (`descendantId`) REFERENCES `Geographie`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Site` ADD CONSTRAINT `Site_geographieId_fkey` FOREIGN KEY (`geographieId`) REFERENCES `Geographie`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Tarif` ADD CONSTRAINT `Tarif_typeMotoId_fkey` FOREIGN KEY (`typeMotoId`) REFERENCES `TypeMoto`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Assujetti` ADD CONSTRAINT `Assujetti_siteId_fkey` FOREIGN KEY (`siteId`) REFERENCES `Site`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Moto` ADD CONSTRAINT `Moto_assujettiId_fkey` FOREIGN KEY (`assujettiId`) REFERENCES `Assujetti`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Moto` ADD CONSTRAINT `Moto_typeMotoId_fkey` FOREIGN KEY (`typeMotoId`) REFERENCES `TypeMoto`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `DeclarationVol` ADD CONSTRAINT `DeclarationVol_motoId_fkey` FOREIGN KEY (`motoId`) REFERENCES `Moto`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Autocollant` ADD CONSTRAINT `Autocollant_lotId_fkey` FOREIGN KEY (`lotId`) REFERENCES `LotAutocollants`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Autocollant` ADD CONSTRAINT `Autocollant_siteId_fkey` FOREIGN KEY (`siteId`) REFERENCES `Site`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Autocollant` ADD CONSTRAINT `Autocollant_mouvementId_fkey` FOREIGN KEY (`mouvementId`) REFERENCES `MouvementStock`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Attribution` ADD CONSTRAINT `Attribution_assujettiId_fkey` FOREIGN KEY (`assujettiId`) REFERENCES `Assujetti`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Attribution` ADD CONSTRAINT `Attribution_autocollantId_fkey` FOREIGN KEY (`autocollantId`) REFERENCES `Autocollant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SoldeStock` ADD CONSTRAINT `SoldeStock_siteId_fkey` FOREIGN KEY (`siteId`) REFERENCES `Site`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MouvementStock` ADD CONSTRAINT `MouvementStock_sourceId_fkey` FOREIGN KEY (`sourceId`) REFERENCES `Site`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MouvementStock` ADD CONSTRAINT `MouvementStock_destinationId_fkey` FOREIGN KEY (`destinationId`) REFERENCES `Site`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ValidationStock` ADD CONSTRAINT `ValidationStock_mouvementId_fkey` FOREIGN KEY (`mouvementId`) REFERENCES `MouvementStock`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TransactionFinanciere` ADD CONSTRAINT `TransactionFinanciere_siteId_fkey` FOREIGN KEY (`siteId`) REFERENCES `Site`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Recouvrement` ADD CONSTRAINT `Recouvrement_siteId_fkey` FOREIGN KEY (`siteId`) REFERENCES `Site`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ValidationRecouvrement` ADD CONSTRAINT `ValidationRecouvrement_recouvrementId_fkey` FOREIGN KEY (`recouvrementId`) REFERENCES `Recouvrement`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Notification` ADD CONSTRAINT `Notification_utilisateurId_fkey` FOREIGN KEY (`utilisateurId`) REFERENCES `Utilisateur`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AbonnementPush` ADD CONSTRAINT `AbonnementPush_utilisateurId_fkey` FOREIGN KEY (`utilisateurId`) REFERENCES `Utilisateur`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;


-- Migration : 202610030002_metier
-- AlterTable
ALTER TABLE `Recouvrement` ADD COLUMN `utilisateurConcerneId` VARCHAR(30) NULL;

-- AlterTable
ALTER TABLE `Session` ADD COLUMN `lastSeenAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3);

-- AlterTable
ALTER TABLE `Utilisateur` ADD COLUMN `latitude` DOUBLE NULL,
    ADD COLUMN `longitude` DOUBLE NULL,
    ADD COLUMN `partagePosition` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `permissionsPersonnalisees` JSON NULL,
    ADD COLUMN `porteeNationale` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `positionAt` DATETIME(3) NULL;

-- CreateTable
CREATE TABLE `Timbre` (
    `numero` VARCHAR(80) NOT NULL,
    `siteId` VARCHAR(30) NOT NULL,
    `statut` VARCHAR(30) NOT NULL DEFAULT 'ATTRIBUE',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `Timbre_siteId_createdAt_idx`(`siteId`, `createdAt`),
    PRIMARY KEY (`numero`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ActionAssistant` (
    `id` VARCHAR(30) NOT NULL,
    `utilisateurId` VARCHAR(30) NOT NULL,
    `cibleId` VARCHAR(30) NOT NULL,
    `type` VARCHAR(50) NOT NULL,
    `statut` VARCHAR(30) NOT NULL DEFAULT 'EN_ATTENTE',
    `expiresAt` DATETIME(3) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `ActionAssistant_utilisateurId_expiresAt_idx`(`utilisateurId`, `expiresAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `LivraisonPush` (
    `id` VARCHAR(30) NOT NULL,
    `utilisateurId` VARCHAR(30) NOT NULL,
    `titre` VARCHAR(200) NOT NULL,
    `message` TEXT NOT NULL,
    `tentatives` INTEGER NOT NULL DEFAULT 0,
    `prochaineTentative` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `envoyeeAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `LivraisonPush_envoyeeAt_prochaineTentative_idx`(`envoyeeAt`, `prochaineTentative`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Attribution` ADD CONSTRAINT `Attribution_numeroTimbre_fkey` FOREIGN KEY (`numeroTimbre`) REFERENCES `Timbre`(`numero`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Timbre` ADD CONSTRAINT `Timbre_siteId_fkey` FOREIGN KEY (`siteId`) REFERENCES `Site`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TransactionFinanciere` ADD CONSTRAINT `TransactionFinanciere_attributionId_fkey` FOREIGN KEY (`attributionId`) REFERENCES `Attribution`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;


-- Migration : 202610030003_simplification
-- Mise à jour additive : aucune suppression de données métier.
-- Le retrait PHYSIQUE des anciens modules est volontaire et séparé :
-- docs/sql/NETTOYAGE_STOCK_IA.sql (sauvegarde obligatoire avant exécution).
ALTER TABLE `Recouvrement` ADD COLUMN `moniteurId` VARCHAR(30) NULL;
ALTER TABLE `Notification` ADD COLUMN `lien` VARCHAR(255) NULL;

-- Nouvelle base uniquement : retirer les tables historiques inutilisées.
-- GNVA : nettoyage volontaire, uniquement APRES sauvegarde et migrations Prisma.
-- IRREVERSIBLE : détruit l'historique logistique Stocks et les propositions IA.
-- Ne touche PAS aux utilisateurs, photos, dossiers, QR, attributions, timbres,
-- transactions, recouvrements, signatures ni journal d'audit.
-- Ne pas désactiver FOREIGN_KEY_CHECKS. Une dépendance externe doit bloquer le DROP.

DROP TABLE IF EXISTS `ValidationStock`;
-- Retirer uniquement la référence logistique obsolète des QR, jamais leurs données métier.
SET @gnva_ddl = IF(EXISTS(
  SELECT 1 FROM information_schema.TABLE_CONSTRAINTS
   WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'Autocollant'
     AND CONSTRAINT_NAME = 'Autocollant_mouvementId_fkey'
), 'ALTER TABLE `Autocollant` DROP FOREIGN KEY `Autocollant_mouvementId_fkey`', 'SELECT 1');
PREPARE gnva_nettoyage FROM @gnva_ddl;
EXECUTE gnva_nettoyage;
DEALLOCATE PREPARE gnva_nettoyage;
SET @gnva_ddl = IF(EXISTS(
  SELECT 1 FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Autocollant' AND COLUMN_NAME = 'mouvementId'
), 'ALTER TABLE `Autocollant` DROP COLUMN `mouvementId`', 'SELECT 1');
PREPARE gnva_nettoyage FROM @gnva_ddl;
EXECUTE gnva_nettoyage;
DEALLOCATE PREPARE gnva_nettoyage;
DROP TABLE IF EXISTS `MouvementStock`;
DROP TABLE IF EXISTS `SoldeStock`;
DROP TABLE IF EXISTS `ActionAssistant`;
DELETE FROM `RolePermission`
 WHERE `permissionCode` LIKE 'STOCK!_%' ESCAPE '!'
    OR `permissionCode` LIKE 'ASSISTANT!_%' ESCAPE '!';
DELETE FROM `Permission`
 WHERE `code` LIKE 'STOCK!_%' ESCAPE '!'
    OR `code` LIKE 'ASSISTANT!_%' ESCAPE '!';
DELETE FROM `ParametreSysteme` WHERE `cle` IN ('typesStock', 'aiModel');
-- Les anciennes permissions JSON personnalisées sont ignorées par le serveur.
-- Le champ Autocollant.typeStock reste nécessaire pour les autocollants historiques.