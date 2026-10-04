import { Prisma } from "@prisma/client";
import type { Transaction } from "./contexte";

export function partagerGain(montant: Prisma.Decimal | string | number) {
  const total = new Prisma.Decimal(montant);
  const partDispromalt = total.div(2).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
  return { total, partDispromalt, partProvince: total.minus(partDispromalt) };
}

// Grouper par tarif évite de charger chaque transaction et conserve l'arrondi
// au centime PAR attribution, y compris pour les tarifs au centime impair.
export async function gains(tx: Transaction, where: Prisma.TransactionFinanciereWhereInput) {
  const tarifs = await tx.transactionFinanciere.groupBy({
    by: ["montant"], where, _count: { _all: true },
  });
  let total = new Prisma.Decimal(0), partDispromalt = new Prisma.Decimal(0);
  for (const tarif of tarifs) {
    const partage = partagerGain(tarif.montant);
    total = total.plus(partage.total.mul(tarif._count._all));
    partDispromalt = partDispromalt.plus(partage.partDispromalt.mul(tarif._count._all));
  }
  return { total, partDispromalt, partProvince: total.minus(partDispromalt) };
}

export async function soldeDispromalt(
  tx: Transaction,
  transactions: Prisma.TransactionFinanciereWhereInput,
  recouvrements: Prisma.RecouvrementWhereInput,
) {
  const [revenus, confirmes, attentes] = await Promise.all([
    gains(tx, transactions),
    tx.recouvrement.aggregate({
      where: { ...recouvrements, statut: "VALIDE" }, _sum: { partDispromalt: true },
    }),
    tx.recouvrement.aggregate({
      where: { ...recouvrements, statut: { in: ["EN_ATTENTE", "SIGNE_MONITEUR"] } },
      _sum: { partDispromalt: true },
    }),
  ]);
  const recouvre = new Prisma.Decimal(confirmes._sum.partDispromalt ?? 0);
  const reserve = new Prisma.Decimal(attentes._sum.partDispromalt ?? 0);
  const restant = revenus.partDispromalt.minus(recouvre);
  return {
    revenus, recouvre, reserve, restant,
    disponible: Prisma.Decimal.max(0, restant.minus(reserve)),
  };
}