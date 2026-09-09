"use client"

import { useState } from "react"
import { motion } from "framer-motion"
import { Search, Filter, Key, CheckCircle2, AlertTriangle, PenTool, LayoutGrid, List, Plus } from "lucide-react"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { createUnit } from "@/app/actions/units"

type UnitStats = {
  total: number
  available: number
  occupied: number
  dirty: number
  maintenance: number
}

export function UnitsClient({ 
  initialData, 
  stats 
}: { 
  initialData: any[],
  stats: UnitStats
}) {
  const [searchTerm, setSearchTerm] = useState("")
  const [filterStatus, setFilterStatus] = useState("ALL")
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const filteredData = initialData.filter((unit: any) => {
    const matchesSearch = unit.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      unit.type.toLowerCase().includes(searchTerm.toLowerCase())
    if (filterStatus === "ALL") return matchesSearch;
    return matchesSearch && unit.status === filterStatus;
  })

  const getStatusColor = (status: string) => {
    switch(status) {
      case 'AVAILABLE':
      case 'READY':
        return 'bg-emerald-50 text-emerald-700 border-emerald-200/80 dark:bg-emerald-500/8 dark:text-emerald-400 dark:border-emerald-500/15'
      case 'OCCUPIED':
        return 'bg-blue-50 text-blue-700 border-blue-200/80 dark:bg-blue-500/8 dark:text-blue-400 dark:border-blue-500/15'
      case 'DIRTY':
        return 'bg-rose-50 text-rose-700 border-rose-200/80 dark:bg-rose-500/8 dark:text-rose-400 dark:border-rose-500/15'
      case 'CLEANING':
        return 'bg-amber-50 text-amber-700 border-amber-200/80 dark:bg-amber-500/8 dark:text-amber-400 dark:border-amber-500/15'
      case 'MAINTENANCE':
        return 'bg-orange-50 text-orange-700 border-orange-200/80 dark:bg-orange-500/8 dark:text-orange-400 dark:border-orange-500/15'
      default:
        return 'bg-slate-50 text-slate-600 border-slate-200'
    }
  }

  const getStatusIcon = (status: string) => {
    switch(status) {
      case 'AVAILABLE':
      case 'READY':
        return <CheckCircle2 className="h-4 w-4" />
      case 'OCCUPIED':
        return <Key className="h-4 w-4" />
      case 'DIRTY':
      case 'CLEANING':
        return <AlertTriangle className="h-4 w-4" />
      case 'MAINTENANCE':
        return <PenTool className="h-4 w-4" />
      default:
        return <div className="h-4 w-4 rounded-full bg-current opacity-20" />
    }
  }

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setIsSubmitting(true)
    const formData = new FormData(e.currentTarget)
    const result = await createUnit(formData)
    setIsSubmitting(false)
    if (result.success) {
      setIsDialogOpen(false)
    } else {
      alert("Failed to add unit: " + result.error)
    }
  }

  return (
    <div className="flex flex-col flex-1 w-full gap-5 pb-4">
      <div className="flex flex-wrap items-center justify-between gap-4 shrink-0">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Units & Inventory</h1>
          <p className="text-sm text-muted-foreground mt-1">Manage property rooms, spaces, and live status.</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center rounded-xl border border-border/60 bg-background p-1 shadow-sm">
            <button 
              onClick={() => setViewMode('grid')}
              className={`p-1.5 rounded-lg transition-all duration-200 ${viewMode === 'grid' ? 'bg-muted text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
            >
              <LayoutGrid className="h-4 w-4" />
            </button>
            <button 
              onClick={() => setViewMode('list')}
              className={`p-1.5 rounded-lg transition-all duration-200 ${viewMode === 'list' ? 'bg-muted text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
            >
              <List className="h-4 w-4" />
            </button>
          </div>
          
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm shadow-primary/20 transition-all duration-200 hover:bg-primary/90 hover:shadow-md hover:shadow-primary/25 active:scale-[0.98]">
              <Plus className="h-4 w-4" />
              Add Unit
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px] rounded-2xl">
              <form onSubmit={handleSubmit}>
                <DialogHeader>
                  <DialogTitle className="text-lg">Add Unit</DialogTitle>
                  <DialogDescription>Add a new room or space to your property inventory.</DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="grid gap-2">
                      <Label htmlFor="name">Unit Name / Number *</Label>
                      <Input id="name" name="name" placeholder="e.g. 101 or Presidential Suite" required className="rounded-xl" />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="type">Unit Type</Label>
                      <Select name="type" defaultValue="STANDARD">
                        <SelectTrigger className="rounded-xl">
                          <SelectValue placeholder="Type" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="STANDARD">Standard Room</SelectItem>
                          <SelectItem value="DELUXE">Deluxe Room</SelectItem>
                          <SelectItem value="SUITE">Suite</SelectItem>
                          <SelectItem value="VILLA">Villa</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="grid gap-2">
                      <Label htmlFor="floor">Floor / Building</Label>
                      <Input id="floor" name="floor" placeholder="e.g. Ground or North Tower" className="rounded-xl" />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="capacity">Max Capacity</Label>
                      <Input id="capacity" name="capacity" type="number" min="1" defaultValue="2" required className="rounded-xl" />
                    </div>
                  </div>
                </div>
                <DialogFooter>
                  <button 
                    type="submit" 
                    disabled={isSubmitting}
                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm shadow-primary/20 transition-all duration-200 hover:bg-primary/90 hover:shadow-md disabled:opacity-50"
                  >
                    {isSubmitting ? "Saving..." : "Save Unit"}
                  </button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="grid shrink-0 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {[
          { label: "Total Units", value: stats.total, color: "bg-violet-50 text-violet-600 dark:bg-violet-500/10 dark:text-violet-400" },
          { label: "Available", value: stats.available, color: "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400" },
          { label: "Occupied", value: stats.occupied, color: "bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400" },
          { label: "Dirty", value: stats.dirty, color: "bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-400" },
          { label: "Maintenance", value: stats.maintenance, color: "bg-orange-50 text-orange-600 dark:bg-orange-500/10 dark:text-orange-400" }
        ].map((stat, i) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, delay: i * 0.05 }}
            className="group rounded-2xl border bg-card p-4 shadow-sm transition-all duration-300 hover:shadow-md hover:border-border/80"
          >
            <p className="text-sm font-medium text-muted-foreground mb-2">{stat.label}</p>
            <h2 className="text-3xl font-bold tracking-tight">{stat.value}</h2>
          </motion.div>
        ))}
      </div>

      <motion.div 
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.2 }}
        className="flex flex-col flex-1 min-h-0 rounded-2xl border bg-card shadow-sm overflow-hidden"
      >
        <div className="p-4 border-b border-border/40 bg-muted/20 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shrink-0">
          <div className="relative w-full sm:max-w-xs">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search units by name or type..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full rounded-xl border border-border/60 bg-background py-2.5 pl-9 pr-4 text-sm shadow-sm transition-all placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20 focus-visible:border-primary/40"
            />
          </div>
          <Select value={filterStatus} onValueChange={(val) => setFilterStatus(val || "ALL")}>
            <SelectTrigger className="w-[180px] bg-background rounded-xl">
              <div className="flex items-center gap-2">
                <Filter className="h-4 w-4" />
                <span>{filterStatus === 'ALL' ? 'All Status' : filterStatus}</span>
              </div>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All Status</SelectItem>
              <SelectItem value="AVAILABLE">Available</SelectItem>
              <SelectItem value="OCCUPIED">Occupied</SelectItem>
              <SelectItem value="DIRTY">Dirty</SelectItem>
              <SelectItem value="CLEANING">Cleaning</SelectItem>
              <SelectItem value="READY">Ready</SelectItem>
              <SelectItem value="MAINTENANCE">Maintenance</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex-1 overflow-auto p-4 bg-muted/10">
          {filteredData.length === 0 ? (
            <div className="h-full flex items-center justify-center text-muted-foreground">
              <div className="flex flex-col items-center">
                <Key className="h-10 w-10 mb-3 opacity-30" />
                <p className="text-sm font-medium">No units found matching your criteria.</p>
              </div>
            </div>
          ) : viewMode === 'grid' ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-3">
              {filteredData.map((unit: any) => (
                <div 
                  key={unit.id} 
                  className={`relative flex flex-col p-3.5 rounded-2xl border-2 transition-all duration-200 hover:shadow-md hover:scale-[1.02] cursor-pointer ${getStatusColor(unit.status)}`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-bold text-lg">{unit.name}</span>
                    {getStatusIcon(unit.status)}
                  </div>
                  <span className="text-[10px] font-bold tracking-wider uppercase opacity-70 mt-auto">{unit.status}</span>
                  <span className="text-[10px] opacity-50 truncate">{unit.type}</span>
                  
                  {unit.status === 'OCCUPIED' && unit.reservations?.[0] && (
                    <div className="mt-2 pt-2 border-t border-current/10 text-xs font-semibold truncate">
                      {unit.reservations[0].guest.name}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="border border-border/60 rounded-2xl bg-background overflow-hidden">
              <table className="w-full text-sm text-left">
                <thead className="text-[11px] uppercase bg-muted/30 text-muted-foreground border-b border-border/40">
                  <tr>
                    <th className="px-6 py-3.5 font-semibold">Unit Name</th>
                    <th className="px-6 py-3.5 font-semibold">Type</th>
                    <th className="px-6 py-3.5 font-semibold">Status</th>
                    <th className="px-6 py-3.5 font-semibold">Floor</th>
                    <th className="px-6 py-3.5 font-semibold">Capacity</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/40">
                  {filteredData.map((unit: any) => (
                    <tr key={unit.id} className="hover:bg-muted/30 transition-colors duration-150 cursor-pointer">
                      <td className="px-6 py-3.5 font-bold">{unit.name}</td>
                      <td className="px-6 py-3.5 text-muted-foreground font-medium">{unit.type}</td>
                      <td className="px-6 py-3.5">
                        <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold tracking-wider uppercase border ${getStatusColor(unit.status)}`}>
                          {unit.status}
                        </span>
                      </td>
                      <td className="px-6 py-3.5 text-muted-foreground font-medium">{unit.floor}</td>
                      <td className="px-6 py-3.5 text-muted-foreground font-medium">{unit.capacity} Persons</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  )
}
