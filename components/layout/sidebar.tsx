"use client"

import Link from 'next/link'
import { motion } from 'framer-motion'
import {
  LayoutDashboard,
  CalendarCheck,
  Users,
  BedDouble,
  Wrench,
  MessageSquare,
  Globe
} from 'lucide-react'

const navigation = [
  { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { name: 'Reservations', href: '/reservations', icon: CalendarCheck },
  { name: 'Guests', href: '/guests', icon: Users },
  { name: 'Units', href: '/units', icon: BedDouble },
  { name: 'Operations', href: '/operations', icon: Wrench },
  { name: 'WhatsApp', href: '/whatsapp', icon: MessageSquare },
  { name: 'SEO Tools', href: '/seo', icon: Globe },
]

export function Sidebar() {
  return (
    <div className="flex h-full w-64 flex-col border-r border-slate-800 bg-slate-950 px-3 py-4 text-slate-300">
      <div className="mb-8 px-4">
        <h1 className="text-xl font-bold tracking-tight text-white">
          Hospitality OS
        </h1>
        <p className="text-xs text-slate-500 mt-1">by Ritumbhara</p>
      </div>
      <nav className="flex-1 space-y-1">
        {navigation.map((item, index) => (
          <Link
            key={item.name}
            href={item.href}
            className="group flex items-center rounded-lg px-3 py-2 text-sm font-medium hover:bg-slate-800 hover:text-white text-slate-400 transition-colors duration-150"
          >
            <motion.div
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.05, duration: 0.2 }}
              whileTap={{ scale: 0.95 }}
              className="mr-3 flex items-center justify-center rounded-md text-slate-400 group-hover:text-white transition-colors duration-150"
            >
              <item.icon
                className="h-5 w-5 flex-shrink-0"
                aria-hidden="true"
              />
            </motion.div>
            <motion.span
               initial={{ opacity: 0 }}
               animate={{ opacity: 1 }}
               transition={{ delay: index * 0.05 + 0.1, duration: 0.2 }}
            >
              {item.name}
            </motion.span>
          </Link>
        ))}
      </nav>
    </div>
  )
}
