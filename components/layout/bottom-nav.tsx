"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { MoreHorizontal } from "lucide-react"
import { bottomTabs as tabs, isActivePath } from "./nav-items"
import { useTr } from "@/components/i18n/language-provider"

// Phone-only tab bar. Thumb-reachable, sits above the home indicator on notched phones.
export function BottomNav({ onMore }: { onMore: () => void }) {
  const tr = useTr()
  const pathname = usePathname()
  const onTab = tabs.some((t) => isActivePath(pathname, t.href))
  return (
    <nav
      aria-label={tr("Quick")}
      className="relative z-40 shrink-0 border-t border-border/60 bg-background/95 backdrop-blur-xl pb-[env(safe-area-inset-bottom)] sm:hidden"
    >
      <div className="grid h-16 grid-cols-5">
        {tabs.map((tab) => {
          const active = isActivePath(pathname, tab.href)
          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={active ? "page" : undefined}
              className={`flex flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors ${
                active ? "text-primary" : "text-muted-foreground active:text-foreground"
              }`}
            >
              <span className={`flex h-7 w-12 items-center justify-center rounded-full transition-colors ${active ? "bg-primary/10" : ""}`}>
                <tab.icon className="h-[20px] w-[20px]" aria-hidden />
              </span>
              {tr(tab.name)}
            </Link>
          )
        })}
        <button
          type="button"
          onClick={onMore}
          className={`flex flex-col items-center justify-center gap-1 text-[11px] font-medium ${
            onTab ? "text-muted-foreground" : "text-primary"
          }`}
        >
          <span className={`flex h-7 w-12 items-center justify-center rounded-full ${onTab ? "" : "bg-primary/10"}`}>
            <MoreHorizontal className="h-[20px] w-[20px]" aria-hidden />
          </span>
          {tr("More")}
        </button>
      </div>
    </nav>
  )
}
