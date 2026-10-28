"use client"

import { usePathname } from "next/navigation"
import { Search, Menu } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Sheet, SheetContent, SheetTitle, SheetDescription } from "@/components/ui/sheet"
import { Sidebar } from "./sidebar"
import { LogoutMenuItem } from "./logout-menu-item"
import { NotificationBell } from "./notification-bell"
import { useNotifications } from "./use-notifications"
import { currentNavItem } from "./nav-items"
import { LanguageToggle } from "@/components/i18n/language-toggle"
import { useTr } from "@/components/i18n/language-provider"

// The phone menu drawer. Controlled so tapping a page in it closes it straight away.
export function MobileMenu({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const tr = useTr()
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="left" className="w-[82%] max-w-[300px] p-0 border-0" showCloseButton={false}>
        <SheetTitle className="sr-only">{tr("Menu")}</SheetTitle>
        <SheetDescription className="sr-only">{tr("Navigation menu")}</SheetDescription>
        <Sidebar onNavigate={() => onOpenChange(false)} />
      </SheetContent>
    </Sheet>
  )
}

function AccountMenu() {
  const tr = useTr()
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button variant="ghost" size="icon" className="h-10 w-10 rounded-xl hover:bg-accent" aria-label={tr("Account")} />}
      >
        <Avatar className="h-8 w-8 ring-2 ring-border">
          <AvatarImage src="" alt="Admin" />
          <AvatarFallback className="text-[10px] font-bold bg-primary/10 text-primary">AD</AvatarFallback>
        </Avatar>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        {/* Base UI requires a menu label to sit inside a group; without it the menu crashed on open. */}
        <DropdownMenuGroup>
          <DropdownMenuLabel className="font-normal">
            <div className="flex flex-col space-y-1">
              <p className="text-sm font-semibold">{tr("Admin")}</p>
              <p className="text-xs text-muted-foreground">admin@ritumbhara.com</p>
            </div>
          </DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem>{tr("Settings")}</DropdownMenuItem>
        <DropdownMenuItem render={<a href="mailto:studios.jaipur@gmail.com" />}>{tr("Support")}</DropdownMenuItem>
        <DropdownMenuSeparator />
        <LogoutMenuItem />
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function Topbar({ onOpenMenu }: { onOpenMenu?: () => void }) {
  const tr = useTr()
  const pathname = usePathname()
  const title = currentNavItem(pathname)?.name ?? tr("Ritumbhara OS")
  // One poller for the bell; it is drawn in both the phone and the desktop layout below.
  const notifications = useNotifications()

  return (
    <header className="sticky top-0 z-30 shrink-0 border-b border-border/50 bg-background/90 backdrop-blur-xl pt-[env(safe-area-inset-top)] sm:static sm:border-0 sm:bg-transparent sm:backdrop-blur-none sm:pt-0">
      {/* Phone: menu, page name, account. */}
      <div className="flex h-14 items-center gap-2 px-2 sm:hidden">
        <Button size="icon" variant="ghost" className="h-10 w-10 rounded-xl hover:bg-accent" onClick={onOpenMenu} aria-label={tr("Open menu")}>
          <Menu className="h-5 w-5" />
        </Button>
        <div className="flex min-w-0 flex-1 items-center gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icons/icon-192.png" alt="" className="h-7 w-7 shrink-0 rounded-lg" />
          <span className="truncate text-base font-semibold tracking-tight">{tr(title)}</span>
        </div>
        <LanguageToggle />
        <NotificationBell state={notifications} className="h-10 w-10" />
        <AccountMenu />
      </div>

      {/* Tablet and desktop: unchanged layout. */}
      <div className="hidden w-full items-center justify-end gap-4 px-6 sm:flex md:gap-2 lg:gap-4">
        <div className="flex-1 md:flex-initial">
          <div className="flex items-center gap-2 rounded-xl bg-muted/50 px-3.5 py-2 border border-border/40">
            <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-sm font-medium text-muted-foreground">{tr("Ritumbhara Hotels")}</span>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <LanguageToggle className="mr-1" />
          <Button variant="ghost" size="icon" className="relative h-9 w-9 rounded-xl hover:bg-accent">
            <Search className="h-4 w-4 text-muted-foreground" />
            <span className="sr-only">{tr("Search")}</span>
          </Button>
          <NotificationBell state={notifications} />
          <AccountMenu />
        </div>
      </div>
    </header>
  )
}
