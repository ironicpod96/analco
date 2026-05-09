import { Badge } from "@/components/ui/badge"
import type { AutoScore, HybridScore, ManualScore } from "@/lib/types"
import { cn } from "@/lib/utils"

type Source = "auto" | "ai_pending" | "ai_suggested" | "confirmed" | "manual_override" | "manual"

const LABELS: Record<Source, string> = {
  auto: "Auto",
  ai_pending: "Pending…",
  ai_suggested: "AI suggested",
  confirmed: "Confirmed",
  manual_override: "Manual override",
  manual: "Manual",
}

const STYLES: Record<Source, string> = {
  auto: "border-transparent bg-muted text-muted-foreground",
  ai_pending: "border-transparent bg-muted text-muted-foreground",
  ai_suggested: "border-violet-500/30 bg-violet-500/10 text-violet-700 dark:text-violet-300",
  confirmed: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  manual_override: "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300",
  manual: "border-transparent bg-muted text-muted-foreground",
}

export function SourcePill({
  row,
  manualScored,
}: {
  row: AutoScore | HybridScore | ManualScore
  /** For manual rows: whether the user has actually scored it yet. */
  manualScored?: boolean
}) {
  const source: Source =
    row.source === "manual" && manualScored === false ? "manual" : (row.source as Source)
  return (
    <Badge variant="outline" className={cn("h-5 rounded-full px-2 text-xs font-medium", STYLES[source])}>
      {LABELS[source]}
    </Badge>
  )
}
