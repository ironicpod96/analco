export type ApiKeys = {
  pagespeed: string
  anthropic: string
}

export type GoogleWorkspaceKeys = {
  apiKey: string
  clientId: string
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
  hasPhone: boolean
}

export type AccessibilityInsightGroup = {
  id: string
  title: string
  description: string
  items: string[]
}

export type RubricScale = 1 | 2 | 3

export type AutoScore = {
  score: RubricScale
  source: "auto"
  evidence: string
}

export type HybridSource = "ai_pending" | "ai_suggested" | "confirmed" | "manual_override"

export type PrincipleRef = {
  title: string
  url: string
}

export type RichTextRun = {
  text: string
  bold?: boolean
  italic?: boolean
}

export type RichTextBlock = {
  runs: RichTextRun[]
}

export type RichTextContent = {
  blocks: RichTextBlock[]
}

export type CrossSiteInsightOverride = {
  headline?: string
  text?: string
  principle?: PrincipleRef | null
  updatedAt: string
}

export type HybridScore = {
  score: RubricScale | null
  source: HybridSource
  aiSuggested: RubricScale | null
  aiReasoning: string
  aiPrinciples?: PrincipleRef[]
  userNote?: string
}

export type ManualScore = {
  score: RubricScale | null
  source: "manual"
  userNote?: string
  aiPrinciples?: PrincipleRef[]
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

export type UserImages = {
  screenshot?: string
  firstImpression?: string
  visualHierarchy?: string[]
  helpSupport?: string[]
}

export type RowScoringStatus = "idle" | "scoring" | "error"

export type MiniScaleValue = 0 | 1 | 2
export type NullableMiniScaleValue = MiniScaleValue | null

export type NavigationSignals = {
  labelClarity: NullableMiniScaleValue
  pathConfidence: NullableMiniScaleValue
  navbarLoad: NullableMiniScaleValue
  l1ItemCount: NullableMiniScaleValue
}

export type VisualHierarchySignals = {
  scanEase: NullableMiniScaleValue
  fontBalance: NullableMiniScaleValue
  whitespaceUsage: NullableMiniScaleValue
  sectionColorDiff: NullableMiniScaleValue
  ctaPlacement: NullableMiniScaleValue
}

export type TaskCompletionSignals = {
  interrupted: "frequently" | "somewhat" | "no" | null
  ease: "hard" | "ok" | "easy" | null
  duration: "long" | "moderate" | "quick" | null
}

export type ConsistencySignals = {
  pageCoherence: NullableMiniScaleValue
  navigation: NullableMiniScaleValue
  visualLang: NullableMiniScaleValue
  interactions: NullableMiniScaleValue
  terminologyShifts: boolean
  contentAvailabilityIssue: boolean
}

export type HelpSupportSignals = {
  supportWithinReach: boolean | null
  faqAnswered: boolean | null
}

export type FirstImpressionSignals = {
  scope: "hero" | "full"
  ctaAboveFold?: "yes" | "no" | null
  heroClarity?: "clear" | "confusing" | null
}

export type RubricSignals = {
  taskCompletion?: TaskCompletionSignals
  navigation?: NavigationSignals
  visualHierarchy?: VisualHierarchySignals
  consistency?: ConsistencySignals
  helpSupport?: HelpSupportSignals
  firstImpression?: FirstImpressionSignals
}

export type KnowledgeCategory =
  | "First Impressions"
  | "Navigation"
  | "Task Completion"
  | "Visual Hierarchy"
  | "Consistency"
  | "Accessibility"
  | "Help & Support"
  | "Custom"

export const KNOWLEDGE_CATEGORIES: KnowledgeCategory[] = [
  "First Impressions",
  "Navigation",
  "Task Completion",
  "Visual Hierarchy",
  "Consistency",
  "Accessibility",
  "Help & Support",
  "Custom",
]

export type KnowledgeEntry = {
  id: string
  category: string
  title: string
  url: string
  blurb?: string
}

export type ImpostorReason =
  | "similar_ux"
  | "industry_reference"
  | "user_disputes"

export type SiteRole = "primary" | "reference"

export type SiteClassification = {
  url: string
  role: SiteRole
  reason?: ImpostorReason
}

export type IndustryClassification = {
  industry: string
  classifiedAt: string
  sites: SiteClassification[]
}

export type NavItem = {
  label: string
  href?: string
  children?: NavItem[]
}

export type NavData = {
  brand?: NavItem
  primary: NavItem[]
  utilities: NavItem[]
  ctas: NavItem[]
  breadcrumbs?: NavItem[]
  sidebar?: NavItem[]
  meta: {
    confidence: "high" | "medium" | "low"
    notes: string[]
  }
}

export type SiteAudit = {
  url: string
  metrics: ExtractedMetrics
  rubric: RubricScores
  lastScoredAt: string
  userImages?: UserImages
  rubricSignals?: RubricSignals
  consistencyReport?: string
  navData?: NavData
  scoringStatus?: Partial<Record<RubricKey, RowScoringStatus>>
  isClient?: boolean
}

export type LastRun = {
  runId: string
  startedAt: string
  urls: string[]
  sites: SiteAudit[]
  crossSiteSynthesis?: string
  crossSiteInsightOverrides?: Record<string, CrossSiteInsightOverride>
  classification?: IndustryClassification
  clientUrl?: string
}

export type SavedRun = {
  id: string
  name: string
  savedAt: string
  run: LastRun
  imageRefs?: Record<
    string,
    {
      metrics?: Partial<Record<"screenshot" | "fullPageScreenshot" | "navigationMobileScreenshot" | "visualHierarchyScreenshot", string>>
      metricArrays?: {
        visualHierarchySectionScreenshots?: string[]
      }
      userImages?: {
        screenshot?: string
        firstImpression?: string
        visualHierarchy?: string[]
        helpSupport?: string[]
      }
    }
  >
}

export type PromptKey =
  | "firstImpression"
  | "navigation"
  | "visualHierarchy"
  | "helpSupport"

export type PromptOverrides = Partial<Record<PromptKey, string>>

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
    source?: "field-url" | "field-origin" | "lighthouse"
  }
  opportunities: Opportunity[]
  diagnostics: Diagnostic[]
  resourceSummary: ResourceSummary
  screenshot: string
  fullPageScreenshot: string
  navigationMobileScreenshot?: string
  visualHierarchyScreenshot?: string
  visualHierarchySectionScreenshots?: string[]
  visualHierarchyScreenshotTarget?: string
  fullPageScreenshotSource?: "pagespeed" | "screenshotone"
  audits: {
    headingOrder: { score: number | null }
    domSize: { numericValue: number }
    tapTargets: { score: number | null }
    linkText: { score: number | null }
    helpPatterns: HelpPatterns
    accessibilityInsights: AccessibilityInsightGroup[]
  }
}
