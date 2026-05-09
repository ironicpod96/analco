import type { RubricScale } from "@/lib/types"
import { cn } from "@/lib/utils"

const TONE: Record<"green" | "yellow" | "red" | "neutral", string> = {
  green: "bg-green-500",
  yellow: "bg-amber-500",
  red: "bg-red-500",
  neutral: "bg-muted-foreground/40",
}

function tone(score: number | null): "green" | "yellow" | "red" | "neutral" {
  if (score == null) return "neutral"
  if (score >= 4) return "green"
  if (score >= 3) return "yellow"
  return "red"
}

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
  const t = TONE[tone(display)]

  return (
    <span
      role="img"
      aria-label={ariaLabel}
      className={cn("h-3 w-3 shrink-0 rounded-full", t)}
    />
  )
}
