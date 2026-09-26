"use client";

import { useState, useEffect } from "react";
import { 
  TrendingUp, 
  Users, 
  Clock, 
  MessageSquare,
  Wrench,
  CheckCircle,
  AlertTriangle,
  Building,
  DollarSign,
  PieChart,
  BarChart2
} from "lucide-react";
import { toast } from "sonner";

interface AnalyticsData {
  revenue: {
    total: number;
    adr: number;
    occupancyRate: number;
    bookingSources: { name: string; value: number }[];
  };
  operations: {
    openTickets: number;
    completedTickets: number;
    overdueTickets: number;
    avgCleaningTime: number;
    avgMaintenanceTime: number;
  };
  guests: {
    newGuests: number;
    repeatGuests: number;
    members: number;
    whatsappEngagement: number;
  };
}

export function AnalyticsClient() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [timeframe, setTimeframe] = useState("This Month");

  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);
      try {
        const res = await fetch(`/api/analytics?timeframe=${encodeURIComponent(timeframe)}`);
        if (res.ok) {
          const json = await res.json();
          setData(json);
        } else {
          toast.error("Failed to load analytics");
        }
      } catch (err) {
        toast.error("Failed to load analytics");
      } finally {
        setIsLoading(false);
      }
    };
    fetchData();
  }, [timeframe]);

  if (isLoading || !data) {
    return (
      <div className="p-8 space-y-8">
        <h1 className="text-3xl font-bold tracking-tight text-gray-900">Analytics & Performance</h1>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-32 w-full rounded-2xl bg-gray-200 animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  const { revenue, operations, guests } = data;

  const formatCurrency = (val: number) => 
    new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(val);

  return (
    <div className="p-8 space-y-10 animate-in fade-in duration-500">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-gray-900">Analytics & Performance</h1>
          <p className="text-gray-500 mt-1">Management overview for revenue, operations, and guests.</p>
        </div>
        <div className="flex gap-2">
          <select 
            value={timeframe}
            onChange={(e) => setTimeframe(e.target.value)}
            className="bg-white border border-gray-200 text-sm rounded-lg px-3 py-2 text-gray-700 outline-none focus:ring-2 focus:ring-rose-500/20"
          >
            <option value="This Month">This Month</option>
            <option value="Last Month">Last Month</option>
            <option value="Year to Date">Year to Date</option>
          </select>
        </div>
      </div>

      {/* REVENUE SECTION */}
      <section>
        <div className="flex items-center gap-2 mb-4">
          <TrendingUp className="w-5 h-5 text-rose-600" />
          <h2 className="text-lg font-bold text-gray-900">Revenue & Occupancy</h2>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm relative overflow-hidden group hover:shadow-md transition-all">
            <div className="absolute top-0 right-0 p-6 opacity-5 group-hover:opacity-10 transition-opacity">
              <DollarSign className="w-24 h-24" />
            </div>
            <p className="text-sm font-medium text-gray-500 mb-1 uppercase tracking-wider">Total Revenue</p>
            <p className="text-4xl font-bold text-gray-900">{formatCurrency(revenue.total)}</p>
            <div className="mt-4 inline-flex items-center gap-1 text-xs font-medium text-emerald-600 bg-emerald-50 px-2 py-1 rounded-full">
              <TrendingUp className="w-3 h-3" /> +12.5% vs last month
            </div>
          </div>

          <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm relative overflow-hidden group hover:shadow-md transition-all">
            <div className="absolute top-0 right-0 p-6 opacity-5 group-hover:opacity-10 transition-opacity">
              <Building className="w-24 h-24" />
            </div>
            <p className="text-sm font-medium text-gray-500 mb-1 uppercase tracking-wider">Occupancy Rate</p>
            <p className="text-4xl font-bold text-gray-900">{revenue.occupancyRate.toFixed(1)}%</p>
            <div className="mt-4 w-full bg-gray-100 rounded-full h-2 overflow-hidden">
              <div 
                className="bg-gradient-to-r from-rose-500 to-rose-600 h-full rounded-full" 
                style={{ width: `${revenue.occupancyRate}%` }}
              />
            </div>
          </div>

          <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm relative overflow-hidden group hover:shadow-md transition-all">
            <div className="absolute top-0 right-0 p-6 opacity-5 group-hover:opacity-10 transition-opacity">
              <BarChart2 className="w-24 h-24" />
            </div>
            <p className="text-sm font-medium text-gray-500 mb-1 uppercase tracking-wider">ADR</p>
            <p className="text-4xl font-bold text-gray-900">{formatCurrency(revenue.adr)}</p>
            <p className="text-sm text-gray-400 mt-4">Average Daily Rate</p>
          </div>
        </div>

        {/* Booking Sources */}
        {revenue.bookingSources.length > 0 && (
          <div className="mt-6 bg-white p-6 rounded-3xl border border-gray-100 shadow-sm">
            <h3 className="text-sm font-bold text-gray-900 mb-4 uppercase tracking-wider flex items-center gap-2">
              <PieChart className="w-4 h-4 text-gray-400" /> Booking Sources
            </h3>
            <div className="space-y-4">
              {revenue.bookingSources.map((source, idx) => {
                const totalBookings = revenue.bookingSources.reduce((sum, s) => sum + s.value, 0);
                const percent = ((source.value / totalBookings) * 100).toFixed(0);
                return (
                  <div key={idx} className="flex items-center gap-4">
                    <div className="w-24 text-sm font-medium text-gray-700 capitalize">{source.name.toLowerCase()}</div>
                    <div className="flex-1 bg-gray-100 h-2.5 rounded-full overflow-hidden">
                      <div 
                        className="bg-gradient-to-r from-[#5c0a20] to-rose-500 h-full rounded-full"
                        style={{ width: `${percent}%` }}
                      />
                    </div>
                    <div className="w-12 text-right text-sm text-gray-500">{percent}%</div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </section>

      {/* OPERATIONS SECTION */}
      <section>
        <div className="flex items-center gap-2 mb-4">
          <Wrench className="w-5 h-5 text-[#5c0a20]" />
          <h2 className="text-lg font-bold text-gray-900">Operations</h2>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <div className="bg-white p-5 rounded-3xl border border-gray-100 shadow-sm flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <div>
              <p className="text-sm text-gray-500 font-medium">Open Tickets</p>
              <p className="text-2xl font-bold text-gray-900">{operations.openTickets}</p>
            </div>
          </div>

          <div className="bg-white p-5 rounded-3xl border border-gray-100 shadow-sm flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
              <CheckCircle className="w-6 h-6" />
            </div>
            <div>
              <p className="text-sm text-gray-500 font-medium">Completed</p>
              <p className="text-2xl font-bold text-gray-900">{operations.completedTickets}</p>
            </div>
          </div>

          <div className="bg-white p-5 rounded-3xl border border-gray-100 shadow-sm flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-red-50 text-red-600 flex items-center justify-center shrink-0">
              <Clock className="w-6 h-6" />
            </div>
            <div>
              <p className="text-sm text-gray-500 font-medium">Overdue (SLA)</p>
              <p className="text-2xl font-bold text-gray-900">{operations.overdueTickets}</p>
            </div>
          </div>

          <div className="bg-white p-5 rounded-3xl border border-gray-100 shadow-sm flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-purple-50 text-purple-600 flex items-center justify-center shrink-0">
              <Wrench className="w-6 h-6" />
            </div>
            <div>
              <p className="text-sm text-gray-500 font-medium">Avg Maintenance</p>
              <p className="text-2xl font-bold text-gray-900">{operations.avgMaintenanceTime.toFixed(1)} <span className="text-sm text-gray-400 font-normal">hrs</span></p>
            </div>
          </div>
        </div>
      </section>

      {/* GUEST METRICS SECTION */}
      <section>
        <div className="flex items-center gap-2 mb-4">
          <Users className="w-5 h-5 text-purple-600" />
          <h2 className="text-lg font-bold text-gray-900">Guest Insights</h2>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-gradient-to-br from-[#4a0518] to-[#3a0312] p-6 rounded-3xl text-white shadow-lg relative overflow-hidden">
            <div className="relative z-10">
              <p className="text-rose-200 text-sm font-medium uppercase tracking-wider mb-2">Guest Loyalty</p>
              <div className="flex items-end gap-6">
                <div>
                  <p className="text-3xl font-bold">{guests.repeatGuests}</p>
                  <p className="text-sm text-rose-100/80">Repeat</p>
                </div>
                <div className="h-10 w-px bg-white/20"></div>
                <div>
                  <p className="text-3xl font-bold">{guests.newGuests}</p>
                  <p className="text-sm text-rose-100/80">New Guests</p>
                </div>
              </div>
            </div>
            <Users className="absolute -bottom-4 -right-4 w-32 h-32 text-white opacity-5" />
          </div>

          <div className="bg-gradient-to-br from-indigo-500 to-purple-600 p-6 rounded-3xl text-white shadow-lg relative overflow-hidden">
            <div className="relative z-10">
              <p className="text-indigo-200 text-sm font-medium uppercase tracking-wider mb-2">Memberships</p>
              <p className="text-4xl font-bold mb-1">{guests.members}</p>
              <p className="text-sm text-indigo-100/80">Active enrolled members</p>
            </div>
            <div className="absolute -bottom-4 -right-4 w-32 h-32 border-[20px] border-white opacity-5 rounded-full" />
          </div>

          <div className="bg-gradient-to-br from-emerald-500 to-teal-600 p-6 rounded-3xl text-white shadow-lg relative overflow-hidden">
            <div className="relative z-10">
              <p className="text-emerald-200 text-sm font-medium uppercase tracking-wider mb-2">WhatsApp</p>
              <p className="text-4xl font-bold mb-1">{guests.whatsappEngagement}</p>
              <p className="text-sm text-emerald-100/80">Total engagements</p>
            </div>
            <MessageSquare className="absolute -bottom-2 -right-2 w-28 h-28 text-white opacity-10" />
          </div>
        </div>
      </section>

    </div>
  );
}
