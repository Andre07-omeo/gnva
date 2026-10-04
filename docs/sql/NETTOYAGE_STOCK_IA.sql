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