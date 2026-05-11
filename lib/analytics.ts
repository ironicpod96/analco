import { liveScore } from "@/lib/rubric"
import type {
  ConsistencySignals,
  CrossSiteInsightOverride,
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
  buildHelpSupportInsight,
  buildNavigationInsight,
  buildTaskCompletionInsight,
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

function formatCohort(labels: string[]): string {
  if (labels.length === 0) return ""
  if (labels.length === 1) return labels[0]
  if (labels.length === 2) return `${labels[0]} and ${labels[1]}`
  return labels.slice(0, -1).join(", ") + " and " + labels[labels.length - 1]
}

function thirdPersonSingular(verb: string): string {
  if (verb === "have") return "has"
  if (verb === "do") return "does"
  if (verb === "be") return "is"
  if (/(s|x|z|ch|sh)$/.test(verb)) return verb + "es"
  if (/[^aeiou]y$/.test(verb)) return verb.slice(0, -1) + "ies"
  return verb + "s"
}

// Headlines are stored as plural-base-verb phrases (e.g. "carry a top-level nav above the threshold").
// Use this to make them agree with a singular subject.
function conjugateHeadline(headline: string, plural: boolean): string {
  if (plural) return headline
  const firstSpace = headline.indexOf(" ")
  if (firstSpace === -1) return thirdPersonSingular(headline)
  const verb = headline.slice(0, firstSpace)
  return thirdPersonSingular(verb) + headline.slice(firstSpace)
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
  return liveScore(audit, rubricKey)
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
  if (score >= 3) return { tone: "green", display: String(Math.round(score)) }
  if (score >= 2) return { tone: "amber", display: String(Math.round(score)) }
  return { tone: "red", display: String(Math.round(score)) }
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
    push("L1 item count", (s) => {
      const v = (s?.navigation as NavigationSignals | undefined)?.l1ItemCount ?? null
      if (v == null) return { tone: "neutral", display: "—" }
      const tone = v === 0 ? "green" : v === 1 ? "amber" : "red"
      const label = v === 0 ? "<8" : v === 1 ? "8" : ">8"
      return { tone, display: label }
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

  if (category === "firstImpression") {
    push("Verdict", (_s, audit) => fromCategoryScore(categoryScore(audit, "firstImpression")))
    push("CTA above fold", (s, audit) => {
      let v = s?.firstImpression?.ctaAboveFold ?? null
      // Fallback: extract from aiReasoning text if not in signals
      if (v == null) {
        const reasoning = audit.rubric.firstImpression.aiReasoning ?? ""
        const match = reasoning.match(/\*\*CTA above fold:\*\*\s*(\w+)/i)
        if (match) v = match[1].toLowerCase() === "yes" ? "yes" : "no"
      }
      if (v == null) return { tone: "neutral", display: "—" }
      return { tone: v === "yes" ? "green" : "red", display: v === "yes" ? "Yes" : "No" }
    })
    push("Hero clarity", (s, audit) => {
      let v = s?.firstImpression?.heroClarity ?? null
      // Fallback: extract from aiReasoning text if not in signals
      if (v == null) {
        const reasoning = audit.rubric.firstImpression.aiReasoning ?? ""
        const match = reasoning.match(/\*\*Hero clarity:\*\*\s*(\w+)/i)
        if (match) v = match[1].toLowerCase() === "clear" ? "clear" : "confusing"
      }
      if (v == null) return { tone: "neutral", display: "—" }
      return { tone: v === "clear" ? "green" : "red", display: v === "clear" ? "Clear" : "Confusing" }
    })
    return rows
  }

  // Fallback for unmapped categories
  return rows
}

export type CrossSiteInsight = {
  type: "client_weakness" | "competitor_strength" | "client_strength"
  subjects: string[]
  headline: string
  text: string
  principle?: PrincipleRef
}

export function applyCrossSiteInsightOverrides(
  category: AnalyticsCategoryKey,
  insights: CrossSiteInsight[],
  overrides: Record<string, CrossSiteInsightOverride>
): CrossSiteInsight[] {
  return insights.map((insight, index) => {
    const override = overrides[`${category}:${index}`]
    if (!override) return insight
    const headline = typeof override.headline === "string" && override.headline.trim() ? override.headline.trim() : insight.headline
    const text = typeof override.text === "string" && override.text.trim() ? override.text.trim() : insight.text
    const principle = "principle" in override ? (override.principle ?? undefined) : insight.principle
    return {
      ...insight,
      headline,
      text,
      principle,
    }
  })
}

function buildLcpInsight(
  client: { audit: SiteAudit; meta: SiteMeta },
  competitors: Array<{ audit: SiteAudit; meta: SiteMeta }>
): CrossSiteInsight | null {
  const lcp = client.audit.metrics?.cwv?.lcp ?? null
  if (lcp == null || lcp <= 2500) return null
  const better = competitors.filter((c) => (c.audit.metrics?.cwv?.lcp ?? Infinity) < lcp)
  if (better.length === 0) return null
  const display = lcp > 1000 ? `${(lcp / 1000).toFixed(1)}s` : `${Math.round(lcp)}ms`
  const threshold = lcp > 4000 ? "above the poor threshold of 4s" : "in the needs-improvement range"
  return {
    type: "client_weakness",
    subjects: [client.meta.label],
    headline: `${client.meta.label} loads its main content slower than competing sites (LCP: ${display}).`,
    text: `LCP measures when the biggest element on screen, usually the hero image or main headline, finishes rendering. Users who have to wait too long are more likely to leave before it arrives. At ${display}, ${client.meta.label} is ${threshold}. Unoptimised images above the fold, scripts that block rendering, and slow server response are the most common causes.`,
  }
}

function buildInpInsight(
  client: { audit: SiteAudit; meta: SiteMeta },
  competitors: Array<{ audit: SiteAudit; meta: SiteMeta }>
): CrossSiteInsight | null {
  const inp = client.audit.metrics?.cwv?.inp ?? null
  if (inp == null || inp <= 200) return null
  const better = competitors.filter((c) => (c.audit.metrics?.cwv?.inp ?? Infinity) < inp)
  if (better.length === 0) return null
  const threshold = inp > 500 ? "above the poor threshold of 500ms" : "in the needs-improvement range"
  return {
    type: "client_weakness",
    subjects: [client.meta.label],
    headline: `${client.meta.label} takes longer to respond to user input than competing sites (INP: ${Math.round(inp)}ms).`,
    text: `INP captures how quickly the page reacts after a click, tap, or key press. When that gap is too wide, the page feels unresponsive. At ${Math.round(inp)}ms, ${client.meta.label} is ${threshold}. The most common cause is JavaScript running on the main thread and keeping it from reacting to input quickly.`,
  }
}

function buildClsInsight(
  client: { audit: SiteAudit; meta: SiteMeta },
  competitors: Array<{ audit: SiteAudit; meta: SiteMeta }>
): CrossSiteInsight | null {
  const cls = client.audit.metrics?.cwv?.cls ?? null
  if (cls == null || cls <= 0.1) return null
  const better = competitors.filter((c) => (c.audit.metrics?.cwv?.cls ?? Infinity) < cls)
  if (better.length === 0) return null
  const threshold = cls > 0.25 ? "above the poor threshold of 0.25" : "in the needs-improvement range"
  return {
    type: "client_weakness",
    subjects: [client.meta.label],
    headline: `${client.meta.label} has more layout shift during load than competing sites (CLS: ${cls.toFixed(2)}).`,
    text: `CLS measures how much content moves around as the page settles. When things shift, users mis-tap, lose their place in the text, and the page feels unfinished. At ${cls.toFixed(2)}, ${client.meta.label} is ${threshold}. Images or ads without reserved space, fonts that load late, and content injected after the page starts rendering are the usual causes.`,
  }
}

function buildPagePerformanceInsights(
  audits: SiteAudit[],
  sites: SiteMeta[]
): CrossSiteInsight[] {
  const insights: CrossSiteInsight[] = []

  const clientEntry = audits
    .map((audit, i) => ({ audit, meta: sites[i] }))
    .find((x) => x.meta.isClient && !!x.audit.metrics)
  if (!clientEntry) return insights

  const competitorEntries = audits
    .map((audit, i) => ({ audit, meta: sites[i] }))
    .filter((x) => !x.meta.isClient && !!x.audit.metrics)
  if (competitorEntries.length === 0) return insights

  const lcpInsight = buildLcpInsight(clientEntry, competitorEntries)
  if (lcpInsight) insights.push(lcpInsight)

  const inpInsight = buildInpInsight(clientEntry, competitorEntries)
  if (inpInsight) insights.push(inpInsight)

  const clsInsight = buildClsInsight(clientEntry, competitorEntries)
  if (clsInsight) insights.push(clsInsight)

  const cm = clientEntry.audit.metrics
  const clientPerf = Math.round((cm?.scores?.performance ?? 0) * 100)
  const sortedBetter = competitorEntries
    .filter((c) => Math.round((c.audit.metrics?.scores?.performance ?? 0) * 100) > clientPerf)
    .sort(
      (a, b) =>
        Math.round((b.audit.metrics?.scores?.performance ?? 0) * 100) -
        Math.round((a.audit.metrics?.scores?.performance ?? 0) * 100)
    )

  if (sortedBetter.length > 0) {
    const topComp = sortedBetter[0]
    const topCompPerf = Math.round((topComp.audit.metrics?.scores?.performance ?? 0) * 100)
    const cohortLabels = sortedBetter.slice(0, 2).map((c) => c.meta.label)
    const cohortStr = formatCohort(cohortLabels)
    const clientOpps = cm?.opportunities ?? []
    const compOppIds = new Set((topComp.audit.metrics?.opportunities ?? []).map((o) => o.id))
    const uniqueToClient = clientOpps.filter((o) => !compOppIds.has(o.id))

    if (uniqueToClient.length > 0) {
      const title = uniqueToClient[0].title
      insights.push({
        type: "competitor_strength",
        subjects: cohortLabels,
        headline: `${clientEntry.meta.label} still carries ${title.toLowerCase()}, where ${cohortStr} do not.`,
        text: `${cohortStr} pass this audit (${topComp.meta.label} at ${topCompPerf}), while ${clientEntry.meta.label} sits at ${clientPerf}. Clearing that one issue is the most direct route to closing the gap.`,
      })
    } else if (clientOpps.length > 0) {
      insights.push({
        type: "competitor_strength",
        subjects: cohortLabels,
        headline: `${clientEntry.meta.label} handles the same performance issues less efficiently than ${cohortStr}.`,
        text: `${cohortStr} reach ${topCompPerf} against ${clientEntry.meta.label}'s ${clientPerf}. With similar issues flagged in both, the gap likely comes from bundle size, server response, or caching.`,
      })
    } else {
      insights.push({
        type: "competitor_strength",
        subjects: cohortLabels,
        headline: `${clientEntry.meta.label} lags ${cohortStr} on performance with no opportunities flagged.`,
        text: `${cohortStr} sit at ${topCompPerf} against ${clientEntry.meta.label}'s ${clientPerf}. With no audit opportunities surfaced, the gap is likely infrastructure — server response, CDN setup, or HTTP/2.`,
      })
    }
  }

  return insights
}

function buildAccessibilityInsights(
  audits: SiteAudit[],
  sites: SiteMeta[]
): CrossSiteInsight[] {
  const insights: CrossSiteInsight[] = []

  const clientEntry = audits
    .map((audit, i) => ({ audit, meta: sites[i] }))
    .find((x) => x.meta.isClient && !!x.audit.metrics)
  if (!clientEntry) return insights

  const competitorEntries = audits
    .map((audit, i) => ({ audit, meta: sites[i] }))
    .filter((x) => !x.meta.isClient && !!x.audit.metrics)
  if (competitorEntries.length === 0) return insights

  const cm = clientEntry.audit.metrics
  const clientScore = Math.round((cm?.scores?.accessibility ?? 0) * 100)

  // Overall score
  if (clientScore < 90) {
    const betterOnScore = competitorEntries
      .filter((c) => Math.round((c.audit.metrics?.scores?.accessibility ?? 0) * 100) > clientScore)
      .sort(
        (a, b) =>
          Math.round((b.audit.metrics?.scores?.accessibility ?? 0) * 100) -
          Math.round((a.audit.metrics?.scores?.accessibility ?? 0) * 100)
      )
    if (betterOnScore.length > 0) {
      const topComp = betterOnScore[0]
      const topCompScore = Math.round((topComp.audit.metrics?.scores?.accessibility ?? 0) * 100)
      const detail =
        clientScore < 50
          ? "A score this low typically blocks whole groups of users from parts of the site."
          : "Scores in this range usually point to issues that affect real users but are easy to miss without testing."
      insights.push({
        type: "client_weakness",
        subjects: [clientEntry.meta.label],
        headline: `${clientEntry.meta.label} scores ${clientScore}% on accessibility, behind ${topComp.meta.label} at ${topCompScore}%.`,
        text: `${detail} Screen reader, keyboard, and voice-control users feel it first.`,
      })
    }
  }

  // Heading order
  const clientHeadingScore = cm?.audits?.headingOrder?.score ?? null
  if (clientHeadingScore != null && clientHeadingScore < 0.9) {
    const anyCompetitorPasses = competitorEntries.some(
      (c) => (c.audit.metrics?.audits?.headingOrder?.score ?? 0) >= 0.9
    )
    if (anyCompetitorPasses) {
      insights.push({
        type: "client_weakness",
        subjects: [clientEntry.meta.label],
        headline: `${clientEntry.meta.label} has a broken heading structure that competitors have resolved.`,
        text: `Screen readers turn headings into a navigation menu. Users can jump between h1, h2, and h3 to scan a page without reading everything. When the order breaks, that shortcut stops working and forces linear reading, which is much slower.`,
      })
    }
  }

  // Tap targets
  const clientTapScore = cm?.audits?.tapTargets?.score ?? null
  if (clientTapScore != null && clientTapScore < 0.9) {
    const anyCompetitorPasses = competitorEntries.some(
      (c) => (c.audit.metrics?.audits?.tapTargets?.score ?? 0) >= 0.9
    )
    if (anyCompetitorPasses) {
      insights.push({
        type: "client_weakness",
        subjects: [clientEntry.meta.label],
        headline: `Tap targets on ${clientEntry.meta.label} are harder to hit than on competing sites.`,
        text: `When targets are too small or too close together, users mis-tap. This is most noticeable for people with motor difficulties or when using a phone one-handed. The recommended minimum is 48 by 48 pixels with 8 pixels of space between adjacent targets.`,
      })
    }
  }

  // Link text
  const clientLinkScore = cm?.audits?.linkText?.score ?? null
  if (clientLinkScore != null && clientLinkScore < 0.9) {
    const anyCompetitorPasses = competitorEntries.some(
      (c) => (c.audit.metrics?.audits?.linkText?.score ?? 0) >= 0.9
    )
    if (anyCompetitorPasses) {
      insights.push({
        type: "client_weakness",
        subjects: [clientEntry.meta.label],
        headline: `${clientEntry.meta.label} uses vague link text that competing sites avoid.`,
        text: `Screen readers can pull up a list of every link on a page. When links say things like "click here" or "read more", that list gives no clue where any of them lead. Each link should make sense on its own, without needing surrounding text to explain it.`,
      })
    }
  }

  // ARIA
  const clientGroups = cm?.audits?.accessibilityInsights ?? []
  const ariaGroup = clientGroups.find((g) => g.id === "a11y-aria")
  if (ariaGroup && ariaGroup.items.length > 0) {
    const anyCompetitorNoAria = competitorEntries.some(
      (c) => !(c.audit.metrics?.audits?.accessibilityInsights ?? []).some((g) => g.id === "a11y-aria")
    )
    if (anyCompetitorNoAria) {
      insights.push({
        type: "client_weakness",
        subjects: [clientEntry.meta.label],
        headline: `${clientEntry.meta.label} has ARIA issues that competing sites have resolved.`,
        text: `ARIA tells assistive technology what an element is, what state it is in, and what it is called. When it is wrong or missing, things like dropdowns, modals, and tabs either get skipped or described incorrectly to screen reader users.`,
      })
    }
  }

  // Names and labels
  const namesGroup = clientGroups.find((g) => g.id === "a11y-names-labels")
  if (namesGroup && namesGroup.items.length > 0) {
    const anyCompetitorNoNames = competitorEntries.some(
      (c) => !(c.audit.metrics?.audits?.accessibilityInsights ?? []).some((g) => g.id === "a11y-names-labels")
    )
    if (anyCompetitorNoNames) {
      insights.push({
        type: "client_weakness",
        subjects: [clientEntry.meta.label],
        headline: `Some elements on ${clientEntry.meta.label} are missing accessible labels that competitors provide.`,
        text: `Without a label, a screen reader announces a button or input as just "button" or "edit field" with nothing else. The user has to guess what it does. Each interactive element needs a name that makes its purpose clear without relying on surrounding text.`,
      })
    }
  }

  // Top competitor strength
  const sortedBetter = competitorEntries
    .filter(
      (c) => Math.round((c.audit.metrics?.scores?.accessibility ?? 0) * 100) > clientScore
    )
    .sort(
      (a, b) =>
        Math.round((b.audit.metrics?.scores?.accessibility ?? 0) * 100) -
        Math.round((a.audit.metrics?.scores?.accessibility ?? 0) * 100)
    )

  if (sortedBetter.length > 0) {
    const topComp = sortedBetter[0]
    const topCompScore = Math.round((topComp.audit.metrics?.scores?.accessibility ?? 0) * 100)
    const cohortLabels = sortedBetter.slice(0, 2).map((c) => c.meta.label)
    const cohortStr = formatCohort(cohortLabels)
    const compGroups = topComp.audit.metrics?.audits?.accessibilityInsights ?? []
    const compGroupIds = new Set(compGroups.map((g) => g.id))
    const clientOnlyGroups = clientGroups.filter((g) => !compGroupIds.has(g.id))

    if (clientOnlyGroups.length > 0) {
      const firstGroup = clientOnlyGroups[0].title.toLowerCase()
      insights.push({
        type: "competitor_strength",
        subjects: cohortLabels,
        headline: `${clientEntry.meta.label} still has ${firstGroup} failures that ${cohortStr} have cleared.`,
        text: `${cohortStr} pass that audit (${topComp.meta.label} at ${topCompScore}%), where ${clientEntry.meta.label} sits at ${clientScore}%. Clearing that group is the most direct route to closing the gap.`,
      })
    } else {
      insights.push({
        type: "competitor_strength",
        subjects: cohortLabels,
        headline: `${clientEntry.meta.label} flags more accessibility issues per category than ${cohortStr}.`,
        text: `${cohortStr} reach ${topCompScore}% against ${clientEntry.meta.label}'s ${clientScore}%. The problem areas overlap — the difference is in how many issues sit inside each one.`,
      })
    }
  }

  return insights
}

function buildScoreFallbacks(
  category: AnalyticsCategoryKey,
  audits: SiteAudit[],
  sites: SiteMeta[],
  needed: number
): CrossSiteInsight[] {
  if (needed <= 0) return []
  const fallbacks: CrossSiteInsight[] = []

  const entries = audits
    .map((audit, i) => ({ meta: sites[i], score: categoryScore(audit, category) }))
    .filter((x): x is { meta: SiteMeta; score: number } => x.score != null)

  if (entries.length < 2) return fallbacks

  const client = entries.find((e) => e.meta.isClient)
  const competitors = entries.filter((e) => !e.meta.isClient)

  if (competitors.length === 0) return fallbacks

  const sorted = [...entries].sort((a, b) => b.score - a.score)
  const leader = sorted[0]
  const trailer = sorted[sorted.length - 1]

  if (fallbacks.length < needed) {
    if (leader.score !== trailer.score) {
      const gap = Math.round(leader.score - trailer.score)
      fallbacks.push({
        type: leader.meta.isClient ? "client_strength" : "competitor_strength",
        subjects: [leader.meta.label],
        headline: `${leader.meta.label} leads this category, with ${trailer.meta.label} trailing by ${gap} ${gap === 1 ? "point" : "points"}.`,
        text: `That gap across sites shows this category is a real differentiator, not a baseline all players meet equally. The sites in the middle have room to move in either direction.`,
      })
    } else {
      const catLabel = ANALYTICS_CATEGORIES.find((c) => c.key === category)?.label ?? category
      fallbacks.push({
        type: "client_strength",
        subjects: entries.map((e) => e.meta.label),
        headline: `All sites in this comparison score the same on ${catLabel}.`,
        text: `Parity on a rubric score doesn't mean identical execution. The differentiation lives in the details — copy clarity, interaction feel, and edge-case handling that aggregate scoring doesn't surface.`,
      })
    }
  }

  if (fallbacks.length < needed && client) {
    const compAvg = competitors.reduce((s, e) => s + e.score, 0) / competitors.length
    const roundedAvg = Math.round(compAvg * 10) / 10
    if (client.score > compAvg) {
      fallbacks.push({
        type: "client_strength",
        subjects: [client.meta.label],
        headline: `${client.meta.label} scores above the competitor average in this category.`,
        text: `The ${competitors.length}-site field averages ${roundedAvg} — ${client.meta.label} sits ahead. That lead is worth protecting; it reflects work competitors haven't yet matched.`,
      })
    } else if (client.score < compAvg) {
      fallbacks.push({
        type: "client_weakness",
        subjects: [client.meta.label],
        headline: `${client.meta.label} scores below the competitor average in this category.`,
        text: `The ${competitors.length}-site field averages ${roundedAvg} — ${client.meta.label} trails the group. Closing that gap is typically achievable with focused improvements rather than a full overhaul.`,
      })
    } else {
      fallbacks.push({
        type: "client_strength",
        subjects: [client.meta.label],
        headline: `${client.meta.label} matches the competitor average in this category.`,
        text: `Meeting the field is a baseline position. The opportunity is to pull ahead on execution details that aggregate scores miss — how the experience feels, not just what it checks.`,
      })
    }
  }

  return fallbacks
}

export function buildCrossSiteInsights(
  category: AnalyticsCategoryKey,
  audits: SiteAudit[],
  sites: SiteMeta[],
  knowledge: import("@/lib/types").KnowledgeEntry[]
): CrossSiteInsight[] {
  const insights: CrossSiteInsight[] = []

  if (category === "loadingSpeed") {
    const speedInsights = buildPagePerformanceInsights(audits, sites)
    if (speedInsights.length < 2) speedInsights.push(...buildScoreFallbacks(category, audits, sites, 2 - speedInsights.length))
    return speedInsights
  }

  if (category === "accessibility") {
    const a11yInsights = buildAccessibilityInsights(audits, sites)
    if (a11yInsights.length < 2) a11yInsights.push(...buildScoreFallbacks(category, audits, sites, 2 - a11yInsights.length))
    return a11yInsights
  }

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
    if (category === "helpSupport" && signals.helpSupport) {
      return buildHelpSupportInsight(signals.helpSupport as HelpSupportSignals, knowledge)
    }
    if (category === "taskCompletion" && signals.taskCompletion) {
      return buildTaskCompletionInsight(signals.taskCompletion as TaskCompletionSignals, knowledge)
    }
    return null
  }

  if (category === "helpSupport") {
    // Client weakness: neither channel present
    if (client && client.score != null) {
      const clientSignals = client.audit.rubricSignals?.helpSupport
      const noSupport = clientSignals?.supportWithinReach === false
      const noFaq = clientSignals?.faqAnswered === false
      if (noSupport && noFaq) {
        const clientInsight = getInsightForAudit(client.audit)
        insights.push({
          type: "client_weakness",
          subjects: [client.meta.label],
          headline: `${client.meta.label} offers no accessible support path.`,
          text: clientInsight?.text ?? "Users who hit a blocker have no path forward — churn is the default outcome for anyone who cannot resolve an issue.",
          principle: clientInsight?.principle,
        })
      } else if (noSupport && !noFaq) {
        const clientInsight = getInsightForAudit(client.audit)
        if (clientInsight) {
          insights.push({
            type: "client_weakness",
            subjects: [client.meta.label],
            headline: `${client.meta.label} has FAQ but no direct contact path.`,
            text: clientInsight.text,
            principle: clientInsight.principle,
          })
        }
      }

      // Competitor outranks client on help & support
      const sortedComps = [...competitors].sort((a, b) => b.score - a.score)
      const topComp = sortedComps[0]
      if (topComp && topComp.score > client.score) {
        const compSignals = topComp.audit.rubricSignals?.helpSupport
        const compHasBoth = compSignals?.supportWithinReach === true && compSignals?.faqAnswered === true
        const compInsight = getInsightForAudit(topComp.audit)
        // Surface the AI "read" from the competitor's reasoning
        const compReasoning = ("aiReasoning" in topComp.audit.rubric.helpSupport ? topComp.audit.rubric.helpSupport.aiReasoning : "") || ""
        const readMatch = compReasoning.match(/_(.+?)_/)
        const readText = readMatch ? readMatch[1].trim() : null
        if (compHasBoth && (readText || compInsight)) {
          insights.push({
            type: "competitor_strength",
            subjects: [topComp.meta.label],
            headline: `${topComp.meta.label} offers a more complete support experience than ${client.meta.label}.`,
            text: readText ?? compInsight!.text,
            principle: compInsight?.principle,
          })
        }
      }

      // Client strong, all competitors weaker
      const clientScoreVal = client.score ?? 0
      const allCompsWeak = competitors.every(c => c.score < clientScoreVal)
      if (allCompsWeak && clientScoreVal >= 3) {
        const clientInsight = getInsightForAudit(client.audit)
        insights.push({
          type: "client_strength",
          subjects: [client.meta.label],
          headline: `${client.meta.label} offers better support access than all competing sites.`,
          text: clientInsight?.text ?? "Competitors leave users without a clear support path. That gap is an advantage worth protecting — support accessibility directly affects trust and retention.",
          principle: clientInsight?.principle,
        })
      }
    }

    // All sites — pattern: industry-wide poor support
    if (competitors.length >= 2) {
      const allWeak = competitors.every(c => c.score <= 2) && (!client || (client.score ?? 3) <= 2)
      if (allWeak) {
        const clientLabel = client?.meta.label
        insights.push({
          type: "client_weakness",
          subjects: clientLabel ? [clientLabel] : competitors.map(c => c.meta.label),
          headline: clientLabel
            ? `Support access is weak across the board — ${clientLabel} included.`
            : "Support access is weak across the board.",
          text: clientLabel
            ? `No site in this comparison offers a complete support path. ${clientLabel} can close that category-wide gap and earn the trust advantage with users who hit problems.`
            : "No site in this comparison offers a complete support path. The first to close that category-wide gap earns the trust advantage.",
        })
      }
    }

    if (insights.length < 2) insights.push(...buildScoreFallbacks(category, audits, sites, 2 - insights.length))
    return insights
  }

  if (category === "firstImpression" && client && client.score != null) {
    // 1. CTA above fold for client is no
    const clientRow = client.audit.rubric.firstImpression
    const clientAiReasoning = ("aiReasoning" in clientRow ? clientRow.aiReasoning : "") || ""
    if (clientAiReasoning.includes("**CTA above fold:** No")) {
      insights.push({
        type: "client_weakness",
        subjects: [client.meta.label],
        headline: `${client.meta.label} has no clear action visible before the user scrolls.`,
        text: "The top of the page gets the most attention before someone decides whether to keep reading. Without a visible action there, users have to scroll to commit to anything, and many will not.",
        principle: { title: "Above the Fold Principle", url: "https://www.nngroup.com/articles/page-fold-manifesto/" }
      })
    }

    // 2. Competitor outranks all others
    const sortedComps = [...competitors].sort((a, b) => b.score - a.score)
    if (sortedComps.length > 0) {
      const topComp = sortedComps[0]
      const secondTop = sortedComps.length > 1 ? sortedComps[1] : client
      // Require the top competitor to be uniquely strong (>= 3) and outrank the rest
      if (topComp.score >= 3 && topComp.score > (secondTop?.score || 0)) {
        const topReasoning = ("aiReasoning" in topComp.audit.rubric.firstImpression ? topComp.audit.rubric.firstImpression.aiReasoning : "") || ""
        
        // Find signals that have the tick emoji, fallback to any signals and strip emojis
        const rawSignals = topReasoning.split("\n").filter(l => l.startsWith("- ")).map(l => l.substring(2).trim())
        const tickSignals = rawSignals.filter(s => s.startsWith("😍")).map(s => s.replace(/^😍\s*/, "").trim())
        const signals = tickSignals.length >= 2 ? tickSignals : rawSignals.map(s => s.replace(/^[😍🤔]\s*/, "").trim())
        
        if (signals.length >= 2) {
          insights.push({
            type: "competitor_strength",
            subjects: [topComp.meta.label],
            headline: `${topComp.meta.label} makes a stronger first impression than ${client.meta.label}.`,
            text: `${signals[0]} and ${signals[1].toLowerCase()} are what give ${topComp.meta.label} the lead — both signal a landing experience that knows what it is trying to do.`,
          })
        }
      }
    }

    // 3. Client strong, competitors weak
    const allCompsWeak = competitors.every(c => c.score <= 2)
    if (allCompsWeak && client.score >= 3) {
      insights.push({
        type: "client_strength",
        subjects: [client.meta.label],
        headline: `${client.meta.label} makes a stronger first impression than all competing sites.`,
        text: "Competitors are not landing well. That gap is worth protecting, especially for users who are comparing options side by side.",
      })
    }

    if (insights.length < 2) insights.push(...buildScoreFallbacks(category, audits, sites, 2 - insights.length))
    return insights
  }

  if (client && client.score != null) {
    // Type 1: Client Weakness — client-centric headline, naming the issue specifically.
    const allScores = [...competitors.map((c) => c.score), client.score]
    const minScore = Math.min(...allScores)

    if (client.score === minScore && minScore < 3) {
      const clientInsight = getInsightForAudit(client.audit)
      if (clientInsight) {
        const clientPhrase = conjugateHeadline(clientInsight.headline, false)
        const headline = `${client.meta.label} ${clientPhrase}.`
        insights.push({
          type: "client_weakness",
          subjects: [client.meta.label],
          headline,
          text: clientInsight.text,
          principle: clientInsight.principle,
        })
      }
    }
  }

  // Type 2: Competitor Strength — name the cohort doing it well, tie back to the client.
  const strongCompetitors = competitors.filter((c) => c.score >= 3)
  if (strongCompetitors.length > 0) {
    const insightGroups = new Map<
      string,
      { subjects: string[]; principle?: PrincipleRef; headline: string }
    >()
    for (const comp of strongCompetitors) {
      const compInsight = getInsightForAudit(comp.audit)
      if (compInsight) {
        const key = compInsight.text
        if (!insightGroups.has(key)) {
          insightGroups.set(key, { subjects: [], principle: compInsight.principle, headline: compInsight.headline })
        }
        insightGroups.get(key)!.subjects.push(comp.meta.label)
      }
    }

    const clientLabel = client?.meta.label
    const clientLags = client != null && client.score != null && client.score < 3
    for (const [text, group] of insightGroups.entries()) {
      const cohortStr = formatCohort(group.subjects)
      const plural = group.subjects.length > 1
      const phrase = conjugateHeadline(group.headline, plural)
      const tieBack = clientLabel && clientLags ? `, where ${clientLabel} does not` : ""
      insights.push({
        type: "competitor_strength",
        subjects: group.subjects,
        headline: `${cohortStr} ${phrase}${tieBack}.`,
        text,
        principle: group.principle,
      })
    }
  }

  if (insights.length < 2) insights.push(...buildScoreFallbacks(category, audits, sites, 2 - insights.length))
  return insights
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
