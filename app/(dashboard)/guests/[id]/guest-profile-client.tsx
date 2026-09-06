"use client"

import { motion } from "framer-motion"
import { ArrowLeft, User, Phone, Mail, Calendar, CreditCard, ShieldCheck, Ticket } from "lucide-react"
import Link from "next/link"
import { format } from "date-fns"

export function GuestProfileClient({ guest, totalSpend, totalStays }: { guest: any, totalSpend: number, totalStays: number }) {
  return (
    <div className="flex h-full flex-col gap-6 overflow-auto pb-8">
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="flex items-center gap-4"
      >
        <Link href="/guests" className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors text-slate-500">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white">Guest Profile</h1>
          <p className="text-muted-foreground mt-1">
            Detailed information for {guest.name}
          </p>
        </div>
      </motion.div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Profile Card */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.1 }}
          className="col-span-1 border rounded-xl bg-card shadow-sm p-6 flex flex-col items-center text-center"
        >
          <div className="h-24 w-24 bg-primary/10 rounded-full flex items-center justify-center text-primary mb-4 text-3xl font-bold">
            {guest.name.charAt(0).toUpperCase()}
          </div>
          <h2 className="text-2xl font-bold">{guest.name}</h2>
          
          {guest.membership ? (
            <div className="mt-2 flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-indigo-50 text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800/30 text-xs font-semibold">
              <Star className="h-3 w-3" />
              {guest.membership.tier} MEMBER
            </div>
          ) : (
            <span className="text-xs text-muted-foreground italic mt-2">No Membership</span>
          )}

          <div className="w-full mt-6 space-y-4 text-left border-t pt-6">
            <div className="flex items-center gap-3 text-sm">
              <Phone className="h-4 w-4 text-muted-foreground" />
              <span>{guest.phone}</span>
            </div>
            {guest.email && (
              <div className="flex items-center gap-3 text-sm">
                <Mail className="h-4 w-4 text-muted-foreground" />
                <span>{guest.email}</span>
              </div>
            )}
            <div className="flex items-center gap-3 text-sm">
              <CreditCard className="h-4 w-4 text-muted-foreground" />
              <span>{guest.idType || 'ID'}: {guest.idNumber || 'Not provided'}</span>
            </div>
            <div className="flex items-center gap-3 text-sm">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <span>Added: {format(new Date(guest.createdAt), "MMM d, yyyy")}</span>
            </div>
          </div>
        </motion.div>

        {/* Stats and History */}
        <div className="col-span-1 md:col-span-2 flex flex-col gap-6">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.2 }}
            className="grid grid-cols-2 gap-4"
          >
            <div className="border rounded-xl bg-card p-4 flex flex-col justify-center shadow-sm">
              <p className="text-sm font-medium text-muted-foreground mb-1">Total Stays</p>
              <div className="text-3xl font-bold">{totalStays}</div>
            </div>
            <div className="border rounded-xl bg-card p-4 flex flex-col justify-center shadow-sm">
              <p className="text-sm font-medium text-muted-foreground mb-1">Total Spend</p>
              <div className="text-3xl font-bold text-emerald-600 dark:text-emerald-400">${totalSpend.toFixed(2)}</div>
            </div>
          </motion.div>

          {/* Reservations List */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.3 }}
            className="border rounded-xl bg-card shadow-sm flex flex-col"
          >
            <div className="p-4 border-b font-semibold flex items-center justify-between">
              Reservations History
              <Link href={`/reservations?newBooking=true&guestId=${guest.id}`} className="text-sm text-primary hover:underline font-normal">
                + New Booking
              </Link>
            </div>
            <div className="p-0">
              {guest.reservations.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground text-sm">No reservations found.</div>
              ) : (
                <div className="divide-y">
                  {guest.reservations.map((res: any) => (
                    <div key={res.id} className="p-4 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-900/50 transition-colors">
                      <div>
                        <div className="font-medium text-sm">{res.unit.name} <span className="text-muted-foreground ml-2">({res.property.name})</span></div>
                        <div className="text-xs text-muted-foreground mt-1">
                          {format(new Date(res.checkIn), "MMM d")} - {format(new Date(res.checkOut), "MMM d, yyyy")}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-xs font-semibold px-2 py-1 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 inline-block">
                          {res.status}
                        </div>
                        <div className="text-xs font-medium text-emerald-600 dark:text-emerald-400 mt-2">${res.totalAmount}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </motion.div>

          {/* Tickets List */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.4 }}
            className="border rounded-xl bg-card shadow-sm flex flex-col"
          >
            <div className="p-4 border-b font-semibold flex items-center justify-between">
              Tickets & Requests
              <Link href={`/operations?newTicket=true&guestId=${guest.id}`} className="text-sm text-primary hover:underline font-normal">
                + New Ticket
              </Link>
            </div>
            <div className="p-0">
              {guest.tickets.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground text-sm">No tickets found.</div>
              ) : (
                <div className="divide-y">
                  {guest.tickets.map((ticket: any) => (
                    <div key={ticket.id} className="p-4 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-900/50 transition-colors">
                      <div>
                        <div className="font-medium text-sm flex items-center gap-2">
                          {ticket.description}
                        </div>
                        <div className="text-xs text-muted-foreground mt-1">
                          {ticket.category} • {format(new Date(ticket.createdAt), "MMM d, yyyy")}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-xs font-semibold px-2 py-1 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 inline-block">
                          {ticket.status}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </motion.div>

        </div>
      </div>
    </div>
  )
}

function Star({ className }: { className?: string }) {
  return (
    <svg className={className} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
      <path fillRule="evenodd" d="M10.788 3.21c.448-1.077 1.976-1.077 2.424 0l2.082 5.007 5.404.433c1.164.093 1.636 1.545.749 2.305l-4.117 3.527 1.257 5.273c.271 1.136-.964 2.033-1.96 1.425L12 18.354 7.373 21.18c-.996.608-2.231-.29-1.96-1.425l1.257-5.273-4.117-3.527c-.887-.76-.415-2.212.749-2.305l5.404-.433 2.082-5.006z" clipRule="evenodd" />
    </svg>
  )
}
