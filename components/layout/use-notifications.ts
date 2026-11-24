"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { useTr } from "@/components/i18n/language-provider"

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

export interface NotificationsState {
  items: NotificationItem[]
  unread: number
  hasCritical: boolean
  setupNeeded: boolean
  open: (item: NotificationItem) => void
  markAllRead: () => void
}

const POLL_MS = 30_000
const MAX_TOASTS_PER_POLL = 3

// One poller for the whole top bar (the bell is drawn twice, phone and desktop, but only one hook runs).
export function useNotifications(): NotificationsState {
  const tr = useTr()
  const router = useRouter()
  const [items, setItems] = useState<NotificationItem[]>([])
  const [unread, setUnread] = useState(0)
  const [setupNeeded, setSetupNeeded] = useState(false)
  // id -> count of what the admin has already been told about. null until the first load, so opening the
  // app does not toast everything that was already waiting.
  const seen = useRef<Map<string, number> | null>(null)
  const inflight = useRef(false)

  const markRead = useCallback(async (payload: { ids: string[] } | { all: true }) => {
    try {
      await fetch("/api/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
    } catch {
      // The next poll shows the true state.
    }
  }, [])

  const openItem = useCallback(
    (item: NotificationItem) => {
      if (!item.read) {
        setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, read: true } : i)))
        setUnread((n) => Math.max(0, n - 1))
        void markRead({ ids: [item.id] })
      }
      if (item.href) router.push(item.href)
    },
    [markRead, router],
  )

  const refresh = useCallback(async () => {
    if (inflight.current) return
    inflight.current = true
    try {
      const res = await fetch("/api/notifications", { cache: "no-store" })
      if (!res.ok) return
      const data = (await res.json()) as { items?: NotificationItem[]; unread?: number; setupNeeded?: boolean }
      const next = data.items ?? []
      setItems(next)
      setUnread(data.unread ?? 0)
      setSetupNeeded(Boolean(data.setupNeeded))

      const fresh = next.filter((i) => !i.read && (seen.current === null ? false : (seen.current.get(i.id) ?? 0) < i.count))
      for (const item of fresh.slice(0, MAX_TOASTS_PER_POLL)) {
        const show = item.severity === "CRITICAL" ? toast.warning : toast
        show(item.title, {
          description: item.body ?? undefined,
          duration: item.severity === "CRITICAL" ? 15_000 : 8_000,
          action: item.href ? { label: tr("Take action"), onClick: () => openItem(item) } : undefined,
        })
      }
      if (fresh.length > MAX_TOASTS_PER_POLL) {
        toast(tr("{n} more new notifications", { n: fresh.length - MAX_TOASTS_PER_POLL }))
      }
      seen.current = new Map(next.filter((i) => !i.read).map((i) => [i.id, i.count]))
    } catch {
      // Offline or the server is restarting: try again on the next tick.
    } finally {
      inflight.current = false
    }
  }, [openItem, tr])

  useEffect(() => {
    const tick = () => {
      if (document.visibilityState === "visible") void refresh()
    }
    // First load a tick after mount (state is only set from the async callback), then poll.
    const first = window.setTimeout(tick, 0)
    const timer = window.setInterval(tick, POLL_MS)
    document.addEventListener("visibilitychange", tick)
    window.addEventListener("focus", tick)
    return () => {
      window.clearTimeout(first)
      window.clearInterval(timer)
      document.removeEventListener("visibilitychange", tick)
      window.removeEventListener("focus", tick)
    }
  }, [refresh])

  const markAllRead = useCallback(() => {
    setItems((prev) => prev.map((i) => ({ ...i, read: true })))
    setUnread(0)
    seen.current = new Map()
    void markRead({ all: true })
  }, [markRead])

  return {
    items,
    unread,
    hasCritical: items.some((i) => !i.read && i.severity === "CRITICAL"),
    setupNeeded,
    open: openItem,
    markAllRead,
  }
}
