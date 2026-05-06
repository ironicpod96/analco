import type {
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

type RawPageSpeed = {
  lighthouseResult?: {
    finalUrl?: string
    finalDisplayedUrl?: string
    categories?: {
      performance?: { score?: number; auditRefs?: Array<{ id: string; group?: string }> }
      accessibility?: { score?: number }
      "best-practices"?: { score?: number }
      seo?: { score?: number }
    }
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

export function extractMetrics(url: string, raw: RawPageSpeed): ExtractedMetrics {
  const lh = raw.lighthouseResult
  const audits = lh?.audits ?? {}

  const scores = {
    performance: numScore(lh?.categories?.performance?.score),
    accessibility: numScore(lh?.categories?.accessibility?.score),
    bestPractices: numScore(lh?.categories?.["best-practices"]?.score),
    seo: numScore(lh?.categories?.seo?.score),
  }

  const cwv = {
    lcp: audits["largest-contentful-paint"]?.numericValue ?? 0,
    cls: audits["cumulative-layout-shift"]?.numericValue ?? 0,
    inp:
      audits["interaction-to-next-paint"]?.numericValue ??
      audits["experimental-interaction-to-next-paint"]?.numericValue ??
      0,
  }

  const opportunities = extractOpportunities(audits)
  const diagnostics = extractDiagnostics(audits, lh?.categories?.performance?.auditRefs)
  const resourceSummary = extractResourceSummary(audits)
  const screenshot = audits["final-screenshot"]?.details?.data ?? ""
  const helpPatterns = extractHelpPatterns(audits)

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
    audits: {
      headingOrder: { score: audits["heading-order"]?.score ?? null },
      domSize: { numericValue: audits["dom-size"]?.numericValue ?? 0 },
      tapTargets: { score: audits["tap-targets"]?.score ?? null },
      linkText: { score: audits["link-text"]?.score ?? null },
      helpPatterns,
    },
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

function extractHelpPatterns(audits: Record<string, Audit>): HelpPatterns {
  const text = collectHints(audits).toLowerCase()
  return {
    hasFaq: /\bfaq\b|frequently asked/.test(text),
    hasChat: /(live chat|chat (?:with|now|widget)|chatbot|messenger|intercom|drift|zendesk chat)/.test(
      text
    ),
    hasHelpCenter: /(help cent(?:er|re)|knowledge base|support cent(?:er|re))/.test(text),
    hasContact: /(contact us|contact form|get in touch|reach out)/.test(text),
  }
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
