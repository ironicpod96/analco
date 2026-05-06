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

export type RubricScale = 1 | 2 | 3 | 4 | 5

export type AutoScore = {
  score: RubricScale
  source: "auto"
  evidence: string
}

export type HybridSource = "ai_pending" | "ai_suggested" | "confirmed" | "manual_override"

export type HybridScore = {
  score: RubricScale | null
  source: HybridSource
  aiSuggested: RubricScale | null
  aiReasoning: string
  userNote?: string
}

export type ManualScore = {
  score: RubricScale | null
  source: "manual"
  userNote?: string
}

export type RollupScore = {
  aiRollup: number
  userOverride: RubricScale | null
}

export type RubricScores = {
  loadingSpeed: AutoScore
  firstImpression: HybridScore
  navigation: HybridScore
  taskCompletion: ManualScore
  visualHierarchy: HybridScore
  consistency: ManualScore
  accessibility: AutoScore
  helpSupport: HybridScore
  uxScoring: RollupScore
}

export type RubricKey = keyof RubricScores

export type SiteAudit = {
  url: string
  metrics: ExtractedMetrics
  rubric: RubricScores
  lastScoredAt: string
}

export type LastRun = {
  runId: string
  startedAt: string
  urls: string[]
  sites: SiteAudit[]
  crossSiteSynthesis?: string
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
