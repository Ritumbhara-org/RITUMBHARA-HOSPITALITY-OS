"use client"

import { useState } from "react"
import { motion } from "framer-motion"
import { Search, Filter, Key, CheckCircle2, AlertTriangle, PenTool, LayoutGrid, List, User, Plus } from "lucide-react"
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
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const filteredData = initialData.filter((unit: any) => 
    unit.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    unit.type.toLowerCase().includes(searchTerm.toLowerCase())
  )

  const getStatusColor = (status: string) => {
    switch(status) {
      case 'AVAILABLE':
      case 'READY':
        return 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-900/50'
      case 'OCCUPIED':
        return 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/30 dark:text-blue-400 dark:border-blue-900/50'
      case 'DIRTY':
        return 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/30 dark:text-rose-400 dark:border-rose-900/50'
      case 'CLEANING':
        return 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-900/50'
      case 'MAINTENANCE':
        return 'bg-slate-100 text-slate-700 border-slate-300 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700'
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
    <div className="flex flex-col flex-1 h-full w-full gap-6 pb-4 min-h-0">
      <div className="flex items-center justify-between shrink-0">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Units & Inventory</h1>
          <p className="text-sm text-muted-foreground mt-1">Manage property rooms, spaces, and live status.</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center rounded-md border bg-background p-1 shadow-sm">
            <button 
              onClick={() => setViewMode('grid')}
              className={`p-1.5 rounded-sm transition-colors ${viewMode === 'grid' ? 'bg-muted text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
            >
              <LayoutGrid className="h-4 w-4" />
            </button>
            <button 
              onClick={() => setViewMode('list')}
              className={`p-1.5 rounded-sm transition-colors ${viewMode === 'list' ? 'bg-muted text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
            >
              <List className="h-4 w-4" />
            </button>
          </div>
          
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow transition-colors hover:bg-primary/90">
              <Plus className="mr-2 h-4 w-4" />
              Add Unit
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px]">
              <form onSubmit={handleSubmit}>
                <DialogHeader>
                  <DialogTitle>Add Unit</DialogTitle>
                  <DialogDescription>
                    Add a new room or space to your property inventory.
                  </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="grid gap-2">
                      <Label htmlFor="name">Unit Name / Number *</Label>
                      <Input id="name" name="name" placeholder="e.g. 101 or Presidential Suite" required />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="type">Unit Type</Label>
                      <Select name="type" defaultValue="STANDARD">
                        <SelectTrigger>
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
                      <Input id="floor" name="floor" placeholder="e.g. Ground or North Tower" />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="capacity">Max Capacity</Label>
                      <Input id="capacity" name="capacity" type="number" min="1" defaultValue="2" required />
                    </div>
                  </div>
                </div>
                <DialogFooter>
                  <button 
                    type="submit" 
                    disabled={isSubmitting}
                    className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow transition-colors hover:bg-primary/90 disabled:opacity-50"
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
          { label: "Total Units", value: stats.total, icon: Key },
          { label: "Available", value: stats.available, icon: CheckCircle2 },
          { label: "Occupied", value: stats.occupied, icon: User },
          { label: "Dirty", value: stats.dirty, icon: AlertTriangle },
          { label: "Maintenance", value: stats.maintenance, icon: PenTool }
        ].map((stat, i) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: i * 0.05 }}
            className="rounded-xl border bg-card p-4 shadow-sm"
          >
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-muted-foreground">{stat.label}</p>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <h2 className="text-2xl font-semibold tracking-tight">{stat.value}</h2>
            </div>
          </motion.div>
        ))}
      </div>

      <motion.div 
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.2 }}
        className="flex flex-col flex-1 min-h-0 rounded-xl border bg-card shadow-sm overflow-hidden"
      >
        <div className="p-4 border-b bg-slate-50/50 dark:bg-slate-900/50 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shrink-0">
          <div className="relative w-full sm:max-w-xs">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search units by name or type..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full rounded-md border border-input bg-background py-2 pl-9 pr-4 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
          </div>
          <button className="inline-flex items-center justify-center gap-2 rounded-md border border-input bg-background px-4 py-2 text-sm font-medium shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground">
            <Filter className="h-4 w-4" />
            Filter Status
          </button>
        </div>

        <div className="flex-1 overflow-auto p-4 bg-slate-50/30 dark:bg-slate-900/20">
          {filteredData.length === 0 ? (
            <div className="h-full flex items-center justify-center text-muted-foreground">
              No units found matching your criteria.
            </div>
          ) : viewMode === 'grid' ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-3">
              {filteredData.map((unit: any) => (
                <div 
                  key={unit.id} 
                  className={`relative flex flex-col p-3 rounded-xl border-2 transition-all hover:shadow-md cursor-pointer ${getStatusColor(unit.status)}`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-bold text-lg">{unit.name}</span>
                    {getStatusIcon(unit.status)}
                  </div>
                  <span className="text-[10px] font-semibold tracking-wider uppercase opacity-80 mt-auto">{unit.status}</span>
                  <span className="text-[10px] opacity-60 truncate">{unit.type}</span>
                  
                  {unit.status === 'OCCUPIED' && unit.reservations?.[0] && (
                    <div className="mt-2 pt-2 border-t border-current/10 text-xs font-medium truncate">
                      {unit.reservations[0].guest.name}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="border rounded-lg bg-background overflow-hidden">
              <table className="w-full text-sm text-left">
                <thead className="text-xs uppercase bg-slate-50 dark:bg-slate-900 text-slate-500 border-b">
                  <tr>
                    <th className="px-6 py-4 font-semibold">Unit Name</th>
                    <th className="px-6 py-4 font-semibold">Type</th>
                    <th className="px-6 py-4 font-semibold">Status</th>
                    <th className="px-6 py-4 font-semibold">Floor</th>
                    <th className="px-6 py-4 font-semibold">Capacity</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {filteredData.map((unit: any) => (
                    <tr key={unit.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/50 transition-colors cursor-pointer">
                      <td className="px-6 py-4 font-bold">{unit.name}</td>
                      <td className="px-6 py-4 text-muted-foreground">{unit.type}</td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-[10px] font-bold tracking-wider uppercase border ${getStatusColor(unit.status)}`}>
                          {unit.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-muted-foreground">{unit.floor}</td>
                      <td className="px-6 py-4 text-muted-foreground">{unit.capacity} Persons</td>
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

