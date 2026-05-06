import type {
  AutoScore,
  ExtractedMetrics,
  HybridScore,
  ManualScore,
  RubricKey,
  RubricScale,
  RubricScores,
} from "@/lib/types"

export const RUBRIC_ORDER: RubricKey[] = [
  "loadingSpeed",
  "firstImpression",
  "navigation",
  "taskCompletion",
  "visualHierarchy",
  "consistency",
  "accessibility",
  "helpSupport",
  "uxScoring",
]

export const RUBRIC_LABELS: Record<RubricKey, string> = {
  loadingSpeed: "Loading Speed",
  firstImpression: "First Impression",
  navigation: "Navigation",
  taskCompletion: "Task Completion & Goal-driven",
  visualHierarchy: "Visual Hierarchy",
  consistency: "Consistency",
  accessibility: "Accessibility",
  helpSupport: "Help & Support",
  uxScoring: "UX Scoring",
}

const ROLLUP_KEYS: Exclude<RubricKey, "uxScoring">[] = [
  "loadingSpeed",
  "firstImpression",
  "navigation",
  "taskCompletion",
  "visualHierarchy",
  "consistency",
  "accessibility",
  "helpSupport",
]

/**
 * Lighthouse score (0..1) → 1..5 dot scale.
 * 90+ = 5, 70–89 = 4, 50–69 = 3, 30–49 = 2, <30 = 1.
 */
export function scoreFromLighthouse(score: number): RubricScale {
  const pct = Math.round(score * 100)
  if (pct >= 90) return 5
  if (pct >= 70) return 4
  if (pct >= 50) return 3
  if (pct >= 30) return 2
  return 1
}

export function buildLoadingSpeed(metrics: ExtractedMetrics): AutoScore {
  const score = scoreFromLighthouse(metrics.scores.performance)
  const evidence = `Performance ${Math.round(metrics.scores.performance * 100)} · LCP ${formatMs(
    metrics.cwv.lcp
  )} · INP ${formatMs(metrics.cwv.inp)} · CLS ${metrics.cwv.cls.toFixed(2)}`
  return { score, source: "auto", evidence }
}

export function buildAccessibility(metrics: ExtractedMetrics): AutoScore {
  const score = scoreFromLighthouse(metrics.scores.accessibility)
  const evidence = `Lighthouse Accessibility ${Math.round(metrics.scores.accessibility * 100)}`
  return { score, source: "auto", evidence }
}

export function emptyHybrid(): HybridScore {
  return {
    score: null,
    source: "ai_pending",
    aiSuggested: null,
    aiReasoning: "",
  }
}

export function emptyManual(): ManualScore {
  return { score: null, source: "manual" }
}

export function initialRubric(metrics: ExtractedMetrics): RubricScores {
  const loadingSpeed = buildLoadingSpeed(metrics)
  const accessibility = buildAccessibility(metrics)
  const initial: RubricScores = {
    loadingSpeed,
    firstImpression: emptyHybrid(),
    navigation: emptyHybrid(),
    taskCompletion: emptyManual(),
    visualHierarchy: emptyHybrid(),
    consistency: emptyManual(),
    accessibility,
    helpSupport: emptyHybrid(),
    uxScoring: { aiRollup: 0, userOverride: null },
  }
  initial.uxScoring.aiRollup = computeRollup(initial)
  return initial
}

/**
 * Equal-weighted average over the 8 input rows. Uses each row's effective
 * score: auto = score; hybrid = score (if user-touched) or aiSuggested;
 * manual = score (or 0 if not yet scored). Rows without any score contribute 0.
 */
export function computeRollup(rubric: RubricScores): number {
  let total = 0
  let count = 0
  for (const key of ROLLUP_KEYS) {
    const v = effectiveScore(rubric[key])
    if (v != null) {
      total += v
      count += 1
    }
  }
  return count === 0 ? 0 : total / ROLLUP_KEYS.length
}

export function effectiveScore(
  row: AutoScore | HybridScore | ManualScore
): number | null {
  if (row.source === "auto") return row.score
  if (row.source === "manual") return row.score
  if (row.score != null) return row.score
  return row.aiSuggested
}

export function isScored(row: AutoScore | HybridScore | ManualScore): boolean {
  if (row.source === "auto") return true
  if (row.source === "manual") return row.score != null
  return row.source === "confirmed" || row.source === "manual_override"
}

export function toneFor(score: number | null): "green" | "yellow" | "red" | "neutral" {
  if (score == null) return "neutral"
  if (score >= 4) return "green"
  if (score >= 3) return "yellow"
  return "red"
}

function formatMs(value: number): string {
  if (!value) return "—"
  return value > 1000 ? `${(value / 1000).toFixed(1)}s` : `${Math.round(value)}ms`
}
