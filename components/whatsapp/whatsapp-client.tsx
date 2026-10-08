"use client"

import { useState, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { MessageSquare, Settings, Users, Search, Phone, User, Send, Bot, Shield, Clock, PlusCircle, ChevronLeft, StickyNote, Mail, Globe, MessageCircle, Star, Briefcase, IndianRupee } from "lucide-react"

import { useRouter, useSearchParams } from "next/navigation"
import { sendBroadcast } from "@/app/actions/whatsapp"
import { updateLocationKnowledge } from "@/app/actions/knowledge"
import { summarizeUserMemory, draftAIReply } from "@/app/actions/memory"
import { toast } from "sonner"
import { Sparkles, BrainCircuit } from "lucide-react"

interface WhatsAppClientProps {
  initialThreads: any[]
  initialBroadcasts: any[]
  properties: any[]
  activePropertyId: string
  initialKnowledge?: any
  userRole?: string
}

export function WhatsAppClient({ initialThreads, initialBroadcasts, properties, activePropertyId, initialKnowledge, userRole }: WhatsAppClientProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [activeTab, setActiveTab] = useState<"inbox" | "broadcasts" | "settings">("inbox")
  const [search, setSearch] = useState("")
  const [activeThreadId, setActiveThreadId] = useState<string | null>(initialThreads[0]?.phone || null)
  const [replyText, setReplyText] = useState("")
  const [isDrafting, setIsDrafting] = useState(false)
  const [isSummarizing, setIsSummarizing] = useState(false)
  const [showChatOnMobile, setShowChatOnMobile] = useState(false)
  const [isInternalMode, setIsInternalMode] = useState(false)
  const [isHinglishMode, setIsHinglishMode] = useState(false)
  const [selectedTemplate, setSelectedTemplate] = useState("pre_arrival_instructions")

  // Broadcast Modal State
  const [isBroadcastModalOpen, setIsBroadcastModalOpen] = useState(false)
  const [campaignName, setCampaignName] = useState("")
  const [audience, setAudience] = useState("ALL_ACTIVE_GUESTS")
  const [broadcastMessage, setBroadcastMessage] = useState("")
  const [isSending, setIsSending] = useState(false)

  // Knowledge Base State
  const [isSavingKnowledge, setIsSavingKnowledge] = useState(false)
  const [knowledge, setKnowledge] = useState({
    sops: initialKnowledge?.sops || "1. Greet guests politely.\n2. Verify booking details.\n3. Hand over keys.",
    policies: initialKnowledge?.policies || "Check-in: 1 PM\nCheck-out: 10 AM\nNo smoking.",
    prices: initialKnowledge?.prices || "Late Check-out: ₹500/hour\nExtra Bed: ₹1000/night",
    facts: initialKnowledge?.facts || "Wi-Fi: GUEST_NET (Pass: stay123)\nBreakfast: 7 AM - 10 AM",
  })

  // Sync state when property (and thus initialKnowledge) changes
  useEffect(() => {
    setKnowledge({
      sops: initialKnowledge?.sops || "1. Greet guests politely.\n2. Verify booking details.\n3. Hand over keys.",
      policies: initialKnowledge?.policies || "Check-in: 1 PM\nCheck-out: 10 AM\nNo smoking.",
      prices: initialKnowledge?.prices || "Late Check-out: ₹500/hour\nExtra Bed: ₹1000/night",
      facts: initialKnowledge?.facts || "Wi-Fi: GUEST_NET (Pass: stay123)\nBreakfast: 7 AM - 10 AM",
    });
  }, [initialKnowledge]);

  const filteredThreads = initialThreads.filter(t => {
    // Basic search filtering
    const matchesSearch = t.phone.includes(search) || 
      t.guest?.name?.toLowerCase().includes(search.toLowerCase()) ||
      t.teamMember?.name?.toLowerCase().includes(search.toLowerCase());
    
    // Property filtering
    const matchesProperty = t.propertyId === activePropertyId;

    return matchesSearch && matchesProperty;
  })

  // Set active thread to the first filtered one if none is selected
  const activeThread = filteredThreads.find(t => t.phone === activeThreadId) || filteredThreads[0];

  const lastInboundMsg = activeThread?.messages.slice().reverse().find((m: any) => m.direction === 'INBOUND');
  const is24hExpired = lastInboundMsg 
    ? (new Date().getTime() - new Date(lastInboundMsg.createdAt).getTime() > 24 * 60 * 60 * 1000)
    : true;

  const handlePropertyChange = (propertyId: string) => {
    const params = new URLSearchParams(searchParams)
    params.set("propertyId", propertyId)
    router.push(`/whatsapp?${params.toString()}`)
    setActiveThreadId(null) // Reset selection
  }

  const handleSendBroadcast = async () => {
    if (!campaignName || !broadcastMessage) {
      toast.error("Please fill in all fields.");
      return;
    }
    
    setIsSending(true);
    try {
      const result = await sendBroadcast(campaignName, audience, broadcastMessage, activePropertyId);
      if (result.success) {
        toast.success(`Sent successfully to ${result.count} contacts!`);
        setIsBroadcastModalOpen(false);
        setCampaignName("");
        setBroadcastMessage("");
        router.refresh();
      } else {
        toast.error(result.error || "Failed to send broadcast.");
      }
    } catch (e: any) {
      toast.error(e.message || "An error occurred.");
    } finally {
      setIsSending(false);
    }
  }

  return (
    <div className="flex h-full w-full flex-col bg-background p-4 sm:p-6 overflow-hidden">
      <div className="mb-6 flex flex-col xl:flex-row xl:items-center justify-between gap-4">
        <div className="flex flex-col sm:flex-row sm:items-center gap-4 xl:gap-6">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">WhatsApp Control Center</h1>
            <p className="text-muted-foreground mt-1">Manage guest communications, broadcasts, and AI settings.</p>
          </div>
          
          {/* Property Selector - RBAC Enforcement */}
          {(userRole === 'MANAGEMENT' || userRole === 'ADMIN') && (
            <div className="h-10 px-3 bg-muted/20 border rounded-xl flex items-center">
              <select 
                value={activePropertyId} 
                onChange={(e) => handlePropertyChange(e.target.value)}
                className="bg-transparent font-medium border-none outline-none focus:ring-0 cursor-pointer text-sm"
              >
                {properties.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
          )}
        </div>
        <div className="flex items-center gap-1 sm:gap-2 rounded-xl border bg-card p-1 shadow-sm overflow-x-auto no-scrollbar w-full xl:w-auto whitespace-nowrap">
          {[
            { id: "inbox", label: "Live Inbox", icon: MessageSquare },
            { id: "broadcasts", label: "Broadcasts", icon: Users },
            { id: "settings", label: "AI Settings", icon: Settings },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`relative flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                activeTab === tab.id ? "text-primary" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {activeTab === tab.id && (
                <motion.div
                  layoutId="active-tab"
                  className="absolute inset-0 rounded-lg bg-primary/10"
                  transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                />
              )}
              <tab.icon className="h-4 w-4 relative z-10" />
              <span className="relative z-10">{tab.label}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 min-h-0 relative overflow-hidden rounded-2xl border bg-card shadow-sm">
        <AnimatePresence mode="wait">
          {activeTab === "inbox" && (
            <motion.div 
              key="inbox"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="flex h-full"
            >
              {/* Sidebar */}
              <div className={`w-full md:w-80 border-r flex flex-col bg-muted/10 ${showChatOnMobile ? 'hidden md:flex' : 'flex'}`}>
                <div className="p-4 border-b">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <input 
                      type="text" 
                      placeholder="Search messages..." 
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      className="w-full rounded-xl border-none bg-background pl-9 pr-4 py-2 text-sm shadow-sm ring-1 ring-inset ring-border focus:ring-2 focus:ring-primary"
                    />
                  </div>
                </div>
                <div className="flex-1 overflow-y-auto p-2 space-y-1">
                  {filteredThreads.map(thread => (
                    <button
                      key={thread.phone}
                      onClick={() => {
                        setActiveThreadId(thread.phone)
                        setShowChatOnMobile(true)
                      }}
                      className={`w-full flex items-start gap-3 p-3 rounded-xl text-left transition-colors ${
                        activeThreadId === thread.phone ? "bg-primary/5 ring-1 ring-primary/20" : "hover:bg-muted"
                      }`}
                    >
                      <div className={`h-10 w-10 shrink-0 rounded-full flex items-center justify-center ${thread.teamMember ? 'bg-blue-100 text-blue-600' : 'bg-rose-100 text-rose-600'}`}>
                        {thread.teamMember ? <Shield className="h-5 w-5" /> : <User className="h-5 w-5" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex justify-between items-baseline mb-0.5">
                          <p className="font-semibold text-sm truncate">
                            {thread.teamMember ? thread.teamMember.name : (thread.guest ? thread.guest.name : thread.phone)}
                          </p>
                          <span suppressHydrationWarning className="text-[10px] text-muted-foreground whitespace-nowrap">
                            {new Date(thread.lastMessageAt).toLocaleDateString()}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground truncate">
                          {thread.teamMember ? 'Team Member' : 'Guest'}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Main Chat Area with Sidebar */}
              <div className={`flex-1 flex overflow-hidden bg-background ${showChatOnMobile ? 'flex' : 'hidden md:flex'}`}>
                {activeThread ? (
                  <>
                    <div className="flex-1 flex flex-col">
                      {/* Chat Header */}
                    <div className="h-16 border-b flex items-center px-6 justify-between bg-card">
                      <div className="flex items-center gap-3">
                        <button 
                          onClick={() => setShowChatOnMobile(false)}
                          className="md:hidden p-2 -ml-3 rounded-lg hover:bg-muted text-muted-foreground"
                        >
                          <ChevronLeft className="w-5 h-5" />
                        </button>
                        <div className={`h-10 w-10 rounded-full flex items-center justify-center ${activeThread.teamMember ? 'bg-blue-100 text-blue-600' : 'bg-rose-100 text-rose-600'}`}>
                          {activeThread.teamMember ? <Shield className="h-5 w-5" /> : <User className="h-5 w-5" />}
                        </div>
                        <div>
                          <h2 className="font-semibold">{activeThread.teamMember ? activeThread.teamMember.name : (activeThread.guest ? activeThread.guest.name : activeThread.phone)}</h2>
                          <p className="text-xs text-muted-foreground flex items-center gap-1">
                            <Phone className="h-3 w-3" /> {activeThread.phone}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-600">
                          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                          AI Active
                        </span>
                      </div>
                    </div>

                    {/* Messages */}
                    <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-[#f0f2f5] dark:bg-background">
                      {activeThread.messages.map((msg: any) => {
                        const isSystem = msg.direction === 'OUTBOUND';
                        const isInternal = msg.isInternalNote;
                        return (
                          <div key={msg.id} className={`flex flex-col ${isSystem ? 'items-end' : 'items-start'} ${isInternal ? 'items-center' : ''}`}>
                            <div className={`max-w-[70%] rounded-2xl px-4 py-2 ${
                              isInternal 
                                ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-900 dark:text-amber-100 rounded-2xl shadow-sm border border-amber-200'
                                : isSystem 
                                  ? 'bg-[#d9fdd3] dark:bg-primary text-foreground dark:text-primary-foreground rounded-tr-sm shadow-sm' 
                                  : 'bg-white dark:bg-muted text-foreground rounded-tl-sm shadow-sm'
                            }`}>
                              {isInternal && (
                                <div className="flex items-center gap-1.5 mb-1 opacity-70 text-[10px] uppercase font-bold tracking-wider text-amber-800">
                                  <StickyNote className="h-3 w-3" /> Internal Note
                                </div>
                              )}
                              {msg.templateName && !isInternal && (
                                <div className="flex items-center gap-1.5 mb-1 opacity-70 text-[10px] uppercase font-bold tracking-wider">
                                  <Bot className="h-3 w-3" /> Automated Template
                                </div>
                              )}
                              <p className="text-sm whitespace-pre-wrap">{msg.content || (msg.mediaUrl ? '[Media File Attached]' : '')}</p>
                              <div suppressHydrationWarning className={`text-[10px] mt-1 text-right flex items-center justify-end gap-1 ${isInternal ? 'text-amber-800/70' : isSystem ? 'text-black/40 dark:text-white/60' : 'text-muted-foreground'}`}>
                                {msg.channel === 'EMAIL' ? <Mail className="w-3 h-3" /> : msg.channel === 'IG' ? <MessageCircle className="w-3 h-3" /> : msg.channel === 'WEB' ? <Globe className="w-3 h-3" /> : <MessageSquare className="w-3 h-3" />}
                                {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>

                    {/* AI Memory Context Banner */}
                    {(activeThread.guest?.aiContext || activeThread.teamMember?.aiContext) && (
                      <div className="mx-6 mt-2 mb-4 rounded-xl border border-amber-200/50 bg-amber-50/50 p-3 shadow-sm flex items-start gap-3">
                        <BrainCircuit className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                        <div>
                          <h4 className="text-xs font-bold text-amber-800 uppercase tracking-wider mb-1">AI Context Memory</h4>
                          <p className="text-xs text-amber-900/80 leading-relaxed whitespace-pre-wrap">
                            {activeThread.guest?.aiContext || activeThread.teamMember?.aiContext}
                          </p>
                        </div>
                      </div>
                    )}

                    {/* Chat Input */}
                    <div className="p-4 bg-card border-t">
                      <div className="flex items-center gap-2 mb-3">
                        <button 
                          onClick={async () => {
                            setIsDrafting(true);
                            const recentMsgs = activeThread.messages.slice(-5).map((m: any) => m.content);
                            const res = await draftAIReply(activeThread.phone, recentMsgs, isHinglishMode);
                            if (res.success) setReplyText(res.draft || "");
                            else toast.error("Failed to draft reply");
                            setIsDrafting(false);
                          }}
                          disabled={isDrafting}
                          className="text-xs font-semibold flex items-center gap-1.5 text-indigo-600 bg-indigo-50 hover:bg-indigo-100 px-3 py-1.5 rounded-full transition-colors disabled:opacity-50"
                        >
                          <Sparkles className="w-3.5 h-3.5" />
                          {isDrafting ? "Drafting..." : "AI Draft"}
                        </button>

                        <button
                          onClick={() => setIsHinglishMode(!isHinglishMode)}
                          className={`text-xs font-semibold px-3 py-1.5 rounded-full transition-colors ${isHinglishMode ? 'bg-indigo-600 text-white' : 'bg-muted text-muted-foreground hover:bg-muted/80'}`}
                        >
                          Hinglish
                        </button>
                        
                        <button
                          onClick={() => setIsInternalMode(!isInternalMode)}
                          className={`text-xs font-semibold flex items-center gap-1.5 px-3 py-1.5 rounded-full transition-colors ${isInternalMode ? 'text-amber-700 bg-amber-100 hover:bg-amber-200' : 'text-amber-600 bg-amber-50 hover:bg-amber-100'}`}
                        >
                          <StickyNote className="w-3.5 h-3.5" />
                          Internal Note
                        </button>
                        <button
                          onClick={async () => {
                            const note = prompt("Enter call notes:");
                            if (note) {
                              toast.success("Logging call...");
                              await import("@/app/actions/whatsapp").then(m => m.sendManualReply(activeThread.phone, `📞 CALL LOG: ${note}`, { isInternalNote: true }));
                              toast.success("Call logged!");
                              window.location.reload();
                            }
                          }}
                          className="text-xs font-semibold flex items-center gap-1.5 text-emerald-700 bg-emerald-50 hover:bg-emerald-100 px-3 py-1.5 rounded-full transition-colors"
                        >
                          <Phone className="w-3.5 h-3.5" />
                          Log Call
                        </button>
                        <button 
                          onClick={async () => {
                            setIsSummarizing(true);
                            const res = await summarizeUserMemory(activeThread.phone);
                            if (res.success) {
                              toast.success("AI Memory Updated!");
                              window.location.reload();
                            } else toast.error("Failed to update memory");
                            setIsSummarizing(false);
                          }}
                          disabled={isSummarizing}
                          className="text-xs font-semibold flex items-center gap-1.5 text-amber-600 bg-amber-50 hover:bg-amber-100 px-3 py-1.5 rounded-full transition-colors ml-auto disabled:opacity-50"
                        >
                          <BrainCircuit className="w-3.5 h-3.5" />
                          {isSummarizing ? "Updating Memory..." : "Update Memory"}
                        </button>
                      </div>
                      
                      {is24hExpired && !isInternalMode ? (
                        <div className="flex flex-col gap-2">
                          <div className="text-xs text-rose-600 bg-rose-50 p-2.5 rounded-xl border border-rose-100 flex items-center gap-2">
                            <Clock className="w-4 h-4 shrink-0" />
                            24-hour session expired. You can only send pre-approved templates.
                          </div>
                          <div className="flex gap-2">
                            <select
                              value={selectedTemplate}
                              onChange={(e) => setSelectedTemplate(e.target.value)}
                              className="flex-1 rounded-xl border border-border bg-background px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                            >
                              <option value="pre_arrival_instructions">Pre-Arrival Instructions</option>
                              <option value="booking_confirmation">Booking Confirmation</option>
                              <option value="post_stay_thank_you">Post-Stay Thank You</option>
                              <option value="day_of_arrival_reminder">Day of Arrival Reminder</option>
                              <option value="staff_password_reset">Account Setup / Password Reset</option>
                            </select>
                            <button
                              onClick={async () => {
                                toast.success("Sending template...");
                                await import("@/app/actions/whatsapp").then(m => m.sendManualReply(activeThread.phone, "", { templateName: selectedTemplate }));
                                toast.success("Template sent!");
                                window.location.reload();
                              }}
                              className="h-10 w-10 shrink-0 rounded-full bg-primary flex items-center justify-center text-primary-foreground shadow-sm hover:opacity-90 transition-opacity"
                            >
                              <Send className="h-4 w-4" />
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex gap-2">
                          <input 
                            type="text" 
                            placeholder={isInternalMode ? "Type an internal note (guest won't see this)..." : "Type a manual reply to take over from AI..."}
                            className={`flex-1 rounded-full border border-border px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 ${isInternalMode ? 'bg-amber-50/50 placeholder:text-amber-600/50 text-amber-900 border-amber-200 focus:ring-amber-500/20' : 'bg-background'}`}
                            value={replyText}
                            onChange={(e) => setReplyText(e.target.value)}
                            onKeyDown={async (e) => {
                              if (e.key === 'Enter' && replyText) {
                                const text = replyText;
                                setReplyText("");
                                toast.success(isInternalMode ? "Adding note..." : "Sending message...");
                                await import("@/app/actions/whatsapp").then(m => m.sendManualReply(activeThread.phone, text, { isInternalNote: isInternalMode }));
                                toast.success(isInternalMode ? "Note added!" : "Message sent!");
                                window.location.reload();
                              }
                            }}
                          />
                          <button 
                            onClick={async () => {
                              if (replyText) {
                                const text = replyText;
                                setReplyText("");
                                toast.success(isInternalMode ? "Adding note..." : "Sending message...");
                                await import("@/app/actions/whatsapp").then(m => m.sendManualReply(activeThread.phone, text, { isInternalNote: isInternalMode }));
                                toast.success(isInternalMode ? "Note added!" : "Message sent!");
                                window.location.reload();
                              }
                            }}
                            className={`h-10 w-10 shrink-0 rounded-full text-primary-foreground flex items-center justify-center hover:opacity-90 transition-colors shadow-sm ${isInternalMode ? 'bg-amber-500' : 'bg-primary'}`}
                          >
                            <Send className="h-4 w-4 ml-0.5" />
                          </button>
                        </div>
                      )}
                    </div>
                  </div> {/* <--- THIS IS THE MISSING CLOSING DIV FOR flex-1 flex flex-col */}

                  {/* Guest 360° Sidebar */}
                  <div className="w-80 border-l bg-card hidden lg:flex flex-col overflow-y-auto">
                      <div className="p-6 border-b">
                        <div className="flex flex-col items-center text-center">
                          <div className={`h-20 w-20 rounded-full flex items-center justify-center mb-4 ${activeThread.teamMember ? 'bg-blue-100 text-blue-600' : 'bg-rose-100 text-rose-600'}`}>
                            {activeThread.teamMember ? <Shield className="h-10 w-10" /> : <User className="h-10 w-10" />}
                          </div>
                          <h3 className="text-lg font-bold">
                            {activeThread.teamMember ? activeThread.teamMember.name : (activeThread.guest ? activeThread.guest.name : activeThread.phone)}
                          </h3>
                          <p className="text-sm text-muted-foreground flex items-center gap-1.5 mt-1">
                            <Phone className="h-3.5 w-3.5" /> {activeThread.phone}
                          </p>
                        </div>
                      </div>

                      {activeThread.guest && (
                        <div className="p-6 flex-1">
                          {/* Lifetime Value */}
                          <div className="mb-6">
                            <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3">Lifetime Value</h4>
                            <div className="grid grid-cols-2 gap-3">
                              <div className="bg-muted p-3 rounded-xl">
                                <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1"><Briefcase className="w-3 h-3"/> Stays</div>
                                <div className="font-semibold">{activeThread.guest.reservations?.length || 0}</div>
                              </div>
                              <div className="bg-muted p-3 rounded-xl">
                                <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1"><IndianRupee className="w-3 h-3"/> Spend</div>
                                <div className="font-semibold">₹{(activeThread.guest.reservations || []).reduce((acc: number, r: any) => acc + (r.totalAmount || 0), 0).toLocaleString()}</div>
                              </div>
                            </div>
                          </div>

                          {/* Open Tickets */}
                          <div>
                            <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3">Active Tickets</h4>
                            {activeThread.guest.tickets && activeThread.guest.tickets.length > 0 ? (
                              <div className="space-y-3">
                                {activeThread.guest.tickets.map((ticket: any) => (
                                  <div key={ticket.id} className="bg-muted/50 p-3 rounded-xl border border-border/50 text-sm">
                                    <div className="font-medium">{ticket.category}</div>
                                    <div className="text-muted-foreground text-xs mt-1">{ticket.description}</div>
                                    <div className="mt-2 text-xs font-semibold text-rose-600 uppercase">
                                      {ticket.status}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <div className="text-sm text-muted-foreground italic">No open tickets.</div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </>
                ) : (
                  <div className="h-full flex flex-col items-center justify-center text-muted-foreground">
                    <MessageSquare className="h-12 w-12 opacity-20 mb-4" />
                    <p>No active WhatsApp conversations found for this location.</p>
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {activeTab === "settings" && (
            <motion.div
              key="settings"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              className="p-8 overflow-y-auto h-full bg-muted/5"
            >
              <div className="max-w-3xl mx-auto space-y-8">
                <div>
                  <h2 className="text-xl font-bold flex items-center gap-2 mb-2"><Bot className="h-6 w-6 text-primary" /> AI Assistant Persona</h2>
                  <p className="text-muted-foreground text-sm">Configure how the AI interacts with guests on WhatsApp.</p>
                </div>
                
                <div className="space-y-6">
                  <div className="rounded-2xl border bg-card p-6 shadow-sm">
                    <h3 className="font-semibold mb-2">Standard Operating Procedures (SOPs)</h3>
                    <p className="text-sm text-muted-foreground mb-4">Step-by-step instructions for the AI to handle common scenarios.</p>
                    <textarea 
                      value={knowledge.sops}
                      onChange={(e) => setKnowledge({...knowledge, sops: e.target.value})}
                      className="w-full h-32 p-4 rounded-xl border bg-background text-sm focus:ring-2 focus:ring-primary/20 outline-none resize-none"
                      placeholder="e.g. If a guest complains about AC, apologize and escalate immediately."
                    />
                  </div>

                  <div className="rounded-2xl border bg-card p-6 shadow-sm">
                    <h3 className="font-semibold mb-2">Hotel Policies</h3>
                    <p className="text-sm text-muted-foreground mb-4">Rules and regulations the AI must enforce.</p>
                    <textarea 
                      value={knowledge.policies}
                      onChange={(e) => setKnowledge({...knowledge, policies: e.target.value})}
                      className="w-full h-32 p-4 rounded-xl border bg-background text-sm focus:ring-2 focus:ring-primary/20 outline-none resize-none"
                      placeholder="e.g. Check-in is at 1 PM. Check-out is at 10 AM. Pets are not allowed."
                    />
                  </div>

                  <div className="rounded-2xl border bg-card p-6 shadow-sm">
                    <h3 className="font-semibold mb-2">Pricing & Upsells</h3>
                    <p className="text-sm text-muted-foreground mb-4">Cost of additional services so the AI can quote accurately.</p>
                    <textarea 
                      value={knowledge.prices}
                      onChange={(e) => setKnowledge({...knowledge, prices: e.target.value})}
                      className="w-full h-32 p-4 rounded-xl border bg-background text-sm focus:ring-2 focus:ring-primary/20 outline-none resize-none"
                      placeholder="e.g. Late checkout costs ₹500 per hour. Extra bed is ₹1000 per night."
                    />
                  </div>

                  <div className="rounded-2xl border bg-card p-6 shadow-sm">
                    <h3 className="font-semibold mb-2">Property Facts</h3>
                    <p className="text-sm text-muted-foreground mb-4">General information about this location.</p>
                    <textarea 
                      value={knowledge.facts}
                      onChange={(e) => setKnowledge({...knowledge, facts: e.target.value})}
                      className="w-full h-32 p-4 rounded-xl border bg-background text-sm focus:ring-2 focus:ring-primary/20 outline-none resize-none"
                      placeholder="e.g. Wi-Fi password is 'stay123'. Breakfast is from 7 AM to 10 AM on the ground floor."
                    />
                    <div className="mt-6 flex justify-end">
                      <button 
                        onClick={async () => {
                          setIsSavingKnowledge(true);
                          const res = await updateLocationKnowledge(activePropertyId, knowledge);
                          if (res.success) {
                            toast.success("AI Brain updated successfully!");
                          } else {
                            toast.error("Failed to update AI Brain");
                          }
                          setIsSavingKnowledge(false);
                        }}
                        disabled={isSavingKnowledge}
                        className="px-6 py-2.5 bg-primary text-primary-foreground rounded-xl text-sm font-semibold hover:bg-primary/90 transition-colors shadow-sm disabled:opacity-50"
                      >
                        {isSavingKnowledge ? "Saving..." : "Save AI Brain Sync"}
                      </button>
                    </div>
                  </div>

                  </div>
                </div>
            </motion.div>
          )}

          {activeTab === "broadcasts" && (
            <motion.div
              key="broadcasts"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              className="p-8 h-full flex flex-col bg-muted/5"
            >
              <div className="max-w-4xl mx-auto w-full flex-1 flex flex-col">
                <div className="flex items-center justify-between mb-8">
                  <div>
                    <h2 className="text-xl font-bold flex items-center gap-2 mb-1"><Users className="h-6 w-6 text-primary" /> Campaigns & Broadcasts</h2>
                    <p className="text-muted-foreground text-sm">Send bulk updates or promotional offers to your guests.</p>
                  </div>
                  <button 
                    onClick={() => setIsBroadcastModalOpen(true)}
                    className="px-4 py-2 bg-primary text-primary-foreground rounded-xl text-sm font-semibold flex items-center gap-2 hover:bg-primary/90 transition-colors shadow-sm"
                  >
                    <PlusCircle className="h-4 w-4" /> New Broadcast
                  </button>
                </div>
                
                <div className="flex-1 rounded-2xl border bg-card overflow-hidden shadow-sm flex flex-col">
                  <div className="p-4 border-b bg-muted/30 grid grid-cols-4 font-semibold text-sm text-muted-foreground">
                    <div className="col-span-2">Campaign Name</div>
                    <div>Sent / Delivered</div>
                    <div>Date</div>
                  </div>
                  
                  {initialBroadcasts.length > 0 ? (
                    <div className="divide-y overflow-y-auto">
                      {initialBroadcasts.map((campaign, idx) => (
                        <div key={idx} className="p-4 grid grid-cols-4 items-center hover:bg-muted/10 transition-colors">
                          <div className="col-span-2 font-medium">{campaign.name}</div>
                          <div>
                            <span className="text-emerald-600 font-semibold">{campaign.deliveredCount}</span> / {campaign.sentCount}
                          </div>
                          <div className="text-sm text-muted-foreground">
                            {new Date(campaign.createdAt).toLocaleDateString()}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="divide-y p-8 flex flex-col items-center justify-center text-center text-muted-foreground flex-1">
                      <Clock className="h-12 w-12 opacity-20 mb-4" />
                      <h3 className="text-lg font-medium text-foreground">No Broadcasts Yet</h3>
                      <p className="max-w-sm mt-2 text-sm">You haven't sent any mass WhatsApp broadcasts. Click "New Broadcast" to get started.</p>
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Broadcast Modal */}
      <AnimatePresence>
        {isBroadcastModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="bg-card w-full max-w-lg rounded-2xl shadow-xl overflow-hidden flex flex-col"
            >
              <div className="p-6 border-b">
                <h3 className="text-xl font-bold">New Broadcast Campaign</h3>
                <p className="text-sm text-muted-foreground">Send a mass message to a selected segment.</p>
              </div>
              <div className="p-6 space-y-4 flex-1 overflow-y-auto">
                <div>
                  <label className="block text-sm font-semibold mb-1">Campaign Name</label>
                  <input 
                    type="text" 
                    placeholder="e.g. Pool Maintenance Notice"
                    value={campaignName}
                    onChange={(e) => setCampaignName(e.target.value)}
                    className="w-full rounded-xl border px-3 py-2 text-sm focus:ring-2 focus:ring-primary outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold mb-1">Target Audience</label>
                  <select 
                    value={audience}
                    onChange={(e) => setAudience(e.target.value)}
                    className="w-full rounded-xl border px-3 py-2 text-sm focus:ring-2 focus:ring-primary outline-none"
                  >
                    <option value="ALL_ACTIVE_GUESTS">Current Checked-in Guests</option>
                    <option value="ALL_PAST_GUESTS">Past Guests (Marketing)</option>
                    <option value="ALL_TEAM">All Team Members (Alerts)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-semibold mb-1">Message</label>
                  <textarea 
                    placeholder="Type your message here..."
                    rows={4}
                    value={broadcastMessage}
                    onChange={(e) => setBroadcastMessage(e.target.value)}
                    className="w-full rounded-xl border p-3 text-sm focus:ring-2 focus:ring-primary outline-none resize-none"
                  />
                  <p className="text-[10px] text-muted-foreground mt-1">Note: Twilio Sandbox only supports standard text to whitelisted numbers unless using pre-registered templates.</p>
                </div>
              </div>
              <div className="p-4 border-t bg-muted/20 flex justify-end gap-2">
                <button 
                  onClick={() => setIsBroadcastModalOpen(false)}
                  className="px-4 py-2 text-sm font-medium hover:bg-muted rounded-xl"
                  disabled={isSending}
                >
                  Cancel
                </button>
                <button 
                  onClick={handleSendBroadcast}
                  disabled={isSending}
                  className="px-6 py-2 bg-primary text-primary-foreground text-sm font-bold rounded-xl hover:bg-primary/90 disabled:opacity-50"
                >
                  {isSending ? 'Sending...' : 'Send Broadcast'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  )
}
