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

