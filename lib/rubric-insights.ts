import type {
  ConsistencySignals,
  FirstImpressionSignals,
  HelpSupportSignals,
  KnowledgeEntry,
  NavigationSignals,
  PrincipleRef,
  RubricSignals,
  TaskCompletionSignals,
  VisualHierarchySignals,
} from "@/lib/types"

export type RubricInsight = {
  text: string
  principle?: PrincipleRef
}

export const DEFAULT_RUBRIC_SIGNALS: Required<RubricSignals> = {
  navigation: {
    labelClarity: null,
    pathConfidence: null,
    navbarLoad: null,
    l1ItemCount: null,
  },
  visualHierarchy: {
    scanEase: null,
    fontBalance: null,
    whitespaceUsage: null,
    sectionColorDiff: null,
    ctaPlacement: null,
  },
  taskCompletion: {
    interrupted: null,
    ease: null,
    duration: null,
  },
  consistency: {
    pageCoherence: null,
    navigation: null,
    visualLang: null,
    interactions: null,
    terminologyShifts: false,
    contentAvailabilityIssue: false,
  },
  helpSupport: {
    supportWithinReach: null,
    faqAnswered: null,
  },
  firstImpression: {
    scope: "hero",
  },
}

type InsightRule<T> = {
  when: (signals: T) => boolean
  text: string
  principleTitle: string
}

export function defaultNavigationSignals(
  signals?: Partial<NavigationSignals>
): NavigationSignals {
  return { ...DEFAULT_RUBRIC_SIGNALS.navigation, ...signals }
}

export function defaultVisualHierarchySignals(
  signals?: Partial<VisualHierarchySignals>
): VisualHierarchySignals {
  return { ...DEFAULT_RUBRIC_SIGNALS.visualHierarchy, ...signals }
}

export function defaultTaskCompletionSignals(
  signals?: Partial<TaskCompletionSignals>
): TaskCompletionSignals {
  return { ...DEFAULT_RUBRIC_SIGNALS.taskCompletion, ...signals }
}

export function defaultConsistencySignals(
  signals?: Partial<ConsistencySignals>
): ConsistencySignals {
  return { ...DEFAULT_RUBRIC_SIGNALS.consistency, ...signals }
}

export function defaultHelpSupportSignals(
  signals?: Partial<HelpSupportSignals>
): HelpSupportSignals {
  return { ...DEFAULT_RUBRIC_SIGNALS.helpSupport, ...signals }
}

export function defaultFirstImpressionSignals(
  signals?: Partial<FirstImpressionSignals>
): FirstImpressionSignals {
  return { ...DEFAULT_RUBRIC_SIGNALS.firstImpression, ...signals }
}

export function buildNavigationInsight(
  signals: NavigationSignals,
  knowledge: KnowledgeEntry[]
): RubricInsight | null {
  return resolveInsight(signals, knowledge, NAVIGATION_RULES)
}

export function buildVisualHierarchyInsight(
  signals: VisualHierarchySignals,
  knowledge: KnowledgeEntry[]
): RubricInsight | null {
  return resolveInsight(signals, knowledge, VISUAL_HIERARCHY_RULES)
}

export function buildConsistencyInsight(
  signals: ConsistencySignals,
  knowledge: KnowledgeEntry[]
): RubricInsight | null {
  return resolveInsight(signals, knowledge, CONSISTENCY_RULES)
}

function resolveInsight<T>(
  signals: T,
  knowledge: KnowledgeEntry[],
  rules: Array<InsightRule<T>>
): RubricInsight | null {
  const rule = rules.find((item) => item.when(signals))
  if (!rule) return null
  return {
    text: rule.text,
    principle: resolvePrinciple(rule.principleTitle, knowledge),
  }
}

function resolvePrinciple(title: string, knowledge: KnowledgeEntry[]): PrincipleRef | undefined {
  const normalized = normalizeTitle(title)
  const entry = knowledge.find((item) => normalizeTitle(item.title) === normalized && item.url.trim())
  if (!entry) return undefined
  return { title: entry.title, url: entry.url }
}

function normalizeTitle(title: string): string {
  return title.trim().toLowerCase().replace(/[’']/g, "'")
}

function lowCount(values: Array<number | null>): number {
  return values.filter((value) => value === 0).length
}

const NAVIGATION_RULES: Array<InsightRule<NavigationSignals>> = [
  {
    when: (s) => (s.l1ItemCount ?? 0) > 7,
    text: "Top-level nav exceeds the 7±2 working-memory threshold. Miller's Law frames this as cognitive overload — group or collapse items so users can hold the structure in mind while choosing.",
    principleTitle: "Miller's Law",
  },
  {
    when: (s) => lowCount([s.labelClarity, s.pathConfidence, s.navbarLoad]) >= 2,
    text: "Multiple weak navigation signals mean users face avoidable uncertainty before they can choose a route. Information Scent frames this as a loss of confidence before the click.",
    principleTitle: "Information Scent",
  },
  {
    when: (s) => s.labelClarity === 2 && s.pathConfidence === 2 && s.navbarLoad === 2,
    text: "Strong navigation signals mean the structure matches familiar expectations and keeps the next step obvious. Jakob's Law frames this as the value of patterns users already know.",
    principleTitle: "Jakob's Law",
  },
  {
    when: (s) => s.labelClarity === 0 && s.pathConfidence === 2,
    text: "Vague label clarity with high path confidence signals users can move forward but may still question whether the path is right. Information Scent frames this as the label's promise before the click.",
    principleTitle: "Information Scent",
  },
  {
    when: (s) => s.labelClarity === 2 && s.pathConfidence === 0,
    text: "Clear labels with low path confidence signal the words are understandable but the structure does not match user goals. Mental Models frames this as a mismatch between site logic and user expectation.",
    principleTitle: "Mental Models",
  },
  {
    when: (s) => s.navbarLoad === 0 && s.labelClarity === 0,
    text: "Heavy navbar load with vague labels means users must compare too many unclear choices. Hick's Law frames this as slower decisions under greater option complexity.",
    principleTitle: "Hick's Law",
  },
  {
    when: (s) => s.labelClarity === 0,
    text: "Vague label clarity means users cannot predict what sits behind each nav item. Information Scent frames this as weak evidence before commitment.",
    principleTitle: "Information Scent",
  },
  {
    when: (s) => s.labelClarity === 2,
    text: "Clear label clarity signals users can recognize the right route without translating internal terminology. Recognition Over Recall frames this as reducing memory effort.",
    principleTitle: "Recognition Over Recall",
  },
  {
    when: (s) => s.pathConfidence === 0,
    text: "Low path confidence means users cannot confidently choose the route that matches their goal. Mental Models frames this as structure failing to match expected tasks.",
    principleTitle: "Mental Models",
  },
  {
    when: (s) => s.pathConfidence === 2,
    text: "High path confidence signals the next route feels familiar and predictable. Jakob's Law frames this as using patterns people already understand.",
    principleTitle: "Jakob's Law",
  },
  {
    when: (s) => s.navbarLoad === 0,
    text: "Heavy navbar load means the nav asks users to compare too many choices at once. Hick's Law frames this as decision time increasing with option complexity.",
    principleTitle: "Hick's Law",
  },
  {
    when: (s) => s.navbarLoad === 2,
    text: "Light navbar load signals the structure reveals enough without overwhelming the first scan. Progressive Disclosure frames this as showing detail only when it becomes useful.",
    principleTitle: "Progressive Disclosure",
  },
]

const VISUAL_HIERARCHY_RULES: Array<InsightRule<VisualHierarchySignals>> = [
  {
    when: (s) => s.scanEase === 2 && s.fontBalance === 2 && s.whitespaceUsage === 2 && s.ctaPlacement === 2,
    text: "Strong hierarchy signals the next step is easy to detect, compare, and act on. Von Restorff Effect frames this as making the important element stand out.",
    principleTitle: "Von Restorff Effect",
  },
  {
    when: (s) => s.ctaPlacement === 0,
    text: "CTA only at the bottom hides the action below the fold. Above the Fold Principle frames this as missing the high-attention zone where users decide whether to engage.",
    principleTitle: "Above the Fold Principle",
  },
  {
    when: (s) => s.whitespaceUsage === 0 && s.scanEase === 0,
    text: "Cramped whitespace with hard scanning means the layout flattens hierarchy. Whitespace Principle frames this as missing the separation that directs attention.",
    principleTitle: "Whitespace Principle",
  },
  {
    when: (s) => s.fontBalance === 0 && s.scanEase === 0,
    text: "Poor font balance with hard scanning signals emphasis is not creating a readable path. Visual Search Theory frames this as friction in finding what matters.",
    principleTitle: "Visual Search Theory",
  },
  {
    when: (s) => s.sectionColorDiff === 0 && s.scanEase === 0,
    text: "Flat section color with hard scanning means users cannot see structural breaks. Law of Similarity frames this as missing visual grouping cues.",
    principleTitle: "Law of Similarity",
  },
  {
    when: (s) => s.scanEase === 0,
    text: "Hard scan-through means users cannot quickly find the next useful thing. Visual Search Theory frames this as weak support for visual search.",
    principleTitle: "Visual Search Theory",
  },
  {
    when: (s) => s.scanEase === 2,
    text: "Easy scan-through signals the page creates a useful reading order. Serial Position Effect frames this as making placement and sequence work harder.",
    principleTitle: "Serial Position Effect",
  },
  {
    when: (s) => s.fontBalance === 0,
    text: "Poor font balance means type scale and weight are not guiding attention. Gestalt Principles frames this as weak perceptual organization.",
    principleTitle: "Gestalt Principles",
  },
  {
    when: (s) => s.fontBalance === 2,
    text: "Good font balance signals typography is reinforcing priority and grouping. Gestalt Principles frames this as clearer relationships between elements.",
    principleTitle: "Gestalt Principles",
  },
  {
    when: (s) => s.whitespaceUsage === 0,
    text: "Cramped whitespace collapses hierarchy and increases cognitive load. Whitespace Principle frames this as the layout failing to direct attention.",
    principleTitle: "Whitespace Principle",
  },
  {
    when: (s) => s.sectionColorDiff === 0,
    text: "Flat section color removes a key wayfinding cue. Law of Proximity frames this as missing the grouping that helps users perceive structure.",
    principleTitle: "Law of Proximity",
  },
  {
    when: (s) => s.ctaPlacement === 2,
    text: "CTA placement at the top and bottom keeps the action within reach throughout the page. Above the Fold Principle frames this as putting the value proposition where attention lands.",
    principleTitle: "Above the Fold Principle",
  },
]

const CONSISTENCY_RULES: Array<InsightRule<ConsistencySignals>> = [
  {
    when: (s) => s.contentAvailabilityIssue,
    text: "Missing content that users expect (e.g. products listed in one place but absent in another) reads as a system error, not a design choice. Error of Omission frames this as a trust break that overrides surface polish.",
    principleTitle: "Error of Omission",
  },
  {
    when: (s) => lowCount([s.pageCoherence, s.navigation, s.visualLang, s.interactions]) >= 2,
    text: "Multiple consistency breaks mean the issue is system-level rather than local polish. Consistency and Standards frames this as the cost of patterns changing across the experience.",
    principleTitle: "Consistency and Standards",
  },
  {
    when: (s) => s.pageCoherence === 2 && s.navigation === 2 && s.visualLang === 2 && s.interactions === 2 && !s.terminologyShifts,
    text: "Strong consistency signals users can learn the system once and reuse that understanding. Jakob's Law frames this as leaning on familiar patterns across the journey.",
    principleTitle: "Jakob's Law",
  },
  {
    when: (s) => s.navigation === 0 && s.terminologyShifts,
    text: "Navigation shifts with terminology shifts mean users lose both location and language stability. Mental Models frames this as breaking the user's expected map of the site.",
    principleTitle: "Mental Models",
  },
  {
    when: (s) => s.pageCoherence === 0 && s.navigation === 0,
    text: "Low page coherence with shifting navigation means users must reorient after moving between pages. Jakob's Law frames this as violating familiar cross-page expectations.",
    principleTitle: "Jakob's Law",
  },
  {
    when: (s) => s.pageCoherence === 0,
    text: "Low page coherence means pages feel like separate experiences rather than one system. Consistency and Standards frames this as weakened continuity.",
    principleTitle: "Consistency and Standards",
  },
  {
    when: (s) => s.pageCoherence === 2,
    text: "High page coherence signals the site structure supports stable expectations. Jakob's Law frames this as preserving familiar experience patterns.",
    principleTitle: "Jakob's Law",
  },
  {
    when: (s) => s.navigation === 0,
    text: "Shifting navigation means users must rebuild their sense of location across pages. Mental Models frames this as disrupting the user's expected route map.",
    principleTitle: "Mental Models",
  },
  {
    when: (s) => s.navigation === 2,
    text: "Stable navigation signals wayfinding remains predictable across the journey. Jakob's Law frames this as consistency with familiar site behavior.",
    principleTitle: "Jakob's Law",
  },
  {
    when: (s) => s.visualLang === 0,
    text: "Inconsistent visual language means styling differences weaken recognizability and trust. Consistency and Standards frames this as a break in shared interface rules.",
    principleTitle: "Consistency and Standards",
  },
  {
    when: (s) => s.visualLang === 2,
    text: "Consistent visual language signals repeated patterns are easier to parse. Recognition Over Recall frames this as reducing the need to relearn meaning.",
    principleTitle: "Recognition Over Recall",
  },
  {
    when: (s) => s.interactions === 0,
    text: "Unpredictable interactions mean users have to relearn controls. Consistency and Standards frames this as behavior changing without a clear reason.",
    principleTitle: "Consistency and Standards",
  },
  {
    when: (s) => s.interactions === 2,
    text: "Predictable interactions signal controls behave according to learned expectations. Recognition Over Recall frames this as letting users recognize patterns instead of remembering exceptions.",
    principleTitle: "Recognition Over Recall",
  },
  {
    when: (s) => s.terminologyShifts,
    text: "Terminology shifts mean similar things are named in different ways. Recognition Over Recall frames this as added memory burden.",
    principleTitle: "Recognition Over Recall",
  },
]
