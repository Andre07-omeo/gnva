-- Politique demandée : minimum 4 caractères et aucun changement imposé.
-- Aucun mot de passe, dossier, QR ou historique financier n'est réinitialisé.
UPDATE `ParametreSysteme` SET `valeur` = '4'
WHERE `cle` = 'longueurMotDePasse';
UPDATE `Utilisateur` SET `changementRequis` = false
WHERE `changementRequis` = true;
ALTER TABLE `Utilisateur` ALTER COLUMN `changementRequis` SET DEFAULT false;