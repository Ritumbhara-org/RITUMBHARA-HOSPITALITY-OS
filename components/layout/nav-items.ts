import {
  LayoutDashboard,
  MapPin,
  CalendarCheck,
  Users,
  BedDouble,
  Wrench,
  MessageSquare,
  Inbox,
  Globe,
  ShieldCheck,
  Package,
  LineChart,
  Target,
  CalendarRange,
  Crown,
  type LucideIcon,
} from "lucide-react"

export interface NavItem {
  name: string
  href: string
  icon: LucideIcon
}

// One list for the desktop sidebar, the phone menu drawer and the page title in the phone top bar.
export const navigation: NavItem[] = [
  { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { name: "Leads", href: "/leads", icon: Target },
  { name: "Analytics", href: "/analytics", icon: LineChart },
  { name: "Locations", href: "/locations", icon: MapPin },
  { name: "Reservations", href: "/reservations", icon: CalendarCheck },
  { name: "Long Stays", href: "/long-stay", icon: CalendarRange },
  { name: "Guests", href: "/guests", icon: Users },
  { name: "Loyalty", href: "/loyalty", icon: Crown },
  { name: "Units", href: "/units", icon: BedDouble },
  { name: "Operations", href: "/operations", icon: Wrench },
  { name: "Inventory", href: "/inventory", icon: Package },
  { name: "Team", href: "/team", icon: ShieldCheck },
  { name: "Inbox", href: "/inbox", icon: Inbox },
  { name: "WhatsApp", href: "/whatsapp", icon: MessageSquare },
  { name: "SEO Tools", href: "/seo", icon: Globe },
]

// The four sections staff open most on a phone get a tab in the bottom bar; everything else is under "More".
export const bottomTabs: NavItem[] = [
  { name: "Home", href: "/dashboard", icon: LayoutDashboard },
  { name: "Bookings", href: "/reservations", icon: CalendarCheck },
  { name: "Ops", href: "/operations", icon: Wrench },
  { name: "Inbox", href: "/inbox", icon: Inbox },
]

export function isActivePath(pathname: string | null, href: string) {
  return pathname === href || !!pathname?.startsWith(href + "/")
}

export function currentNavItem(pathname: string | null): NavItem | undefined {
  return navigation.find((item) => isActivePath(pathname, item.href))
}
