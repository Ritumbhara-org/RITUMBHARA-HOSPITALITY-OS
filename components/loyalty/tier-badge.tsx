import { Crown, Sparkles, Star } from "lucide-react"
import { TIER_INFO, type Tier } from "@/lib/loyalty/rules"

const STYLE: Record<Tier, string> = {
  STAR: "bg-slate-100 text-slate-700 ring-slate-500/15 dark:bg-slate-500/10 dark:text-slate-300",
  ROCKSTAR: "bg-amber-50 text-amber-800 ring-amber-600/20 dark:bg-amber-500/10 dark:text-amber-300",
  SUPERSTAR: "bg-rose-50 text-rose-800 ring-rose-700/15 dark:bg-rose-500/10 dark:text-rose-300",
}

export function TierBadge({ tier, className = "" }: { tier: Tier; className?: string }) {
  const Icon = tier === "SUPERSTAR" ? Crown : tier === "ROCKSTAR" ? Sparkles : Star
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ring-inset ${STYLE[tier]} ${className}`}>
      <Icon className="h-3 w-3" />
      {TIER_INFO[tier].label}
    </span>
  )
}

// Card gradients for the member's tier (portal and admin profile header).
export const TIER_CARD: Record<Tier, string> = {
  STAR: "from-[#3b3f4a] via-[#23262e] to-[#121318]",
  ROCKSTAR: "from-[#8a6a2a] via-[#5a4216] to-[#2b1e08]",
  SUPERSTAR: "from-[#7a1430] via-[#5c0a20] to-[#2a0410]",
}
