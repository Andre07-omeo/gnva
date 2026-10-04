import { PrismaClient } from "@prisma/client";

// Une instance par processus évite de saturer MySQL pendant le rechargement Next.
const globalPrisma = globalThis as unknown as { gnvaPrisma?: PrismaClient };
export const db = globalPrisma.gnvaPrisma ?? new PrismaClient();
if (process.env.NODE_ENV !== "production") globalPrisma.gnvaPrisma = db;
