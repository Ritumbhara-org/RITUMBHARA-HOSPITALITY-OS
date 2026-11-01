import { NextResponse } from "next/server"
import { adminApiGuard } from "@/lib/auth/guard"
import { prisma } from "@/lib/prisma"
import { memberWhere } from "@/lib/loyalty/queries"
import { tierLabel } from "@/lib/loyalty/rules"

// CSV export (opens in Excel) of members or the points ledger, with the same filters as the Loyalty page.
// ?report=members|ledger&q=&tier=&propertyId=&joinedFrom=&joinedTo=&minPoints=&maxPoints=&from=&to=

function cell(v: unknown): string {
  let s = v === null || v === undefined ? "" : v instanceof Date ? v.toISOString() : String(v)
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s // no spreadsheet formulas from data
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

function csv(rows: unknown[][]): string {
  return "﻿" + rows.map((r) => r.map(cell).join(",")).join("\r\n") + "\r\n"
}

export async function GET(request: Request) {
  const denied = await adminApiGuard()
  if (denied) return denied
  const sp = new URL(request.url).searchParams
  const f = Object.fromEntries(["q", "tier", "propertyId", "joinedFrom", "joinedTo", "minPoints", "maxPoints"].map((k) => [k, sp.get(k) ?? undefined]))
  const report = sp.get("report") === "ledger" ? "ledger" : "members"
  const stamp = new Date().toISOString().slice(0, 10)
  let body: string

  if (report === "members") {
    const members = await prisma.membership.findMany({ where: memberWhere(f), orderBy: { joinedAt: "asc" }, take: 20000, include: { guest: { select: { name: true, email: true } } } })
    body = csv([
      ["Membership ID", "Name", "Mobile", "Email", "Tier", "Available points", "Qualifying spend (6 months)", "Birthday", "Anniversary", "Referral code", "Referred by", "Joined"],
      ...members.map((m) => [m.membershipNumber, m.name || m.guest?.name, m.phone, m.guest?.email, tierLabel(m.tier), m.points, m.qualifyingSpend, m.birthday?.toISOString().slice(0, 10), m.anniversary?.toISOString().slice(0, 10), m.referralCode, m.referredBy, m.joinedAt]),
    ])
  } else {
    const from = /^\d{4}-\d{2}-\d{2}$/.test(sp.get("from") ?? "") ? new Date(sp.get("from") + "T00:00:00+05:30") : null
    const to = /^\d{4}-\d{2}-\d{2}$/.test(sp.get("to") ?? "") ? new Date(sp.get("to") + "T23:59:59+05:30") : null
    const rows = await prisma.pointTransaction.findMany({
      where: { membership: memberWhere(f), ...(from || to ? { createdAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}) },
      orderBy: { createdAt: "asc" }, take: 50000,
      include: { membership: { select: { membershipNumber: true, name: true } }, property: { select: { name: true } } },
    })
    body = csv([
      ["Transaction ID", "Date", "Membership ID", "Name", "Type", "Points", "Description", "Expires", "Booking ID", "Property", "Channel", "Tier", "Channel ×", "Tier ×", "Eligible amount", "By", "Reason"],
      ...rows.map((t) => [t.id, t.createdAt, t.membership.membershipNumber, t.membership.name, t.type, t.amount, t.description, t.expiresAt, t.reservationId, t.property?.name, t.channel, t.tier, t.channelMultiplier, t.tierMultiplier, t.eligibleAmount, t.actor, t.reason]),
    ])
  }
  return new NextResponse(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="ritumbhara-loyalty-${report}-${stamp}.csv"`,
      "Cache-Control": "no-store",
    },
  })
}
