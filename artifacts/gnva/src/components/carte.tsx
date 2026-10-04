"use client";
import { useQuery } from "@tanstack/react-query";
import { MapPinned } from "lucide-react";
import { Badge, Btn, Empty, ErrorBox, PageHead, Skeleton } from "@/components/ui";
import { DataView } from "@/components/data-view";
import { apiJson, fmtDate, type Row } from "@/lib/utils";

const W = 760, H = 460, T = 256;
const px = (lon: number, z: number) => ((lon + 180) / 360) * T * 2 ** z;
const py = (lat: number, z: number) => {
  const r = (lat * Math.PI) / 180;
  return ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * T * 2 ** z;
};

function OsmMap({ pts }: { pts: Row[] }) {
  const lats = pts.map((p) => p.latitude as number), lons = pts.map((p) => p.longitude as number);
  const cLat = (Math.min(...lats) + Math.max(...lats)) / 2, cLon = (Math.min(...lons) + Math.max(...lons)) / 2;
  let z = 15;
  for (; z > 2; z--) {
    const w = Math.abs(px(Math.max(...lons), z) - px(Math.min(...lons), z)), h = Math.abs(py(Math.min(...lats), z) - py(Math.max(...lats), z));
    if (w < W - 120 && h < H - 120) break;
  }
  const cx = px(cLon, z), cy = py(cLat, z), n = 2 ** z;
  const x0 = Math.floor((cx - W / 2) / T), x1 = Math.floor((cx + W / 2) / T), y0 = Math.floor((cy - H / 2) / T), y1 = Math.floor((cy + H / 2) / T);
  const tiles: { x: number; y: number }[] = [];
  for (let x = x0; x <= x1; x++) for (let y = Math.max(0, y0); y <= Math.min(n - 1, y1); y++) tiles.push({ x, y });
  return (
    <div style={{ position: "relative", width: "100%", maxWidth: W, height: H, overflow: "hidden", borderRadius: 8, background: "#dfe6ee" }}>
      <div style={{ position: "absolute", left: "50%", top: "50%", width: 0, height: 0 }}>
        {tiles.map((t) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={`${t.x}-${t.y}`} alt="" loading="lazy" src={`https://tile.openstreetmap.org/${z}/${((t.x % n) + n) % n}/${t.y}.png`} width={T} height={T}
            style={{ position: "absolute", left: t.x * T - cx, top: t.y * T - cy, maxWidth: "none" }} />
        ))}
        {pts.map((p) => (
          <div key={String(p.id)} title={`${p.nom} - ${p.role}`} style={{ position: "absolute", left: px(p.longitude, z) - cx - 9, top: py(p.latitude, z) - cy - 22 }}>
            <MapPinned size={22} color={p.connecte ? "#1f8a4c" : "#c53030"} fill="#fff" />
          </div>
        ))}
      </div>
      <span style={{ position: "absolute", right: 4, bottom: 2, fontSize: 10, background: "#fffc", padding: "0 4px" }}>© OpenStreetMap</span>
    </div>
  );
}

export function Carte() {
  const q = useQuery({ queryKey: ["/api/v1/positions"], queryFn: () => apiJson<Row[]>("/api/v1/positions"), retry: false });
  const rows = (Array.isArray(q.data) ? q.data : []).filter((r) => r.partagePosition !== false);
  const pts = rows.filter((r) => typeof r.latitude === "number" && typeof r.longitude === "number");
  return (
    <div>
      <PageHead title="Carte nationale" sub="Dernières positions partagées volontairement par les agents."><Btn onClick={() => q.refetch()} disabled={q.isFetching}>Actualiser</Btn></PageHead>
      {q.isLoading ? <div className="card"><Skeleton /></div> : q.isError ? <ErrorBox error={q.error} retry={() => q.refetch()} /> : pts.length === 0 ? (
        <div className="card"><Empty title="Aucune position partagée" icon={<MapPinned size={34} />}>Les agents peuvent partager leur dernière position depuis leur page « Mon compte ». Aucune position n&apos;est suivie en continu.</Empty></div>
      ) : (
        <>
          <div className="card pad" style={{ marginBottom: 12 }}><OsmMap pts={pts} /></div>
          <div className="card"><DataView rows={pts} mode="table" titleOf={(r) => String(r.nom)} columns={[
            { key: "nom", label: "Agent" }, { key: "role", label: "Rôle" }, { key: "site", label: "Site" },
            { key: "lastSeen", label: "Dernière position", render: (r) => <Badge t="info">{fmtDate(r.lastSeen)}</Badge> },
            { key: "latitude", label: "Coordonnées", render: (r) => <span className="mono">{Number(r.latitude).toFixed(4)}, {Number(r.longitude).toFixed(4)}</span> }]} /></div>
        </>
      )}
    </div>
  );
}
