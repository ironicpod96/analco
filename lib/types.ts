export type ApiKeys = {
  pagespeed: string
  anthropic: string
}

export type ConnectionTest =
  | { ok: true }
  | { ok: false; error: string }

export type Opportunity = {
  id: string
  title: string
  savingsMs: number
}

export type Diagnostic = {
  id: string
  title: string
  displayValue?: string
}

export type ResourceSummary = {
  js: number
  css: number
  image: number
  font: number
  other: number
  total: number
}

export type HelpPatterns = {
  hasFaq: boolean
  hasChat: boolean
  hasContact: boolean
  hasHelpCenter: boolean
}

export type ExtractedMetrics = {
  url: string
  finalUrl: string
  fetchedAt: string
  scores: {
    performance: number
    accessibility: number
    bestPractices: number
    seo: number
  }
  cwv: {
    lcp: number
    inp: number
    cls: number
  }
  opportunities: Opportunity[]
  diagnostics: Diagnostic[]
  resourceSummary: ResourceSummary
  screenshot: string
  audits: {
    headingOrder: { score: number | null }
    domSize: { numericValue: number }
    tapTargets: { score: number | null }
    linkText: { score: number | null }
    helpPatterns: HelpPatterns
  }
}
