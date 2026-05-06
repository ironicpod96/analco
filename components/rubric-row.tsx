import type { ReactNode } from "react"

import { ScoreDots } from "@/components/score-dots"
import { SourcePill } from "@/components/source-pill"
import { effectiveScore } from "@/lib/rubric"
import type { AutoScore, HybridScore, ManualScore, RubricScale } from "@/lib/types"

export function RubricRow({
  label,
  row,
  evidence,
  onChange,
  controls,
}: {
  label: string
  row: AutoScore | HybridScore | ManualScore
  evidence?: ReactNode
  onChange?: (next: RubricScale) => void
  controls?: ReactNode
}) {
  const isHybrid = row.source !== "auto" && row.source !== "manual"
  const ghost = isHybrid && row.score == null ? (row as HybridScore).aiSuggested : null
  const display = effectiveScore(row)
  const manualScored = row.source === "manual" ? row.score != null : undefined

  return (
    <div className="space-y-1.5 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium leading-tight">{label}</div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <ScoreDots
            score={(row.source === "auto" ? row.score : row.score) as RubricScale | null}
            ghost={ghost as RubricScale | null}
            onChange={onChange}
            ariaLabel={`${label} score`}
          />
          <SourcePill row={row} manualScored={manualScored} />
        </div>
      </div>
      {evidence != null && (
        <p className="text-xs leading-snug text-muted-foreground">
          {evidence}
        </p>
      )}
      {controls != null && <div>{controls}</div>}
      {display == null && row.source !== "manual" && row.source !== "ai_pending" && null}
    </div>
  )
}
