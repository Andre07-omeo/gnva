"use client";
import { useState } from "react";
import { Field } from "@/components/ui";
import { estKinshasa, normaliserTerritoire, provinceDe } from "@/lib/territoire";
import type { Row } from "@/lib/utils";

export function ZoneLot({ zones, onChange }: { zones: Row[]; onChange: (id: string) => void }) {
  const [provinceId, setProvince] = useState("");
  const [districtId, setDistrict] = useState("");
  const provinces = zones.filter(g => normaliserTerritoire(g.niveau) === "PROVINCE");
  const province = provinces.find(g => g.id === provinceId);
  const kin = !!province && estKinshasa(province as { nom: string; code: string });
  const districts = zones.filter(g => normaliserTerritoire(g.niveau) === "DISTRICT" &&
    provinceDe(g as never, zones as never)?.id === provinceId);
  return <>
    <Field label="Province *"><select className="input" value={provinceId} onChange={e => {
      const id = e.target.value;
      const p = provinces.find(g => g.id === id);
      setProvince(id); setDistrict("");
      onChange(p && !estKinshasa(p as { nom: string; code: string }) ? id : "");
    }}><option value="">Choisir une province…</option>
      {provinces.map(g => <option key={g.id} value={g.id}>{g.nom}</option>)}</select></Field>
    {kin && <Field label="District de Kinshasa *"><select className="input" value={districtId} onChange={e => {
      setDistrict(e.target.value); onChange(e.target.value);
    }}><option value="">Choisir un district…</option>
      {districts.map(g => <option key={g.id} value={g.id}>{g.nom}</option>)}</select></Field>}
    {kin && !districts.length && <p role="alert">Créez un district sous Kinshasa avant de générer ou importer.</p>}
  </>;
}