import { CheckCircle2, Clock, Eye, FileSignature, Send, XCircle } from "lucide-react"
import { BADGE_LABEL, type AgreementBadge } from "@/lib/long-stay/agreement"
import { statusLabel } from "@/lib/long-stay/shared"

const pill = "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ring-inset"

const STATUS_STYLE: Record<string, string> = {
  UPCOMING: "bg-emerald-50 text-emerald-700 ring-emerald-600/15 dark:bg-emerald-500/10 dark:text-emerald-400 dark:ring-emerald-500/20",
  CHECKED_IN: "bg-blue-50 text-blue-700 ring-blue-700/10 dark:bg-blue-500/10 dark:text-blue-400 dark:ring-blue-500/20",
  CHECKED_OUT: "bg-slate-100 text-slate-600 ring-slate-500/10 dark:bg-slate-500/10 dark:text-slate-400 dark:ring-slate-500/20",
  CANCELLED: "bg-rose-50 text-rose-700 ring-rose-600/10 dark:bg-rose-500/10 dark:text-rose-400 dark:ring-rose-500/20",
}

export function StatusBadge({ status }: { status: string }) {
  const Icon = status === "UPCOMING" ? Clock : status === "CANCELLED" ? XCircle : CheckCircle2
  return (
    <span className={`${pill} ${STATUS_STYLE[status] ?? STATUS_STYLE.CHECKED_OUT}`}>
      <Icon className="h-3 w-3" /> {statusLabel(status)}
    </span>
  )
}

const AGREEMENT_STYLE: Record<AgreementBadge, string> = {
  NOT_SENT: "bg-slate-50 text-slate-500 ring-slate-500/10 dark:bg-slate-500/10 dark:text-slate-400",
  SENT: "bg-amber-50 text-amber-700 ring-amber-600/15 dark:bg-amber-500/10 dark:text-amber-400",
  VIEWED: "bg-violet-50 text-violet-700 ring-violet-600/15 dark:bg-violet-500/10 dark:text-violet-400",
  SIGNED: "bg-emerald-50 text-emerald-700 ring-emerald-600/15 dark:bg-emerald-500/10 dark:text-emerald-400",
  VOIDED: "bg-rose-50 text-rose-700 ring-rose-600/10 dark:bg-rose-500/10 dark:text-rose-400",
}

export function AgreementBadgePill({ badge }: { badge: AgreementBadge }) {
  const Icon = badge === "SIGNED" ? CheckCircle2 : badge === "VIEWED" ? Eye : badge === "SENT" ? Send : badge === "VOIDED" ? XCircle : FileSignature
  return (
    <span className={`${pill} ${AGREEMENT_STYLE[badge]}`} title="E-sign agreement">
      <Icon className="h-3 w-3" /> {BADGE_LABEL[badge]}
    </span>
  )
}
