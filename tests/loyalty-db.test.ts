/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-require-imports */
// Membership & Loyalty against a real PostgreSQL database: earning, idempotency, refunds, cancellations, tiers,
// expiry, referrals, bonuses, OTP redemption, concurrency and the immutable ledger.
// Needs LOYALTY_TEST_DATABASE_URL (see tests/helpers/loyalty-db.ts); skipped otherwise.
import { test, mock, before, beforeEach, after } from "node:test"
import assert from "node:assert/strict"
import path from "node:path"
import { pathToFileURL } from "node:url"
import { makeTestPrisma, resetDb, TEST_DB_URL } from "./helpers/loyalty-db"

const root = path.resolve(__dirname, "..")
const mod = (p: string) => pathToFileURL(path.join(root, p)).href
const skip = !TEST_DB_URL && "LOYALTY_TEST_DATABASE_URL not set"

let prisma: any
let L: {
  earning: typeof import("../lib/loyalty/earning")
  ledger: typeof import("../lib/loyalty/ledger")
  members: typeof import("../lib/loyalty/members")
  jobs: typeof import("../lib/loyalty/jobs")
  redemption: typeof import("../lib/loyalty/redemption")
  notify: typeof import("../lib/loyalty/notify")
  otp: typeof import("../lib/loyalty/otp")
}
const sent: { kind: string; to: string; body: string; positional: Record<string, string> }[] = []
let failSends = false

before(async () => {
  if (skip) return
  process.env.ADMIN_SESSION_SECRET = "test-session-secret-0123456789-abcdefghijklmnop"
  process.env.LOYALTY_PROGRAM_START = "2026-01-01"
  prisma = await makeTestPrisma()
  mock.module(mod("lib/prisma.ts"), { namedExports: { prisma }, defaultExport: prisma })
  mock.module("next/cache", { namedExports: { revalidatePath: () => {}, revalidateTag: () => {} } })
  L = {
    earning: await import(mod("lib/loyalty/earning.ts")),
    ledger: await import(mod("lib/loyalty/ledger.ts")),
    members: await import(mod("lib/loyalty/members.ts")),
    jobs: await import(mod("lib/loyalty/jobs.ts")),
    redemption: await import(mod("lib/loyalty/redemption.ts")),
    notify: await import(mod("lib/loyalty/notify.ts")),
    otp: await import(mod("lib/loyalty/otp.ts")),
  } as typeof L
  L.notify.setLoyaltyTransport(async (m) => {
    sent.push({ kind: m.kind, to: m.to, body: m.body, positional: m.positional })
    return failSends ? { ok: false, error: "simulated outage" } : { ok: true, status: "SENT" }
  })
})

after(async () => {
  if (prisma) await prisma.$disconnect()
})

let unitId = ""
let propertyId = ""
beforeEach(async () => {
  if (skip) return
  await resetDb(prisma)
  sent.length = 0
  failSends = false
  const p = await prisma.property.create({ data: { name: "Ritumbhara Jagatpura", slug: "jagatpura-" + Math.random().toString(36).slice(2), address: "a", city: "Jaipur", state: "RJ", country: "IN", phone: "1", email: "a@b.c", timezone: "Asia/Kolkata" } })
  const u = await prisma.unit.create({ data: { propertyId: p.id, name: "909", type: "STUDIO", floor: "9", capacity: 2 } })
  propertyId = p.id
  unitId = u.id
})

const NOW = new Date("2026-11-01T12:00:00Z")
const daysAgo = (n: number, from = NOW) => new Date(from.getTime() - n * 86400000)

async function guest(phone = "+919876543210", name = "Asha Verma") {
  return prisma.guest.create({ data: { name, phone } })
}
async function stay(g: { id: string }, o: { amount: number; tax?: number; source?: string; detail?: string; checkOut?: Date; status?: string; paymentStatus?: string | null; paid?: number | null }) {
  const checkOut = o.checkOut ?? daysAgo(1)
  return prisma.reservation.create({
    data: {
      guestId: g.id, unitId, propertyId, checkIn: new Date(checkOut.getTime() - 86400000), checkOut, status: o.status ?? "CHECKED_OUT",
      source: o.source ?? "Walk-In", sourceDetail: o.detail ?? null, totalAmount: o.amount, taxAmount: o.tax ?? 0,
      paymentStatus: o.paymentStatus ?? null, paidAmount: o.paid ?? null,
    },
  })
}
const memberByPhone = (phone = "+919876543210") => prisma.membership.findUnique({ where: { phone } })
const summary = async (id: string, now = NOW) => L.ledger.getPointsSummary(id, now)

test("completed direct stay earns once (duplicate and concurrent events don't double-award)", { skip }, async () => {
  const g = await guest()
  const r = await stay(g, { amount: 11800, tax: 1800, source: "Walk-In" })
  const results = await Promise.all([1, 2, 3, 4, 5].map(() => L.earning.reconcileReservation(r.id, NOW)))
  assert.equal(results.filter((x) => x.action === "earned").length, 1)
  await L.earning.reconcileReservation(r.id, NOW)
  const m = await memberByPhone()
  const entries = await prisma.pointTransaction.findMany({ where: { reservationId: r.id } })
  assert.equal(entries.length, 1)
  const e = entries[0]
  assert.equal(e.amount, 1000) // ₹10,000 eligible (tax excluded), Star, direct 2X
  assert.equal(e.channel, "DIRECT")
  assert.equal(e.tier, "STAR")
  assert.equal(e.channelMultiplier, 2)
  assert.equal(e.tierMultiplier, 1)
  assert.equal(e.eligibleAmount, 10000)
  assert.equal(e.expiresAt.toISOString(), "2027-05-01T12:00:00.000Z")
  assert.equal(m.points, 1000)
  assert.equal(m.tier, "STAR")
  assert.equal(sent.filter((s) => s.kind === "POINTS_CREDITED").length, 1)
  assert.match(sent[0].body, /earned you 1000 loyalty points/)
})

test("OTA stay earns the base rate; stays before checkout earn nothing", { skip }, async () => {
  const g = await guest()
  const ota = await stay(g, { amount: 10000, source: "OTA", detail: "Airbnb" })
  const upcoming = await stay(g, { amount: 5000, status: "CONFIRMED", checkOut: new Date(NOW.getTime() + 5 * 86400000) })
  assert.equal((await L.earning.reconcileReservation(ota.id, NOW)).points, 500)
  assert.equal((await L.earning.reconcileReservation(upcoming.id, NOW)).action, "none")
})

test("same mobile number across OTAs is one membership", { skip }, async () => {
  const a = await guest("+919876543210", "Asha (Airbnb)")
  const b = await guest("+919876543210", "Asha Verma (Booking.com)")
  const r1 = await stay(a, { amount: 4000, source: "OTA", detail: "Airbnb" })
  const r2 = await stay(b, { amount: 6000, source: "OTA", detail: "Booking" })
  await L.earning.reconcileReservation(r1.id, NOW)
  await L.earning.reconcileReservation(r2.id, NOW)
  assert.equal(await prisma.membership.count(), 1)
  const m = await memberByPhone()
  assert.equal(m.points, 200 + 300)
  assert.equal(m.qualifyingSpend, 10000)
})

test("tier upgrade during a booking: that booking earns at the tier it completed in; the next one at the new tier", { skip }, async () => {
  const g = await guest()
  const first = await stay(g, { amount: 11000, checkOut: daysAgo(30) })
  await L.earning.reconcileReservation(first.id, NOW)
  const second = await stay(g, { amount: 5000, checkOut: daysAgo(2) })
  const r2 = await L.earning.reconcileReservation(second.id, NOW)
  assert.equal(r2.points, 500) // Star direct 2X; spend before this stay was ₹11,000
  let m = await memberByPhone()
  assert.equal(m.tier, "ROCKSTAR") // ₹16,000 in 6 months
  assert.equal(sent.filter((s) => s.kind === "TIER_UPGRADE").length, 1)
  const history = await prisma.memberTierHistory.findMany({ where: { membershipId: m.id }, orderBy: { createdAt: "asc" } })
  assert.deepEqual(history.map((h: any) => h.reason), ["ENROLLED", "AUTO_UPGRADE"])
  const third = await stay(g, { amount: 10000, checkOut: daysAgo(1) })
  assert.equal((await L.earning.reconcileReservation(third.id, NOW)).points, 2000) // RockStar direct 4X
  const e = await prisma.pointTransaction.findFirst({ where: { reservationId: third.id } })
  assert.equal(e.tier, "ROCKSTAR")
  m = await memberByPhone()
  assert.equal(m.tier, "ROCKSTAR")
})

test("rolling 6-month window: tier drops when qualifying stays age out", { skip }, async () => {
  const g = await guest()
  const big = await stay(g, { amount: 40000, checkOut: daysAgo(100) })
  await L.earning.reconcileReservation(big.id, NOW)
  let m = await memberByPhone()
  assert.equal(m.tier, "SUPERSTAR")
  // 6 months after that check-out the stay no longer qualifies.
  const later = new Date(big.checkOut.getTime() + 184 * 86400000)
  await prisma.membership.update({ where: { id: m.id }, data: { tierEvaluatedAt: null } })
  await L.jobs.recalculateTiers(later)
  m = await memberByPhone()
  assert.equal(m.tier, "STAR")
  assert.equal(m.qualifyingSpend, 0)
  const last = await prisma.memberTierHistory.findFirst({ where: { membershipId: m.id }, orderBy: { createdAt: "desc" } })
  assert.equal(last.reason, "AUTO_DOWNGRADE")
})

test("partial refund, booking modification and full cancellation adjust points", { skip }, async () => {
  const g = await guest()
  const r = await stay(g, { amount: 10000 })
  await L.earning.reconcileReservation(r.id, NOW)
  await prisma.reservation.update({ where: { id: r.id }, data: { refundedAmount: 2000 } })
  assert.deepEqual((await L.earning.reconcileReservation(r.id, NOW)).points, -200) // 1000 -> 800
  await L.earning.reconcileReservation(r.id, NOW) // idempotent
  await prisma.reservation.update({ where: { id: r.id }, data: { totalAmount: 12000 } }) // modification
  assert.equal((await L.earning.reconcileReservation(r.id, NOW)).points, 200) // (12000-2000)/100*5*2 = 1000
  await prisma.reservation.update({ where: { id: r.id }, data: { status: "CANCELLED" } })
  assert.equal((await L.earning.reconcileReservation(r.id, NOW)).points, -1000)
  await L.earning.reconcileReservation(r.id, NOW)
  const m = await memberByPhone()
  assert.equal(m.points, 0)
  const rows = await prisma.pointTransaction.findMany({ where: { reservationId: r.id }, orderBy: { createdAt: "asc" } })
  assert.deepEqual(rows.map((x: any) => x.type), ["EARN_BOOKING", "BOOKING_REVERSAL", "BOOKING_ADJUSTMENT", "BOOKING_REVERSAL"])
  assert.equal(rows.reduce((s: number, x: any) => s + x.amount, 0), 0)
})

test("cancellation after the points were spent leaves a debt that later points pay off", { skip }, async () => {
  const g = await guest()
  const r = await stay(g, { amount: 10000 })
  await L.earning.reconcileReservation(r.id, NOW)
  const m = await memberByPhone()
  await L.ledger.withMemberLock(m.id, (tx) => L.ledger.postDebit(tx, { membershipId: m.id, points: 800, type: "REDEMPTION", description: "t", idempotencyKey: "t1" }, NOW))
  await prisma.reservation.update({ where: { id: r.id }, data: { status: "CANCELLED" } })
  await L.earning.reconcileReservation(r.id, NOW)
  let s = await summary(m.id)
  assert.equal(s.available, -800)
  const next = await stay(g, { amount: 10000 })
  await L.earning.reconcileReservation(next.id, NOW)
  s = await summary(m.id)
  assert.equal(s.available, 200) // 1000 new points − 800 owed
  assert.equal(s.debt, 0)
})

test("points expire per batch; reminders 30 days before and on expiry", { skip }, async () => {
  const g = await guest()
  const m = await L.members.ensureMembership({ phone: "+919876543210", name: "Asha" }, NOW)
  const t0 = new Date("2026-03-01T06:00:00Z")
  const t1 = new Date("2026-05-01T06:00:00Z")
  await L.ledger.withMemberLock(m!.id, async (tx) => {
    await L.ledger.postCredit(tx, { membershipId: m!.id, points: 300, type: "ADJUSTMENT", description: "a", idempotencyKey: "b1" }, t0)
    await L.ledger.postCredit(tx, { membershipId: m!.id, points: 500, type: "ADJUSTMENT", description: "b", idempotencyKey: "b2" }, t1)
    await L.ledger.postDebit(tx, { membershipId: m!.id, points: 200, type: "REDEMPTION", description: "partial", idempotencyKey: "d1" }, new Date("2026-06-01T00:00:00Z"))
  })
  // 200 redeemed from the earlier batch (expires 1 Sep), leaving 100 there and 500 in the later one.
  const aug10 = new Date("2026-08-10T06:00:00Z")
  assert.equal(await L.jobs.remindExpiringPoints(aug10), 1)
  assert.equal(await L.jobs.remindExpiringPoints(aug10), 0) // once per expiry date
  assert.match(sent.find((x) => x.kind === "POINTS_EXPIRING")!.body, /100 loyalty points will expire on 1 Sept? 2026/)
  const sep2 = new Date("2026-09-02T06:00:00Z")
  assert.equal((await summary(m!.id, sep2)).available, 500) // unavailable the moment it lapses
  assert.equal(await L.jobs.expireLapsedPoints(sep2), 100)
  assert.equal(await L.jobs.expireLapsedPoints(sep2), 0)
  const s = await summary(m!.id, sep2)
  assert.deepEqual([s.available, s.redeemed, s.expired], [500, 200, 100])
  assert.equal(sent.filter((x) => x.kind === "POINTS_EXPIRED").length, 1)
  assert.ok(g)
})

test("birthday and anniversary on the same day: two bonuses, once per year", { skip }, async () => {
  await guest()
  const m = await L.members.ensureMembership({ phone: "+919876543210", name: "Asha" }, NOW)
  await prisma.membership.update({ where: { id: m!.id }, data: { birthday: new Date(Date.UTC(1990, 10, 1)), anniversary: new Date(Date.UTC(2015, 10, 1)) } })
  assert.equal(await L.jobs.awardOccasionBonuses(NOW), 2)
  assert.equal(await L.jobs.awardOccasionBonuses(NOW), 0)
  assert.equal((await memberByPhone()).points, 200)
  assert.deepEqual(sent.map((s) => s.kind).sort(), ["ANNIVERSARY_BONUS", "BIRTHDAY_BONUS"])
  // Next year it's awarded again.
  assert.equal(await L.jobs.awardOccasionBonuses(new Date("2027-11-01T08:00:00Z")), 2)
})

test("failed WhatsApp delivery is logged and retried, never sent twice", { skip }, async () => {
  failSends = true
  const g = await guest()
  const r = await stay(g, { amount: 10000 })
  await L.earning.reconcileReservation(r.id, NOW)
  let n = await prisma.loyaltyNotification.findFirst({ where: { kind: "POINTS_CREDITED" } })
  assert.equal(n.status, "FAILED")
  assert.equal(n.lastError, "simulated outage")
  assert.equal((await memberByPhone()).points, 1000) // points are credited regardless
  failSends = false
  await prisma.$executeRaw`UPDATE "LoyaltyNotification" SET "updatedAt" = ${new Date(Date.now() - 3600000)}`
  assert.equal(await L.notify.retryFailedNotifications(), 1)
  n = await prisma.loyaltyNotification.findFirst({ where: { kind: "POINTS_CREDITED" } })
  assert.equal(n.status, "SENT")
  assert.equal(n.attempts, 2)
  await L.earning.reconcileReservation(r.id, NOW)
  assert.equal(await prisma.loyaltyNotification.count(), 1)
})

test("referrals: rules against abuse, reward both after the first paid completed stay", { skip }, async () => {
  const referrer = await L.members.ensureMembership({ phone: "+919800000001", name: "Ravi" }, NOW)
  const g = await guest("+919800000002", "Neha")
  const referee = await L.members.ensureMembership({ phone: g.phone, name: g.name, guestId: g.id }, NOW)
  await assert.rejects(L.members.applyReferral(referee!.id, referee!.referralCode, "t"), /own referral code/)
  await assert.rejects(L.members.applyReferral(referee!.id, "RBNOPE00", "t"), /isn't valid/)
  await L.members.applyReferral(referee!.id, referrer!.referralCode.toLowerCase(), "t")
  await assert.rejects(L.members.applyReferral(referee!.id, referrer!.referralCode, "t"), /already been applied/)

  const unpaid = await stay(g, { amount: 5000, paymentStatus: "Pending", paid: 0 })
  await L.earning.reconcileReservation(unpaid.id, NOW)
  assert.equal((await prisma.referral.findFirst()).status, "PENDING")
  await prisma.reservation.update({ where: { id: unpaid.id }, data: { paymentStatus: "Paid" } })
  await L.earning.reconcileReservation(unpaid.id, NOW)
  await L.earning.reconcileReservation(unpaid.id, NOW)
  const ref = await prisma.referral.findFirst()
  assert.equal(ref.status, "REWARDED")
  assert.equal(ref.qualifyingReservationId, unpaid.id)
  const bonuses = await prisma.pointTransaction.findMany({ where: { type: "BONUS_REFERRAL" } })
  assert.equal(bonuses.length, 2)
  assert.deepEqual(bonuses.map((b: any) => b.amount), [100, 100])
  assert.equal((await prisma.membership.findUnique({ where: { id: referrer!.id } })).points, 100)
  assert.equal((await prisma.membership.findUnique({ where: { id: referee!.id } })).points, 500 + 100)
  // A member with a completed stay can't be referred afterwards.
  const other = await L.members.ensureMembership({ phone: "+919800000003", name: "X" }, NOW)
  const og = await guest("+919800000003", "X")
  await L.earning.reconcileReservation((await stay(og, { amount: 1000 })).id, NOW)
  await assert.rejects(L.members.applyReferral(other!.id, referrer!.referralCode, "t"), /before their first stay/)
})

test("OTP redemption: staff-initiated, 5-minute code, 3 attempts, single use", { skip }, async () => {
  const g = await guest()
  await L.earning.reconcileReservation((await stay(g, { amount: 10000 })).id, NOW)
  const m = await memberByPhone()
  await assert.rejects(L.redemption.startRedemption({ membershipId: m.id, points: 5000, adminId: "admin" }, NOW), /Not enough points/)
  const t = new Date()
  const req = await L.redemption.startRedemption({ membershipId: m.id, points: 400, adminId: "admin" }, t)
  assert.equal(req.sentTo, "+91 ••••• 3210")
  const code = sent.find((s) => s.kind === "OTP")!.positional["1"]
  assert.match(code, /^\d{6}$/)
  const otpRow = await prisma.loyaltyOtp.findFirst()
  assert.notEqual(otpRow.codeHash, code)
  const wrong = code === "000000" ? "111111" : "000000"
  await assert.rejects(L.redemption.confirmRedemption({ redemptionId: req.redemptionId, code: wrong, adminId: "admin" }, t), /2 tries left/)
  const res = await L.redemption.confirmRedemption({ redemptionId: req.redemptionId, code, adminId: "admin" }, t)
  assert.equal(res.points, 400)
  assert.equal(res.balance, 600)
  assert.match(res.reference, /^RDM-[0-9A-F]{10}$/)
  await assert.rejects(L.redemption.confirmRedemption({ redemptionId: req.redemptionId, code, adminId: "admin" }, t), /no longer open/)
  const red = await prisma.redemption.findUnique({ where: { id: req.redemptionId } })
  assert.equal(red.status, "COMPLETED")
  const debit = await prisma.pointTransaction.findUnique({ where: { id: red.transactionId } })
  assert.deepEqual([debit.amount, debit.type, debit.actor], [-400, "REDEMPTION", "admin"])
  assert.equal(sent.filter((s) => s.kind === "REDEMPTION_SUCCESS").length, 1)
  assert.ok(await prisma.loyaltyAuditLog.findFirst({ where: { action: "REDEMPTION_COMPLETED" } }))
})

test("OTP: three wrong codes lock; expired codes are refused; issuing is rate-limited", { skip }, async () => {
  const g = await guest()
  await L.earning.reconcileReservation((await stay(g, { amount: 10000 })).id, NOW)
  const m = await memberByPhone()
  const t = Date.now()
  const req = await L.redemption.startRedemption({ membershipId: m.id, points: 100, adminId: "admin" }, new Date(t))
  for (let i = 0; i < 2; i++) await assert.rejects(L.redemption.confirmRedemption({ redemptionId: req.redemptionId, code: "999999", adminId: "admin" }, new Date(t)))
  await assert.rejects(L.redemption.confirmRedemption({ redemptionId: req.redemptionId, code: "999999", adminId: "admin" }, new Date(t)), /Too many wrong codes/)
  assert.equal((await prisma.redemption.findUnique({ where: { id: req.redemptionId } })).status, "FAILED")
  assert.equal((await memberByPhone()).points, 1000)

  const phone = "+919811111111"
  const o = await L.otp.issueOtp({ purpose: "LOGIN", phone }, t)
  assert.ok(o.ok)
  const late = await L.otp.verifyOtp({ purpose: "LOGIN", phone, code: (o as any).code }, t + 5 * 60 * 1000 + 1)
  assert.equal(late.ok, false)
  assert.match((late as any).error, /expired/)
  const tooSoon = await L.otp.issueOtp({ purpose: "LOGIN", phone }, t + 10000)
  assert.equal(tooSoon.ok, false)
  assert.equal((tooSoon as any).status, 429)
  assert.ok((await L.otp.issueOtp({ purpose: "LOGIN", phone }, t + 61000)).ok)
  assert.ok((await L.otp.issueOtp({ purpose: "LOGIN", phone }, t + 122000)).ok)
  const fourth = await L.otp.issueOtp({ purpose: "LOGIN", phone }, t + 183000)
  assert.equal(fourth.ok, false) // max 3 per 15 minutes
})

test("concurrent redemptions can't double-spend", { skip }, async () => {
  const g = await guest()
  await L.earning.reconcileReservation((await stay(g, { amount: 10000 })).id, NOW)
  const m = await memberByPhone()
  // Same request confirmed twice at once: one succeeds.
  const req = await L.redemption.startRedemption({ membershipId: m.id, points: 300, adminId: "a" })
  const code = sent.filter((s) => s.kind === "OTP").at(-1)!.positional["1"]
  const both = await Promise.allSettled([1, 2].map(() => L.redemption.confirmRedemption({ redemptionId: req.redemptionId, code, adminId: "a" })))
  assert.equal(both.filter((x) => x.status === "fulfilled").length, 1)
  // Two debits racing for more than the balance: only one fits.
  const race = await Promise.allSettled([1, 2].map((i) => L.ledger.withMemberLock(m.id, (tx) => L.ledger.postDebit(tx, { membershipId: m.id, points: 600, type: "REDEMPTION", description: "race", idempotencyKey: "race" + i }))))
  assert.equal(race.filter((x) => x.status === "fulfilled").length, 1)
  const s = await summary(m.id, new Date())
  assert.equal(s.available, 100)
  assert.equal(s.redeemed, 900)
})

test("ledger rows are immutable in the database", { skip }, async () => {
  const g = await guest()
  await L.earning.reconcileReservation((await stay(g, { amount: 10000 })).id, NOW)
  const e = await prisma.pointTransaction.findFirst()
  await assert.rejects(prisma.$executeRaw`UPDATE "PointTransaction" SET "amount" = 999999 WHERE "id" = ${e.id}`, /immutable/)
  await assert.rejects(prisma.$executeRaw`DELETE FROM "PointTransaction" WHERE "id" = ${e.id}`, /immutable/)
  assert.equal((await prisma.pointTransaction.findFirst()).amount, 1000)
})

test("loyalty job enrols existing guests and credits completed stays once", { skip }, async () => {
  const g = await guest()
  await stay(g, { amount: 10000, checkOut: daysAgo(3) })
  await stay(g, { amount: 3000, checkOut: daysAgo(400) }) // before the programme start: no points
  const run1 = await L.jobs.runLoyaltyJobs(NOW)
  const run2 = await L.jobs.runLoyaltyJobs(NOW)
  assert.equal(run1.enrolled, 1)
  assert.deepEqual(run1.bookings, { earned: 1, adjusted: 0, reversed: 0 })
  assert.deepEqual(run2.bookings, { earned: 0, adjusted: 0, reversed: 0 })
  const m = await memberByPhone()
  assert.equal(m.points, 1000)
  assert.match(m.membershipNumber, /^RBM-\d+$/)
})
