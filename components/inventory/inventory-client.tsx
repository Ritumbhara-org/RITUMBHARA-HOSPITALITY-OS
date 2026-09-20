"use client"

import { useState, useEffect } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { motion, AnimatePresence } from "framer-motion"
import { Package, Plus, Search, AlertTriangle, Box, Minus, CheckCircle2, MapPin } from "lucide-react"
import { InventoryItem, Property } from "@prisma/client"
import { addInventoryItem, updateInventoryQuantity } from "@/app/actions/inventory"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { toast } from "sonner"

interface InventoryClientProps {
  initialItems: InventoryItem[]
  activePropertyId: string
  properties: Property[]
  reporterId: string
}

export function InventoryClient({ initialItems, activePropertyId, properties, reporterId }: InventoryClientProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [items, setItems] = useState<InventoryItem[]>(initialItems)
  const [search, setSearch] = useState("")
  const [isAdding, setIsAdding] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [updatingId, setUpdatingId] = useState<string | null>(null)

  // When initialItems changes (e.g. after a navigation event/server reload), sync state
  useEffect(() => {
    setItems(initialItems)
  }, [initialItems])

  const filteredItems = items.filter(item => 
    item.name.toLowerCase().includes(search.toLowerCase()) ||
    item.category.toLowerCase().includes(search.toLowerCase())
  )

  const lowStockCount = items.filter(i => i.quantity < i.minThreshold).length
  const healthyCount = items.length - lowStockCount

  const handlePropertyChange = (propertyId: string | null) => {
    if (!propertyId) return;
    // Navigate to the new property ID which will trigger a server fetch
    const params = new URLSearchParams(searchParams)
    params.set("propertyId", propertyId)
    router.push(`/inventory?${params.toString()}`)
  }

  const handleUpdateStock = async (itemId: string, change: number) => {
    try {
      setUpdatingId(itemId)
      const updated = await updateInventoryQuantity(itemId, change, reporterId)
      setItems(items.map(item => item.id === itemId ? updated : item))
      
      if (updated.quantity < updated.minThreshold && items.find(i => i.id === itemId)!.quantity >= updated.minThreshold) {
        toast.error("Low Stock Alert!", {
          description: `An automatic high-priority ticket was created for ${updated.name}.`
        })
      } else {
        toast.success("Stock updated successfully")
      }
    } catch (error: any) {
      toast.error("Failed to update stock", { description: error.message })
    } finally {
      setUpdatingId(null)
    }
  }

  const handleAddItem = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setIsLoading(true)
    const formData = new FormData(e.currentTarget)
    try {
      const newItem = await addInventoryItem({
        propertyId: activePropertyId,
        name: formData.get("name") as string,
        category: formData.get("category") as string,
        quantity: parseInt(formData.get("quantity") as string),
        unit: formData.get("unit") as string,
        minThreshold: parseInt(formData.get("minThreshold") as string),
      })
      setItems([...items, newItem].sort((a, b) => a.category.localeCompare(b.category)))
      setIsAdding(false)
      toast.success("Item added successfully")
    } catch (error: any) {
      toast.error("Failed to add item", { description: error.message })
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="flex flex-col gap-6 pb-4">
      
      {/* Property Selector Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-2xl border bg-card/60 shadow-sm backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
            <MapPin className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-sm font-medium text-muted-foreground">Select Location</h3>
            <Select value={activePropertyId} onValueChange={handlePropertyChange}>
              <SelectTrigger className="w-[240px] h-9 border-none bg-transparent hover:bg-muted/50 focus:ring-0 px-2 -ml-2 rounded-lg font-bold text-lg">
                <SelectValue placeholder="Select property..." />
              </SelectTrigger>
              <SelectContent>
                {properties.map(p => (
                  <SelectItem key={p.id} value={p.id} className="font-medium">
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        
        <button
          onClick={() => setIsAdding(!isAdding)}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm shadow-primary/20 transition-all duration-200 hover:bg-primary/90 hover:shadow-md active:scale-[0.98]"
        >
          <Plus className="h-4 w-4" />
          New Item
        </button>
      </div>

      {/* Metrics Row */}
      <div className="grid shrink-0 gap-4 sm:grid-cols-3">
        {[
          { label: "Total Items", value: items.length, icon: Box, color: "bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400" },
          { label: "Healthy Stock", value: healthyCount, icon: CheckCircle2, color: "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400" },
          { label: "Low Stock Alerts", value: lowStockCount, icon: AlertTriangle, color: "bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-400" },
        ].map((stat, i) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, delay: i * 0.05 }}
            className="group rounded-2xl border bg-card p-4 shadow-sm transition-all duration-300 hover:shadow-md hover:border-border/80"
          >
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-medium text-muted-foreground">{stat.label}</p>
              <div className={`rounded-xl p-2 ${stat.color} transition-transform duration-300 group-hover:scale-110`}>
                <stat.icon className="h-4 w-4" />
              </div>
            </div>
            <h2 className="text-3xl font-bold tracking-tight">{stat.value}</h2>
          </motion.div>
        ))}
      </div>

      <AnimatePresence>
        {isAdding && (
          <motion.div
            initial={{ opacity: 0, height: 0, y: -10 }}
            animate={{ opacity: 1, height: 'auto', y: 0 }}
            exit={{ opacity: 0, height: 0, y: -10 }}
            transition={{ duration: 0.3, type: "spring", bounce: 0.2 }}
            className="overflow-hidden"
          >
            <div className="rounded-2xl border bg-gradient-to-br from-card to-muted/20 p-6 shadow-md mb-2">
              <h3 className="text-lg font-semibold mb-5 flex items-center gap-2">
                <Box className="w-5 h-5 text-primary" />
                Add New Inventory Item
              </h3>
              <form onSubmit={handleAddItem} className="grid gap-5 md:grid-cols-2 lg:grid-cols-5">
                <div className="space-y-2">
                  <label className="text-xs font-semibold uppercase text-muted-foreground tracking-wider">Item Name</label>
                  <input required name="name" className="flex h-11 w-full rounded-xl border border-input bg-background/50 px-3 py-2 text-sm transition-all focus:bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary/50" placeholder="e.g. Toilet Paper" />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-semibold uppercase text-muted-foreground tracking-wider">Category</label>
                  <select required name="category" className="flex h-11 w-full rounded-xl border border-input bg-background/50 px-3 py-2 text-sm transition-all focus:bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary/50">
                    <option value="TOILETRIES">Toiletries</option>
                    <option value="LINEN">Linen</option>
                    <option value="CLEANING">Cleaning</option>
                    <option value="FOOD_BEVERAGE">Food & Beverage</option>
                    <option value="MAINTENANCE">Maintenance</option>
                    <option value="OTHER">Other</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-semibold uppercase text-muted-foreground tracking-wider">Initial Qty</label>
                  <input required name="quantity" type="number" min="0" className="flex h-11 w-full rounded-xl border border-input bg-background/50 px-3 py-2 text-sm transition-all focus:bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary/50" placeholder="e.g. 50" />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-semibold uppercase text-muted-foreground tracking-wider">Unit Type</label>
                  <input required name="unit" className="flex h-11 w-full rounded-xl border border-input bg-background/50 px-3 py-2 text-sm transition-all focus:bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary/50" placeholder="e.g. Rolls, Bottles" />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-semibold uppercase text-muted-foreground tracking-wider">Min Alert Level</label>
                  <div className="flex items-end gap-3">
                    <input required name="minThreshold" type="number" min="0" className="flex h-11 w-full rounded-xl border border-input bg-background/50 px-3 py-2 text-sm transition-all focus:bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary/50" placeholder="Alert at..." />
                    <button disabled={isLoading} type="submit" className="h-11 px-6 bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl transition-all font-semibold shadow-sm shadow-primary/20">
                      Save
                    </button>
                  </div>
                </div>
              </form>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <motion.div 
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.2 }}
        className="flex flex-col flex-1 min-h-0 rounded-2xl border bg-card shadow-sm overflow-hidden"
      >
        <div className="p-4 border-b border-border/40 bg-muted/20">
          <div className="relative w-full sm:max-w-sm">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search items by name or category..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-xl border border-border/60 bg-background py-2.5 pl-9 pr-4 text-sm shadow-sm transition-all placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20 focus-visible:border-primary/40"
            />
          </div>
        </div>

        <div className="relative w-full overflow-auto">
          <table className="w-full caption-bottom text-sm">
            <thead className="[&_tr]:border-b bg-muted/30">
              <tr className="border-b transition-colors">
                <th className="h-14 px-6 text-left align-middle text-xs font-bold uppercase tracking-wider text-muted-foreground">Item Name</th>
                <th className="h-14 px-6 text-left align-middle text-xs font-bold uppercase tracking-wider text-muted-foreground">Category</th>
                <th className="h-14 px-6 text-left align-middle text-xs font-bold uppercase tracking-wider text-muted-foreground">Stock Level</th>
                <th className="h-14 px-6 text-left align-middle text-xs font-bold uppercase tracking-wider text-muted-foreground">Alert Threshold</th>
                <th className="h-14 px-6 text-left align-middle text-xs font-bold uppercase tracking-wider text-muted-foreground">Status</th>
                <th className="h-14 px-6 text-right align-middle text-xs font-bold uppercase tracking-wider text-muted-foreground">Manage</th>
              </tr>
            </thead>
            <tbody className="[&_tr:last-child]:border-0">
              {filteredItems.length === 0 ? (
                <tr>
                  <td colSpan={6} className="h-32 text-center text-muted-foreground">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <Package className="h-8 w-8 text-muted-foreground/50" />
                      <p>No inventory items found.</p>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredItems.map((item) => {
                  const isLowStock = item.quantity < item.minThreshold
                  const isUpdating = updatingId === item.id

                  return (
                    <tr key={item.id} className="border-b transition-colors hover:bg-muted/30 group">
                      <td className="p-6 align-middle">
                        <div className="flex items-center gap-3">
                          <div className={`h-8 w-8 rounded-lg flex items-center justify-center border ${isLowStock ? 'bg-red-50 border-red-100 text-red-500' : 'bg-primary/5 border-primary/10 text-primary'}`}>
                            <Package className="w-4 h-4" />
                          </div>
                          <span className="font-semibold text-base">{item.name}</span>
                        </div>
                      </td>
                      <td className="p-6 align-middle">
                        <span className="inline-flex items-center rounded-lg border bg-background px-3 py-1 text-xs font-medium text-foreground shadow-sm">
                          {item.category.replace('_', ' ')}
                        </span>
                      </td>
                      <td className="p-6 align-middle">
                        <div className="flex items-center gap-2">
                          <span className={`text-xl font-bold tracking-tight ${isLowStock ? 'text-red-500' : 'text-emerald-500'}`}>
                            {item.quantity}
                          </span>
                          <span className="text-xs font-medium text-muted-foreground uppercase">{item.unit}</span>
                        </div>
                      </td>
                      <td className="p-6 align-middle font-medium text-muted-foreground">
                        {item.minThreshold} {item.unit}
                      </td>
                      <td className="p-6 align-middle">
                        {isLowStock ? (
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-500/10 px-3 py-1 text-xs font-semibold text-rose-600 dark:text-rose-400 border border-rose-500/20">
                            <AlertTriangle className="w-3.5 h-3.5" />
                            Restock Required
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                            Healthy
                          </span>
                        )}
                      </td>
                      <td className="p-6 align-middle text-right">
                        <div className="flex items-center justify-end gap-2 opacity-100 sm:opacity-50 sm:group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={() => handleUpdateStock(item.id, -1)}
                            disabled={isUpdating || item.quantity <= 0}
                            className="inline-flex items-center justify-center rounded-xl bg-background border border-border/60 shadow-sm w-9 h-9 hover:bg-muted text-muted-foreground hover:text-foreground disabled:opacity-50 transition-all active:scale-95"
                          >
                            <Minus className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleUpdateStock(item.id, 1)}
                            disabled={isUpdating}
                            className="inline-flex items-center justify-center rounded-xl bg-background border border-border/60 shadow-sm w-9 h-9 hover:bg-muted text-muted-foreground hover:text-foreground disabled:opacity-50 transition-all active:scale-95"
                          >
                            <Plus className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </motion.div>
    </div>
  )
}
