import type { UtilisateurPublic } from "@workspace/api-client-react";

export const has = (u: UtilisateurPublic, ...codes: string[]) => codes.length === 0 || codes.some((c) => u.permissions.includes(c));
export const isAdmin = (u: UtilisateurPublic) => /ADMIN/i.test(u.role);
export const isNational = (u: UtilisateurPublic) =>
  (u as unknown as { roleCode?: string }).roleCode === "SUPER_ADMIN" ||
  (u as unknown as { roleCode?: string }).roleCode === "ADMIN_NATIONAL";
