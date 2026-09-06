"use client"

import { useState } from "react"
import { motion } from "framer-motion"
import { Search, Loader2, Sparkles, Copy, CheckCircle2, AlertCircle } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"

export function SeoClient({ properties }: { properties: any[] }) {
  const [isLoading, setIsLoading] = useState(false)
  const [result, setResult] = useState<any | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copiedKeys, setCopiedKeys] = useState<Record<string, boolean>>({})

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setIsLoading(true)
    setError(null)
    setResult(null)

    const formData = new FormData(e.currentTarget)
    
    // Parse amenities string into array
    const amenitiesStr = formData.get("amenities") as string
    const amenities = amenitiesStr.split(",").map(a => a.trim()).filter(Boolean)

    const payload = {
      propertyName: formData.get("propertyName"),
      location: formData.get("location"),
      city: formData.get("city"),
      state: formData.get("state"),
      country: formData.get("country") || "India",
      amenities,
      description: formData.get("description"),
      propertyType: formData.get("propertyType"),
      starRating: formData.get("starRating") ? parseInt(formData.get("starRating") as string) : undefined,
      priceRange: formData.get("priceRange")
    }

    try {
      const res = await fetch("/api/seo", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      })

      const data = await res.json()
      
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to generate SEO package")
      }

      setResult(data.data)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setIsLoading(false)
    }
  }

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text)
    setCopiedKeys({ ...copiedKeys, [key]: true })
    setTimeout(() => {
      setCopiedKeys(prev => ({ ...prev, [key]: false }))
    }, 2000)
  }

  return (
    <div className="flex flex-col flex-1 h-full w-full gap-6 pb-4 min-h-0">
      <div className="flex flex-col gap-2 shrink-0">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
          <Sparkles className="h-6 w-6 text-indigo-500" />
          SEO Automation
        </h1>
        <p className="text-muted-foreground text-sm max-w-2xl">
          Instantly generate comprehensive Meta tags, FAQs, H1/H2 structures, and JSON-LD Schema markup for your properties.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 min-h-0 flex-1">
        {/* Input Form */}
        <div className="lg:col-span-4 flex flex-col h-full bg-card border rounded-xl shadow-sm overflow-hidden shrink-0">
          <div className="p-4 border-b font-semibold bg-slate-50/50 dark:bg-slate-900/50 shrink-0">
            Property Details
          </div>
          <div className="p-4 overflow-y-auto flex-1 custom-scrollbar">
            <form id="seo-form" onSubmit={handleSubmit} className="flex flex-col gap-4">
              <div className="grid gap-2">
                <Label htmlFor="propertyName">Property Name *</Label>
                <Input id="propertyName" name="propertyName" placeholder="e.g. Ritumbhara Megacity" required />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="propertyType">Property Type *</Label>
                <Select name="propertyType" defaultValue="hotel">
                  <SelectTrigger>
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="hotel">Hotel</SelectItem>
                    <SelectItem value="resort">Resort</SelectItem>
                    <SelectItem value="villa">Villa</SelectItem>
                    <SelectItem value="boutique hotel">Boutique Hotel</SelectItem>
                    <SelectItem value="serviced apartment">Serviced Apartment</SelectItem>
                    <SelectItem value="guesthouse">Guesthouse</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="starRating">Star Rating</Label>
                  <Input id="starRating" name="starRating" type="number" min="1" max="5" placeholder="e.g. 5" />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="priceRange">Price Range</Label>
                  <Input id="priceRange" name="priceRange" placeholder="e.g. ₹2000 - ₹8000" />
                </div>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="location">Street / Area Location *</Label>
                <Input id="location" name="location" placeholder="e.g. Patia, Near KIIT" required />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="city">City *</Label>
                  <Input id="city" name="city" placeholder="e.g. Bhubaneswar" required />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="state">State</Label>
                  <Input id="state" name="state" placeholder="e.g. Odisha" />
                </div>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="amenities">Amenities (Comma separated) *</Label>
                <Textarea 
                  id="amenities" 
                  name="amenities" 
                  placeholder="Free WiFi, Swimming Pool, Spa, Free Parking" 
                  className="min-h-[60px]"
                  required 
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="description">Short Description *</Label>
                <Textarea 
                  id="description" 
                  name="description" 
                  placeholder="A brief description of what makes this property special..." 
                  className="min-h-[100px]"
                  required 
                />
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="mt-2 w-full inline-flex items-center justify-center gap-2 rounded-md bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white shadow hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-50 transition-colors"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> Generating Package...
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4" /> Generate SEO Package
                  </>
                )}
              </button>
            </form>
          </div>
        </div>

        {/* Results Pane */}
        <div className="lg:col-span-8 flex flex-col h-full bg-slate-50/50 dark:bg-slate-900/20 border rounded-xl overflow-hidden shrink-0">
          <div className="p-4 border-b font-semibold bg-white dark:bg-slate-900 shrink-0">
            SEO Outputs
          </div>
          <div className="p-4 overflow-y-auto flex-1 custom-scrollbar">
            {!result && !isLoading && !error && (
              <div className="h-full flex flex-col items-center justify-center text-muted-foreground opacity-60">
                <Sparkles className="h-12 w-12 mb-4" />
                <p>Fill out the property details and generate to see results.</p>
              </div>
            )}

            {error && (
              <div className="p-4 rounded-lg bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400 border border-red-200 dark:border-red-900/50 flex items-start gap-3">
                <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
                <div className="text-sm">{error}</div>
              </div>
            )}

            {isLoading && (
              <div className="h-full flex flex-col items-center justify-center text-muted-foreground">
                <Loader2 className="h-8 w-8 animate-spin mb-4 text-indigo-500" />
                <p>Analyzing and generating SEO structures...</p>
              </div>
            )}

            {result && !isLoading && (
              <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex flex-col gap-6"
              >
                {/* Meta Tags */}
                <div className="flex flex-col gap-3">
                  <h3 className="font-semibold text-slate-900 dark:text-white">Meta Tags</h3>
                  
                  <div className="relative group rounded-lg border bg-white dark:bg-slate-900 p-4 shadow-sm">
                    <p className="text-xs font-semibold text-slate-500 mb-1 uppercase tracking-wider">Meta Title ({result.metaTitle.length} chars)</p>
                    <p className="text-sm font-medium text-slate-900 dark:text-slate-100 pr-8">{result.metaTitle}</p>
                    <button 
                      onClick={() => copyToClipboard(result.metaTitle, 'metaTitle')}
                      className="absolute right-3 top-3 p-2 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 transition-colors"
                    >
                      {copiedKeys['metaTitle'] ? <CheckCircle2 className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
                    </button>
                  </div>

                  <div className="relative group rounded-lg border bg-white dark:bg-slate-900 p-4 shadow-sm">
                    <p className="text-xs font-semibold text-slate-500 mb-1 uppercase tracking-wider">Meta Description ({result.metaDescription.length} chars)</p>
                    <p className="text-sm text-slate-700 dark:text-slate-300 pr-8">{result.metaDescription}</p>
                    <button 
                      onClick={() => copyToClipboard(result.metaDescription, 'metaDesc')}
                      className="absolute right-3 top-3 p-2 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 transition-colors"
                    >
                      {copiedKeys['metaDesc'] ? <CheckCircle2 className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                {/* Headings */}
                <div className="flex flex-col gap-3">
                  <h3 className="font-semibold text-slate-900 dark:text-white">Headings & Content</h3>
                  
                  <div className="relative group rounded-lg border bg-white dark:bg-slate-900 p-4 shadow-sm">
                    <p className="text-xs font-semibold text-slate-500 mb-1 uppercase tracking-wider">H1 Heading</p>
                    <p className="text-sm font-bold text-slate-900 dark:text-slate-100 text-2xl pr-8">{result.h1}</p>
                    <button 
                      onClick={() => copyToClipboard(result.h1, 'h1')}
                      className="absolute right-3 top-3 p-2 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 transition-colors"
                    >
                      {copiedKeys['h1'] ? <CheckCircle2 className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
                    </button>
                  </div>

                  <div className="relative group rounded-lg border bg-white dark:bg-slate-900 p-4 shadow-sm">
                    <p className="text-xs font-semibold text-slate-500 mb-2 uppercase tracking-wider">H2 Headings</p>
                    <ul className="list-disc list-inside text-sm text-slate-700 dark:text-slate-300 space-y-1">
                      {result.h2s.map((h2: string, i: number) => (
                        <li key={i}>{h2}</li>
                      ))}
                    </ul>
                    <button 
                      onClick={() => copyToClipboard(result.h2s.join("\n"), 'h2')}
                      className="absolute right-3 top-3 p-2 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 transition-colors"
                    >
                      {copiedKeys['h2'] ? <CheckCircle2 className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                {/* Image ALTs */}
                <div className="flex flex-col gap-3">
                  <h3 className="font-semibold text-slate-900 dark:text-white">Image ALT Text Suggestions</h3>
                  <div className="relative group rounded-lg border bg-white dark:bg-slate-900 p-4 shadow-sm">
                    <ul className="list-disc list-inside text-sm text-slate-700 dark:text-slate-300 space-y-1">
                      {result.imageAlts.map((alt: string, i: number) => (
                        <li key={i}>{alt}</li>
                      ))}
                    </ul>
                    <button 
                      onClick={() => copyToClipboard(result.imageAlts.join("\n"), 'alts')}
                      className="absolute right-3 top-3 p-2 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 transition-colors"
                    >
                      {copiedKeys['alts'] ? <CheckCircle2 className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                {/* FAQs */}
                <div className="flex flex-col gap-3">
                  <h3 className="font-semibold text-slate-900 dark:text-white">Frequently Asked Questions</h3>
                  <div className="relative group rounded-lg border bg-white dark:bg-slate-900 p-4 shadow-sm flex flex-col gap-4">
                    {result.faqs.map((faq: any, i: number) => (
                      <div key={i} className="border-b last:border-0 pb-3 last:pb-0">
                        <p className="font-medium text-sm text-slate-900 dark:text-white mb-1">Q: {faq.question}</p>
                        <p className="text-sm text-slate-600 dark:text-slate-400">A: {faq.answer}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Schema Markup */}
                <div className="flex flex-col gap-3">
                  <h3 className="font-semibold text-slate-900 dark:text-white">JSON-LD Schema Markup</h3>
                  <div className="relative group rounded-lg border bg-slate-900 p-4 shadow-sm overflow-hidden">
                    <pre className="text-xs text-green-400 font-mono overflow-x-auto custom-scrollbar pb-2">
                      {JSON.stringify(result.schemaMarkup, null, 2)}
                    </pre>
                    <button 
                      onClick={() => copyToClipboard(JSON.stringify(result.schemaMarkup, null, 2), 'schema')}
                      className="absolute right-3 top-3 p-2 rounded-md bg-white/10 hover:bg-white/20 text-white transition-colors"
                    >
                      {copiedKeys['schema'] ? <CheckCircle2 className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

              </motion.div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
