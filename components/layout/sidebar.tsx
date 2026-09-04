import Link from 'next/link'
import {
  LayoutDashboard,
  CalendarCheck,
  Users,
  BedDouble,
  Wrench,
  MessageSquare
} from 'lucide-react'

const navigation = [
  { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { name: 'Reservations', href: '/reservations', icon: CalendarCheck },
  { name: 'Guests', href: '/guests', icon: Users },
  { name: 'Units', href: '/units', icon: BedDouble },
  { name: 'Operations', href: '/operations', icon: Wrench },
  { name: 'WhatsApp', href: '/whatsapp', icon: MessageSquare },
]

export function Sidebar() {
  return (
    <div className="flex h-full w-64 flex-col border-r bg-card px-3 py-4">
      <div className="mb-8 px-4">
        <h1 className="text-xl font-bold tracking-tight text-primary">
          Hospitality OS
        </h1>
        <p className="text-xs text-muted-foreground mt-1">by Ritumbhara</p>
      </div>
      <nav className="flex-1 space-y-1">
        {navigation.map((item) => (
          <Link
            key={item.name}
            href={item.href}
            className="group flex items-center rounded-md px-3 py-2 text-sm font-medium hover:bg-accent hover:text-accent-foreground text-muted-foreground transition-colors"
          >
            <item.icon
              className="mr-3 h-5 w-5 flex-shrink-0"
              aria-hidden="true"
            />
            {item.name}
          </Link>
        ))}
      </nav>
    </div>
  )
}
