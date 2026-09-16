"use client"

import { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Package, Plus, Search, AlertTriangle, Box, Minus, PlusCircle } from "lucide-react"
import { InventoryItem } from "@prisma/client"
import { addInventoryItem, updateInventoryQuantity } from "@/app/actions/inventory"
import { toast } from "sonner"

interface InventoryClientProps {
  initialItems: InventoryItem[]
  propertyId: string
  reporterId: string
}

export function InventoryClient({ initialItems, propertyId, reporterId }: InventoryClientProps) {
  const [items, setItems] = useState<InventoryItem[]>(initialItems)
  const [search, setSearch] = useState("")
  const [isAdding, setIsAdding] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [updatingId, setUpdatingId] = useState<string | null>(null)

  const filteredItems = items.filter(item => 
    item.name.toLowerCase().includes(search.toLowerCase()) ||
    item.category.toLowerCase().includes(search.toLowerCase())
  )

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
        propertyId,
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
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="relative max-w-sm w-full">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search inventory..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-10 w-full rounded-md border border-input bg-background pl-9 pr-4 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
          />
        </div>
        <button
          onClick={() => setIsAdding(!isAdding)}
          className="inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 bg-rose-600 text-white hover:bg-rose-600/90 h-10 px-4 py-2"
        >
          <Plus className="mr-2 h-4 w-4" />
          Add Item
        </button>
      </div>

      <AnimatePresence>
        {isAdding && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="rounded-xl border bg-card p-6 shadow-sm mb-6">
              <h3 className="text-lg font-semibold mb-4 flex items-center">
                <Box className="w-5 h-5 mr-2 text-rose-500" />
                Add New Inventory Item
              </h3>
              <form onSubmit={handleAddItem} className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
                <div className="space-y-2">
                  <label className="text-sm font-medium leading-none">Item Name</label>
                  <input required name="name" className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" placeholder="e.g. Toilet Paper" />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium leading-none">Category</label>
                  <select required name="category" className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                    <option value="TOILETRIES">Toiletries</option>
                    <option value="LINEN">Linen</option>
                    <option value="CLEANING">Cleaning</option>
                    <option value="FOOD_BEVERAGE">Food & Beverage</option>
                    <option value="MAINTENANCE">Maintenance</option>
                    <option value="OTHER">Other</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium leading-none">Initial Qty</label>
                  <input required name="quantity" type="number" min="0" className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" placeholder="e.g. 50" />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium leading-none">Unit</label>
                  <input required name="unit" className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" placeholder="e.g. Rolls, Bottles" />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium leading-none">Min Threshold</label>
                  <div className="flex items-end gap-2">
                    <input required name="minThreshold" type="number" min="0" className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" placeholder="Alert at..." />
                    <button disabled={isLoading} type="submit" className="h-10 px-4 bg-rose-600 hover:bg-rose-700 text-white rounded-md transition-colors font-medium">Save</button>
                  </div>
                </div>
              </form>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="rounded-xl border bg-card overflow-hidden">
        <div className="relative w-full overflow-auto">
          <table className="w-full caption-bottom text-sm">
            <thead className="[&_tr]:border-b bg-muted/50">
              <tr className="border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted">
                <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">Item</th>
                <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">Category</th>
                <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">Stock Level</th>
                <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">Threshold</th>
                <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">Status</th>
                <th className="h-12 px-4 text-right align-middle font-medium text-muted-foreground">Quick Action</th>
              </tr>
            </thead>
            <tbody className="[&_tr:last-child]:border-0">
              {filteredItems.length === 0 ? (
                <tr>
                  <td colSpan={6} className="h-24 text-center text-muted-foreground">
                    No inventory items found.
                  </td>
                </tr>
              ) : (
                filteredItems.map((item) => {
                  const isLowStock = item.quantity < item.minThreshold
                  const isUpdating = updatingId === item.id

                  return (
                    <tr key={item.id} className="border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted">
                      <td className="p-4 align-middle font-medium">
                        <div className="flex items-center gap-2">
                          <Package className="w-4 h-4 text-rose-500" />
                          {item.name}
                        </div>
                      </td>
                      <td className="p-4 align-middle">
                        <span className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold bg-secondary/50 text-secondary-foreground">
                          {item.category.replace('_', ' ')}
                        </span>
                      </td>
                      <td className="p-4 align-middle">
                        <div className="flex items-center gap-2">
                          <span className={`text-lg font-bold ${isLowStock ? 'text-red-500' : ''}`}>
                            {item.quantity}
                          </span>
                          <span className="text-xs text-muted-foreground">{item.unit}</span>
                        </div>
                      </td>
                      <td className="p-4 align-middle text-muted-foreground">
                        {item.minThreshold} {item.unit}
                      </td>
                      <td className="p-4 align-middle">
                        {isLowStock ? (
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-medium text-red-800 dark:bg-red-900/30 dark:text-red-400">
                            <AlertTriangle className="w-3.5 h-3.5" />
                            Low Stock
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800 dark:bg-green-900/30 dark:text-green-400">
                            <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
                            Healthy
                          </span>
                        )}
                      </td>
                      <td className="p-4 align-middle text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => handleUpdateStock(item.id, -1)}
                            disabled={isUpdating || item.quantity <= 0}
                            className="inline-flex items-center justify-center rounded-md w-8 h-8 hover:bg-muted text-muted-foreground hover:text-foreground disabled:opacity-50"
                          >
                            <Minus className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleUpdateStock(item.id, 1)}
                            disabled={isUpdating}
                            className="inline-flex items-center justify-center rounded-md w-8 h-8 hover:bg-muted text-muted-foreground hover:text-foreground disabled:opacity-50"
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
      </div>
    </div>
  )
}
