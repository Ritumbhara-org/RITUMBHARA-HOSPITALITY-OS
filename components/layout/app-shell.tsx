"use client"

import { useState } from "react"
import { Sidebar } from "./sidebar"
import { Topbar, MobileMenu } from "./topbar"
import { BottomNav } from "./bottom-nav"

// Staff app frame. Desktop/tablet: fixed sidebar. Phone: top bar + bottom tab bar + slide-in menu.
export function AppShell({ banner, children }: { banner?: React.ReactNode; children: React.ReactNode }) {
  const [menuOpen, setMenuOpen] = useState(false)
  return (
    <div className="flex h-[100dvh] w-full flex-col overflow-hidden bg-muted/30">
      <aside className="fixed inset-y-0 left-0 z-10 hidden w-64 flex-col sm:flex">
        <Sidebar />
      </aside>
      <div className="flex h-full min-h-0 flex-1 flex-col sm:gap-4 sm:py-4 sm:pl-64">
        <Topbar onOpenMenu={() => setMenuOpen(true)} />
        <main
          id="main"
          className="flex min-h-0 w-full flex-1 flex-col gap-4 overflow-y-auto overflow-x-hidden overscroll-y-contain px-4 pt-4 pb-4 sm:px-6 sm:py-0 md:gap-6"
        >
          {banner}
          {children}
        </main>
      </div>
      <MobileMenu open={menuOpen} onOpenChange={setMenuOpen} />
      <BottomNav onMore={() => setMenuOpen(true)} />
    </div>
  )
}
