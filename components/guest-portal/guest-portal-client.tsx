"use client";

import { useState } from "react";
import { format } from "date-fns";
import { 
  MapPin, 
  MessageSquare, 
  Wrench, 
  Sparkles, 
  Wifi, 
  Info,
  Clock,
  ChevronRight,
  Phone
} from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

export function GuestPortalClient({ reservation }: { reservation: any }) {
  const router = useRouter();
  const [isHousekeepingOpen, setIsHousekeepingOpen] = useState(false);
  const [isIssueOpen, setIsIssueOpen] = useState(false);
  const [issueDesc, setIssueDesc] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

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

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      {/* Premium Header */}
      <div className="bg-gray-900 text-white px-6 pt-12 pb-8 rounded-b-[2.5rem] shadow-lg relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-rose-600/20 to-purple-600/20 opacity-50"></div>
        <div className="relative z-10">
          <p className="text-gray-300 text-sm font-medium tracking-wide uppercase mb-1">Your Stay</p>
          <h1 className="text-3xl font-bold mb-6">Welcome, {reservation.guest.name.split(' ')[0]}!</h1>
          
          <div className="bg-white/10 backdrop-blur-md rounded-2xl p-5 border border-white/20">
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
                <p className="text-sm text-gray-300">Before 11:00 AM</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="px-6 mt-8 max-w-md mx-auto space-y-6">
        
        {/* At a glance section */}
        <div className="grid grid-cols-2 gap-4">
          <a 
            href={reservation.unit.property?.googleMapsUrl || "#"} 
            target="_blank" 
            rel="noreferrer"
            className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 flex flex-col items-center justify-center text-center gap-2 hover:shadow-md transition-shadow"
          >
            <div className="w-10 h-10 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center">
              <MapPin className="w-5 h-5" />
            </div>
            <span className="text-sm font-semibold text-gray-900">Directions</span>
          </a>
          <button 
            onClick={() => alert(`Network: ${reservation.unit.property?.wifiNetwork || 'N/A'}\nPassword: ${reservation.unit.property?.wifiPassword || 'N/A'}`)}
            className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 flex flex-col items-center justify-center text-center gap-2 hover:shadow-md transition-shadow"
          >
            <div className="w-10 h-10 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <Wifi className="w-5 h-5" />
            </div>
            <span className="text-sm font-semibold text-gray-900">Wi-Fi Details</span>
          </button>
        </div>

        {/* Services Section */}
        <div>
          <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider mb-3">At your service</h3>
          <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
            <button 
              onClick={() => setIsHousekeepingOpen(true)}
              className="w-full p-4 flex items-center gap-4 hover:bg-gray-50 transition-colors border-b border-gray-50 text-left"
            >
              <div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center shrink-0">
                <Sparkles className="w-5 h-5" />
              </div>
              <div className="flex-1">
                <h4 className="font-semibold text-gray-900">Request Housekeeping</h4>
                <p className="text-xs text-gray-500">Fresh towels, cleaning, or restocking</p>
              </div>
              <ChevronRight className="w-5 h-5 text-gray-300" />
            </button>

            <button 
              onClick={() => setIsIssueOpen(true)}
              className="w-full p-4 flex items-center gap-4 hover:bg-gray-50 transition-colors border-b border-gray-50 text-left"
            >
              <div className="w-10 h-10 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center shrink-0">
                <Wrench className="w-5 h-5" />
              </div>
              <div className="flex-1">
                <h4 className="font-semibold text-gray-900">Report an Issue</h4>
                <p className="text-xs text-gray-500">AC, plumbing, or maintenance</p>
              </div>
              <ChevronRight className="w-5 h-5 text-gray-300" />
            </button>

            <a 
              href={`https://wa.me/YOUR_BUSINESS_NUMBER`} // Should be dynamic ideally
              target="_blank"
              rel="noreferrer"
              className="w-full p-4 flex items-center gap-4 hover:bg-gray-50 transition-colors text-left"
            >
              <div className="w-10 h-10 rounded-xl bg-green-50 text-green-600 flex items-center justify-center shrink-0">
                <MessageSquare className="w-5 h-5" />
              </div>
              <div className="flex-1">
                <h4 className="font-semibold text-gray-900">Ask a Question</h4>
                <p className="text-xs text-gray-500">Chat with our 24/7 support team</p>
              </div>
              <ChevronRight className="w-5 h-5 text-gray-300" />
            </a>
          </div>
        </div>

        {/* Status Indicator */}
        <div className="bg-gray-900 rounded-2xl p-5 text-white flex items-center gap-4 shadow-md">
          <div className="w-12 h-12 rounded-full bg-white/10 flex items-center justify-center shrink-0">
            <Info className="w-6 h-6 text-white" />
          </div>
          <div>
            <h4 className="font-semibold">Need Late Checkout?</h4>
            <p className="text-sm text-gray-300 mt-1">Contact us on WhatsApp to check availability.</p>
          </div>
        </div>
      </div>

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
                className="flex-1 py-3 font-semibold text-white bg-gray-900 rounded-xl hover:bg-gray-800 transition-colors disabled:opacity-70"
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
    </div>
  );
}
