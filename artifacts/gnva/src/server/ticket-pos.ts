/** Aperçu thermique. La longueur du rouleau dépend du pilote de l'imprimante. */
export function ticketPOS(d: Record<string, unknown>, qr: string, largeur: 58 | 80, echapper: (v: unknown) => string) {
  const nom = [d.nom, d.postnom, d.prenom].filter(Boolean).join(" ");
  const date = d.createdAt ? new Date(String(d.createdAt)).toLocaleString("fr-FR", { timeZone: "Africa/Kinshasa" }) : "";
  const champ = (label: string, valeur: unknown) => valeur
    ? `<div class="ligne"><b>${echapper(label)}</b><span>${echapper(valeur)}</span></div>` : "";
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Ticket POS — ${echapper(d.reference)}</title>
<style>
*{box-sizing:border-box}body{margin:0;background:#eceff3;color:#000;font:12px Arial,sans-serif}
.outils{padding:16px;text-align:center}.outils a,.outils button{display:inline-block;margin:4px;padding:10px;border:1px solid #777;background:white;color:#111;text-decoration:none;cursor:pointer}
.ticket{background:white;width:${largeur - 6}mm;margin:18px auto;padding:3mm;overflow-wrap:anywhere}
header,.qr,footer{text-align:center}h1{font-size:16px;margin:6px 0}p{margin:7px 0}.dossier{font-size:15px;font-weight:bold}
.ligne{padding:5px 0;border-bottom:1px dashed #888}.ligne b,.ligne span{display:block}
.qr img{display:block;width:36mm;height:36mm;max-width:100%;margin:8px auto;image-rendering:auto}
footer{border-top:1px dashed #000;margin-top:10px;padding-top:8px;font-size:11px}
@media print{@page{size:auto;margin:3mm}body{background:white}.outils{display:none}.ticket{margin:0;padding:0;width:${largeur - 6}mm}.qr{break-inside:avoid}footer{break-inside:avoid}}
</style></head><body>
<nav class="outils" aria-label="Impression"><a href="?largeur=80">Papier 80 mm</a><a href="?largeur=58">Papier 58 mm</a><button onclick="window.print()">Imprimer le ticket</button>
<p>Sélectionnez le papier ${largeur} mm dans le pilote POS, échelle 100 %, sans en-têtes ni pieds de page du navigateur.</p></nav>
<main class="ticket"><header><b>GNVA · DISPROMALT</b><h1>Ticket d’enregistrement</h1><p>N° de dossier</p><p class="dossier">${echapper(d.reference)}</p></header>
${champ("Assujetti", nom)}${champ("Plaque", d.plaque)}${champ("Châssis", d.chassis)}${champ("Moteur", d.moteur)}${champ("Enregistré le (Kinshasa)", date)}
<div class="qr"><img src="${qr}" alt="QR du numéro de dossier"><p>${echapper(d.reference)}</p></div>
<footer>QR contenant uniquement le numéro de dossier.<br>Conservez ce ticket pour l’attribution.<br>Ce ticket n’est pas une preuve de paiement.</footer></main></body></html>`;
}