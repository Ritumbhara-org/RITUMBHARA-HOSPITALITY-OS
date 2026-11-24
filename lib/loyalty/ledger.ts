// The points ledger. SERVER-ONLY.
// Every change to a member's points is a new PointTransaction row (never an update), written inside a database
// transaction that holds a per-member advisory lock, so concurrent earnings, redemptions and expiries for the same
// member run one after another and can't double-spend. Debits record exactly which credit batches they consumed
// (PointAllocation), soonest-expiring first. Membership.points is only a cache of the computed available balance.

import type { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { planAllocation, pointsExpiry, summarizePoints, type CreditBatch, type DebitRow, type PointsSummary } from "./rules"

export type Tx = Prisma.TransactionClient

export class LoyaltyError extends Error {
  constructor(message: string, public code: string = "LOYALTY_ERROR") {
    super(message)
    this.name = "LoyaltyError"
  }
}

export async function withMemberLock<T>(membershipId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return prisma.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"loyalty:" + membershipId}))`
      return fn(tx)
    },
    { maxWait: 10000, timeout: 20000 },
  )
}

export async function loadLedger(tx: Tx | typeof prisma, membershipId: string): Promise<{ credits: CreditBatch[]; debits: DebitRow[] }> {
  const rows = await tx.pointTransaction.findMany({
    where: { membershipId },
    select: { id: true, amount: true, type: true, expiresAt: true, createdAt: true },
  })
  const ids = rows.map((r) => r.id)
  const [asCredit, asDebit] = ids.length
    ? await Promise.all([
        tx.pointAllocation.groupBy({ by: ["creditId"], where: { creditId: { in: ids } }, _sum: { points: true } }),
        tx.pointAllocation.groupBy({ by: ["debitId"], where: { debitId: { in: ids } }, _sum: { points: true } }),
      ])
    : [[], []]
  const creditUsed = new Map(asCredit.map((a) => [a.creditId, a._sum.points ?? 0]))
  const debitUsed = new Map(asDebit.map((a) => [a.debitId, a._sum.points ?? 0]))
  const credits: CreditBatch[] = []
  const debits: DebitRow[] = []
  for (const r of rows) {
    if (r.amount > 0) credits.push({ id: r.id, amount: r.amount, allocated: creditUsed.get(r.id) ?? 0, expiresAt: r.expiresAt, createdAt: r.createdAt })
    else if (r.amount < 0) debits.push({ id: r.id, amount: r.amount, allocated: debitUsed.get(r.id) ?? 0, type: r.type })
  }
  return { credits, debits }
}

export async function getPointsSummary(membershipId: string, now = new Date(), tx: Tx | typeof prisma = prisma): Promise<PointsSummary> {
  const { credits, debits } = await loadLedger(tx, membershipId)
  return summarizePoints(credits, debits, now)
}

type EntryMeta = Omit<Prisma.PointTransactionUncheckedCreateInput, "id" | "membershipId" | "amount" | "type" | "description" | "createdAt">

export interface CreditInput {
  membershipId: string
  points: number
  type: string
  description: string
  idempotencyKey: string
  meta?: EntryMeta
}

// Adds a credit batch valid for 6 months. Idempotent on idempotencyKey: a repeat returns the existing row.
export async function postCredit(tx: Tx, input: CreditInput, now = new Date()) {
  if (!Number.isInteger(input.points) || input.points <= 0) throw new LoyaltyError("Credit must be a positive whole number of points.")
  const existing = await tx.pointTransaction.findUnique({ where: { idempotencyKey: input.idempotencyKey } })
  if (existing) return { entry: existing, created: false }
  const entry = await tx.pointTransaction.create({
    data: {
      ...input.meta,
      membershipId: input.membershipId,
      amount: input.points,
      type: input.type,
      description: input.description,
      idempotencyKey: input.idempotencyKey,
      expiresAt: input.meta?.expiresAt ?? pointsExpiry(now),
      createdAt: now,
    },
  })
  await settleDebt(tx, input.membershipId, now)
  return { entry, created: true }
}

export interface DebitInput {
  membershipId: string
  points: number
  type: string
  description: string
  idempotencyKey: string
  meta?: EntryMeta
  allowShortfall?: boolean // reversals may take the balance below zero; redemptions and manual debits may not
  preferCreditId?: string
  onlyCreditId?: string // expiry: consume one specific (expired) batch only
}

export async function postDebit(tx: Tx, input: DebitInput, now = new Date()) {
  if (!Number.isInteger(input.points) || input.points <= 0) throw new LoyaltyError("Debit must be a positive whole number of points.")
  const existing = await tx.pointTransaction.findUnique({ where: { idempotencyKey: input.idempotencyKey } })
  if (existing) return { entry: existing, created: false }
  const { credits, debits } = await loadLedger(tx, input.membershipId)

  let allocations: { creditId: string; points: number }[]
  let shortfall: number
  if (input.onlyCreditId) {
    const c = credits.find((x) => x.id === input.onlyCreditId)
    const rem = c ? c.amount - c.allocated : 0
    if (rem < input.points) throw new LoyaltyError("That batch has fewer points left than requested.")
    allocations = [{ creditId: input.onlyCreditId, points: input.points }]
    shortfall = 0
  } else {
    const summary = summarizePoints(credits, debits, now)
    if (!input.allowShortfall && summary.available < input.points) {
      throw new LoyaltyError(`Not enough points: ${Math.max(0, summary.available)} available.`, "INSUFFICIENT_POINTS")
    }
    ;({ allocations, shortfall } = planAllocation(credits, input.points, now, input.preferCreditId))
    if (shortfall > 0 && !input.allowShortfall) throw new LoyaltyError("Not enough points.", "INSUFFICIENT_POINTS")
  }

  const entry = await tx.pointTransaction.create({
    data: {
      ...input.meta,
      membershipId: input.membershipId,
      amount: -input.points,
      type: input.type,
      description: input.description,
      idempotencyKey: input.idempotencyKey,
      expiresAt: null,
      createdAt: now,
    },
  })
  if (allocations.length) {
    await tx.pointAllocation.createMany({ data: allocations.map((a) => ({ debitId: entry.id, creditId: a.creditId, points: a.points, createdAt: now })) })
  }
  return { entry, created: true, shortfall }
}

// A reversal larger than the live balance leaves a debt (unallocated debit). Any live credit pays it off first, so a
// batch that later expires is never counted as both covering the debt and expiring.
export async function settleDebt(tx: Tx, membershipId: string, now = new Date()) {
  const { credits, debits } = await loadLedger(tx, membershipId)
  const owing = debits.filter((d) => -d.amount - d.allocated > 0).sort((a, b) => a.id.localeCompare(b.id))
  if (!owing.length) return
  const pool = credits.map((c) => ({ ...c }))
  for (const d of owing) {
    const need = -d.amount - d.allocated
    const { allocations } = planAllocation(pool, need, now)
    if (!allocations.length) break
    for (const a of allocations) {
      const existing = await tx.pointAllocation.findUnique({ where: { debitId_creditId: { debitId: d.id, creditId: a.creditId } } })
      // A debit with a shortfall drained every batch it touched, so an existing pair can't have points left.
      if (existing) continue
      await tx.pointAllocation.create({ data: { debitId: d.id, creditId: a.creditId, points: a.points, createdAt: now } })
      const c = pool.find((x) => x.id === a.creditId)
      if (c) c.allocated += a.points
    }
  }
}

// Recomputes the cached balance from the ledger. Call at the end of every locked ledger operation.
export async function refreshBalanceCache(tx: Tx, membershipId: string, now = new Date()): Promise<PointsSummary> {
  await settleDebt(tx, membershipId, now)
  const summary = await getPointsSummary(membershipId, now, tx)
  await tx.membership.update({ where: { id: membershipId }, data: { points: summary.available } })
  return summary
}
