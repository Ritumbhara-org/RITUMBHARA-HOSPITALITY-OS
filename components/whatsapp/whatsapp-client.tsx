"use client"

import { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { MessageSquare, Settings, Users, Search, Phone, User, Send, Bot, Shield, Clock, PlusCircle } from "lucide-react"

import { useRouter, useSearchParams } from "next/navigation"
import { sendBroadcast } from "@/app/actions/whatsapp"
import { toast } from "sonner"

interface WhatsAppClientProps {
  initialThreads: any[]
  initialBroadcasts: any[]
  properties: any[]
  activePropertyId: string
}

export function WhatsAppClient({ initialThreads, initialBroadcasts, properties, activePropertyId }: WhatsAppClientProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [activeTab, setActiveTab] = useState<"inbox" | "broadcasts" | "settings">("inbox")
  const [search, setSearch] = useState("")
  const [activeThreadId, setActiveThreadId] = useState<string | null>(initialThreads[0]?.phone || null)
  const [replyText, setReplyText] = useState("")

  // Broadcast Modal State
  const [isBroadcastModalOpen, setIsBroadcastModalOpen] = useState(false)
  const [campaignName, setCampaignName] = useState("")
  const [audience, setAudience] = useState("ALL_ACTIVE_GUESTS")
  const [broadcastMessage, setBroadcastMessage] = useState("")
  const [isSending, setIsSending] = useState(false)

  const filteredThreads = initialThreads.filter(t => {
    // Basic search filtering
    const matchesSearch = t.phone.includes(search) || 
      t.guest?.name?.toLowerCase().includes(search.toLowerCase()) ||
      t.teamMember?.name?.toLowerCase().includes(search.toLowerCase());
    
    // Property filtering
    const matchesProperty = activePropertyId === "ALL" || t.propertyId === activePropertyId;

    return matchesSearch && matchesProperty;
  })

  // Set active thread to the first filtered one if none is selected
  const activeThread = filteredThreads.find(t => t.phone === activeThreadId) || filteredThreads[0];

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
    <div className="flex h-full w-full flex-col bg-background p-6">
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">WhatsApp Control Center</h1>
            <p className="text-muted-foreground mt-1">Manage guest communications, broadcasts, and AI settings.</p>
          </div>
          
          {/* Property Selector */}
          <div className="h-10 px-3 bg-muted/20 border rounded-xl flex items-center">
            <select 
              value={activePropertyId} 
              onChange={(e) => handlePropertyChange(e.target.value)}
              className="bg-transparent font-medium border-none outline-none focus:ring-0 cursor-pointer text-sm"
            >
              <option value="ALL">All Locations</option>
              {properties.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="flex items-center gap-2 rounded-xl border bg-card p-1 shadow-sm">
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
              <div className="w-80 border-r flex flex-col bg-muted/10">
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
                      onClick={() => setActiveThreadId(thread.phone)}
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
                          <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                            {new Date(thread.lastMessageAt).toISOString().split('T')[0]}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground truncate flex items-center gap-1.5">
                          {thread.teamMember ? 'Team Member' : 'Guest'}
                          {activePropertyId === "ALL" && thread.propertyId && (
                            <>
                              <span>•</span>
                              <span className="font-medium">{properties.find((p: any) => p.id === thread.propertyId)?.name}</span>
                            </>
                          )}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Main Chat Area */}
              <div className="flex-1 flex flex-col bg-background">
                {activeThread ? (
                  <>
                    {/* Chat Header */}
                    <div className="h-16 border-b flex items-center px-6 justify-between bg-card">
                      <div className="flex items-center gap-3">
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
                        return (
                          <div key={msg.id} className={`flex flex-col ${isSystem ? 'items-end' : 'items-start'}`}>
                            <div className={`max-w-[70%] rounded-2xl px-4 py-2 ${
                              isSystem 
                                ? 'bg-[#d9fdd3] dark:bg-primary text-foreground dark:text-primary-foreground rounded-tr-sm shadow-sm' 
                                : 'bg-white dark:bg-muted text-foreground rounded-tl-sm shadow-sm'
                            }`}>
                              {msg.templateName && (
                                <div className="flex items-center gap-1.5 mb-1 opacity-70 text-[10px] uppercase font-bold tracking-wider">
                                  <Bot className="h-3 w-3" /> Automated Template
                                </div>
                              )}
                              <p className="text-sm whitespace-pre-wrap">{msg.content || (msg.mediaUrl ? '[Media File Attached]' : '')}</p>
                              <div className={`text-[10px] mt-1 text-right ${isSystem ? 'text-black/40 dark:text-white/60' : 'text-muted-foreground'}`}>
                                {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>

                    {/* Chat Input */}
                    <div className="p-4 bg-card border-t">
                      <div className="flex gap-2">
                        <input 
                          type="text" 
                          placeholder="Type a manual reply to take over from AI..." 
                          className="flex-1 rounded-full border border-border bg-background px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                          value={replyText}
                          onChange={(e) => setReplyText(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && replyText) {
                              setReplyText("");
                              // In a real app, this would call an action to send a WhatsApp message
                            }
                          }}
                        />
                        <button className="h-10 w-10 shrink-0 rounded-full bg-primary text-primary-foreground flex items-center justify-center hover:bg-primary/90 transition-colors shadow-sm">
                          <Send className="h-4 w-4 ml-0.5" />
                        </button>
                      </div>
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
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <h3 className="font-semibold">AI Assistant Status</h3>
                        <p className="text-sm text-muted-foreground">Enable or disable automated AI replies for guests.</p>
                      </div>
                      <div className="h-6 w-11 rounded-full bg-emerald-500 relative cursor-pointer shadow-inner">
                        <div className="absolute right-1 top-1 h-4 w-4 rounded-full bg-white shadow-sm" />
                      </div>
                    </div>
                  </div>

                  <div className="rounded-2xl border bg-card p-6 shadow-sm">
                    <h3 className="font-semibold mb-2">System Prompt</h3>
                    <p className="text-sm text-muted-foreground mb-4">The core instructions that dictate the AI's behavior and tone.</p>
                    <textarea 
                      className="w-full h-40 p-4 rounded-xl border bg-background text-sm font-mono focus:ring-2 focus:ring-primary/20 outline-none"
                      defaultValue={`You are a helpful, polite, and professional AI assistant for Ritumbhara Hospitality. 
Always aim for 5-star service. Keep answers concise.
If they ask for late checkout, mention it is subject to availability and costs ₹1500/hour.
If they complain, apologize profusely and escalate the issue immediately.`}
                    />
                    <div className="mt-4 flex justify-end">
                      <button className="px-4 py-2 bg-primary text-primary-foreground rounded-xl text-sm font-semibold hover:bg-primary/90 transition-colors shadow-sm">
                        Save Changes
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
                            {new Date(campaign.createdAt).toISOString().split('T')[0]}
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
