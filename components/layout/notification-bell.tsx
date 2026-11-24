"use client"

import { useState } from "react"
import { Bell, BellRing, CheckCheck } from "lucide-react"
import { formatDistanceToNowStrict } from "date-fns"
import { cn } from "cn"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { useTr } from "@/components/i18n/language-provider"
import type { NotificationItem, NotificationsState } from "./use-notifications"
import type { PhoneAlertsState } from "./use-phone-alerts"

const DOT: Record<string, string> = {
  CRITICAL: "bg-red-500",
  ACTION: "bg-amber-500",
  INFO: "bg-sky-500",
}

function ago(iso: string): string {
  try {
    return formatDistanceToNowStrict(new Date(iso), { addSuffix: true })
  } catch {
    return ""
  }
}

function Row({ item, onOpen }: { item: NotificationItem; onOpen: (item: NotificationItem) => void }) {
  return (
    <button
      type="button"
      onClick={() => onOpen(item)}
      className={cn(
        "flex w-full items-start gap-3 border-b border-border/50 px-3 py-2.5 text-left transition-colors last:border-0 hover:bg-accent focus-visible:bg-accent focus-visible:outline-none",
        !item.read && "bg-primary/5",
      )}
    >
      <span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", item.read ? "bg-muted-foreground/30" : (DOT[item.severity] ?? DOT.INFO))} />
      <span className="min-w-0 flex-1">
        <span className={cn("block text-sm leading-snug", item.read ? "text-muted-foreground" : "font-semibold")}>
          {item.title}
          {item.count > 1 && <span className="ml-1.5 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">×{item.count}</span>}
        </span>
        {item.body && <span className="mt-0.5 line-clamp-2 block text-xs text-muted-foreground">{item.body}</span>}
        <span className="mt-1 block text-[11px] text-muted-foreground/80">{ago(item.createdAt)}</span>
      </span>
    </button>
  )
}

// Footer of the bell: turn alerts on this phone on or off, or say why they are not available.
function PhoneAlertsFooter({ phone }: { phone: PhoneAlertsState }) {
  const tr = useTr()
  const { status } = phone
  if (status === "loading" || status === "unsupported") return null

  const note = (text: string) => <p className="text-xs text-muted-foreground">{text}</p>
  return (
    <div className="border-t border-border/60 px-3 py-2.5">
      {status === "off" && (
        <Button type="button" variant="outline" size="sm" className="h-8 w-full gap-2 text-xs" onClick={phone.enable}>
          <BellRing className="h-3.5 w-3.5" />
          {tr("Turn on phone alerts")}
        </Button>
      )}
      {status === "working" && note(tr("Working…"))}
      {status === "on" && (
        <div className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400">
            <BellRing className="h-3.5 w-3.5" />
            {tr("Phone alerts are on")}
          </span>
          <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={phone.disable}>
            {tr("Turn off")}
          </Button>
        </div>
      )}
      {status === "blocked" && note(tr("Alerts are blocked. Allow notifications for this app in your phone's settings, then reload."))}
      {status === "needs-install" && note(tr("To get alerts on an iPhone, add this app to your Home Screen (Share, then Add to Home Screen) and open it from there."))}
      {status === "not-configured" && note(tr("Phone alerts need a one-time server setup (VAPID keys)."))}
      {status === "error" && (
        <div className="flex items-center justify-between gap-2">
          {note(tr("Could not turn on phone alerts."))}
          <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={phone.enable}>
            {tr("Try again")}
          </Button>
        </div>
      )}
    </div>
  )
}

// The bell in the top bar. The data comes from useNotifications() and usePhoneAlerts(), each called once in the Topbar.
export function NotificationBell({ state, phone, className }: { state: NotificationsState; phone: PhoneAlertsState; className?: string }) {
  const tr = useTr()
  const [open, setOpen] = useState(false)
  const { items, unread, hasCritical, setupNeeded } = state

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            className={cn("relative h-9 w-9 rounded-xl hover:bg-accent sm:h-9 sm:w-9", className)}
            aria-label={unread > 0 ? `${tr("Notifications")} (${unread})` : tr("Notifications")}
          />
        }
      >
        <Bell className="h-4 w-4 text-muted-foreground" />
        {unread > 0 && (
          <span
            className={cn(
              "absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-bold leading-none text-white ring-2 ring-background",
              hasCritical ? "bg-red-500" : "bg-primary",
            )}
          >
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={8} className="w-[22rem] max-w-[calc(100vw-1.5rem)] gap-0 p-0">
        <div className="flex items-center justify-between border-b border-border/60 px-3 py-2.5">
          <span className="text-sm font-semibold">{tr("Notifications")}</span>
          {unread > 0 && (
            <Button type="button" variant="ghost" size="sm" className="h-7 gap-1.5 px-2 text-xs" onClick={state.markAllRead}>
              <CheckCheck className="h-3.5 w-3.5" />
              {tr("Mark all read")}
            </Button>
          )}
        </div>
        <div className="max-h-[70dvh] overflow-y-auto overscroll-contain">
          {setupNeeded ? (
            <p className="px-4 py-6 text-center text-xs text-muted-foreground">
              {tr("Notifications need a one-time database update. Run `npx prisma db push`, then reload.")}
            </p>
          ) : items.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">{tr("You're all caught up.")}</p>
          ) : (
            items.map((item) => (
              <Row
                key={item.id}
                item={item}
                onOpen={(i) => {
                  setOpen(false)
                  state.open(i)
                }}
              />
            ))
          )}
        </div>
        <PhoneAlertsFooter phone={phone} />
      </PopoverContent>
    </Popover>
  )
}
