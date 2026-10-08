"use client";

import { useState } from "react";
import { format } from "date-fns";
import { motion, AnimatePresence } from "framer-motion";
import { 
  MapPin, 
  MessageSquare, 
  Wrench, 
  Sparkles, 
  Wifi, 
  Info,
  Clock,
  ChevronRight,
  Phone,
  Crown,
  Gift,
  Copy,
  Bot,
  X,
  Send
} from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

export function GuestPortalClient({ reservation, whatsappNumber }: { reservation: any, whatsappNumber: string }) {
  const router = useRouter();
  const [isHousekeepingOpen, setIsHousekeepingOpen] = useState(false);
  const [isIssueOpen, setIsIssueOpen] = useState(false);
  const [issueDesc, setIssueDesc] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isJoining, setIsJoining] = useState(false);
  
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState<{role: string, content: string}[]>([
    { role: "assistant", content: `Hi ${reservation.guest.name.split(' ')[0]}! I'm your AI assistant. How can I help you today?` }
  ]);
  const [chatInput, setChatInput] = useState("");
  const [isChatLoading, setIsChatLoading] = useState(false);

  const membership = reservation.guest.membership;

  const handleJoinMembership = async () => {
    setIsJoining(true);
    try {
      const res = await fetch(`/api/stay/${reservation.id}/membership/join`, {
        method: "POST"
      });
      if (res.ok) {
        toast.success("Welcome to Ritumbhara Rewards! You've earned points for this stay.");
        router.refresh();
      } else {
        toast.error("Failed to join membership. Please try again.");
      }
    } catch (e) {
      toast.error("An error occurred.");
    } finally {
      setIsJoining(false);
    }
  };

  const handleChatSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim() || isChatLoading) return;
    
    const newMessages = [...chatMessages, { role: "user", content: chatInput }];
    setChatMessages(newMessages);
    setChatInput("");
    setIsChatLoading(true);
    
    try {
      const res = await fetch(`/api/stay/${reservation.id}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: newMessages })
      });
      const data = await res.json();
      if (res.ok) {
        setChatMessages(prev => [...prev, { role: "assistant", content: data.reply }]);
        if (data.ticketCreated) {
          toast.success("Request sent to our team!");
        }
      } else {
        toast.error("AI is unavailable right now.");
      }
    } catch (e) {
      toast.error("Failed to connect to AI.");
    } finally {
      setIsChatLoading(false);
    }
  };

  const handleHousekeeping = async () => {
    setIsSubmitting(true);
    try {
      const res = await fetch(`/api/stay/${reservation.id}/tickets`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category: "HOUSEKEEPING",
          description: "Guest requested housekeeping service.",
          priority: "MEDIUM"
        })
      });
      if (res.ok) {
        toast.success("Housekeeping requested! Our team will be there soon.");
        setIsHousekeepingOpen(false);
      } else {
        toast.error("Failed to request housekeeping. Please try again.");
      }
    } catch (e) {
      toast.error("An error occurred.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleIssue = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!issueDesc.trim()) return;
    setIsSubmitting(true);
    try {
      const res = await fetch(`/api/stay/${reservation.id}/tickets`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category: "MAINTENANCE",
          description: issueDesc,
          priority: "HIGH"
        })
      });
      if (res.ok) {
        toast.success("Issue reported! Our team has been notified via WhatsApp.");
        setIsIssueOpen(false);
        setIssueDesc("");
      } else {
        toast.error("Failed to report issue. Please try again.");
      }
    } catch (e) {
      toast.error("An error occurred.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Animation variants
  const containerVariants = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1
      }
    }
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    show: { opacity: 1, y: 0, transition: { type: "spring" as const, stiffness: 300, damping: 24 } }
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      {/* Premium Header */}
      <motion.div 
        initial={{ y: -50, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ type: "spring", stiffness: 200, damping: 20 }}
        className="bg-gradient-to-br from-[#4a0518] via-[#5c0a20] to-[#3a0312] text-white px-6 pt-10 pb-8 rounded-b-[2.5rem] shadow-lg relative overflow-hidden border-b border-white/[0.08]"
      >
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-rose-500/10 via-transparent to-transparent" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_left,_var(--tw-gradient-stops))] from-red-500/5 via-transparent to-transparent" />
        <div className="relative z-10">
          {/* Branding */}
          <motion.div 
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.2 }}
            className="flex items-center justify-center mb-10"
          >
            <img src="/logo.svg" alt="Ritumbhara Hotels" className="h-12 w-auto object-contain drop-shadow-lg" />
          </motion.div>

          <motion.p 
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.3 }}
            className="text-gray-300 text-sm font-medium tracking-wide uppercase mb-1"
          >
            Your Stay
          </motion.p>
          <motion.h1 
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.4 }}
            className="text-3xl font-bold mb-6"
          >
            Welcome, {reservation.guest.name.split(' ')[0]}!
          </motion.h1>
          
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
            className="bg-white/10 backdrop-blur-md rounded-2xl p-5 border border-white/20 shadow-[0_8px_32px_rgba(0,0,0,0.12)]"
          >
            <h2 className="font-semibold text-lg flex items-center gap-2">
              <MapPin className="w-5 h-5 text-rose-400" />
              {reservation.unit.name}
            </h2>
            <p className="text-gray-300 text-sm mt-1 mb-4">{reservation.unit.property?.name}</p>
            
            <div className="flex items-center justify-between border-t border-white/10 pt-4 mt-2">
              <div>
                <p className="text-xs text-gray-400 uppercase tracking-wider">Check-in</p>
                <p className="font-medium mt-0.5">{format(new Date(reservation.checkIn), "MMM d, yyyy")}</p>
                <p className="text-sm text-gray-300">After 1:00 PM</p>
              </div>
              <div className="h-10 w-px bg-white/20 mx-4"></div>
              <div className="text-right">
                <p className="text-xs text-gray-400 uppercase tracking-wider">Check-out</p>
                <p className="font-medium mt-0.5">{format(new Date(reservation.checkOut), "MMM d, yyyy")}</p>
                <p className="text-sm text-gray-300">Before 10:00 AM</p>
              </div>
            </div>
          </motion.div>
        </div>
      </motion.div>

      <motion.div 
        variants={containerVariants}
        initial="hidden"
        animate="show"
        className="px-6 mt-8 max-w-md mx-auto space-y-6"
      >
        
        {/* At a glance section */}
        <motion.div variants={itemVariants} className="grid grid-cols-2 gap-4">
          <motion.a 
            whileHover={{ scale: 1.05, y: -5 }}
            whileTap={{ scale: 0.95 }}
            href={reservation.unit.property?.googleMapsUrl || "#"} 
            target="_blank" 
            rel="noreferrer"
            className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 flex flex-col items-center justify-center text-center gap-2 hover:shadow-lg transition-all"
          >
            <div className="w-10 h-10 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center">
              <MapPin className="w-5 h-5" />
            </div>
            <span className="text-sm font-semibold text-gray-900">Directions</span>
          </motion.a>
          <motion.button 
            whileHover={{ scale: 1.05, y: -5 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => alert(`Network: ${reservation.unit.property?.wifiNetwork || 'N/A'}\nPassword: ${reservation.unit.property?.wifiPassword || 'N/A'}`)}
            className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 flex flex-col items-center justify-center text-center gap-2 hover:shadow-lg transition-all"
          >
            <div className="w-10 h-10 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <Wifi className="w-5 h-5" />
            </div>
            <span className="text-sm font-semibold text-gray-900">Wi-Fi Details</span>
          </motion.button>
        </motion.div>

        {/* Services Section */}
        <motion.div variants={itemVariants}>
          <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider mb-3">At your service</h3>
          <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
            <button 
              onClick={() => setIsHousekeepingOpen(true)}
              className="w-full p-4 flex items-center gap-4 hover:bg-gray-50 transition-colors border-b border-gray-50 text-left group"
            >
              <motion.div 
                whileHover={{ rotate: 15 }}
                className="w-10 h-10 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center shrink-0"
              >
                <Sparkles className="w-5 h-5" />
              </motion.div>
              <div className="flex-1">
                <h4 className="font-semibold text-gray-900">Request Housekeeping</h4>
                <p className="text-xs text-gray-500">Fresh towels, cleaning, or restocking</p>
              </div>
              <ChevronRight className="w-5 h-5 text-gray-300 group-hover:text-rose-500 transition-colors" />
            </button>

            <button 
              onClick={() => setIsIssueOpen(true)}
              className="w-full p-4 flex items-center gap-4 hover:bg-gray-50 transition-colors border-b border-gray-50 text-left group"
            >
              <motion.div 
                whileHover={{ rotate: -15 }}
                className="w-10 h-10 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center shrink-0"
              >
                <Wrench className="w-5 h-5" />
              </motion.div>
              <div className="flex-1">
                <h4 className="font-semibold text-gray-900">Report an Issue</h4>
                <p className="text-xs text-gray-500">AC, plumbing, or maintenance</p>
              </div>
              <ChevronRight className="w-5 h-5 text-gray-300 group-hover:text-rose-500 transition-colors" />
            </button>

            <a 
              href={`https://wa.me/${whatsappNumber}?text=Hi, I am staying at ${reservation.unit.name} (Booking ${reservation.id}). I have a question.`}
              target="_blank"
              rel="noreferrer"
              className="w-full p-4 flex items-center gap-4 hover:bg-gray-50 transition-colors text-left group"
            >
              <motion.div 
                whileHover={{ scale: 1.1 }}
                className="w-10 h-10 rounded-xl bg-green-50 text-green-600 flex items-center justify-center shrink-0"
              >
                <MessageSquare className="w-5 h-5" />
              </motion.div>
              <div className="flex-1">
                <h4 className="font-semibold text-gray-900">Ask a Question</h4>
                <p className="text-xs text-gray-500">Chat with our 24/7 support team</p>
              </div>
              <ChevronRight className="w-5 h-5 text-gray-300 group-hover:text-rose-500 transition-colors" />
            </a>
          </div>
        </motion.div>

        {/* Membership Section */}
        <motion.div variants={itemVariants}>
          <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider mb-3">Ritumbhara Rewards</h3>
          {membership ? (
            <motion.div 
              className="bg-gradient-to-br from-[#5c0a20] to-[#3a0312] rounded-3xl p-6 text-white shadow-lg relative overflow-hidden flex flex-col gap-6"
            >
              <div className="absolute top-0 right-0 p-4 opacity-10">
                <Crown className="w-24 h-24" />
              </div>
              <div className="relative z-10">
                <div className="flex items-center gap-2 mb-2">
                  <Crown className="w-5 h-5 text-yellow-400" />
                  <span className="font-bold tracking-widest uppercase text-yellow-400 text-sm">{membership.tier} MEMBER</span>
                </div>
                <div className="flex items-end gap-3 mb-1">
                  <p className="text-4xl font-bold">{membership.points} <span className="text-lg font-medium text-gray-400">pts</span></p>
                  <p className="text-sm font-medium text-emerald-400 mb-2">≈ ₹{Math.floor(membership.points / 2)} Value</p>
                </div>
                <p className="text-sm text-gray-300 mb-6">Redeem points for discounts on walk-in bookings.</p>
                
                {/* Referral Code Box */}
                <div className="bg-white/10 rounded-xl p-4 flex flex-col gap-2 backdrop-blur-sm border border-white/10 mb-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs text-gray-400 uppercase">Your Referral Code</p>
                      <p className="font-mono font-bold tracking-wider text-lg">{membership.referralCode}</p>
                    </div>
                    <button 
                      onClick={() => {
                        navigator.clipboard.writeText(membership.referralCode);
                        toast.success("Referral code copied!");
                      }}
                      className="p-2 bg-white/10 hover:bg-white/20 rounded-lg transition-colors"
                    >
                      <Copy className="w-4 h-4" />
                    </button>
                  </div>
                  <p className="text-xs text-gray-300">Share this code! They get 110 pts, you get 20 pts.</p>
                </div>

                {/* Redeem Section */}
                {reservation.source !== "OTA" ? (
                  <div className="bg-white/5 rounded-xl p-4 border border-white/10 mb-6">
                    <h4 className="font-semibold text-sm mb-2">Redeem Points (Max 10% of booking)</h4>
                    <form 
                      onSubmit={async (e) => {
                        e.preventDefault();
                        const form = new FormData(e.currentTarget);
                        const pts = parseInt(form.get("points") as string);
                        if (!pts || pts <= 0) return;
                        
                        setIsJoining(true);
                        const { redeemPoints } = await import("@/app/actions/membership");
                        const res = await redeemPoints(reservation.id, pts);
                        setIsJoining(false);
                        
                        if (res.success) {
                          toast.success(`Redeemed! ₹${res.discount} has been deducted from your bill.`);
                          router.refresh();
                        } else {
                          toast.error(res.error);
                        }
                      }}
                      className="flex gap-2"
                    >
                      <input 
                        type="number" 
                        name="points" 
                        placeholder="Points" 
                        max={membership.points}
                        className="bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-sm w-24 outline-none focus:border-rose-400"
                        required
                      />
                      <button 
                        type="submit"
                        disabled={isJoining || membership.points <= 0}
                        className="flex-1 bg-rose-600 hover:bg-rose-700 text-white font-semibold py-2 rounded-lg text-sm disabled:opacity-50 transition-colors"
                      >
                        {isJoining ? "Processing..." : "Redeem Now"}
                      </button>
                    </form>
                  </div>
                ) : (
                  <div className="bg-white/5 rounded-xl p-3 border border-white/10 mb-6 text-sm text-gray-300 text-center">
                    Points redemption is only available for Direct Walk-in bookings.
                  </div>
                )}

                {/* Transaction History */}
                <div>
                  <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Recent Transactions</h4>
                  <div className="space-y-3 max-h-48 overflow-y-auto pr-2" style={{ scrollbarWidth: 'thin' }}>
                    {membership.transactions?.map((tx: any) => (
                      <div key={tx.id} className="flex items-center justify-between">
                        <div className="flex-1">
                          <p className="text-sm font-medium">{tx.description}</p>
                          <p className="text-xs text-gray-400">{format(new Date(tx.createdAt), "MMM d, yyyy • h:mm a")}</p>
                        </div>
                        <div className={`text-sm font-bold shrink-0 ${tx.amount > 0 ? "text-emerald-400" : "text-rose-400"}`}>
                          {tx.amount > 0 ? "+" : ""}{tx.amount} pts
                        </div>
                      </div>
                    ))}
                    {(!membership.transactions || membership.transactions.length === 0) && (
                      <p className="text-xs text-gray-400">No transactions yet.</p>
                    )}
                  </div>
                </div>

              </div>
            </motion.div>
          ) : (
            <motion.div 
              className="bg-gradient-to-br from-rose-50 to-orange-50 rounded-3xl p-6 border border-rose-100 shadow-sm relative overflow-hidden"
            >
              <div className="relative z-10 flex flex-col gap-4">
                <div className="flex gap-4">
                  <div className="w-12 h-12 rounded-full bg-gradient-to-br from-rose-500 to-orange-500 text-white flex items-center justify-center shrink-0 shadow-md">
                    <Gift className="w-6 h-6" />
                  </div>
                  <div>
                    <h4 className="font-bold text-gray-900 mb-1">Join Ritumbhara Rewards</h4>
                    <p className="text-sm text-gray-600">Get 100 bonus points instantly, earn on referrals, and redeem for discounts!</p>
                  </div>
                </div>

                <form 
                  onSubmit={async (e) => {
                    e.preventDefault();
                    setIsJoining(true);
                    const form = new FormData(e.currentTarget);
                    const refCode = form.get("referralCode") as string;
                    const { joinMembership } = await import("@/app/actions/membership");
                    const res = await joinMembership(reservation.guest.id, refCode);
                    setIsJoining(false);
                    if (res.success) {
                      toast.success("Welcome to Ritumbhara Rewards! 🎉");
                      router.refresh();
                    } else {
                      toast.error(res.error || "Failed to join.");
                    }
                  }}
                  className="flex flex-col gap-3 mt-2"
                >
                  <input 
                    type="text" 
                    name="referralCode" 
                    placeholder="Referral Code (Optional)" 
                    className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-rose-500/20 text-sm"
                  />
                  <button 
                    type="submit"
                    disabled={isJoining}
                    className="w-full bg-rose-600 text-white font-semibold py-2.5 rounded-xl hover:bg-rose-700 transition-colors disabled:opacity-70 shadow-lg shadow-rose-200 text-sm"
                  >
                    {isJoining ? "Joining..." : "Join for Free"}
                  </button>
                </form>
              </div>
            </motion.div>
          )}
        </motion.div>

        {/* Status Indicator */}
        <motion.div variants={itemVariants} className="bg-gradient-to-br from-[#4a0518] to-[#3a0312] rounded-2xl p-5 text-white flex items-center gap-4 shadow-md">
          <div className="w-12 h-12 rounded-full bg-white/10 flex items-center justify-center shrink-0">
            <Info className="w-6 h-6 text-white" />
          </div>
          <div>
            <h4 className="font-semibold">Need Late Checkout?</h4>
            <p className="text-sm text-gray-300 mt-1">Contact us on WhatsApp to check availability.</p>
          </div>
        </motion.div>
      </motion.div>

      {/* Housekeeping Modal */}
      {isHousekeepingOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-gray-900/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-3xl w-full max-w-sm p-6 animate-in slide-in-from-bottom-8">
            <h3 className="text-xl font-bold text-gray-900 mb-2">Request Housekeeping</h3>
            <p className="text-gray-500 text-sm mb-6">Our team will be dispatched to your unit shortly for cleaning and restocking.</p>
            <div className="flex gap-3">
              <button 
                onClick={() => setIsHousekeepingOpen(false)}
                className="flex-1 py-3 font-semibold text-gray-700 bg-gray-100 rounded-xl hover:bg-gray-200 transition-colors"
                disabled={isSubmitting}
              >
                Cancel
              </button>
              <button 
                onClick={handleHousekeeping}
                disabled={isSubmitting}
                className="flex-1 py-3 font-semibold text-white bg-[#5c0a20] rounded-xl hover:bg-[#3a0312] transition-colors disabled:opacity-70"
              >
                {isSubmitting ? "Sending..." : "Confirm"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Issue Modal */}
      {isIssueOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-gray-900/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-3xl w-full max-w-sm p-6 animate-in slide-in-from-bottom-8">
            <h3 className="text-xl font-bold text-gray-900 mb-2">Report an Issue</h3>
            <p className="text-gray-500 text-sm mb-4">Please describe the problem you're experiencing.</p>
            <form onSubmit={handleIssue}>
              <textarea
                value={issueDesc}
                onChange={(e) => setIssueDesc(e.target.value)}
                required
                rows={3}
                placeholder="e.g., The AC is not cooling properly."
                className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-gray-50 focus:bg-white focus:border-rose-500 focus:ring-2 focus:ring-rose-500/20 outline-none resize-none mb-6"
              />
              <div className="flex gap-3">
                <button 
                  type="button"
                  onClick={() => setIsIssueOpen(false)}
                  className="flex-1 py-3 font-semibold text-gray-700 bg-gray-100 rounded-xl hover:bg-gray-200 transition-colors"
                  disabled={isSubmitting}
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  disabled={isSubmitting || !issueDesc.trim()}
                  className="flex-1 py-3 font-semibold text-white bg-rose-600 rounded-xl hover:bg-rose-700 transition-colors disabled:opacity-70"
                >
                  {isSubmitting ? "Sending..." : "Submit"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* AI Chat Bubble */}
      <AnimatePresence>
        {!isChatOpen && (
          <motion.button 
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            whileHover={{ scale: 1.1, rotate: 5 }}
            whileTap={{ scale: 0.9 }}
            onClick={() => setIsChatOpen(true)}
            className="fixed bottom-6 right-6 w-14 h-14 bg-gradient-to-tr from-rose-600 to-[#5c0a20] rounded-full shadow-[0_8px_30px_rgba(225,29,72,0.4)] flex items-center justify-center text-white z-40"
          >
            <Bot className="w-7 h-7" />
          </motion.button>
        )}
      </AnimatePresence>

      {/* AI Chat Modal */}
      {isChatOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-gray-900/40 backdrop-blur-sm sm:p-4">
          <div className="bg-white w-full h-[85vh] sm:h-[600px] sm:max-w-md sm:rounded-3xl rounded-t-3xl flex flex-col shadow-2xl animate-in slide-in-from-bottom-8 overflow-hidden border border-gray-200">
            {/* Chat Header */}
            <div className="bg-gradient-to-r from-[#4a0518] to-[#5c0a20] p-4 flex items-center justify-between text-white">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center backdrop-blur-sm">
                  <Bot className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="font-bold">AI Assistant</h3>
                  <p className="text-xs text-white/80">Always here to help</p>
                </div>
              </div>
              <button onClick={() => setIsChatOpen(false)} className="p-2 hover:bg-white/20 rounded-full transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Chat Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50">
              {chatMessages.map((msg, i) => (
                <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[80%] rounded-2xl p-3 text-sm ${msg.role === 'user' ? 'bg-[#5c0a20] text-white rounded-tr-sm' : 'bg-white border border-gray-100 text-gray-800 rounded-tl-sm shadow-sm'}`}>
                    {msg.content}
                  </div>
                </div>
              ))}
              {isChatLoading && (
                <div className="flex justify-start">
                  <div className="bg-white border border-gray-100 rounded-2xl rounded-tl-sm p-4 shadow-sm flex gap-1 items-center">
                    <div className="w-2 h-2 bg-gray-300 rounded-full animate-bounce"></div>
                    <div className="w-2 h-2 bg-gray-300 rounded-full animate-bounce delay-100"></div>
                    <div className="w-2 h-2 bg-gray-300 rounded-full animate-bounce delay-200"></div>
                  </div>
                </div>
              )}
            </div>

            {/* Chat Input */}
            <div className="p-4 bg-white border-t border-gray-100">
              <form onSubmit={handleChatSubmit} className="relative flex items-center">
                <input 
                  type="text" 
                  value={chatInput}
                  onChange={e => setChatInput(e.target.value)}
                  placeholder="Ask for towels, wifi password..."
                  className="w-full bg-gray-50 border border-gray-200 rounded-full pl-4 pr-12 py-3 focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500 text-sm"
                />
                <button 
                  type="submit"
                  disabled={!chatInput.trim() || isChatLoading}
                  className="absolute right-2 w-8 h-8 bg-[#5c0a20] text-white rounded-full flex items-center justify-center disabled:opacity-50 hover:bg-[#3a0312] transition-colors"
                >
                  <Send className="w-4 h-4" />
                </button>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
