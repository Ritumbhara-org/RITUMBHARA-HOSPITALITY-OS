"use client"

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { motion } from 'framer-motion'
import {
  LayoutDashboard,
  CalendarCheck,
  Users,
  BedDouble,
  Wrench,
  MessageSquare,
  Globe,
  Sparkles
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
  const pathname = usePathname()

  return (
    <div className="flex h-full w-64 flex-col bg-gradient-to-b from-[#4a0518] via-[#5c0a20] to-[#3a0312] border-r border-white/[0.06]">
      <div className="px-5 pt-6 pb-8">
        <div className="flex flex-col items-start gap-1.5">
          <img src="/logo.svg" alt="Ritumbhara Logo" className="h-9 w-auto object-contain drop-shadow-md" />
          <h1 className="text-sm font-bold tracking-tight text-white/90 pl-1 mt-1">
            HOSPITALITY OS
          </h1>
        </div>
      </div>
      <nav className="flex-1 space-y-0.5 px-3">
        {navigation.map((item, index) => {
          const isActive = pathname === item.href || pathname?.startsWith(item.href + '/')
          return (
            <Link
              key={item.name}
              href={item.href}
              className={`group relative flex items-center rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200 ${
                isActive
                  ? 'bg-white/[0.1] text-white shadow-sm'
                  : 'text-slate-400 hover:text-white hover:bg-white/[0.05]'
              }`}
            >
              {isActive && (
                <motion.div
                  layoutId="sidebar-active"
                  className="absolute left-0 top-1/2 -translate-y-1/2 h-6 w-[3px] rounded-full bg-gradient-to-b from-rose-400 to-red-500"
                  transition={{ type: "spring", stiffness: 380, damping: 30 }}
                />
              )}
              <motion.div
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.04, duration: 0.25 }}
                className={`mr-3 flex items-center justify-center transition-colors duration-200 ${
                  isActive ? 'text-rose-400' : 'text-slate-500 group-hover:text-slate-300'
                }`}
              >
                <item.icon className="h-[18px] w-[18px] flex-shrink-0" aria-hidden="true" />
              </motion.div>
              <motion.span
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: index * 0.04 + 0.08, duration: 0.25 }}
              >
                {item.name}
              </motion.span>
              {item.name === 'WhatsApp' && (
                <span className="ml-auto rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-400">
                  Soon
                </span>
              )}
            </Link>
          )
        })}
      </nav>
      <div className="mx-3 mb-4 rounded-xl bg-gradient-to-br from-rose-500/10 to-red-500/10 border border-rose-500/10 p-4">
        <p className="text-[11px] font-medium text-slate-300">Need help?</p>
        <p className="text-[10px] text-slate-500 mt-1">Contact support for assistance with your account.</p>
        <a href="mailto:ritumbharahotel@gmail.com" className="text-[10px] font-medium text-rose-400 hover:text-rose-300 mt-2 inline-block transition-colors">ritumbharahotel@gmail.com</a>
      </div>
    </div>
  )
}
