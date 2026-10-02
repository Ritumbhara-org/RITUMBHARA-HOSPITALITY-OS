import { Loader2 } from "lucide-react"

export default function Loading() {
  return (
    <div className="flex h-full w-full items-center justify-center bg-white/50 backdrop-blur-sm">
      <div className="flex flex-col items-center gap-4 p-8 rounded-2xl bg-white shadow-xl shadow-rose-900/5 border border-rose-100">
        <div className="relative">
          <div className="absolute inset-0 rounded-full blur-md bg-rose-400/30 animate-pulse"></div>
          <Loader2 className="h-10 w-10 text-rose-600 animate-spin relative z-10" />
        </div>
        <div className="flex flex-col items-center gap-1">
          <h3 className="text-sm font-semibold text-gray-900">Loading details...</h3>
          <p className="text-xs text-gray-500">Fetching latest data securely</p>
        </div>
      </div>
    </div>
  )
}
