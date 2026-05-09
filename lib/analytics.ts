import { effectiveScore } from "@/lib/rubric"
import type {
  ConsistencySignals,
  HelpSupportSignals,
  NavigationSignals,
  PrincipleRef,
  RubricKey,
  RubricSignals,
  SiteAudit,
  TaskCompletionSignals,
  VisualHierarchySignals,
} from "@/lib/types"
import {
  buildConsistencyInsight,
  buildNavigationInsight,
  buildVisualHierarchyInsight,
  type RubricInsight,
} from "@/lib/rubric-insights"
function hostFromUrl(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "")
  } catch {
    return url
  }
}

function siteNameFromUrl(url: string): string {
  const host = hostFromUrl(url)
  const parts = host.split(".")
  const root = parts.length >= 2 ? parts[parts.length - 2] : parts[0]
  if (!root) return host
  return root.charAt(0).toUpperCase() + root.slice(1)
}

export type AnalyticsCategoryKey =
  | "loadingSpeed"
  | "firstImpression"
  | "navigation"
  | "taskCompletion"
  | "visualHierarchy"
  | "consistency"
  | "accessibility"
  | "helpSupport"

export const ANALYTICS_CATEGORIES: { key: AnalyticsCategoryKey; label: string; rubricKey: RubricKey }[] = [
  { key: "loadingSpeed", label: "Page Performance", rubricKey: "loadingSpeed" },
  { key: "firstImpression", label: "First Impression", rubricKey: "firstImpression" },
  { key: "navigation", label: "Navigation", rubricKey: "navigation" },
  { key: "taskCompletion", label: "Task Completion", rubricKey: "taskCompletion" },
  { key: "visualHierarchy", label: "Visual Hierarchy", rubricKey: "visualHierarchy" },
  { key: "consistency", label: "Consistency", rubricKey: "consistency" },
  { key: "accessibility", label: "Accessibility", rubricKey: "accessibility" },
  { key: "helpSupport", label: "Help & Support", rubricKey: "helpSupport" },
]

const COMPETITOR_PALETTE = Array(8).fill("#999999")

export type SiteMeta = {
  url: string
  host: string
  isClient: boolean
  color: string
  label: string
}

export function buildSiteMeta(audits: SiteAudit[]): SiteMeta[] {
  let palette = 0
  return audits.map((audit) => {
    const isClient = !!audit.isClient
    return {
      url: audit.url,
      host: hostFromUrl(audit.url) || audit.url,
      isClient,
      color: isClient ? "#ffffff" : COMPETITOR_PALETTE[palette++ % COMPETITOR_PALETTE.length],
      label: siteNameFromUrl(audit.url),
    }
  })
}

export function categoryScore(audit: SiteAudit, key: AnalyticsCategoryKey): number | null {
  const rubricKey = ANALYTICS_CATEGORIES.find((c) => c.key === key)!.rubricKey
  const row = audit.rubric[rubricKey]
  if (!row) return null
  const value = effectiveScore(row as never)
  return value == null ? null : Number(value)
}

export function missingCategories(audit: SiteAudit): string[] {
  return ANALYTICS_CATEGORIES.filter((c) => categoryScore(audit, c.key) == null).map((c) => c.label)
}

export type RadarPoint = { category: string } & Record<string, number | string | null>

export function buildRadarData(audits: SiteAudit[], sites: SiteMeta[]): RadarPoint[] {
  return ANALYTICS_CATEGORIES.map((cat) => {
    const point: RadarPoint = { category: cat.label }
    audits.forEach((audit, i) => {
      point[sites[i].url] = categoryScore(audit, cat.key)
    })
    return point
  })
}

// ---- Criteria heatmap -------------------------------------------------------

export type CriterionRow = {
  label: string
  cells: Array<{ url: string; tone: "green" | "amber" | "red" | "neutral"; display: string }>
}

const TONE_FROM_MINI: Record<0 | 1 | 2, "red" | "amber" | "green"> = {
  0: "red",
  1: "amber",
  2: "green",
}

function fromMini(value: 0 | 1 | 2 | null | undefined): { tone: "green" | "amber" | "red" | "neutral"; display: string } {
  if (value == null) return { tone: "neutral", display: "—" }
  return { tone: TONE_FROM_MINI[value], display: value === 0 ? "Low" : value === 1 ? "Mid" : "High" }
}

function fromBool(
  value: boolean | null | undefined,
  trueIs: "good" | "bad"
): { tone: "green" | "amber" | "red" | "neutral"; display: string } {
  if (value == null) return { tone: "neutral", display: "—" }
  const isGood = trueIs === "good" ? value === true : value === false
  return {
    tone: isGood ? "green" : "red",
    display: value ? "Yes" : "No",
  }
}

function fromCategoryScore(score: number | null): { tone: "green" | "amber" | "red" | "neutral"; display: string } {
  if (score == null) return { tone: "neutral", display: "—" }
  if (score >= 4) return { tone: "green", display: score.toFixed(1) }
  if (score >= 3) return { tone: "amber", display: score.toFixed(1) }
  return { tone: "red", display: score.toFixed(1) }
}

const TASK_INTERRUPTED: Record<NonNullable<TaskCompletionSignals["interrupted"]>, 0 | 1 | 2> = {
  no: 2,
  somewhat: 1,
  frequently: 0,
}
const TASK_EASE: Record<NonNullable<TaskCompletionSignals["ease"]>, 0 | 1 | 2> = {
  easy: 2,
  ok: 1,
  hard: 0,
}
const TASK_DURATION: Record<NonNullable<TaskCompletionSignals["duration"]>, 0 | 1 | 2> = {
  quick: 2,
  moderate: 1,
  long: 0,
}

export function buildCriteriaRows(
  category: AnalyticsCategoryKey,
  audits: SiteAudit[]
): CriterionRow[] {
  const rows: CriterionRow[] = []
  const push = (
    label: string,
    map: (signals: RubricSignals | undefined, audit: SiteAudit) =>
      | { tone: "green" | "amber" | "red" | "neutral"; display: string }
      | null
  ) => {
    rows.push({
      label,
      cells: audits.map((audit) => {
        const out = map(audit.rubricSignals, audit) ?? { tone: "neutral" as const, display: "—" }
        return { url: audit.url, ...out }
      }),
    })
  }

  if (category === "loadingSpeed") {
    push("Performance score", (_s, audit) => {
      const pct = Math.round((audit.metrics?.scores?.performance ?? 0) * 100)
      if (!audit.metrics) return { tone: "neutral", display: "—" }
      return {
        tone: pct >= 90 ? "green" : pct >= 50 ? "amber" : "red",
        display: String(pct),
      }
    })
    push("LCP", (_s, audit) => {
      const v = audit.metrics?.cwv?.lcp
      if (v == null) return { tone: "neutral", display: "—" }
      return {
        tone: v <= 2500 ? "green" : v <= 4000 ? "amber" : "red",
        display: v > 1000 ? `${(v / 1000).toFixed(1)}s` : `${Math.round(v)}ms`,
      }
    })
    push("INP", (_s, audit) => {
      const v = audit.metrics?.cwv?.inp
      if (v == null) return { tone: "neutral", display: "—" }
      return {
        tone: v <= 200 ? "green" : v <= 500 ? "amber" : "red",
        display: `${Math.round(v)}ms`,
      }
    })
    push("CLS", (_s, audit) => {
      const v = audit.metrics?.cwv?.cls
      if (v == null) return { tone: "neutral", display: "—" }
      return {
        tone: v <= 0.1 ? "green" : v <= 0.25 ? "amber" : "red",
        display: v.toFixed(2),
      }
    })
    return rows
  }

  if (category === "accessibility") {
    push("Accessibility score", (_s, audit) => {
      const pct = Math.round((audit.metrics?.scores?.accessibility ?? 0) * 100)
      if (!audit.metrics) return { tone: "neutral", display: "—" }
      return {
        tone: pct >= 90 ? "green" : pct >= 50 ? "amber" : "red",
        display: String(pct),
      }
    })
    push("Issues flagged", (_s, audit) => {
      const groups = audit.metrics?.audits?.accessibilityInsights ?? []
      const failed = groups.reduce((total, g) => total + g.items.length, 0)
      if (!audit.metrics) return { tone: "neutral", display: "—" }
      return {
        tone: failed === 0 ? "green" : failed <= 3 ? "amber" : "red",
        display: String(failed),
      }
    })
    push("Heading order", (_s, audit) => {
      const v = audit.metrics?.audits?.headingOrder?.score
      if (v == null) return { tone: "neutral", display: "—" }
      return { tone: v >= 0.9 ? "green" : v >= 0.5 ? "amber" : "red", display: v >= 0.9 ? "Pass" : "Fail" }
    })
    push("Tap targets", (_s, audit) => {
      const v = audit.metrics?.audits?.tapTargets?.score
      if (v == null) return { tone: "neutral", display: "—" }
      return { tone: v >= 0.9 ? "green" : v >= 0.5 ? "amber" : "red", display: v >= 0.9 ? "Pass" : "Fail" }
    })
    push("Link text", (_s, audit) => {
      const v = audit.metrics?.audits?.linkText?.score
      if (v == null) return { tone: "neutral", display: "—" }
      return { tone: v >= 0.9 ? "green" : v >= 0.5 ? "amber" : "red", display: v >= 0.9 ? "Pass" : "Fail" }
    })
    return rows
  }

  if (category === "navigation") {
    push("Label clarity", (s) => fromMini((s?.navigation as NavigationSignals | undefined)?.labelClarity))
    push("Path confidence", (s) => fromMini((s?.navigation as NavigationSignals | undefined)?.pathConfidence))
    push("Navbar load", (s) => fromMini((s?.navigation as NavigationSignals | undefined)?.navbarLoad))
    push("L1 items ≤ 7", (s) => {
      const n = (s?.navigation as NavigationSignals | undefined)?.l1ItemCount ?? null
      if (n == null) return { tone: "neutral", display: "—" }
      return { tone: n > 7 ? "red" : "green", display: String(n) }
    })
    return rows
  }

  if (category === "visualHierarchy") {
    const get = (s: RubricSignals | undefined) => s?.visualHierarchy as VisualHierarchySignals | undefined
    push("Scan ease", (s) => fromMini(get(s)?.scanEase))
    push("Font balance", (s) => fromMini(get(s)?.fontBalance))
    push("Whitespace usage", (s) => fromMini(get(s)?.whitespaceUsage))
    push("Section color diff", (s) => fromMini(get(s)?.sectionColorDiff))
    push("CTA placement", (s) => fromMini(get(s)?.ctaPlacement))
    return rows
  }

  if (category === "consistency") {
    const get = (s: RubricSignals | undefined) => s?.consistency as ConsistencySignals | undefined
    push("Page coherence", (s) => fromMini(get(s)?.pageCoherence))
    push("Navigation", (s) => fromMini(get(s)?.navigation))
    push("Visual language", (s) => fromMini(get(s)?.visualLang))
    push("Interactions", (s) => fromMini(get(s)?.interactions))
    push("Terminology shifts", (s) => fromBool(get(s)?.terminologyShifts, "bad"))
    push("Content availability issue", (s) => fromBool(get(s)?.contentAvailabilityIssue, "bad"))
    return rows
  }

  if (category === "taskCompletion") {
    const get = (s: RubricSignals | undefined) => s?.taskCompletion as TaskCompletionSignals | undefined
    push("Interrupted", (s) => {
      const v = get(s)?.interrupted
      if (!v) return { tone: "neutral", display: "—" }
      return { ...fromMini(TASK_INTERRUPTED[v]), display: v }
    })
    push("Ease", (s) => {
      const v = get(s)?.ease
      if (!v) return { tone: "neutral", display: "—" }
      return { ...fromMini(TASK_EASE[v]), display: v }
    })
    push("Duration", (s) => {
      const v = get(s)?.duration
      if (!v) return { tone: "neutral", display: "—" }
      return { ...fromMini(TASK_DURATION[v]), display: v }
    })
    return rows
  }

  if (category === "helpSupport") {
    const get = (s: RubricSignals | undefined) => s?.helpSupport as HelpSupportSignals | undefined
    push("Support within reach", (s) => fromBool(get(s)?.supportWithinReach, "good"))
    push("FAQ answered", (s) => fromBool(get(s)?.faqAnswered, "good"))
    return rows
  }

  // firstImpression has no per-criterion signals — show the AI score row only.
  push("AI verdict", (_s, audit) => fromCategoryScore(categoryScore(audit, "firstImpression")))
  return rows
}

export type CrossSiteInsight = {
  type: "client_weakness" | "competitor_strength" | "client_strength"
  subjects: string[]
  text: string
  principle?: PrincipleRef
}

export function buildCrossSiteInsights(
  category: AnalyticsCategoryKey,
  audits: SiteAudit[],
  sites: SiteMeta[],
  knowledge: import("@/lib/types").KnowledgeEntry[]
): CrossSiteInsight[] {
  const insights: CrossSiteInsight[] = []

  const competitors = audits
    .map((audit, i) => ({ audit, meta: sites[i], score: categoryScore(audit, category) }))
    .filter((x) => !x.meta.isClient && x.score != null) as Array<{
    audit: SiteAudit
    meta: SiteMeta
    score: number
  }>
  const client = audits
    .map((audit, i) => ({ audit, meta: sites[i], score: categoryScore(audit, category) }))
    .find((x) => x.meta.isClient && x.score != null)

  const getInsightForAudit = (audit: SiteAudit): RubricInsight | null => {
    const signals = audit.rubricSignals
    if (!signals) return null
    if (category === "navigation" && signals.navigation) {
      return buildNavigationInsight(signals.navigation as NavigationSignals, knowledge)
    }
    if (category === "visualHierarchy" && signals.visualHierarchy) {
      return buildVisualHierarchyInsight(signals.visualHierarchy as VisualHierarchySignals, knowledge)
    }
    if (category === "consistency" && signals.consistency) {
      return buildConsistencyInsight(signals.consistency as ConsistencySignals, knowledge)
    }
    return null
  }

  if (category === "firstImpression" && client && client.score != null) {
    // 1. CTA above fold for client is no
    const clientRow = client.audit.rubric.firstImpression
    const clientAiReasoning = ("aiReasoning" in clientRow ? clientRow.aiReasoning : "") || ""
    if (clientAiReasoning.includes("**CTA above fold:** No")) {
      insights.push({
        type: "client_weakness",
        subjects: [client.meta.label],
        text: "has no primary CTA above the fold. This is a critical conversion failure — content above the fold receives disproportionate attention, and the value proposition must be actionable immediately without scrolling.",
        principle: { title: "Above the Fold Principle", url: "https://www.nngroup.com/articles/page-fold-manifesto/" }
      })
    }

    // 2. Competitor outranks all others
    const sortedComps = [...competitors].sort((a, b) => b.score - a.score)
    if (sortedComps.length > 0) {
      const topComp = sortedComps[0]
      const secondTop = sortedComps.length > 1 ? sortedComps[1] : client
      // Require the top competitor to be uniquely strong (>= 4) and outrank the rest
      if (topComp.score >= 4 && topComp.score > (secondTop?.score || 0)) {
        const topReasoning = ("aiReasoning" in topComp.audit.rubric.firstImpression ? topComp.audit.rubric.firstImpression.aiReasoning : "") || ""
        
        // Find signals that have the tick emoji, fallback to any signals and strip emojis
        const rawSignals = topReasoning.split("\n").filter(l => l.startsWith("- ")).map(l => l.substring(2).trim())
        const tickSignals = rawSignals.filter(s => s.startsWith("😍")).map(s => s.replace(/^😍\s*/, "").trim())
        const signals = tickSignals.length >= 2 ? tickSignals : rawSignals.map(s => s.replace(/^[😍🤔]\s*/, "").trim())
        
        if (signals.length >= 2) {
          insights.push({
            type: "competitor_strength",
            subjects: [topComp.meta.label],
            text: `uniquely outranks others in First Impression, driven by ${signals[0].toLowerCase()} and ${signals[1].toLowerCase()}.`
          })
        }
      }
    }

    // 3. Client strong, competitors weak
    const allCompsWeak = competitors.every(c => c.score <= 3)
    if (allCompsWeak && client.score >= 4) {
      insights.push({
        type: "client_strength",
        subjects: [client.meta.label],
        text: "shows a clear opportunity gap. While competitors struggle with First Impressions, your strong performance provides an immediate competitive advantage."
      })
    }

    return insights
  }

  if (client && client.score != null) {
    // Type 1: Client Weakness
    const allScores = [...competitors.map((c) => c.score), client.score]
    const minScore = Math.min(...allScores)
    
    if (client.score === minScore && minScore < 4) {
      const clientInsight = getInsightForAudit(client.audit)
      if (clientInsight) {
        insights.push({
          type: "client_weakness",
          subjects: [client.meta.label],
          text: `scores the lowest in ${ANALYTICS_CATEGORIES.find((c) => c.key === category)?.label}. ${clientInsight.text}`,
          principle: clientInsight.principle,
        })
      }
    }
  }

  // Type 2: Competitor Strength
  // Find competitors who score >= 4
  const strongCompetitors = competitors.filter((c) => c.score >= 4)
  if (strongCompetitors.length > 0) {
    // Group competitors by insight text to avoid repeating the same insight
    const insightGroups = new Map<string, { subjects: string[], principle?: PrincipleRef }>()
    for (const comp of strongCompetitors) {
      const compInsight = getInsightForAudit(comp.audit)
      if (compInsight) {
        const key = compInsight.text
        if (!insightGroups.has(key)) {
          insightGroups.set(key, { subjects: [], principle: compInsight.principle })
        }
        insightGroups.get(key)!.subjects.push(comp.meta.label)
      }
    }

    for (const [text, group] of insightGroups.entries()) {
      insights.push({
        type: "competitor_strength",
        subjects: group.subjects,
        text: `have stronger ${ANALYTICS_CATEGORIES.find((c) => c.key === category)?.label}. ${text}`,
        principle: group.principle,
      })
    }
  }

  return insights
}

function toneToValue(tone: "green" | "amber" | "red" | "neutral"): number | null {
  if (tone === "green") return 2
  if (tone === "amber") return 1
  if (tone === "red") return 0
  return null
}

// ---- Knowledge principles --------------------------------------------------

export function principlesByCategory(
  category: AnalyticsCategoryKey,
  audits: SiteAudit[],
  sites: SiteMeta[]
): Array<{ title: string; url: string; competitorCount: number; clientHas: boolean }> {
  const cat = ANALYTICS_CATEGORIES.find((c) => c.key === category)!
  const competitorPrinciples = new Map<string, { ref: PrincipleRef; sites: Set<string> }>()
  const clientPrincipleTitles = new Set<string>()

  audits.forEach((audit, i) => {
    const meta = sites[i]
    const row = audit.rubric[cat.rubricKey]
    const refs: PrincipleRef[] = []
    if (row && "aiPrinciples" in row && row.aiPrinciples) refs.push(...row.aiPrinciples)
    refs.forEach((ref) => {
      if (!ref.title) return
      const key = ref.title.toLowerCase().trim()
      if (meta.isClient) {
        clientPrincipleTitles.add(key)
      } else {
        const entry = competitorPrinciples.get(key)
        if (entry) {
          entry.sites.add(meta.url)
        } else {
          competitorPrinciples.set(key, { ref, sites: new Set([meta.url]) })
        }
      }
    })
  })

  return Array.from(competitorPrinciples.values())
    .filter((entry) => entry.sites.size >= 2)
    .map((entry) => ({
      title: entry.ref.title,
      url: entry.ref.url,
      competitorCount: entry.sites.size,
      clientHas: clientPrincipleTitles.has(entry.ref.title.toLowerCase().trim()),
    }))
    .sort((a, b) => b.competitorCount - a.competitorCount)
}
