"use client";
import { useState } from "react";
import { ResourcePage, refOpts } from "@/components/resource-page";
import { useQueryClient } from "@tanstack/react-query";
import { useModifierRessource, useObtenirReferences } from "@workspace/api-client-react";
import { PageHead, Badge, Btn, useToast } from "@/components/ui";
import { useUser } from "@/components/shell";
import { PushControl } from "@/components/push";
import { invalidateData } from "@/lib/utils";
import { fmtMoney } from "@/lib/utils";
import type { Row } from "@/lib/utils";
import { zonesDuRole } from "@/lib/territoire";

export function Geographies() {
  return (
    <ResourcePage ressource="geographies" noun="géographie" title="Géographies" sub="Provinces, villes, communes : base des périmètres d'accès."
      titleOf={(r) => `${r.nom} (${r.code})`}
      columns={[{ key: "nom", label: "Nom" }, { key: "code", label: "Code" }, { key: "niveau", label: "Niveau" }, { key: "actif", label: "Actif" }]}
      fields={[
        { name: "nom", label: "Nom", required: true }, { name: "code", label: "Code", required: true },
        { name: "niveau", label: "Niveau", required: true, suggestions: ["PROVINCE", "DISTRICT", "VILLE", "TERRITOIRE", "COMMUNE"] },
        { name: "parentId", label: "Parent", type: "select", options: (r) => refOpts(r.geographies) },
        { name: "actif", label: "Actif", type: "checkbox" },
      ]}
      createPerm={["GEOGRAPHIE_GERER"]} editPerm={["GEOGRAPHIE_GERER"]} suspendPerm={["GEOGRAPHIE_GERER"]}
      setup="Commencez par créer les provinces, puis les villes et communes en choisissant leur parent." />
  );
}

export function Sites() {
  return (
    <ResourcePage ressource="sites" noun="site" title="Sites" sub="Points d'opération rattachés à une géographie."
      titleOf={(r) => `${r.nom} (${r.code})`}
      columns={[{ key: "nom", label: "Nom" }, { key: "code", label: "Code" }, { key: "geographie", label: "Géographie" }, { key: "adresse", label: "Adresse" },
        { key: "actif", label: "Statut", render: (r) => <Badge t={r.actif ? "ok" : "bad"}>{r.actif ? "Actif" : "Suspendu"}</Badge> }]}
      fields={[
        { name: "nom", label: "Nom", required: true }, { name: "code", label: "Code", required: true },
        { name: "geographieId", label: "Géographie", type: "select", required: true, options: (r) => refOpts(r.geographies) },
        { name: "adresse", label: "Adresse" },
        { name: "actif", label: "Actif (décocher pour suspendre)", type: "checkbox" },
      ]}
      createPerm={["SITE_GERER"]} editPerm={["SITE_GERER"]} suspendPerm={["SITE_GERER"]} filtreProvince
      setup="Créez d'abord au moins une géographie, puis ajoutez les sites." />
  );
}

export function Utilisateurs() {
  const [tab, setTab] = useState<"u" | "r">("u");
  const me = useUser();
  const peutVoirPermissions = me.roleCode ? ["SUPER_ADMIN", "ADMIN_NATIONAL"].includes(me.roleCode) : false;
  return (
    <div>
      <PageHead title="Utilisateurs" sub="Comptes, rôles, sites et zones d'accès." />
      <div className="tabs"><button className={tab === "u" ? "on" : ""} onClick={() => setTab("u")}>Utilisateurs</button>{peutVoirPermissions && <button className={tab === "r" ? "on" : ""} onClick={() => setTab("r")}>Rôles et permissions</button>}</div>
      {tab === "u" ? (
        <ResourcePage embedded ressource="utilisateurs" noun="utilisateur" title="Utilisateurs" titleOf={(r) => String(r.nom)}
          filtreProvince
          columns={[{ key: "nom", label: "Nom" }, { key: "email", label: "E-mail" }, { key: "role", label: "Rôle", render: (r) => r.role?.nom ?? "—" }, { key: "site", label: "Site" },
            { key: "actif", label: "Statut", render: (r) => <Badge t={r.actif ? "ok" : "bad"}>{r.actif ? "Actif" : "Inactif"}</Badge> }]}
          fields={[
            { name: "nom", label: "Nom complet", required: true }, { name: "email", label: "E-mail", required: true },
            { name: "roleId", label: "Rôle", type: "select", required: true, options: (r) => refOpts(r.roles) },
            { name: "siteId", label: "Site", type: "select", options: (r) => refOpts(r.sites) },
            { name: "motDePasse", label: "Mot de passe initial", type: "password", requiredOnCreate: true, minLength: 4, hint: "4 caractères minimum. Laisser vide en modification pour ne rien changer.", full: true },
            { name: "zoneIds", label: "Zones d'accès", type: "multi",
              hint: "Rôle provincial : uniquement des provinces. Les sites et sous-zones présents et futurs sont inclus automatiquement.",
              options: (r, v) => refOpts(zonesDuRole(r.roles?.find((role: {id:string}) => role.id === v.roleId)?.code ?? "", r.geographies ?? [])) },
            ...(peutVoirPermissions ? [{
              name: "permissions", label: "Permissions supplémentaires", type: "multi" as const,
              hint: "Les permissions de base du rôle sont incluses; seules les permissions absentes du rôle peuvent être ajoutées.",
              options: (r: Row, v: Row) => {
                const role = ((r.roles as Row[]) ?? []).find((item) => String(item.id) === String(v.roleId));
                const base = (Array.isArray(role?.permissions) ? role.permissions : []) as string[];
                return (((r.permissions as string[]) ?? []).filter((p) => !base.includes(p))).map((p) => ({ v: p, l: p }));
              },
            }] : []),
            { name: "porteeNationale", label: "Portée nationale (moniteur national explicitement habilité)", type: "checkbox", adminOnly: true },
            { name: "actif", label: "Compte actif", type: "checkbox" },
          ]}
          createPerm={["UTILISATEUR_CREER"]} editPerm={["UTILISATEUR_MODIFIER"]} suspendPerm={["UTILISATEUR_SUSPENDRE"]}
          setup="Créez un utilisateur en choisissant son rôle, son site et ses zones." />
      ) : (
        <ResourcePage embedded ressource="roles" noun="rôle" title="Rôles" titleOf={(r) => String(r.nom)}
          columns={[{ key: "nom", label: "Nom" }, { key: "code", label: "Code" }, { key: "permissions", label: "Permissions" }]}
          fields={[
            { name: "nom", label: "Nom", required: true }, { name: "code", label: "Code", required: true },
            { name: "permissions", label: "Permissions", type: "multi", options: (r) => ((r.permissions as string[]) ?? []).map((p) => ({ v: p, l: p })) },
          ]} createPerm={["PARAMETRE_MODIFIER"]} editPerm={["PARAMETRE_MODIFIER"]} />
      )}
    </div>
  );
}

export function Parametres() {
  const [tab, setTab] = useState<"p" | "t" | "f">("p");
  const refs = useObtenirReferences();
  const geographies = (refs.data?.geographies ?? []) as Row[];
  return (
    <div>
      <PageHead title="Paramètres" sub="Configuration générale, types de moto et tarifs." />
      <div className="tabs">
        <button className={tab === "p" ? "on" : ""} onClick={() => setTab("p")}>Paramètres</button>
        <button className={tab === "t" ? "on" : ""} onClick={() => setTab("t")}>Types de moto</button>
        <button className={tab === "f" ? "on" : ""} onClick={() => setTab("f")}>Tarifs</button>
      </div>
      {tab === "p" && (
        <ResourcePage embedded ressource="parametres" noun="paramètre" title="Paramètres" upsertEdit titleOf={(r) => String(r.cle)}
          columns={[{ key: "cle", label: "Clé" }, { key: "valeur", label: "Valeur" }]}
          fields={[{ name: "cle", label: "Clé", required: true }, { name: "valeur", label: "Valeur", required: true, type: "textarea" }]}
          createPerm={["PARAMETRE_MODIFIER"]} editPerm={["PARAMETRE_MODIFIER"]} suspendPerm={["PARAMETRE_MODIFIER"]}
          emptyHint="Aucun paramètre défini. Ajoutez des paires clé / valeur de configuration." />
      )}
      {tab === "t" && (
        <ResourcePage embedded ressource="types-moto" noun="type de moto" title="Types de moto" titleOf={(r) => String(r.nom)}
          columns={[{ key: "nom", label: "Nom" }, { key: "roues", label: "Roues" }, { key: "tarif", label: "Tarif de base général", render: (r) => fmtMoney(r.tarif) }, { key: "actif", label: "Actif" }]}
          fields={[{ name: "nom", label: "Nom", required: true }, { name: "roues", label: "Nombre de roues", type: "number", required: true }, { name: "tarif", label: "Tarif de base général", type: "number", required: true, hint: "Valeur de secours si aucun tarif actif ne correspond à la zone du site." }, { name: "actif", label: "Actif", type: "checkbox" }]}
          createPerm={["PARAMETRE_MODIFIER"]} editPerm={["PARAMETRE_MODIFIER"]} suspendPerm={["PARAMETRE_MODIFIER"]}
          setup="Les types de moto sont communs à tous les sites. Le tarif de base est général; des tarifs géographiques peuvent le remplacer." />
      )}
      {tab === "f" && (
        <ResourcePage embedded ressource="tarifs" noun="tarif" title="Tarifs" titleOf={(r) => String(r.nom)}
          columns={[{ key: "nom", label: "Nom" }, { key: "typeMoto", label: "Type de moto", render: (r) => String(r.typeMoto?.nom ?? "—") }, { key: "geographieId", label: "Portée géographique", render: (r) => String(geographies.find((g) => String(g.id) === String(r.geographieId))?.nom ?? "Tous les sites") }, { key: "montant", label: "Montant", render: (r) => fmtMoney(r.montant) }, { key: "debut", label: "Début" }, { key: "fin", label: "Fin" }, { key: "actif", label: "Actif" }]}
          fields={[
            { name: "nom", label: "Nom", required: true }, { name: "montant", label: "Montant", type: "number", required: true },
            { name: "typeMotoId", label: "Type de moto", type: "select", required: true, options: (r) => refOpts(r.typesMoto) },
            { name: "geographieId", label: "Portée géographique (vide = tous les sites)", type: "select", options: (r) => refOpts(r.geographies), hint: "Sélectionnez une province ou une zone pour limiter le tarif; laissez vide pour un tarif général." },
            { name: "debut", label: "Début", type: "date" }, { name: "fin", label: "Fin", type: "date" },
            { name: "actif", label: "Actif", type: "checkbox" },
          ]}
          createPerm={["PARAMETRE_MODIFIER"]} editPerm={["PARAMETRE_MODIFIER"]} suspendPerm={["PARAMETRE_MODIFIER"]}
          setup="Un tarif géographique remplace le tarif général pour les sites de sa zone. Le tarif le plus précis et actif est appliqué." />
      )}
    </div>
  );
}

export function Audit() {
  return <ResourcePage ressource="audit" noun="événement" title="Journal d'audit" sub="Trace immuable des actions sensibles." readOnly titleOf={(r) => String(r.action ?? r.id)} />;
}
export function Notifications() {
  const qc = useQueryClient();
  const toast = useToast();
  const mark = useModifierRessource({ mutation: { onSuccess: () => invalidateData(qc), onError: toast.err } });
  return (
    <div>
      <PushControl />
      <ResourcePage ressource="notifications" noun="notification" title="Notifications" sub="Alertes qui vous concernent." readOnly titleOf={(r) => String(r.titre ?? r.message ?? r.id)}
        extraActions={(r) => <>{typeof r.lien === "string" && r.lien.startsWith("/recouvrements?id=") &&
          <a className="btn sm primary" href={r.lien}>Ouvrir le recouvrement</a>}
          {r.luAt ? <Badge t="ok">Lue</Badge> : <Btn sm kind="primary" disabled={mark.isPending} onClick={() => mark.mutate({ ressource: "notifications", id: String(r.id), data: { lu: true } })}>Marquer comme lue</Btn>}</>} />
    </div>
  );
}
