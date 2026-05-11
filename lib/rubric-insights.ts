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
  headline: string
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
  headline: string
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

export function buildHelpSupportInsight(
  signals: HelpSupportSignals,
  knowledge: KnowledgeEntry[]
): RubricInsight | null {
  return resolveInsight(signals, knowledge, HELP_SUPPORT_RULES)
}

export function buildTaskCompletionInsight(
  signals: TaskCompletionSignals,
  knowledge: KnowledgeEntry[]
): RubricInsight | null {
  return resolveInsight(signals, knowledge, TASK_COMPLETION_RULES)
}

function resolveInsight<T>(
  signals: T,
  knowledge: KnowledgeEntry[],
  rules: Array<InsightRule<T>>
): RubricInsight | null {
  const rule = rules.find((item) => item.when(signals))
  if (!rule) return null
  return {
    headline: rule.headline,
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
    when: (s) => (s.l1ItemCount ?? 0) >= 1,
    headline: "carry 8 or more top-level nav items, above Miller's 7±2 working-memory threshold",
    text: "The top-level nav holds 8 or more items, past the 7±2 working-memory threshold. Per Miller's Law, that's more choices than users can hold at once — grouping or collapsing items fixes it.",
    principleTitle: "Miller's Law",
  },
  {
    when: (s) => lowCount([s.labelClarity, s.pathConfidence, s.navbarLoad]) >= 2,
    headline: "weaken information scent across multiple navigation signals at once",
    text: "Multiple weak navigation signals leave users uncertain before they can choose a route. Information Scent calls this a broken trail — labels need to promise a destination, not just point somewhere.",
    principleTitle: "Information Scent",
  },
  {
    when: (s) => s.labelClarity === 2 && s.pathConfidence === 2 && s.navbarLoad === 2,
    headline: "navigate with a structure that matches familiar expectations end to end",
    text: "Every navigation signal lines up — labels are clear, paths feel predictable, the navbar reads light. Per Jakob's Law, users expect a site to behave like the ones they already know, and this one does.",
    principleTitle: "Jakob's Law",
  },
  {
    when: (s) => s.labelClarity === 0 && s.pathConfidence === 2,
    headline: "use vague labels even where users can still find the right path",
    text: "Labels are vague but users can still find the right path. Per Information Scent, a label needs to promise the destination — pointing in the right direction is not the same as promising it.",
    principleTitle: "Information Scent",
  },
  {
    when: (s) => s.labelClarity === 2 && s.pathConfidence === 0,
    headline: "use clear labels over an IA that does not match user goals",
    text: "Labels are clear but the IA does not match user goals. Mental Models is the issue — the structure reflects how the company thinks, not how users think about their task.",
    principleTitle: "Mental Models",
  },
  {
    when: (s) => s.navbarLoad === 0 && s.labelClarity === 0,
    headline: "force users to compare too many unclear options at once",
    text: "A heavy navbar with vague labels forces users to compare too many unclear choices. Hick's Law is direct — decision time climbs with every extra option, and unclear labels make each one harder to dismiss.",
    principleTitle: "Hick's Law",
  },
  {
    when: (s) => s.labelClarity === 0,
    headline: "rely on vague labels that hide what sits behind each nav item",
    text: "Labels do not tell users what sits behind each nav item. Information Scent names this a broken trail — without evidence of what lies ahead, users are committing blind.",
    principleTitle: "Information Scent",
  },
  {
    when: (s) => s.labelClarity === 2,
    headline: "use labels users can recognise without translating internal terminology",
    text: "Labels let users recognise the right route without translating internal terminology. Recognition Over Recall is the gain — users see what they need instead of having to remember where it might be.",
    principleTitle: "Recognition Over Recall",
  },
  {
    when: (s) => s.pathConfidence === 0,
    headline: "structure navigation around internal logic rather than user goals",
    text: "Users cannot confidently choose the route that matches their goal. Mental Models identifies the root — the IA reflects internal logic rather than how users think about their task.",
    principleTitle: "Mental Models",
  },
  {
    when: (s) => s.pathConfidence === 2,
    headline: "make the next route feel familiar and predictable",
    text: "The next route feels familiar and predictable. Per Jakob's Law, that is because the structure borrows from patterns users already trust.",
    principleTitle: "Jakob's Law",
  },
  {
    when: (s) => s.navbarLoad === 0,
    headline: "load the navbar with too many options to compare at once",
    text: "The navbar asks users to compare too many options at once. Hick's Law is the mechanism — every additional option lengthens how long it takes to choose.",
    principleTitle: "Hick's Law",
  },
  {
    when: (s) => s.navbarLoad === 2,
    headline: "keep the navbar light enough to reveal structure on first scan",
    text: "The navbar reveals enough structure on first scan without overwhelming. Progressive Disclosure is the principle at work — show what is needed now, surface the rest later.",
    principleTitle: "Progressive Disclosure",
  },
]

const VISUAL_HIERARCHY_RULES: Array<InsightRule<VisualHierarchySignals>> = [
  {
    when: (s) => s.scanEase === 2 && s.fontBalance === 2 && s.whitespaceUsage === 2 && s.ctaPlacement === 2,
    headline: "make the next step easy to detect, compare, and act on",
    text: "Hierarchy makes the next step easy to detect and act on. Per the Von Restorff Effect, the element that stands apart is the one users notice and remember.",
    principleTitle: "Von Restorff Effect",
  },
  {
    when: (s) => s.ctaPlacement === 0,
    headline: "hide the primary CTA below the fold",
    text: "The primary CTA sits below the fold. Per the Above the Fold Principle, the zone users read first should hold the most important action — not reward those who scroll.",
    principleTitle: "Above the Fold Principle",
  },
  {
    when: (s) => s.whitespaceUsage === 0 && s.scanEase === 0,
    headline: "flatten hierarchy with cramped whitespace and hard scanning",
    text: "Cramped whitespace flattens hierarchy into undifferentiated content. Per the Whitespace Principle, without breathing room, nothing reads as more important than anything else.",
    principleTitle: "Whitespace Principle",
  },
  {
    when: (s) => s.fontBalance === 0 && s.scanEase === 0,
    headline: "use type scale and weight that give the eye no starting point",
    text: "Flat type scale and weight mean the eye cannot lock onto a starting point. Visual Search Theory describes this as visual noise — emphasis disappears when nothing on the page leads it.",
    principleTitle: "Visual Search Theory",
  },
  {
    when: (s) => s.sectionColorDiff === 0 && s.scanEase === 0,
    headline: "merge sections into undivided blocks with no visible breaks",
    text: "Without distinct section treatments, unrelated content reads as a single block. The Law of Similarity is the cause — similar surfaces group, even when their content is unrelated.",
    principleTitle: "Law of Similarity",
  },
  {
    when: (s) => s.scanEase === 0,
    headline: "give the eye no clear path to follow on first scan",
    text: "The first scan offers no clear path for the eye to follow. Per Visual Search Theory, when nothing guides attention, users scan everything and retain little.",
    principleTitle: "Visual Search Theory",
  },
  {
    when: (s) => s.scanEase === 2,
    headline: "guide the eye along a clear reading order",
    text: "The page guides the eye along a clear reading order. Per the Serial Position Effect, what users encounter first and last carries disproportionate weight — so a clear scan path makes placement decisions matter.",
    principleTitle: "Serial Position Effect",
  },
  {
    when: (s) => s.fontBalance === 0,
    headline: "use typography that does not direct attention",
    text: "Type scale and weight are not directing attention. Per Gestalt Principles, the eye groups by size and contrast — when neither differentiates content, everything competes equally.",
    principleTitle: "Gestalt Principles",
  },
  {
    when: (s) => s.fontBalance === 2,
    headline: "use typography that reinforces priority and grouping",
    text: "Typography reinforces priority and grouping. Per Gestalt Principles, size and weight alone are enough for the eye to understand which elements belong together.",
    principleTitle: "Gestalt Principles",
  },
  {
    when: (s) => s.whitespaceUsage === 0,
    headline: "cram content into tight spaces that collapse hierarchy",
    text: "Content is crammed into tight spaces, collapsing hierarchy. The Whitespace Principle is direct — space is not decoration; it is the signal that separates what matters from what does not.",
    principleTitle: "Whitespace Principle",
  },
  {
    when: (s) => s.sectionColorDiff === 0,
    headline: "use flat section color that erases wayfinding cues",
    text: "Flat section color erases a key wayfinding cue. Per the Law of Proximity, unseparated elements read as belonging together, and structure disappears into sameness.",
    principleTitle: "Law of Proximity",
  },
  {
    when: (s) => s.ctaPlacement === 2,
    headline: "place the primary CTA where attention already lands",
    text: "The primary CTA lands at the top and the bottom, keeping the action within reach. Per the Above the Fold Principle, when the action lands where attention lands, the conversion path opens without effort.",
    principleTitle: "Above the Fold Principle",
  },
]

const CONSISTENCY_RULES: Array<InsightRule<ConsistencySignals>> = [
  {
    when: (s) => s.contentAvailabilityIssue,
    headline: "show content in one place and hide it in another",
    text: "Content listed in one place is missing in another. Per Error of Omission, the absence of expected content reads as a system fault and speaks louder than anything else on the page.",
    principleTitle: "Error of Omission",
  },
  {
    when: (s) => lowCount([s.pageCoherence, s.navigation, s.visualLang, s.interactions]) >= 2,
    headline: "break consistency across multiple system-level patterns at once",
    text: "Multiple consistency breaks point to a system-level issue rather than local polish. Per Consistency and Standards, every pattern change forces users to pause and relearn the rules.",
    principleTitle: "Consistency and Standards",
  },
  {
    when: (s) => s.pageCoherence === 2 && s.navigation === 2 && s.visualLang === 2 && s.interactions === 2 && !s.terminologyShifts,
    headline: "behave consistently so the system can be learned once and reused throughout",
    text: "The system can be learned once and reused throughout. Per Jakob's Law, consistent behaviour borrows trust from every other site users have already learned.",
    principleTitle: "Jakob's Law",
  },
  {
    when: (s) => s.navigation === 0 && s.terminologyShifts,
    headline: "shift both navigation and terminology, breaking the user's mental map twice over",
    text: "Both navigation and terminology shift between pages. Per Mental Models, users carry an internal map of where things should be — this breaks it twice over in one step.",
    principleTitle: "Mental Models",
  },
  {
    when: (s) => s.pageCoherence === 0 && s.navigation === 0,
    headline: "force users to reorient every time they move between pages",
    text: "Pages do not cohere and the nav shifts as users move through them. Per Jakob's Law, every inconsistency between pages spends trust the site has not yet earned back.",
    principleTitle: "Jakob's Law",
  },
  {
    when: (s) => s.pageCoherence === 0,
    headline: "feel like separate experiences rather than one system",
    text: "Pages feel like separate experiences rather than one system. Per Consistency and Standards, each page that feels different is a page that makes users start over.",
    principleTitle: "Consistency and Standards",
  },
  {
    when: (s) => s.pageCoherence === 2,
    headline: "feel coherent across pages so expectations stay stable",
    text: "The structure feels coherent across pages so expectations stay stable. Per Jakob's Law, that coherence reads as familiar because it matches what users already know from elsewhere.",
    principleTitle: "Jakob's Law",
  },
  {
    when: (s) => s.navigation === 0,
    headline: "shift navigation across pages so users must rebuild their sense of location",
    text: "Navigation shifts between pages, forcing users to rebuild their sense of location. Per Mental Models, users predict location from structure — a nav that moves breaks that prediction every time.",
    principleTitle: "Mental Models",
  },
  {
    when: (s) => s.navigation === 2,
    headline: "keep navigation stable across the journey",
    text: "Navigation stays stable across the journey. Per Jakob's Law, a nav that stays put costs the user nothing to relearn.",
    principleTitle: "Jakob's Law",
  },
  {
    when: (s) => s.visualLang === 0,
    headline: "vary visual language so users cannot tell what is clickable, structural, or decorative",
    text: "Visual language varies, so users cannot tell what is clickable, structural, or decorative. Per Consistency and Standards, when the interface does not follow its own rules, every element becomes ambiguous.",
    principleTitle: "Consistency and Standards",
  },
  {
    when: (s) => s.visualLang === 2,
    headline: "repeat visual patterns users can parse on sight",
    text: "Visual patterns repeat and become easy to parse on sight. Per Recognition Over Recall, familiar patterns let users move without stopping to decode each element.",
    principleTitle: "Recognition Over Recall",
  },
  {
    when: (s) => s.interactions === 0,
    headline: "vary interaction behaviour so users have to relearn controls",
    text: "Controls behave differently from one place to the next, forcing users to relearn them. Per Consistency and Standards, users stop trusting what they are about to touch when behaviour shifts without reason.",
    principleTitle: "Consistency and Standards",
  },
  {
    when: (s) => s.interactions === 2,
    headline: "behave predictably so users can trust each control on contact",
    text: "Controls behave predictably, so users can trust each one on contact. Per Recognition Over Recall, predictable behaviour frees users to focus on their task rather than the interface.",
    principleTitle: "Recognition Over Recall",
  },
  {
    when: (s) => s.terminologyShifts,
    headline: "use different words for the same thing across the site",
    text: "Similar things are named in different ways across the site. Per Recognition Over Recall, that adds memory burden users should not be carrying.",
    principleTitle: "Recognition Over Recall",
  },
]

const TASK_COMPLETION_RULES: Array<InsightRule<TaskCompletionSignals>> = [
  {
    when: (s) => s.interrupted === "no" && s.ease === "easy" && s.duration === "quick",
    headline: "complete the task quickly and without friction",
    text: "The task completes quickly and without friction. Per Cognitive Ease, when a design matches the user's mental model, the effort of using it disappears.",
    principleTitle: "Cognitive Ease",
  },
  {
    when: (s) => s.interrupted === "frequently" && s.ease === "hard",
    headline: "break the task flow with frequent, hard-to-recover interruptions",
    text: "Frequent interruptions plus a hard experience point to a breakdown across the whole flow. Per Error Prevention, the design should make wrong turns difficult before they happen — not force recovery after each one.",
    principleTitle: "Error Prevention",
  },
  {
    when: (s) => s.interrupted === "frequently",
    headline: "place unexpected barriers in the user's path",
    text: "Frequent interruptions place unexpected barriers in the user's path. Per Error Prevention, the design should anticipate where users go wrong and remove those decision points before they happen.",
    principleTitle: "Error Prevention",
  },
  {
    when: (s) => s.ease === "hard" && s.duration === "long",
    headline: "stretch a hard task across a long, indirect path",
    text: "The task is hard and the path to finish is long. Fitts's Law captures the cost of each extra step; Cognitive Load is what accumulates when none of those steps feel obvious.",
    principleTitle: "Fitts's Law",
  },
  {
    when: (s) => s.ease === "hard",
    headline: "demand more mental effort than the task itself requires",
    text: "The interface demands more mental effort than the task itself requires. Per Cognitive Load, when users think about the interface instead of their task, speed and accuracy both drop.",
    principleTitle: "Cognitive Load",
  },
  {
    when: (s) => s.duration === "long" && s.interrupted === "no",
    headline: "keep the path clear but not direct enough",
    text: "The path is clear but not direct enough. Per Progressive Disclosure, when too many steps sit between a user and their goal, shortening the path matters even when each step is easy.",
    principleTitle: "Progressive Disclosure",
  },
  {
    when: (s) => s.duration === "long",
    headline: "stretch the task across too many steps",
    text: "Completion takes too long. Per Fitts's Law, every step between start and finish adds time — even when nothing breaks along the way.",
    principleTitle: "Fitts's Law",
  },
  {
    when: (s) => s.interrupted === "somewhat" && s.ease === "hard",
    headline: "accumulate friction at points that are hard to escape",
    text: "Friction accumulates at specific points and is hard to recover from. Per Error Recovery, each barrier that is hard to escape becomes a potential exit point for the user.",
    principleTitle: "Error Recovery",
  },
  {
    when: (s) => s.interrupted === "somewhat",
    headline: "interrupt the task without fully blocking it",
    text: "The task is passable but not smooth. Per Error Prevention, each interruption is a point where the design failed to anticipate what the user needed next.",
    principleTitle: "Error Prevention",
  },
  {
    when: (s) => s.ease === "easy" && s.interrupted === "no",
    headline: "keep the task path matched to how users think",
    text: "The task path matches how users think — no friction, no surprises. Per Miller's Law, each step presents only what the user can hold and process without overload.",
    principleTitle: "Miller's Law",
  },
]

const HELP_SUPPORT_RULES: Array<InsightRule<HelpSupportSignals>> = [
  {
    when: (s) => s.supportWithinReach === false && s.faqAnswered === false,
    headline: "offer no accessible support path when users hit a blocker",
    text: "Neither direct contact nor self-serve FAQ is accessible. Per Help and Documentation, users who hit a blocker need a clear path forward — without one, churn is the default outcome.",
    principleTitle: "Help and Documentation",
  },
  {
    when: (s) => s.supportWithinReach === false && s.faqAnswered === true,
    headline: "answer common questions but bury direct contact for complex ones",
    text: "FAQ covers common questions but direct contact is absent or buried. Per Help and Documentation, users with urgent or complex issues — the ones most likely to churn — need a clear escalation path.",
    principleTitle: "Help and Documentation",
  },
  {
    when: (s) => s.supportWithinReach === true && s.faqAnswered === false,
    headline: "offer direct contact but no self-serve FAQ for simple questions",
    text: "Direct contact exists but there is no self-serve FAQ. Per Help and Documentation, structured self-serve content frees both users and support staff from handling simple questions through human channels.",
    principleTitle: "Help and Documentation",
  },
  {
    when: (s) => s.supportWithinReach === true && s.faqAnswered === true,
    headline: "offer both direct contact and self-serve FAQ to match the full range of support needs",
    text: "Direct contact and self-serve FAQ are both in place. Per Help and Documentation, that range matches urgency and preference across the spectrum of support needs.",
    principleTitle: "Help and Documentation",
  },
]
