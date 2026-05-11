import type {
  AutoScore,
  ExtractedMetrics,
  HybridScore,
  ManualScore,
  RubricKey,
  RubricScale,
  RubricScores,
  SiteAudit,
} from "@/lib/types"

/**
 * Scoring model — per-category formula
 *
 * | Category         | AI input                | Human input                                       | Score formula                         |
 * |------------------|-------------------------|---------------------------------------------------|---------------------------------------|
 * | Page Performance | PageSpeed score (auto)  | none                                              | PageSpeed score directly              |
 * | First Impression | AI score + AI labels    | scope toggle (hero / full page)                   | AI score directly; AI also returns   |
 * |                  | (CTA above fold yes/no, |                                                   |   labels rendered under the verdict   |
 * |                  |  Hero clarity clear/    |                                                   |                                       |
 * |                  |  confusing)             |                                                   |                                       |
 * | Navigation       | none                    | 3 radios (label, path, navbar) + L1 item count    | sum of radios; L1 count > 7 surfaces  |
 * |                  |                         |                                                   | Miller's Law via the insight panel    |
 * | Task Completion  | none                    | 3 radios (interrupted, ease, duration)            | weighted sum of all signals           |
 * | Visual Hierarchy | none                    | 5 radios (scan, font, whitespace, section colors, | weighted sum                          |
 * |                  |                         |   CTA placement)                                  |                                       |
 * | Consistency      | none                    | 4 radios + 2 checkboxes (terminology shifts,      | sum of radios minus flag penalties    |
 * |                  |                         |   content availability issue)                     |                                       |
 * | Accessibility    | PageSpeed score (auto)  | none                                              | PageSpeed score directly              |
 * | Help & Support   | none                    | 2 radios (support access, FAQ helpfulness)        | sum weighted score                    |
 *
 * Mini-scale convention: 0 = left label, 1 = mid, 2 = right label.
 * The `firstImpression.scope` toggle ("hero" | "full") chooses which screenshot the
 * AI prompt scores against and is recorded in rubricSignals.firstImpression.scope.
 */

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
  loadingSpeed: "Page Performance",
  firstImpression: "First Impression",
  navigation: "Navigation",
  taskCompletion: "Task Completion",
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
 * Lighthouse score (0..1) → 1..3 scale.
 * 90+ = 3 (green), 50–89 = 2 (yellow), <50 = 1 (red).
 */
export function scoreFromLighthouse(score: number): RubricScale {
  const pct = Math.round(score * 100)
  if (pct >= 90) return 3
  if (pct >= 50) return 2
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
  const failed = metrics.audits.accessibilityInsights.reduce(
    (total, group) => total + group.items.length,
    0
  )
  const evidence = `Lighthouse Accessibility ${Math.round(metrics.scores.accessibility * 100)}${failed ? ` · ${failed} issue${failed === 1 ? "" : "s"} flagged` : ""
    }`
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
  if (row.source === "manual_override") return null
  return row.aiSuggested
}

export function isScored(row: AutoScore | HybridScore | ManualScore): boolean {
  if (row.source === "auto") return true
  if (row.source === "manual") return row.score != null
  return row.source === "confirmed" || row.source === "manual_override"
}

export function toneFor(score: number | null): "green" | "yellow" | "red" | "neutral" {
  if (score == null) return "neutral"
  if (score >= 3) return "green"
  if (score >= 2) return "yellow"
  return "red"
}

const SCORE_COLORS: Record<RubricScale, string> = {
  1: "bg-red-500",
  2: "bg-amber-500",
  3: "bg-green-500",
}

export function colorForScore(score: RubricScale | null): string {
  if (score == null) return "bg-muted-foreground/40"
  return SCORE_COLORS[score]
}

/**
 * Returns the effective score for a rubric key, recomputing auto-scored rows
 * (loadingSpeed, accessibility) fresh from live metrics rather than stored rubric
 * values, which can be stale if thresholds changed since the run was saved.
 */
export function liveScore(audit: SiteAudit, key: RubricKey): number | null {
  if (key === "loadingSpeed") return scoreFromLighthouse(audit.metrics.scores.performance)
  if (key === "accessibility") return scoreFromLighthouse(audit.metrics.scores.accessibility)
  if (key === "uxScoring") return audit.rubric.uxScoring.userOverride ?? audit.rubric.uxScoring.aiRollup ?? null
  return effectiveScore(audit.rubric[key] as AutoScore | HybridScore | ManualScore)
}

function formatMs(value: number): string {
  if (!value) return "—"
  return value > 1000 ? `${(value / 1000).toFixed(1)}s` : `${Math.round(value)}ms`
}

