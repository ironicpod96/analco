"use client"

import { useState } from "react"

import type { RubricScale } from "@/lib/types"
import { cn } from "@/lib/utils"

const TONE: Record<"green" | "yellow" | "red" | "neutral", string> = {
  green: "bg-emerald-500",
  yellow: "bg-amber-500",
  red: "bg-rose-500",
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
  onChange,
  size = "md",
  ariaLabel,
}: {
  score: RubricScale | null
  /** A subdued preview score (e.g. AI suggestion before confirmation). */
  ghost?: RubricScale | null
  onChange?: (next: RubricScale) => void
  size?: "sm" | "md"
  ariaLabel?: string
}) {
  const [hover, setHover] = useState<RubricScale | null>(null)
  const interactive = !!onChange

  const display = hover ?? score ?? ghost ?? null
  const filled = display ?? 0
  const t = TONE[tone(display)]
  const dim = ghost != null && score == null && hover == null

  const dot = size === "sm" ? "h-1.5 w-1.5" : "h-2 w-2"

  return (
    <div
      className={cn("flex items-center gap-1", interactive && "cursor-pointer")}
      role={interactive ? "radiogroup" : undefined}
      aria-label={ariaLabel}
      onMouseLeave={() => setHover(null)}
    >
      {[1, 2, 3, 4, 5].map((n) => {
        const on = n <= filled
        const Tag = interactive ? "button" : "span"
        return (
          <Tag
            key={n}
            type={interactive ? "button" : undefined}
            role={interactive ? "radio" : undefined}
            aria-checked={interactive ? score === n : undefined}
            aria-label={interactive ? `Score ${n}` : undefined}
            onMouseEnter={interactive ? () => setHover(n as RubricScale) : undefined}
            onClick={interactive ? () => onChange?.(n as RubricScale) : undefined}
            className={cn(
              "rounded-full transition-opacity",
              dot,
              on ? t : "bg-muted-foreground/20",
              dim && "opacity-50",
              interactive && "hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            )}
          />
        )
      })}
    </div>
  )
}
