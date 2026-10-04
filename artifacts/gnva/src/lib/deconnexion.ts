import type { QueryClient } from "@tanstack/react-query";
export async function terminerDeconnexion(client: QueryClient) {
  await client.cancelQueries();
  client.clear();
  // Informe les autres onglets. La sécurité reste assurée par la session révoquée côté serveur.
  try { localStorage.setItem("gnva-deconnexion", String(Date.now())); } catch { /* Stockage navigateur désactivé. */ }
  window.location.replace("/login");
}