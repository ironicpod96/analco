import { colorForScore } from "@/lib/rubric"
import type { RubricScale } from "@/lib/types"
import { cn } from "@/lib/utils"

export function ScoreDots({
  score,
  ghost,
  ariaLabel,
}: {
  score: RubricScale | null
  /** A subdued preview score (e.g. AI suggestion before confirmation). */
  ghost?: RubricScale | null
  ariaLabel?: string
}) {
  const display = score ?? ghost ?? null

  return (
    <span
      role="img"
      aria-label={ariaLabel}
      className={cn("h-3 w-3 shrink-0 rounded-full", colorForScore(display))}
    />
  )
}
