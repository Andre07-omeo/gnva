"use client";
import { useEffect, useState } from "react";
import { BellRing } from "lucide-react";
import { Btn, useToast } from "@/components/ui";
import { apiJson } from "@/lib/utils";

function key(b64: string) {
  const p = "=".repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + p).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

export function PushControl() {
  const toast = useToast();
  const [publicKey, setPublicKey] = useState<string | null | undefined>(undefined);
  const [active, setActive] = useState(false);
  const [busy, setBusy] = useState(false);
  const supported = typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

  useEffect(() => {
    apiJson<{ publicKey?: string }>("/api/v1/push/config").then((r) => setPublicKey(r.publicKey || null)).catch(() => setPublicKey(null));
    if ("serviceWorker" in navigator)
      navigator.serviceWorker.ready.then((r) => r.pushManager.getSubscription()).then((s) => setActive(!!s)).catch(() => {});
  }, []);

  const enable = async () => {
    if (!publicKey) return;
    setBusy(true);
    try {
      if ((await Notification.requestPermission()) !== "granted") throw new Error("Autorisation de notification refusée par le navigateur.");
      const reg = await navigator.serviceWorker.ready;
      const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key(publicKey) as BufferSource }));
      await apiJson("/api/v1/push/abonnement", { method: "POST", body: sub.toJSON() });
      setActive(true);
      toast.ok("Notifications push activées sur cet appareil");
    } catch (e) { toast.err((e as Error).message ? (e as Error).message : e); } finally { setBusy(false); }
  };

  return (
    <div className="card pad" style={{ marginBottom: 14, display: "flex", gap: 12, alignItems: "center", justifyContent: "space-between", flexWrap: "wrap" }}>
      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
        <BellRing size={20} />
        <div><b>Notifications push</b>
          <div style={{ color: "var(--muted)", fontSize: 12.5 }}>
            {publicKey === undefined ? "Vérification de la disponibilité..." : !supported ? "Ce navigateur ne prend pas en charge les notifications push."
              : !publicKey ? "Service indisponible : aucune clé push n'est configurée sur le serveur."
              : active ? "Cet appareil est abonné." : "Recevez les alertes même application fermée."}
          </div>
        </div>
      </div>
      {supported && publicKey && !active && <Btn kind="primary" disabled={busy} onClick={enable}>{busy ? "Activation..." : "Activer sur cet appareil"}</Btn>}
    </div>
  );
}
