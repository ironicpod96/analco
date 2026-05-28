import type {
  AccessibilityInsightGroup,
  ConnectionTest,
  Diagnostic,
  ExtractedMetrics,
  HelpPatterns,
  Opportunity,
  ResourceSummary,
} from "@/lib/types"

const ENDPOINT = "https://www.googleapis.com/pagespeedonline/v5/runPagespeed"
const CATEGORIES = ["performance", "accessibility", "best-practices", "seo"] as const

/**
 * Validate a PageSpeed key without running a full audit.
 * Trick: hit the endpoint with the key but no `url`. Google's response
 * distinguishes between "API key not valid" and "Required parameter: url",
 * so we can decide validity from the error shape alone.
 */
export async function testPageSpeedKey(key: string): Promise<ConnectionTest> {
  if (!key.trim()) return { ok: false, error: "Key is empty" }
  try {
    const res = await fetch(`${ENDPOINT}?key=${encodeURIComponent(key)}`)
    const data = (await res.json().catch(() => null)) as
      | { error?: { code?: number; message?: string; errors?: Array<{ reason?: string; message?: string }> } }
      | null

    const message = data?.error?.message ?? ""
    const reasons = (data?.error?.errors ?? []).map((e) => e.reason ?? "")

    if (/api key not valid/i.test(message) || reasons.includes("badRequest") && /api key/i.test(message)) {
      return { ok: false, error: "API key not valid" }
    }
    if (reasons.includes("keyInvalid")) {
      return { ok: false, error: "API key not valid" }
    }
    if (/required parameter: url/i.test(message) || reasons.includes("required")) {
      return { ok: true }
    }
    if (res.ok) return { ok: true }

    return { ok: false, error: message || `HTTP ${res.status}` }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Network error" }
  }
}

type Audit = {
  id?: string
  title?: string
  score?: number | null
  numericValue?: number
  displayValue?: string
  scoreDisplayMode?: string
  details?: {
    type?: string
    overallSavingsMs?: number
    items?: unknown[]
    data?: string
  }
}

type FieldMetric = {
  percentile?: number
}

type LoadingExperience = {
  metrics?: {
    LARGEST_CONTENTFUL_PAINT_MS?: FieldMetric
    INTERACTION_TO_NEXT_PAINT?: FieldMetric
    INTERACTION_TO_NEXT_PAINT_MS?: FieldMetric
    CUMULATIVE_LAYOUT_SHIFT_SCORE?: FieldMetric
  }
}

type RawPageSpeed = {
  loadingExperience?: LoadingExperience
  originLoadingExperience?: LoadingExperience
  lighthouseResult?: {
    finalUrl?: string
    finalDisplayedUrl?: string
    runtimeError?: {
      code?: string
      message?: string
    }
    categories?: {
      performance?: { score?: number; auditRefs?: Array<{ id: string; group?: string }> }
      accessibility?: { score?: number; auditRefs?: Array<{ id: string; group?: string }> }
      "best-practices"?: { score?: number }
      seo?: { score?: number }
    }
    categoryGroups?: Record<string, { title?: string; description?: string }>
    audits?: Record<string, Audit>
  }
}

export class PageSpeedError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "PageSpeedError"
  }
}

export async function fetchPageSpeed(url: string, key: string): Promise<RawPageSpeed> {
  const attempts = buildPageSpeedAttempts(url)
  let lastError = ""

  for (let i = 0; i < attempts.length; i += 1) {
    const attempt = attempts[i]
    if (i > 0) await delay(700)

    try {
      const raw = await requestPageSpeed(attempt, key)
      const runtimeError = raw.lighthouseResult?.runtimeError
      if (runtimeError?.message || runtimeError?.code) {
        const message = describeRuntimeError(runtimeError)
        lastError = message
        if (isRetryablePageSpeedError(message, runtimeError.code)) continue
        throw new PageSpeedError(message)
      }
      return raw
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown PageSpeed error"
      lastError = message
      if (!isRetryablePageSpeedError(message) || i === attempts.length - 1) {
        throw new PageSpeedError(describeFailedAttempts(url, attempts.slice(0, i + 1), message))
      }
    }
  }

  throw new PageSpeedError(describeFailedAttempts(url, attempts, lastError))
}

async function requestPageSpeed(url: string, key: string): Promise<RawPageSpeed> {
  const params = new URLSearchParams()
  params.set("url", url)
  params.set("strategy", "desktop")
  params.set("key", key)
  for (const c of CATEGORIES) params.append("category", c)

  const res = await fetch(`${ENDPOINT}?${params.toString()}`)
  if (!res.ok) {
    const data = (await res.json().catch(() => null)) as
      | { error?: { message?: string } }
      | null
    throw new PageSpeedError(data?.error?.message ?? `HTTP ${res.status}`)
  }
  return (await res.json()) as RawPageSpeed
}

function buildPageSpeedAttempts(url: string): string[] {
  const attempts = [url]
  const www = withWww(url)
  if (www && www !== url) attempts.push(url, www)
  else attempts.push(url)
  return attempts
}

function withWww(raw: string): string | null {
  try {
    const url = new URL(raw)
    const parts = url.hostname.split(".")
    if (url.hostname.startsWith("www.") || parts.length !== 2) return null
    url.hostname = `www.${url.hostname}`
    return url.toString().replace(/\/$/, "")
  } catch {
    return null
  }
}

function describeRuntimeError(error: { code?: string; message?: string }): string {
  const message = error.message?.trim() || "Lighthouse failed while auditing this page"
  return error.code ? `${message} (${error.code})` : message
}

function describeFailedAttempts(originalUrl: string, attempts: string[], message: string): string {
  const unique = Array.from(new Set(attempts))
  if (attempts.length <= 1) return message
  const retried =
    unique.length > 1
      ? ` Retried ${unique
          .filter((attempt) => attempt !== originalUrl)
          .join(", ")}.`
      : " Retried once."
  return `${message}.${retried}`
}

function isRetryablePageSpeedError(message: string, code?: string): boolean {
  return (
    /something went wrong|internal error|try again|timed out|timeout|lighthouse returned error/i.test(
      message
    ) ||
    code === "ERRORED_DOCUMENT_REQUEST" ||
    code === "INTERNAL_ERROR" ||
    code === "PROTOCOL_TIMEOUT"
  )
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => globalThis.setTimeout(resolve, ms))
}

export function extractMetrics(url: string, raw: RawPageSpeed): ExtractedMetrics {
  const lh = raw.lighthouseResult
  const audits = lh?.audits ?? {}

  const scores = {
    performance: numScore(lh?.categories?.performance?.score),
    accessibility: numScore(lh?.categories?.accessibility?.score),
    bestPractices: numScore(lh?.categories?.["best-practices"]?.score),
    seo: numScore(lh?.categories?.seo?.score),
  }

  const cwv = extractCwv(raw, audits)

  const opportunities = extractOpportunities(audits)
  const diagnostics = extractDiagnostics(audits, lh?.categories?.performance?.auditRefs)
  const resourceSummary = extractResourceSummary(audits)
  const screenshot = audits["final-screenshot"]?.details?.data ?? ""
  const fullPageScreenshot = extractFullPageScreenshot(audits)
  const helpPatterns = extractHelpPatterns(audits)
  const accessibilityInsights = extractAccessibilityInsights(
    audits,
    lh?.categories?.accessibility?.auditRefs,
    lh?.categoryGroups
  )

  return {
    url,
    finalUrl: lh?.finalDisplayedUrl ?? lh?.finalUrl ?? url,
    fetchedAt: new Date().toISOString(),
    scores,
    cwv,
    opportunities,
    diagnostics,
    resourceSummary,
    screenshot,
    fullPageScreenshot,
    fullPageScreenshotSource: fullPageScreenshot ? "pagespeed" : undefined,
    audits: {
      headingOrder: { score: audits["heading-order"]?.score ?? null },
      domSize: { numericValue: audits["dom-size"]?.numericValue ?? 0 },
      tapTargets: { score: audits["tap-targets"]?.score ?? null },
      linkText: { score: audits["link-text"]?.score ?? null },
      helpPatterns,
      accessibilityInsights,
    },
  }
}

function extractCwv(raw: RawPageSpeed, audits: Record<string, Audit>): ExtractedMetrics["cwv"] {
  const pageField = cwvFromField(raw.loadingExperience, "field-url")
  if (pageField) return pageField

  const originField = cwvFromField(raw.originLoadingExperience, "field-origin")
  if (originField) return originField

  return {
    lcp: audits["largest-contentful-paint"]?.numericValue ?? 0,
    cls: audits["cumulative-layout-shift"]?.numericValue ?? 0,
    inp:
      audits["interaction-to-next-paint"]?.numericValue ??
      audits["experimental-interaction-to-next-paint"]?.numericValue ??
      0,
    source: "lighthouse",
  }
}

function cwvFromField(
  experience: LoadingExperience | undefined,
  source: "field-url" | "field-origin"
): ExtractedMetrics["cwv"] | null {
  const metrics = experience?.metrics
  const lcp = metrics?.LARGEST_CONTENTFUL_PAINT_MS?.percentile
  const inp =
    metrics?.INTERACTION_TO_NEXT_PAINT?.percentile ??
    metrics?.INTERACTION_TO_NEXT_PAINT_MS?.percentile
  const cls = metrics?.CUMULATIVE_LAYOUT_SHIFT_SCORE?.percentile
  if (typeof lcp !== "number" && typeof inp !== "number" && typeof cls !== "number") return null
  return {
    lcp: typeof lcp === "number" ? lcp : 0,
    inp: typeof inp === "number" ? inp : 0,
    cls: typeof cls === "number" ? cls / 100 : 0,
    source,
  }
}

function numScore(v: unknown): number {
  return typeof v === "number" ? v : 0
}

function extractOpportunities(audits: Record<string, Audit>): Opportunity[] {
  const out: Opportunity[] = []
  for (const [id, a] of Object.entries(audits)) {
    if (a?.details?.type === "opportunity") {
      const savings = a.details.overallSavingsMs ?? 0
      if (savings > 0) {
        out.push({ id, title: a.title ?? id, savingsMs: savings })
      }
    }
  }
  return out.sort((a, b) => b.savingsMs - a.savingsMs).slice(0, 5)
}

function extractDiagnostics(
  audits: Record<string, Audit>,
  refs: Array<{ id: string; group?: string }> | undefined
): Diagnostic[] {
  if (!refs) return []
  const out: Diagnostic[] = []
  for (const ref of refs) {
    if (ref.group !== "diagnostics") continue
    const a = audits[ref.id]
    if (!a) continue
    const failing = a.score === null || (typeof a.score === "number" && a.score < 0.9)
    if (!failing) continue
    out.push({ id: ref.id, title: a.title ?? ref.id, displayValue: a.displayValue })
  }
  return out.slice(0, 5)
}

function extractResourceSummary(audits: Record<string, Audit>): ResourceSummary {
  const items = (audits["resource-summary"]?.details?.items ?? []) as Array<{
    resourceType?: string
    transferSize?: number
  }>
  const byType = (type: string) =>
    items.find((i) => i.resourceType === type)?.transferSize ?? 0
  return {
    js: byType("script"),
    css: byType("stylesheet"),
    image: byType("image"),
    font: byType("font"),
    other: byType("media") + byType("document") + byType("other") + byType("third-party"),
    total: byType("total"),
  }
}

function extractFullPageScreenshot(audits: Record<string, Audit>): string {
  const details = audits["full-page-screenshot"]?.details as
    | { screenshot?: { data?: string } }
    | undefined
  return details?.screenshot?.data ?? ""
}

function extractHelpPatterns(audits: Record<string, Audit>): HelpPatterns {
  const text = collectHints(audits).toLowerCase()
  return {
    hasFaq: /\bfaq\b|frequently asked/.test(text),
    hasChat: /(live chat|chat (?:with|now|widget)|chatbot|messenger|intercom|drift|zendesk chat)/.test(
      text
    ),
    hasHelpCenter: /(help cent(?:er|re)|knowledge base|support cent(?:er|re))/.test(text),
    hasContact: /(contact us|contact form|get in touch|reach out)/.test(text),
    hasPhone: /(hotline|phone|telephone|call us|\btel:|\b\d{3}[-.\s]\d{3}[-.\s]\d{4}\b)/.test(text),
  }
}

function extractAccessibilityInsights(
  audits: Record<string, Audit>,
  refs: Array<{ id: string; group?: string }> | undefined,
  groups: Record<string, { title?: string; description?: string }> | undefined
): AccessibilityInsightGroup[] {
  if (!refs) return []
  const byGroup = new Map<string, AccessibilityInsightGroup>()
  for (const ref of refs) {
    const audit = audits[ref.id]
    if (!audit) continue
    if (audit.score === null || (typeof audit.score === "number" && audit.score < 1)) {
      const groupId = ref.group ?? "a11y-other"
      const groupMeta = groups?.[groupId]
      const existing = byGroup.get(groupId)
      const group =
        existing ??
        {
          id: groupId,
          title: groupMeta?.title ?? fallbackAccessibilityGroupTitle(groupId),
          description:
            groupMeta?.description ?? fallbackAccessibilityGroupDescription(groupId),
          items: [],
        }
      const detail = audit.displayValue ? ` (${audit.displayValue})` : ""
      group.items.push(`${audit.title ?? ref.id}${detail}`)
      byGroup.set(groupId, group)
    }
  }
  return Array.from(byGroup.values()).slice(0, 6)
}

function fallbackAccessibilityGroupTitle(groupId: string): string {
  const labels: Record<string, string> = {
    "a11y-aria": "ARIA",
    "a11y-names-labels": "Names and labels",
    "a11y-tables-lists": "Tables and lists",
    "a11y-navigation": "Navigation",
    "a11y-color-contrast": "Contrast",
    "a11y-language": "Language",
    "a11y-audio-video": "Audio and video",
    "a11y-best-practices": "Best practices",
  }
  return labels[groupId] ?? "Additional accessibility flags"
}

function fallbackAccessibilityGroupDescription(groupId: string): string {
  if (groupId === "a11y-aria") {
    return "These are opportunities to improve the usage of ARIA in your application which may enhance the experience for users of assistive technology, like a screen reader."
  }
  if (groupId === "a11y-names-labels") {
    return "These are opportunities to improve the semantics of the controls in your application. This may enhance the experience for users of assistive technology, like a screen reader."
  }
  return "These are opportunities to improve accessibility for users of assistive technology."
}

function collectHints(audits: Record<string, Audit>): string {
  const hints: string[] = []
  for (const a of Object.values(audits)) {
    const items = a?.details?.items
    if (!Array.isArray(items)) continue
    for (const item of items) {
      if (item && typeof item === "object") {
        const obj = item as Record<string, unknown>
        if (typeof obj.text === "string") hints.push(obj.text)
        if (typeof obj.url === "string") hints.push(obj.url)
        const node = obj.node as Record<string, unknown> | undefined
        if (node) {
          if (typeof node.snippet === "string") hints.push(node.snippet)
          if (typeof node.nodeLabel === "string") hints.push(node.nodeLabel)
        }
      }
    }
  }
  return hints.join(" ")
}
