// The admin notification feed: write, list and mark read. SERVER-ONLY.
//
// notifyAdmin() never throws. A notification is a side effect of something more important (a webhook, a booking
// sync, a guest request), so a failure here (for example the table has not been created yet) is logged and
// swallowed instead of breaking that flow.

import { prisma } from "@/lib/prisma"
import { clip, higherSeverity, safeHref, type NotificationDraft } from "./builders"
import { sendPushToAdmin } from "./push"

if (typeof window !== "undefined") {
  throw new Error("lib/notifications/service is server-only and must not be imported in browser code.")
}

export interface NotificationItem {
  id: string
  type: string
  severity: string
  title: string
  body: string | null
  href: string | null
  count: number
  read: boolean
  createdAt: string
}

const READ_RETENTION_DAYS = 30

export async function notifyAdmin(draft: NotificationDraft): Promise<void> {
  try {
    const title = clip(draft.title, 140)
    const body = draft.body ? clip(draft.body, 300) : null
    const href = safeHref(draft.href)
    const severity = draft.severity
    // Also goes to phones that turned alerts on. A repeat about the same thing reuses the tag, so the phone
    // replaces the earlier alert (and buzzes again) instead of stacking them.
    const alertPhones = () => sendPushToAdmin({ title, body, href, severity, groupKey: draft.groupKey })

    if (draft.groupKey) {
      const existing = await prisma.adminNotification.findFirst({
        where: { groupKey: draft.groupKey, readAt: null },
        orderBy: { createdAt: "desc" },
      })
      if (existing) {
        await prisma.adminNotification.update({
          where: { id: existing.id },
          data: {
            title,
            body,
            href,
            severity: higherSeverity(existing.severity, severity),
            count: { increment: 1 },
            createdAt: new Date(),
          },
        })
        await alertPhones()
        return
      }
    }

    await prisma.adminNotification.create({
      data: {
        type: draft.type,
        severity,
        title,
        body,
        href,
        groupKey: draft.groupKey ?? null,
        propertyId: draft.propertyId ?? null,
      },
    })
    await alertPhones()
  } catch (err) {
    console.error("[Notifications] could not record", draft.type, err)
  }
}

export async function listNotifications(limit = 30): Promise<{ items: NotificationItem[]; unread: number }> {
  const take = Math.min(Math.max(Math.trunc(limit) || 30, 1), 100)
  const [rows, unread] = await Promise.all([
    prisma.adminNotification.findMany({ orderBy: { createdAt: "desc" }, take }),
    prisma.adminNotification.count({ where: { readAt: null } }),
  ])
  return {
    unread,
    items: rows.map((r) => ({
      id: r.id,
      type: r.type,
      severity: r.severity,
      title: r.title,
      body: r.body,
      href: r.href,
      count: r.count,
      read: r.readAt !== null,
      createdAt: r.createdAt.toISOString(),
    })),
  }
}

/** Marks the given notifications read, or every unread one when no ids are passed. */
export async function markNotificationsRead(ids?: string[]): Promise<number> {
  const where = ids && ids.length > 0 ? { id: { in: ids.slice(0, 200) }, readAt: null } : { readAt: null }
  const res = await prisma.adminNotification.updateMany({ where, data: { readAt: new Date() } })
  return res.count
}

/** Deletes read notifications older than the retention period. Called from the daily cleanup job. */
export async function pruneNotifications(): Promise<number> {
  const cutoff = new Date(Date.now() - READ_RETENTION_DAYS * 24 * 60 * 60 * 1000)
  const res = await prisma.adminNotification.deleteMany({ where: { readAt: { not: null, lt: cutoff } } })
  return res.count
}
