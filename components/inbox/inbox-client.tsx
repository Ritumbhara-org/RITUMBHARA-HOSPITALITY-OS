"use client"

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { format, formatDistanceToNowStrict, isToday } from "date-fns"
import { toast } from "sonner"
import {
  ArrowLeft,
  BedDouble,
  CalendarDays,
  Check,
  ExternalLink,
  Inbox as InboxIcon,
  Link2,
  Loader2,
  MessageSquareText,
  RotateCcw,
  Search,
  Send,
  Sparkles,
  UserRound,
  X,
} from "lucide-react"

import {
  assignInboxConversation,
  draftInboxReply,
  getInboxThread,
  linkInboxReservation,
  markInboxConversationRead,
  searchInboxReservations,
  sendInboxReply,
  setInboxConversationStatus,
} from "@/app/actions/inbox"
import { CHANNELS, CHANNEL_ORDER, type InboxChannelId } from "@/lib/inbox/channels"
import { QUICK_REPLIES, fillQuickReply } from "@/lib/inbox/quick-replies"
import type { InboxConversationSummary, InboxThread } from "@/lib/inbox/types"

type View = "OPEN" | "MINE" | "UNASSIGNED" | "CLOSED"

interface InboxClientProps {
  initialConversations: InboxConversationSummary[]
  properties: { id: string; name: string }[]
  team: { id: string; name: string }[]
  activePropertyId: string
  currentUser: { id: string; name: string } | null
  setupError: string | null
}

const REFRESH_MS = 30_000

function when(iso: string) {
  const d = new Date(iso)
  return isToday(d) ? format(d, "h:mm a") : format(d, "d MMM")
}

function initials(name: string) {
  const parts = name.replace(/[^\p{L}\s]/gu, " ").trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return "?"
  return (parts[0][0] + (parts[1]?.[0] ?? "")).toUpperCase()
}

function ChannelBadge({ channel, className = "" }: { channel: InboxChannelId; className?: string }) {
  const meta = CHANNELS[channel]
  return (
    <span className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${meta.badge} ${className}`}>
      {meta.short}
    </span>
  )
}

export function InboxClient({
  initialConversations,
  properties,
  team,
  activePropertyId,
  currentUser,
  setupError,
}: InboxClientProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [isRefreshing, startRefresh] = useTransition()

  const [view, setView] = useState<View>("OPEN")
  const [channel, setChannel] = useState<InboxChannelId | "ALL">("ALL")
  const [search, setSearch] = useState("")
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [thread, setThread] = useState<InboxThread | null>(null)
  const [threadLoading, setThreadLoading] = useState(false)
  const [reply, setReply] = useState("")
  const [sending, setSending] = useState(false)
  const [drafting, setDrafting] = useState(false)
  const [showQuick, setShowQuick] = useState(false)
  const [linking, setLinking] = useState(false)
  const [linkQuery, setLinkQuery] = useState("")
  const [linkResults, setLinkResults] = useState<Awaited<ReturnType<typeof searchInboxReservations>>>([])
  // Optimistic read / status / assignee changes until the next refresh.
  const [overrides, setOverrides] = useState<Record<string, Partial<InboxConversationSummary>>>({})

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const selectedKeyRef = useRef<string | null>(null)
  useEffect(() => {
    selectedKeyRef.current = selectedKey
  }, [selectedKey])

  const conversations = useMemo(
    () => initialConversations.map((c) => ({ ...c, ...overrides[c.key] })),
    [initialConversations, overrides]
  )

  const isMine = useCallback(
    (c: InboxConversationSummary) =>
      !!currentUser && !!c.assignee && (c.assignee.id === currentUser.id || c.assignee.name === currentUser.name),
    [currentUser]
  )

  const counts = useMemo(() => {
    const open = conversations.filter((c) => c.status === "OPEN")
    return {
      OPEN: open.length,
      MINE: open.filter(isMine).length,
      UNASSIGNED: open.filter((c) => !c.assignee).length,
      CLOSED: conversations.length - open.length,
      unreadByChannel: CHANNEL_ORDER.reduce(
        (acc, ch) => ({ ...acc, [ch]: open.filter((c) => c.channel === ch && c.unread).length }),
        {} as Record<InboxChannelId, number>
      ),
    }
  }, [conversations, isMine])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return conversations.filter((c) => {
      if (view === "CLOSED" ? c.status !== "CLOSED" : c.status !== "OPEN") return false
      if (view === "MINE" && !isMine(c)) return false
      if (view === "UNASSIGNED" && c.assignee) return false
      if (channel !== "ALL" && c.channel !== channel) return false
      if (!q) return true
      return [c.guestName, c.contact, c.preview, c.subject, c.reservation?.unitName]
        .filter(Boolean)
        .some((v) => v!.toLowerCase().includes(q))
    })
  }, [conversations, view, channel, search, isMine])

  const selected = conversations.find((c) => c.key === selectedKey) ?? null

  // ------------------------------------------------------------ data loading

  const loadThread = useCallback(async (key: string, quiet = false) => {
    if (!quiet) setThreadLoading(true)
    try {
      const t = await getInboxThread(key)
      // Ignore results for a conversation the user has already moved away from.
      if (selectedKeyRef.current === key) setThread(t)
    } catch {
      if (!quiet) toast.error("Couldn't load this conversation.")
    } finally {
      if (!quiet) setThreadLoading(false)
    }
  }, [])

  const openConversation = useCallback(
    async (key: string) => {
      selectedKeyRef.current = key
      setSelectedKey(key)
      setThread(null)
      setReply("")
      setShowQuick(false)
      setLinking(false)
      await loadThread(key)
      const conv = conversations.find((c) => c.key === key)
      if (conv?.unread) {
        setOverrides((o) => ({ ...o, [key]: { ...o[key], unread: false } }))
        markInboxConversationRead(key)
      }
    },
    [conversations, loadThread]
  )

  // Poll for new messages.
  useEffect(() => {
    if (setupError) return
    const id = setInterval(() => {
      startRefresh(() => router.refresh())
      if (selectedKey) loadThread(selectedKey, true)
    }, REFRESH_MS)
    return () => clearInterval(id)
  }, [router, selectedKey, loadThread, setupError])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ block: "end" })
  }, [thread?.messages.length, selectedKey])

  // ------------------------------------------------------------ actions

  const handlePropertyChange = (propertyId: string) => {
    const params = new URLSearchParams(searchParams)
    params.set("propertyId", propertyId)
    router.push(`/inbox?${params.toString()}`)
    setSelectedKey(null)
    setThread(null)
  }

  const handleSend = async () => {
    if (!selected || !reply.trim()) return
    setSending(true)
    const result = await sendInboxReply(selected.key, reply)
    setSending(false)
    if (!result.success) {
      toast.error(result.error)
      return
    }
    setReply("")
    toast.success(`Sent on ${CHANNELS[selected.channel].label}`)
    await loadThread(selected.key, true)
    startRefresh(() => router.refresh())
  }

  const handleDraft = async () => {
    if (!selected) return
    setDrafting(true)
    const result = await draftInboxReply(selected.key)
    setDrafting(false)
    if (result.success && result.data) setReply(result.data.draft)
    else if (!result.success) toast.error(result.error)
  }

  const handleAssign = async (teamMemberId: string) => {
    if (!selected) return
    const member = team.find((t) => t.id === teamMemberId) ?? null
    setOverrides((o) => ({ ...o, [selected.key]: { ...o[selected.key], assignee: member } }))
    const result = await assignInboxConversation(selected.key, member?.id ?? null)
    if (!result.success) toast.error(result.error)
    else toast.success(member ? `Assigned to ${member.name}` : "Unassigned")
  }

  const handleStatus = async (status: "OPEN" | "CLOSED") => {
    if (!selected) return
    setOverrides((o) => ({ ...o, [selected.key]: { ...o[selected.key], status, unread: false } }))
    const result = await setInboxConversationStatus(selected.key, status)
    if (!result.success) toast.error(result.error)
    else toast.success(status === "CLOSED" ? "Marked as done" : "Re-opened")
  }

  const handleLinkSearch = async (q: string) => {
    setLinkQuery(q)
    setLinkResults(q.trim().length >= 2 ? await searchInboxReservations(q) : [])
  }

  const handleLink = async (reservationId: string | null) => {
    if (!selected) return
    const result = await linkInboxReservation(selected.key, reservationId)
    if (!result.success) return toast.error(result.error)
    toast.success(reservationId ? "Booking linked" : "Booking unlinked")
    setLinking(false)
    setLinkQuery("")
    setLinkResults([])
    await loadThread(selected.key, true)
    startRefresh(() => router.refresh())
  }

  const insertQuickReply = (text: string) => {
    const r = (thread?.conversation ?? selected)?.reservation
    const firstName = (thread?.conversation ?? selected)?.guestName?.split(" ")[0]
    const filled = fillQuickReply(text, {
      guest: firstName && !/^[+\d]/.test(firstName) ? firstName : null,
      unit: r?.unitName,
      property: r?.propertyName,
      address: r?.propertyAddress,
      checkIn: r ? format(new Date(r.checkIn), "d MMM") : null,
      checkOut: r ? format(new Date(r.checkOut), "d MMM") : null,
    })
    setReply((prev) => (prev.trim() ? `${prev.trim()}\n\n${filled}` : filled))
    setShowQuick(false)
  }

  // ------------------------------------------------------------ render

  if (setupError) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <div className="max-w-md rounded-2xl border bg-card p-6 text-center shadow-sm">
          <InboxIcon className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
          <h1 className="text-lg font-semibold">Inbox needs one setup step</h1>
          <p className="mt-2 text-sm text-muted-foreground">{setupError}</p>
        </div>
      </div>
    )
  }

  const active = thread && selected && thread.conversation.key === selected.key ? thread : null
  const res = active?.conversation.reservation ?? selected?.reservation ?? null

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col sm:bg-background sm:p-6">
      {/* Header (hidden on phones while a conversation is open, so the chat gets the room) */}
      <div className={`${selected ? "hidden md:flex" : "flex"} mb-3 sm:mb-4 flex-wrap items-center justify-between gap-3`}>
        <div className="min-w-0">
          <h1 className="text-xl font-bold tracking-tight sm:text-3xl">Inbox</h1>
          <p className="mt-1 hidden text-sm text-muted-foreground sm:block">Every guest message from WhatsApp, Airbnb, Booking.com, Agoda and email, in one place.</p>
        </div>
        <div className="flex w-full items-center gap-2 sm:w-auto">
          {isRefreshing && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-label="Refreshing" />}
          <div className="flex h-11 min-w-0 flex-1 items-center rounded-xl border bg-card px-3 sm:h-10 sm:flex-none sm:bg-muted/20">
            <select
              value={activePropertyId}
              onChange={(e) => handlePropertyChange(e.target.value)}
              className="w-full cursor-pointer border-none bg-transparent text-sm font-medium outline-none focus:ring-0"
              aria-label="Location"
            >
              <option value="ALL">All locations</option>
              {properties.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="relative flex min-h-0 flex-1 overflow-hidden rounded-2xl border bg-card shadow-sm">
        {/* ---------------- Conversation list ---------------- */}
        <aside
          className={`${selected ? "hidden md:flex" : "flex"} w-full flex-col border-r bg-muted/10 md:w-80 lg:w-96`}
        >
          <div className="space-y-3 border-b p-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search guest, unit or message"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full rounded-xl border-none bg-background py-2.5 sm:py-2 pl-9 pr-3 text-sm shadow-sm ring-1 ring-inset ring-border focus:ring-2 focus:ring-primary"
              />
            </div>

            <div className="flex gap-1 rounded-xl bg-muted/40 p-1 text-xs font-medium">
              {(
                [
                  ["OPEN", "Open"],
                  ["MINE", "Mine"],
                  ["UNASSIGNED", "Unassigned"],
                  ["CLOSED", "Done"],
                ] as [View, string][]
              ).map(([id, label]) => (
                <button
                  key={id}
                  onClick={() => setView(id)}
                  className={`flex-1 whitespace-nowrap rounded-lg px-1.5 py-2 sm:py-1.5 transition-colors ${
                    view === id ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {label}
                  <span className="ml-1 text-[10px] opacity-60">{counts[id]}</span>
                </button>
              ))}
            </div>

            <div className="flex gap-1.5 overflow-x-auto pb-0.5 [scrollbar-width:none]">
              <button
                onClick={() => setChannel("ALL")}
                className={`shrink-0 rounded-full border px-3 py-1.5 sm:px-2.5 sm:py-1 text-xs font-medium transition-colors ${
                  channel === "ALL" ? "border-primary/40 bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted"
                }`}
              >
                All
              </button>
              {CHANNEL_ORDER.map((ch) => (
                <button
                  key={ch}
                  onClick={() => setChannel(ch)}
                  className={`flex shrink-0 items-center gap-1 rounded-full border px-3 py-1.5 sm:px-2.5 sm:py-1 text-xs font-medium transition-colors ${
                    channel === ch ? "border-primary/40 bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted"
                  }`}
                >
                  {CHANNELS[ch].label}
                  {counts.unreadByChannel[ch] > 0 && (
                    <span className="rounded-full bg-primary px-1.5 text-[10px] leading-4 text-primary-foreground">
                      {counts.unreadByChannel[ch]}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>

          <div className="flex-1 space-y-1 overflow-y-auto p-2">
            {filtered.length === 0 && (
              <div className="px-4 py-12 text-center text-sm text-muted-foreground">
                <MessageSquareText className="mx-auto mb-2 h-6 w-6 opacity-50" />
                {conversations.length === 0
                  ? "No guest messages yet. They'll appear here as they arrive."
                  : "Nothing matches these filters."}
              </div>
            )}
            {filtered.map((c) => (
              <button
                key={c.key}
                onClick={() => openConversation(c.key)}
                className={`flex w-full items-start gap-3 rounded-xl p-3 text-left transition-colors ${
                  selectedKey === c.key ? "bg-primary/5 ring-1 ring-primary/20" : "hover:bg-muted"
                }`}
              >
                <div className="relative shrink-0">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground">
                    {initials(c.guestName)}
                  </div>
                  {c.unread && <span className="absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full border-2 border-card bg-primary" />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="mb-0.5 flex items-baseline justify-between gap-2">
                    <p className={`truncate text-sm ${c.unread ? "font-bold" : "font-semibold"}`}>{c.guestName}</p>
                    <span className="shrink-0 text-[10px] text-muted-foreground">{when(c.lastMessageAt)}</span>
                  </div>
                  <p className={`line-clamp-1 text-xs ${c.unread ? "text-foreground" : "text-muted-foreground"}`}>{c.preview}</p>
                  <div className="mt-1.5 flex items-center gap-1.5">
                    <ChannelBadge channel={c.channel} />
                    {c.reservation?.unitName && (
                      <span className="truncate text-[10px] text-muted-foreground">{c.reservation.unitName}</span>
                    )}
                    {c.assignee && (
                      <span className="ml-auto truncate rounded-md bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                        {c.assignee.name.split(" ")[0]}
                      </span>
                    )}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </aside>

        {/* ---------------- Thread ---------------- */}
        <section className={`${selected ? "flex" : "hidden md:flex"} min-w-0 flex-1 flex-col`}>
          {!selected ? (
            <div className="flex flex-1 flex-col items-center justify-center p-6 text-center text-muted-foreground">
              <InboxIcon className="mb-3 h-10 w-10 opacity-40" />
              <p className="text-sm">Pick a conversation to read and reply.</p>
            </div>
          ) : (
            <>
              <header className="flex items-center gap-2 border-b px-2 py-2.5 sm:gap-3 sm:px-4 sm:py-3">
                <button
                  onClick={() => {
                    setSelectedKey(null)
                    setThread(null)
                  }}
                  className="rounded-lg p-2 hover:bg-muted md:hidden"
                  aria-label="Back to conversations"
                >
                  <ArrowLeft className="h-5 w-5" />
                </button>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h2 className="truncate font-semibold">{selected.guestName}</h2>
                    <span className="hidden shrink-0 sm:inline-flex"><ChannelBadge channel={selected.channel} /></span>
                  </div>
                  <p className="truncate text-xs text-muted-foreground">
                    <span className="sm:hidden">{CHANNELS[selected.channel].label} · </span>
                    {selected.subject || selected.contact || CHANNELS[selected.channel].label}
                  </p>
                </div>
                <select
                  value={selected.assignee?.id ?? ""}
                  onChange={(e) => handleAssign(e.target.value)}
                  className="h-9 max-w-[6.5rem] shrink-0 cursor-pointer rounded-lg border bg-background px-2 text-xs sm:h-8 sm:max-w-[9rem]"
                  aria-label="Assign to"
                >
                  <option value="">Unassigned</option>
                  {team.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
                {selected.status === "OPEN" ? (
                  <button
                    onClick={() => handleStatus("CLOSED")}
                    aria-label="Mark done"
                    className="flex h-9 shrink-0 sm:h-8 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-medium hover:bg-muted"
                  >
                    <Check className="h-4 w-4 sm:h-3.5 sm:w-3.5" /> <span className="hidden sm:inline">Done</span>
                  </button>
                ) : (
                  <button
                    onClick={() => handleStatus("OPEN")}
                    aria-label="Re-open"
                    className="flex h-9 shrink-0 sm:h-8 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-medium hover:bg-muted"
                  >
                    <RotateCcw className="h-4 w-4 sm:h-3.5 sm:w-3.5" /> <span className="hidden sm:inline">Re-open</span>
                  </button>
                )}
              </header>

              {res && (
                <div className="flex items-center gap-2 border-b bg-muted/20 px-3 py-2 text-xs text-muted-foreground xl:hidden">
                  <BedDouble className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">
                    <span className="font-medium text-foreground">{res.unitName ?? "Unit"}</span>
                    {" · "}
                    {format(new Date(res.checkIn), "d MMM")} – {format(new Date(res.checkOut), "d MMM")}
                    {" · "}₹{res.totalAmount.toLocaleString("en-IN")}
                  </span>
                </div>
              )}

              <div className="flex min-h-0 flex-1">
                {/* Messages + composer */}
                <div className="flex min-w-0 flex-1 flex-col">
                  <div className="flex-1 space-y-3 overflow-y-auto overscroll-contain bg-muted/10 p-3 sm:p-4">
                    {threadLoading && !active && (
                      <div className="flex justify-center py-10">
                        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                      </div>
                    )}
                    {active?.messages.map((m) => {
                      const out = m.direction === "OUTBOUND"
                      return (
                        <div key={m.id} className={`flex ${out ? "justify-end" : "justify-start"}`}>
                          <div
                            className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm shadow-sm sm:max-w-[75%] ${
                              out ? "rounded-br-md bg-primary text-primary-foreground" : "rounded-bl-md border bg-card"
                            }`}
                          >
                            <p className="whitespace-pre-wrap break-words">{m.body}</p>
                            <p className={`mt-1 text-[10px] ${out ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
                              {out && m.senderName ? `${m.senderName} · ` : ""}
                              {format(new Date(m.at), "d MMM, h:mm a")}
                              {out && m.status === "FAILED" ? " · failed" : ""}
                            </p>
                          </div>
                        </div>
                      )
                    })}
                    <div ref={messagesEndRef} />
                  </div>

                  <div className="border-t p-2.5 sm:p-3">
                    {active?.replyNote && (
                      <div className="mb-2 flex items-start justify-between gap-2 rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
                        <span>{active.replyNote}</span>
                        {active.extranetUrl && (
                          <a
                            href={active.extranetUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="flex shrink-0 items-center gap-1 font-semibold underline-offset-2 hover:underline"
                          >
                            Open {CHANNELS[selected.channel].label} <ExternalLink className="h-3 w-3" />
                          </a>
                        )}
                      </div>
                    )}

                    <div className="relative">
                      {showQuick && (
                        <div className="absolute bottom-full left-0 z-20 mb-2 max-h-72 w-[min(18rem,calc(100vw-3rem))] overflow-y-auto rounded-xl border bg-popover p-1 shadow-lg">
                          {QUICK_REPLIES.map((q) => (
                            <button
                              key={q.id}
                              onClick={() => insertQuickReply(q.text)}
                              className="block w-full rounded-lg px-3 py-2 text-left hover:bg-muted"
                            >
                              <span className="block text-xs font-semibold">{q.label}</span>
                              <span className="line-clamp-1 text-[11px] text-muted-foreground">{q.text}</span>
                            </button>
                          ))}
                        </div>
                      )}
                      <textarea
                        value={reply}
                        onChange={(e) => setReply(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleSend()
                        }}
                        rows={2}
                        placeholder={
                          active?.canReply
                            ? `Reply on ${CHANNELS[selected.channel].label}… (Ctrl/Cmd + Enter to send)`
                            : "Draft here, then copy it into the extranet"
                        }
                        className="w-full resize-none rounded-xl border bg-background px-3 py-2.5 text-sm sm:min-h-[5.5rem] focus:outline-none focus:ring-2 focus:ring-primary"
                      />
                    </div>

                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <button
                        onClick={() => setShowQuick((s) => !s)}
                        className="flex h-9 sm:h-8 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-medium hover:bg-muted"
                      >
                        <MessageSquareText className="h-3.5 w-3.5" /> <span className="sm:hidden">Quick</span><span className="hidden sm:inline">Quick replies</span>
                      </button>
                      <button
                        onClick={handleDraft}
                        disabled={drafting || !active}
                        className="flex h-9 sm:h-8 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-medium hover:bg-muted disabled:opacity-50"
                      >
                        {drafting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                        AI draft
                      </button>
                      {!active?.canReply && reply.trim() && (
                        <button
                          onClick={() => navigator.clipboard.writeText(reply).then(() => toast.success("Copied"))}
                          className="flex h-9 sm:h-8 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-medium hover:bg-muted"
                        >
                          Copy text
                        </button>
                      )}
                      <button
                        onClick={handleSend}
                        disabled={sending || !reply.trim() || !active?.canReply}
                        className="ml-auto flex h-9 sm:h-8 items-center gap-1.5 rounded-lg bg-primary px-4 sm:px-3 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                      >
                        {sending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                        Send
                      </button>
                    </div>
                  </div>
                </div>

                {/* Booking panel */}
                <aside className="hidden w-72 shrink-0 overflow-y-auto border-l p-4 xl:block">
                  <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Booking</h3>
                  {res ? (
                    <div className="space-y-3 text-sm">
                      <div className="flex items-start gap-2">
                        <BedDouble className="mt-0.5 h-4 w-4 text-muted-foreground" />
                        <div>
                          <p className="font-medium">{res.unitName ?? "Unit"}</p>
                          <p className="text-xs text-muted-foreground">{res.propertyName}</p>
                        </div>
                      </div>
                      <div className="flex items-start gap-2">
                        <CalendarDays className="mt-0.5 h-4 w-4 text-muted-foreground" />
                        <div>
                          <p className="font-medium">
                            {format(new Date(res.checkIn), "d MMM")} – {format(new Date(res.checkOut), "d MMM yyyy")}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {new Date(res.checkIn) > new Date()
                              ? `Arrives in ${formatDistanceToNowStrict(new Date(res.checkIn))}`
                              : new Date(res.checkOut) > new Date()
                                ? "In house"
                                : "Stay completed"}
                          </p>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2 rounded-xl bg-muted/40 p-3 text-xs">
                        <div>
                          <p className="text-muted-foreground">Status</p>
                          <p className="font-medium">{res.status.replace(/_/g, " ").toLowerCase()}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Source</p>
                          <p className="font-medium">{res.source}</p>
                        </div>
                        <div className="col-span-2">
                          <p className="text-muted-foreground">Amount</p>
                          <p className="font-medium">₹{res.totalAmount.toLocaleString("en-IN")}</p>
                        </div>
                      </div>
                      {res.notes && <p className="whitespace-pre-wrap rounded-xl border p-3 text-xs text-muted-foreground">{res.notes}</p>}
                      <a href="/reservations" className="block text-xs font-medium text-primary hover:underline">
                        Open in reservations
                      </a>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">No booking linked yet.</p>
                  )}

                  {selected.channel !== "WHATSAPP" && (
                    <div className="mt-4">
                      {!linking ? (
                        <button
                          onClick={() => setLinking(true)}
                          className="flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
                        >
                          <Link2 className="h-3.5 w-3.5" /> {res ? "Change booking" : "Link a booking"}
                        </button>
                      ) : (
                        <div className="space-y-2">
                          <div className="flex items-center gap-1">
                            <input
                              autoFocus
                              value={linkQuery}
                              onChange={(e) => handleLinkSearch(e.target.value)}
                              placeholder="Guest name or booking ID"
                              className="w-full rounded-lg border bg-background px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary"
                            />
                            <button onClick={() => setLinking(false)} className="rounded-md p-1 hover:bg-muted" aria-label="Cancel">
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </div>
                          {linkResults.map((r) => (
                            <button
                              key={r.id}
                              onClick={() => handleLink(r.id)}
                              className="block w-full rounded-lg border px-2.5 py-2 text-left text-xs hover:bg-muted"
                            >
                              <span className="font-medium">{r.guestName}</span>
                              <span className="block text-muted-foreground">
                                {r.unitName} · {format(new Date(r.checkIn), "d MMM")} – {format(new Date(r.checkOut), "d MMM")}
                              </span>
                            </button>
                          ))}
                          {res && (
                            <button onClick={() => handleLink(null)} className="text-xs text-muted-foreground hover:underline">
                              Unlink current booking
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  <h3 className="mb-2 mt-6 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Guest</h3>
                  <div className="flex items-center gap-2 text-sm">
                    <UserRound className="h-4 w-4 text-muted-foreground" />
                    <span className="truncate">{selected.guestName}</span>
                  </div>
                  {selected.contact && <p className="mt-1 truncate pl-6 text-xs text-muted-foreground">{selected.contact}</p>}
                </aside>
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  )
}
