-- Mise à jour additive : aucune suppression de données métier.
-- Le retrait PHYSIQUE des anciens modules est volontaire et séparé :
-- docs/sql/NETTOYAGE_STOCK_IA.sql (sauvegarde obligatoire avant exécution).
ALTER TABLE `Recouvrement` ADD COLUMN `moniteurId` VARCHAR(30) NULL;
ALTER TABLE `Notification` ADD COLUMN `lien` VARCHAR(255) NULL;