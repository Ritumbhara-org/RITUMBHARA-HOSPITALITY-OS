"use client"

import { useState, useMemo } from "react"
import { motion } from "framer-motion"
import { Search, Filter, Key, CheckCircle2, AlertTriangle, PenTool, LayoutGrid, List, Plus, MapPin } from "lucide-react"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { createUnit, updateUnit } from "@/app/actions/units"
import { toast } from "sonner"
import { useTr } from "@/components/i18n/language-provider"

type UnitStats = {
  total: number
  available: number
  occupied: number
  dirty: number
  maintenance: number
}

export function UnitsClient({ 
  initialData, 
  stats,
  properties
}: { 
  initialData: any[],
  stats: UnitStats,
  properties: any[]
}) {
  const tr = useTr()
  const [searchTerm, setSearchTerm] = useState("")
  const [filterStatus, setFilterStatus] = useState("ALL")
  const [filterLocation, setFilterLocation] = useState("ALL")
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [editingUnit, setEditingUnit] = useState<any>(null)

  const openDialogForNew = () => {
    setEditingUnit(null)
    setIsDialogOpen(true)
  }

  const openDialogForEdit = (unit: any) => {
    setEditingUnit(unit)
    setIsDialogOpen(true)
  }

  const filteredData = useMemo(() => {
    return initialData.filter((unit: any) => {
      const matchesSearch = unit.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        unit.type.toLowerCase().includes(searchTerm.toLowerCase())
      
      const matchesStatus = filterStatus === "ALL" || unit.status === filterStatus;
      const matchesLocation = filterLocation === "ALL" || unit.propertyId === filterLocation;

      return matchesSearch && matchesStatus && matchesLocation;
    })
  }, [initialData, searchTerm, filterStatus, filterLocation])

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
    
    if (editingUnit) {
      formData.append("id", editingUnit.id)
      const result = await updateUnit(formData)
      setIsSubmitting(false)
      if (result.success) {
        setIsDialogOpen(false)
        toast.success(tr("Unit Updated Successfully"))
      } else {
        toast.error(tr("Failed to update unit"), { description: result.error })
      }
    } else {
      const result = await createUnit(formData)
      setIsSubmitting(false)
      if (result.success) {
        setIsDialogOpen(false)
        toast.success(tr("Unit Added Successfully"))
      } else {
        toast.error(tr("Failed to add unit"), { description: result.error })
      }
    }
  }

  return (
    <div className="flex flex-col flex-1 w-full gap-4 sm:gap-5 pb-4">
      <div className="flex flex-wrap items-end justify-between gap-3 sm:gap-4 shrink-0">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight">{tr("Units & Inventory")}</h1>
          <p className="text-sm text-muted-foreground mt-1">{tr("Manage property rooms, spaces, and live status.")}</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center rounded-xl border border-border/60 bg-background p-1 shadow-sm">
            <button 
              onClick={() => setViewMode('grid')}
              aria-label={tr("Grid view")}
              className={`p-2 sm:p-1.5 rounded-lg transition-all duration-200 ${viewMode === 'grid' ? 'bg-muted text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
            >
              <LayoutGrid className="h-4 w-4" />
            </button>
            <button 
              onClick={() => setViewMode('list')}
              aria-label={tr("List view")}
              className={`p-2 sm:p-1.5 rounded-lg transition-all duration-200 ${viewMode === 'list' ? 'bg-muted text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
            >
              <List className="h-4 w-4" />
            </button>
          </div>
          
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger onClick={openDialogForNew} className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm shadow-primary/20 transition-all duration-200 hover:bg-primary/90 hover:shadow-md hover:shadow-primary/25 active:scale-[0.98]">
              <Plus className="h-4 w-4" />
              {tr("Add Unit")}
            </DialogTrigger>
            <DialogContent className="sm:max-w-[660px] sm:max-h-[90vh] sm:rounded-3xl flex flex-col sm:p-6 sm:overflow-hidden">
              <form key={editingUnit ? editingUnit.id : 'new'} onSubmit={handleSubmit} className="flex flex-col min-h-0 flex-1">
                <DialogHeader className="pb-3 border-b border-border/40 shrink-0">
                  <DialogTitle className="text-xl font-bold">{editingUnit ? `Edit Unit: ${editingUnit.name}` : "Add Unit"}</DialogTitle>
                  <DialogDescription>
                    {editingUnit 
                      ? tr("Current details from the database are loaded below. Any change updates the live database and WhatsApp AI instantly.") 
                      : "Add a new room or space to your property inventory."}
                  </DialogDescription>
                </DialogHeader>

                <div className="overflow-y-auto pr-2 py-4 space-y-5 flex-1 text-sm">
                  {/* Basic Information */}
                  <div className="space-y-3">
                    <h3 className="font-semibold text-xs tracking-wider uppercase text-muted-foreground">{tr("General Details")}</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="grid gap-1.5 sm:col-span-2">
                        <Label htmlFor="propertyId">{tr("Location / Property *")}</Label>
                        <Select name="propertyId" required defaultValue={editingUnit?.propertyId || properties[0]?.id}>
                          <SelectTrigger className="w-full rounded-xl">
                            {/* Show the location's name, not its id. */}
                            <SelectValue placeholder={tr("Select Location")}>
                              {(value: string) => properties.find(p => p.id === value)?.name ?? tr("Select Location")}
                            </SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            {properties.map(p => (
                              <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="grid gap-1.5">
                        <Label htmlFor="name">{tr("Unit Name / Number *")}</Label>
                        <Input id="name" name="name" placeholder={tr("e.g. Studio 1210 or Villa 65")} required className="rounded-xl" defaultValue={editingUnit?.name || ""} />
                      </div>
                      <div className="grid gap-1.5">
                        <Label htmlFor="type">{tr("Unit Type")}</Label>
                        <Select name="type" defaultValue={editingUnit?.type || "Studio"}>
                          <SelectTrigger className="w-full rounded-xl">
                            <SelectValue placeholder={tr("Type")} />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Studio">{tr("Studio")}</SelectItem>
                            <SelectItem value="Villa">{tr("Villa")}</SelectItem>
                            <SelectItem value="Penthouse">{tr("Penthouse")}</SelectItem>
                            <SelectItem value="STANDARD">{tr("Standard Room")}</SelectItem>
                            <SelectItem value="DELUXE">{tr("Deluxe Room")}</SelectItem>
                            <SelectItem value="SUITE">{tr("Suite")}</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="grid gap-1.5">
                        <Label htmlFor="floor">{tr("Floor / Tower")}</Label>
                        <Input id="floor" name="floor" placeholder={tr("e.g. 12th or Ground")} className="rounded-xl" defaultValue={editingUnit?.floor || ""} />
                      </div>
                      <div className="grid gap-1.5">
                        <Label htmlFor="capacity">{tr("Max Capacity")}</Label>
                        <Input id="capacity" name="capacity" type="number" min="1" required className="rounded-xl" defaultValue={editingUnit?.capacity || 2} />
                      </div>
                    </div>
                  </div>

                  {/* Access Codes */}
                  <div className="space-y-3 pt-3 border-t border-border/40">
                    <h3 className="font-semibold text-xs tracking-wider uppercase text-muted-foreground">{tr("Access Codes & Digital Entry")}</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="grid gap-1.5">
                        <Label htmlFor="gateAccessCode">{tr("Main Gate / Guard Code")}</Label>
                        <Input id="gateAccessCode" name="gateAccessCode" placeholder={tr("e.g. 299239 or 335429")} className="rounded-xl font-mono" defaultValue={editingUnit?.gateAccessCode || ""} />
                      </div>
                      <div className="grid gap-1.5">
                        <Label htmlFor="doorLockCode">{tr("Door / Smart Lock PIN")}</Label>
                        <Input id="doorLockCode" name="doorLockCode" placeholder={tr("e.g. 07121986# or 07121987*")} className="rounded-xl font-mono" defaultValue={editingUnit?.doorLockCode || ""} />
                      </div>
                    </div>
                  </div>

                  {/* Unit-Specific Wi-Fi */}
                  <div className="space-y-3 pt-3 border-t border-border/40">
                    <h3 className="font-semibold text-xs tracking-wider uppercase text-muted-foreground">{tr("Unit Wi-Fi Credentials")}</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="grid gap-1.5">
                        <Label htmlFor="wifiNetwork">{tr("Wi-Fi SSID / Network")}</Label>
                        <Input id="wifiNetwork" name="wifiNetwork" placeholder={tr("e.g. Room1210-5G")} className="rounded-xl" defaultValue={editingUnit?.wifiNetwork || ""} />
                      </div>
                      <div className="grid gap-1.5">
                        <Label htmlFor="wifiPassword">{tr("Wi-Fi Password")}</Label>
                        <Input id="wifiPassword" name="wifiPassword" placeholder={tr("e.g. Stay@2026")} className="rounded-xl font-mono" defaultValue={editingUnit?.wifiPassword || ""} />
                      </div>
                    </div>
                  </div>

                  {/* Guides & Procedures */}
                  <div className="space-y-3 pt-3 border-t border-border/40">
                    <h3 className="font-semibold text-xs tracking-wider uppercase text-muted-foreground">{tr("Check-in & Check-out Procedures")}</h3>
                    <div className="grid gap-3">
                      <div className="grid gap-1.5">
                        <Label htmlFor="checkInGuide">{tr("Check-in Procedure / Entry Steps")}</Label>
                        <Textarea 
                          id="checkInGuide" 
                          name="checkInGuide" 
                          rows={3} 
                          placeholder={tr("e.g. 1. Get in through Gate (Block B1)...")} 
                          className="rounded-xl text-xs leading-relaxed" 
                          defaultValue={editingUnit?.checkInGuide || ""} 
                        />
                      </div>
                      <div className="grid gap-1.5">
                        <Label htmlFor="checkOutGuide">{tr("Check-out Procedure")}</Label>
                        <Textarea 
                          id="checkOutGuide" 
                          name="checkOutGuide" 
                          rows={2} 
                          placeholder={tr("e.g. Switch OFF all MCBs, submit keys and access card to guard.")} 
                          className="rounded-xl text-xs leading-relaxed" 
                          defaultValue={editingUnit?.checkOutGuide || ""} 
                        />
                      </div>
                    </div>
                  </div>

                  {/* Emergency & Location */}
                  <div className="space-y-3 pt-3 border-t border-border/40">
                    <h3 className="font-semibold text-xs tracking-wider uppercase text-muted-foreground">{tr("Emergency Contacts & Location")}</h3>
                    <div className="grid gap-3">
                      <div className="grid gap-1.5">
                        <Label htmlFor="emergencyContacts">{tr("On-Duty Emergency Contacts")}</Label>
                        <Textarea 
                          id="emergencyContacts" 
                          name="emergencyContacts" 
                          rows={3} 
                          placeholder={tr("e.g. Salim: 9503002629\nElectrician: 9649428190\nManager: 8562884444")} 
                          className="rounded-xl text-xs font-mono leading-relaxed" 
                          defaultValue={editingUnit?.emergencyContacts || ""} 
                        />
                      </div>
                      <div className="grid gap-1.5">
                        <Label htmlFor="googleMapsUrl">{tr("Google Maps Link")}</Label>
                        <Input 
                          id="googleMapsUrl" 
                          name="googleMapsUrl" 
                          placeholder={tr("https://share.google/...")} 
                          className="rounded-xl" 
                          defaultValue={editingUnit?.googleMapsUrl || ""} 
                        />
                      </div>
                    </div>
                  </div>
                </div>

                <DialogFooter className="pt-3 border-t border-border/40 shrink-0">
                  <button 
                    type="submit" 
                    disabled={isSubmitting}
                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm shadow-primary/20 transition-all duration-200 hover:bg-primary/90 hover:shadow-md disabled:opacity-50"
                  >
                    {isSubmitting ? tr("Saving...") : (editingUnit ? tr("Update Changes") : tr("Save Unit"))}
                  </button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="grid shrink-0 grid-cols-3 gap-2.5 sm:gap-4 lg:grid-cols-5">
        {[
          { label: "Total Units", value: stats.total, color: "bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-400" },
          { label: "Available", value: stats.available, color: "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400" },
          { label: "Occupied", value: stats.occupied, color: "bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400" },
          { label: "Dirty", value: stats.dirty, color: "bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-400" },
          { label: "Maintenance", value: stats.maintenance, color: "bg-orange-50 text-orange-600 dark:bg-orange-500/10 dark:text-orange-400" }
        ].map((stat, i) => (
          <motion.div
            key={tr(stat.label)}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, delay: i * 0.05 }}
            className="group rounded-2xl border bg-card min-w-0 p-3 sm:p-4 shadow-sm transition-all duration-300 hover:shadow-md hover:border-border/80"
          >
            <p className="text-xs sm:text-sm leading-snug font-medium text-muted-foreground mb-1.5 sm:mb-2">{tr(stat.label)}</p>
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight tabular-nums">{stat.value}</h2>
          </motion.div>
        ))}
      </div>

      <motion.div 
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.2 }}
        className="flex flex-col flex-1 min-h-0 rounded-2xl border bg-card shadow-sm overflow-hidden"
      >
        <div className="p-3 sm:p-4 border-b border-border/40 bg-muted/20 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 sm:gap-4 shrink-0">
          <div className="relative w-full sm:max-w-xs">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder={tr("Search units by name or type...")}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full rounded-xl border border-border/60 bg-background py-2.5 pl-9 pr-4 text-sm shadow-sm transition-all placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20 focus-visible:border-primary/40"
            />
          </div>
          <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center sm:gap-3">
            <Select value={filterLocation} onValueChange={(val) => setFilterLocation(val || "ALL")}>
              <SelectTrigger className="w-full min-w-0 sm:w-[180px] bg-background rounded-xl">
                <div className="flex min-w-0 items-center gap-2">
                  <MapPin className="h-4 w-4" />
                  <span className="truncate">{filterLocation === 'ALL' ? tr("All Locations") : properties.find(p => p.id === filterLocation)?.name || tr("Unknown")}</span>
                </div>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">{tr("All Locations")}</SelectItem>
                {properties.map(p => (
                  <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filterStatus} onValueChange={(val) => setFilterStatus(val || "ALL")}>
              <SelectTrigger className="w-full min-w-0 sm:w-[180px] bg-background rounded-xl">
                <div className="flex items-center gap-2">
                  <Filter className="h-4 w-4" />
                  <span className="truncate">{filterStatus === 'ALL' ? tr("All Status") : filterStatus}</span>
                </div>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">{tr("All Status")}</SelectItem>
                <SelectItem value="AVAILABLE">{tr("Available")}</SelectItem>
                <SelectItem value="OCCUPIED">{tr("Occupied")}</SelectItem>
                <SelectItem value="DIRTY">{tr("Dirty")}</SelectItem>
                <SelectItem value="CLEANING">{tr("Cleaning")}</SelectItem>
                <SelectItem value="READY">{tr("Ready")}</SelectItem>
                <SelectItem value="MAINTENANCE">{tr("Maintenance")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex-1 overflow-auto p-3 sm:p-4 bg-muted/10">
          {filteredData.length === 0 ? (
            <div className="h-full flex items-center justify-center text-muted-foreground">
              <div className="flex flex-col items-center">
                <Key className="h-10 w-10 mb-3 opacity-30" />
                <p className="text-sm font-medium">{tr("No units found matching your criteria.")}</p>
              </div>
            </div>
          ) : viewMode === 'grid' ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-3">
              {filteredData.map((unit: any) => (
                <div 
                  key={unit.id} 
                  className={`relative flex min-w-0 flex-col p-3 sm:p-3.5 rounded-2xl border-2 transition-all duration-200 hover:shadow-md hover:scale-[1.02] cursor-pointer ${getStatusColor(unit.status)}`}
                >
                  <div className="flex items-start justify-between gap-1 mb-2">
                    <span className="min-w-0 font-bold text-base sm:text-lg leading-tight break-words">{unit.name}</span>
                    <div className="flex shrink-0 items-center gap-1">
                      <button 
                        onClick={(e) => { e.stopPropagation(); openDialogForEdit(unit); }}
                        aria-label={tr("Edit unit")}
                        className="p-1.5 -m-0.5 rounded-md opacity-50 hover:opacity-100 hover:bg-current/10 transition-all"
                      >
                        <PenTool className="h-3 w-3" />
                      </button>
                      {getStatusIcon(unit.status)}
                    </div>
                  </div>
                  <span className="text-[10px] font-bold tracking-wider uppercase opacity-70 mt-auto">{tr(unit.status)}</span>
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
            <div className="border border-border/60 rounded-2xl bg-background overflow-x-auto">
              <table className="w-full min-w-[760px] text-sm text-left">
                <thead className="text-[11px] uppercase bg-muted/30 text-muted-foreground border-b border-border/40">
                  <tr>
                    <th className="px-6 py-3.5 font-semibold">{tr("Unit Name")}</th>
                    <th className="px-6 py-3.5 font-semibold">{tr("Property")}</th>
                    <th className="px-6 py-3.5 font-semibold">{tr("Type")}</th>
                    <th className="px-6 py-3.5 font-semibold">{tr("Status")}</th>
                    <th className="px-6 py-3.5 font-semibold">{tr("Access / Lock Code")}</th>
                    <th className="px-6 py-3.5 font-semibold">{tr("Wi-Fi")}</th>
                    <th className="px-6 py-3.5 font-semibold text-right">{tr("Actions")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/40">
                  {filteredData.map((unit: any) => (
                    <tr key={unit.id} onClick={() => openDialogForEdit(unit)} className="hover:bg-muted/30 transition-colors duration-150 cursor-pointer">
                      <td className="px-6 py-3.5 font-bold">
                        <div>{unit.name}</div>
                        <div className="text-[11px] font-normal text-muted-foreground">{unit.floor ? `Floor: ${unit.floor}` : ''}</div>
                      </td>
                      <td className="px-6 py-3.5 text-muted-foreground text-xs">{unit.property?.name || "N/A"}</td>
                      <td className="px-6 py-3.5 text-muted-foreground font-medium">{unit.type}</td>
                      <td className="px-6 py-3.5">
                        <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold tracking-wider uppercase border ${getStatusColor(unit.status)}`}>
                          {tr(unit.status)}
                        </span>
                      </td>
                      <td className="px-6 py-3.5 text-xs font-mono">
                        {unit.doorLockCode ? (
                          <span className="bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400 px-2 py-0.5 rounded-md border border-emerald-200 dark:border-emerald-500/20">
                            PIN: {unit.doorLockCode}
                          </span>
                        ) : unit.gateAccessCode ? (
                          <span className="bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400 px-2 py-0.5 rounded-md border border-blue-200 dark:border-blue-500/20">
                            Gate: {unit.gateAccessCode}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">{tr("In-person")}</span>
                        )}
                      </td>
                      <td className="px-6 py-3.5 text-xs">
                        {unit.wifiNetwork ? (
                          <div className="font-mono text-[11px] truncate max-w-[130px]">{unit.wifiNetwork}</div>
                        ) : (
                          <span className="text-muted-foreground text-[11px] italic">{tr("Property Wi-Fi")}</span>
                        )}
                      </td>
                      <td className="px-6 py-3.5 text-right">
                        <button
                          onClick={(e) => { e.stopPropagation(); openDialogForEdit(unit); }}
                          className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline p-1"
                        >
                          <PenTool className="h-3.5 w-3.5" />
                          <span>{tr("Edit")}</span>
                        </button>
                      </td>
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
