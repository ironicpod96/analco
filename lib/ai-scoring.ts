import type Anthropic from "@anthropic-ai/sdk"

import { HAIKU_MODEL, makeClient, SONNET_MODEL } from "@/lib/anthropic"
import { computeRollup } from "@/lib/rubric"
import { getPromptOverrides } from "@/lib/storage"
import type {
  ExtractedMetrics,
  HybridScore,
  IndustryClassification,
  KnowledgeEntry,
  PrincipleRef,
  PromptKey,
  RubricScale,
  RubricScores,
  SiteClassification,
} from "@/lib/types"

export type AIRowResult = {
  score: RubricScale
  reasoning: string
  verdict?: string
  signals?: string[]
  read?: string
  ctaAboveFold?: "yes" | "no"
  heroClarity?: "confusing" | "clear"
  principles: PrincipleRef[]
}
export type AISiteResult = {
  firstImpression?: AIRowResult
  navigation?: AIRowResult
  helpSupport?: AIRowResult
}

export type SiteContext = {
  classification?: IndustryClassification
  url: string
}

const ROW_SCHEMA = {
  type: "object",
  properties: {
    score: { type: "integer", enum: [1, 2, 3, 4, 5] },
    verdict: { type: "string" },
    signals: {
      type: "array",
      items: { type: "string" },
    },
    read: { type: "string" },
    principles: {
      type: "array",
      description:
        "Titles of Knowledge Library principles directly referenced or applied. Empty if none apply. Pick only from the supplied list.",
      items: { type: "string" },
    },
  },
  required: ["score", "verdict", "signals", "read", "principles"],
  additionalProperties: false,
} as const

const FIRST_IMPRESSION_SCHEMA = {
  type: "object",
  properties: {
    score: { type: "integer", enum: [1, 2, 3, 4, 5] },
    verdict: { type: "string" },
    signals: {
      type: "array",
      items: { type: "string" },
    },
    ctaAboveFold: {
      type: "string",
      enum: ["yes", "no"],
      description: "Is the primary CTA visible above the fold?",
    },
    heroClarity: {
      type: "string",
      enum: ["confusing", "clear"],
      description: "Is the hero's value proposition clear at a glance?",
    },
    principles: {
      type: "array",
      description:
        "Titles of Knowledge Library principles directly referenced or applied. Empty if none apply. Pick only from the supplied list.",
      items: { type: "string" },
    },
  },
  required: ["score", "verdict", "signals", "ctaAboveFold", "heroClarity", "principles"],
  additionalProperties: false,
} as const

const CLASSIFY_SCHEMA = {
  type: "object",
  properties: {
    industry: { type: "string" },
    impostors: {
      type: "array",
      items: { type: "string" },
      description: "0-2 URLs from the input that are clearly outside the primary industry.",
    },
  },
  required: ["industry", "impostors"],
  additionalProperties: false,
} as const

export type ClassifyResult = {
  industry: string
  impostors: string[]
}

export async function classifyIndustry(
  urls: string[],
  apiKey: string
): Promise<ClassifyResult> {
  if (urls.length === 0) return { industry: "", impostors: [] }
  const client = makeClient(apiKey)
  const system = `You classify a list of competitor websites into a single primary industry.

Rules:
- Pick the most specific industry phrase the majority share (e.g. "Tech Startup Ecosystem", "Direct-to-Consumer Beauty", "Enterprise CRM").
- If 1 or 2 URLs are clearly outside that industry, list them as impostors. If all sites belong to the same industry, return an empty impostors array.
- Never flag more than 2 impostors. If 3 or more are off-industry, the input is too mixed — broaden the industry phrase instead.
- Match impostor entries to the EXACT URLs supplied.

Return JSON.`
  const userText = [
    "Classify these sites:",
    ...urls.map((u, i) => `${i + 1}. ${u}`),
  ].join("\n")
  const res = await client.messages.create({
    model: HAIKU_MODEL,
    max_tokens: 512,
    system,
    output_config: { format: { type: "json_schema", schema: CLASSIFY_SCHEMA } },
    messages: [{ role: "user", content: [{ type: "text", text: userText }] }],
  })
  const text = res.content.find((b): b is Anthropic.TextBlock => b.type === "text")
  if (!text) throw new Error("No text in classification response")
  const parsed = JSON.parse(text.text) as ClassifyResult
  const allow = new Set(urls)
  return {
    industry: parsed.industry?.trim() ?? "",
    impostors: (parsed.impostors ?? []).filter((u) => allow.has(u)).slice(0, 2),
  }
}

type ImageMediaType = "image/jpeg" | "image/png" | "image/webp" | "image/gif"

function parseImage(raw: string): { mediaType: ImageMediaType; data: string } | null {
  const match = /^data:(image\/(?:jpeg|png|webp|gif));base64,(.*)$/.exec(raw ?? "")
  if (!match) return null
  return { mediaType: match[1] as ImageMediaType, data: match[2] }
}

function imageBlock(raw: string): Anthropic.ImageBlockParam | null {
  const parsed = parseImage(raw)
  if (!parsed) return null
  return {
    type: "image",
    source: { type: "base64", media_type: parsed.mediaType, data: parsed.data },
  }
}

async function callScoringModel(
  client: Anthropic,
  model: string,
  system: string,
  content: Array<Anthropic.ImageBlockParam | Anthropic.TextBlockParam>,
  knowledge: KnowledgeEntry[],
  kind: "default" | "firstImpression" = "default"
): Promise<AIRowResult> {
  const schema = kind === "firstImpression" ? FIRST_IMPRESSION_SCHEMA : ROW_SCHEMA
  const res = await client.messages.create({
    model,
    max_tokens: 1400,
    system,
    output_config: { format: { type: "json_schema", schema } },
    messages: [{ role: "user", content }],
  })
  const text = res.content.find((b): b is Anthropic.TextBlock => b.type === "text")
  if (!text) throw new Error("No text in AI response")
  const parsed = JSON.parse(text.text) as Omit<AIRowResult, "reasoning" | "principles"> & {
    reasoning?: string
    principles?: string[]
  }
  return {
    ...parsed,
    reasoning: formatStructuredReasoning(parsed, kind),
    principles: resolvePrinciples(parsed.principles ?? [], knowledge),
  }
}

function titleCase(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1)
}

function resolvePrinciples(
  titles: string[],
  knowledge: KnowledgeEntry[]
): PrincipleRef[] {
  const byTitle = new Map<string, KnowledgeEntry>()
  for (const entry of knowledge) {
    if (entry.title.trim() && entry.url.trim()) {
      byTitle.set(entry.title.toLowerCase().trim(), entry)
    }
  }
  const seen = new Set<string>()
  const refs: PrincipleRef[] = []
  for (const raw of titles) {
    const match = byTitle.get(raw.toLowerCase().trim())
    if (!match) continue
    if (seen.has(match.id)) continue
    seen.add(match.id)
    refs.push({ title: match.title, url: match.url })
  }
  return refs
}

const UNABLE_TO_ASSESS = "Unable to assess. Page cannot be parsed."

const UNPARSEABLE_RULE = `If you genuinely cannot evaluate the supplied material — page is blank, blocked, captcha, error/redirect, screenshot empty or visibly broken, or pasted text is incoherent — set verdict EXACTLY to "Unable to assess. Page cannot be parsed." set signals to [], read to "", principles to [], and score to 1. Do not fabricate analysis when the source is missing.`

const PRINCIPLES_RULE = `When a Knowledge Library principle is supplied and is genuinely the lens behind one of your signals or your verdict, include its EXACT title in "principles". Otherwise leave principles as []. Never invent titles — only use titles from the supplied list. Cap at 3.`

function formatStructuredReasoning(
  parsed: {
    verdict?: string
    signals?: string[]
    read?: string
    reasoning?: string
    ctaAboveFold?: "yes" | "no"
    heroClarity?: "confusing" | "clear"
  },
  kind: "default" | "firstImpression" = "default"
): string {
  const verdict = parsed.verdict?.trim()
  if (verdict && /^unable to assess/i.test(verdict)) return UNABLE_TO_ASSESS
  const signals = (parsed.signals ?? [])
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 4)
  const read = parsed.read?.trim()
  const isFirstImpression = kind === "firstImpression"
  if (
    !verdict &&
    signals.length === 0 &&
    !read &&
    !isFirstImpression
  ) {
    return parsed.reasoning ?? ""
  }
  const blocks: string[] = []
  if (verdict) blocks.push(`**${verdict}**`)
  if (signals.length > 0) blocks.push(signals.map((s) => `- ${s}`).join("\n"))
  if (isFirstImpression) {
    const cta = parsed.ctaAboveFold ? titleCase(parsed.ctaAboveFold) : "—"
    const hero = parsed.heroClarity ? titleCase(parsed.heroClarity) : "—"
    blocks.push(`**CTA above fold:** ${cta}  ·  **Hero clarity:** ${hero}`)
  } else if (read) {
    blocks.push(`_${read}_`)
  }
  return blocks.join("\n\n")
}

const FIRST_IMPRESSION_DEFAULT = `You are a senior UX researcher and information architecture analyst.

Your task is NOT to describe the UI. Evaluate: value proposition clarity, trust, visual confidence, cognitive load, differentiation, action clarity, emotional positioning, conversion direction.

Avoid generic visual narration. Do NOT explain what is visibly present unless directly tied to a UX insight.

Be concise, opinionated, insight-driven. Write like an experienced UX strategist delivering quick audit findings. Avoid filler ("might", "could potentially", "appears to", "seems to"). Focus on behavioral implications and UX consequences.

Return JSON with keys: score (1–5, 5 = excellent), verdict, signals, ctaAboveFold ("yes" or "no"), heroClarity ("confusing" or "clear"), principles.

Rules:
- score is your overall First Impression rating
- verdict: max 1 sentence, sharp UX judgement
- signals: short bullet fragments only, max 4, no paragraphs, no repeated insights
- ctaAboveFold: "yes" if a primary call-to-action is visible above the fold, otherwise "no"
- heroClarity: "clear" if the hero's value proposition reads in seconds, otherwise "confusing"
- do NOT include a "read" field; do NOT add any italic narrative paragraph
- no generic UX filler`

export async function scoreFirstImpression(
  metrics: ExtractedMetrics,
  apiKey: string,
  imageOverride?: string,
  knowledge: KnowledgeEntry[] = [],
  context?: SiteContext,
  scope: "hero" | "full" = "full"
): Promise<AIRowResult> {
  const client = makeClient(apiKey)
  const source =
    imageOverride ||
    (scope === "hero"
      ? metrics.screenshot || metrics.fullPageScreenshot
      : metrics.fullPageScreenshot || metrics.screenshot)
  const img = imageBlock(source)
  if (!img) throw new Error("No screenshot available")
  const scopeNote =
    scope === "hero"
      ? "Scope: HERO ONLY — evaluate only what is visible above the fold. Do not infer or score content below the fold."
      : "Scope: FULL PAGE — evaluate the entire page from top to bottom."
  const userText = [
    `URL: ${metrics.finalUrl}`,
    scopeNote,
    screenshotContext(metrics),
    industryContext(context),
    knowledgeContext(knowledge, "First Impressions"),
    'Audit First Impression for this homepage. Return verdict, signals, ctaAboveFold ("yes" or "no"), heroClarity ("confusing" or "clear"), principles, and score. Do NOT include a "read" field.',
  ].filter(Boolean).join("\n\n")
  return callScoringModel(
    client,
    SONNET_MODEL,
    resolvePrompt("firstImpression"),
    [img, { type: "text", text: userText }],
    knowledge,
    "firstImpression"
  )
}

const NAVIGATION_DEFAULT = `You are a senior UX researcher and information architecture analyst.

Your task is NOT to describe the UI. Evaluate: IA breadth vs depth, prioritization clarity, discoverability, audience segmentation, scanability, CTA hierarchy, grouping logic, wayfinding confidence.

Avoid generic visual narration. Do NOT explain what is visibly present unless directly tied to a UX insight.

Be concise, opinionated, insight-driven. Write like an experienced UX strategist delivering quick audit findings. Avoid filler ("might", "could potentially", "appears to", "seems to"). Focus on behavioral implications and UX consequences.

Use the supplied Lighthouse signals (DOM size, tap targets, link text, heading order) only as evidence — do not narrate them.

Return JSON with keys: score (1–5, 5 = excellent), verdict, signals, read.

Rules:
- score is your overall Navigation rating
- verdict: max 1 sentence, sharp UX judgement
- read: max 1 sentence ia_read — IA / wayfinding consequence for the user
- signals: short bullet fragments only, max 4, no paragraphs, no repeated insights
- no generic UX filler`

export async function scoreNavigation(
  metrics: ExtractedMetrics,
  apiKey: string,
  knowledge: KnowledgeEntry[] = [],
  context?: SiteContext
): Promise<AIRowResult> {
  const client = makeClient(apiKey)
  const a = metrics.audits
  const userText = [
    `URL: ${metrics.finalUrl}`,
    `DOM size: ${a.domSize.numericValue} elements`,
    `Tap targets audit: ${formatScore(a.tapTargets.score)}`,
    `Link text audit: ${formatScore(a.linkText.score)}`,
    `Heading order audit: ${formatScore(a.headingOrder.score)}`,
    industryContext(context),
    knowledgeContext(knowledge, "Navigation"),
    "",
    "Audit Navigation for this site. Return verdict, signals, IA read, principles, and score.",
  ].filter(Boolean).join("\n")
  return callScoringModel(
    client,
    HAIKU_MODEL,
    resolvePrompt("navigation"),
    [{ type: "text", text: userText }],
    knowledge
  )
}

const VISUAL_HIERARCHY_DEFAULT = `You are a senior UX researcher and information architecture analyst.

Your task is NOT to describe the UI. Evaluate: scan path, grouping logic, density vs whitespace, typographic hierarchy, focal-point control, visual prioritization, cognitive load, decision flow.

Avoid generic visual narration. Do NOT explain what is visibly present unless directly tied to a UX insight.

Be concise, opinionated, insight-driven. Avoid filler ("might", "could potentially", "appears to", "seems to"). Focus on behavioral implications and UX consequences.

Return JSON with keys: score (1–5, 5 = excellent), verdict, signals, read.

Rules:
- score is your overall Visual Hierarchy rating
- verdict: max 1 sentence, sharp UX judgement
- read: max 1 sentence — how the hierarchy steers attention and decisions
- signals: short bullet fragments only, max 4, no paragraphs, no repeated insights
- no generic UX filler`

export async function scoreVisualHierarchy(
  images: string[],
  apiKey: string,
  knowledge: KnowledgeEntry[] = [],
  context?: SiteContext
): Promise<AIRowResult> {
  const client = makeClient(apiKey)
  const blocks = images
    .map(imageBlock)
    .filter((b): b is Anthropic.ImageBlockParam => b !== null)
  if (blocks.length === 0) throw new Error("Upload at least one image to score Visual Hierarchy")
  return callScoringModel(
    client,
    SONNET_MODEL,
    resolvePrompt("visualHierarchy"),
    [
      ...blocks,
      {
        type: "text",
        text: [
          industryContext(context),
          knowledgeContext(knowledge, "Visual Hierarchy"),
          "Audit Visual Hierarchy for the page(s). Return verdict, signals, read, principles, and score.",
        ]
          .filter(Boolean)
          .join("\n\n"),
      },
    ],
    knowledge
  )
}

const HELP_SUPPORT_DEFAULT = `You are a senior UX researcher and information architecture analyst.

Your task is NOT to describe the UI. Evaluate: easy reach-out and useful support, specifically hotline/phone support, Contact Us access, contact form or equivalent direct inquiry path, and FAQ/self-serve support.

Avoid generic visual narration. Do NOT explain what is visibly present unless directly tied to a UX insight.

Be concise, opinionated, insight-driven. Avoid filler ("might", "could potentially", "appears to", "seems to"). Focus on behavioral implications and UX consequences.

Return JSON with keys: score, verdict, signals, read.

Scoring rubric:
- score 5 = Yes: hotline/phone, Contact Us, contact form or equivalent direct inquiry path, and FAQ/self-serve support are all visible or easy to find from normal page scanning.
- score 3 = Somewhat: support exists but is partial, harder to find than usual, buried deeper than expected, or lacks one important channel while still giving users a plausible way to resolve questions.
- score 1 = No: support is absent, deeply buried, unclear, or missing multiple expected routes such as phone/hotline, Contact Us, contact form, and FAQ.

Rules:
- score MUST be exactly 1, 3, or 5
- verdict: max 1 sentence, sharp UX judgement
- read: max 1 sentence — what this drives a user in distress to do (resolve, escalate, churn)
- signals: short bullet fragments only, max 4, no paragraphs, no repeated insights
- no generic UX filler`

export async function scoreHelpSupport(
  images: string[],
  apiKey: string,
  knowledge: KnowledgeEntry[] = [],
  context?: SiteContext
): Promise<AIRowResult> {
  const client = makeClient(apiKey)
  const blocks = images
    .map(imageBlock)
    .filter((b): b is Anthropic.ImageBlockParam => b !== null)
  if (blocks.length === 0) throw new Error("Upload at least one image to score Help & Support")
  return callScoringModel(
    client,
    SONNET_MODEL,
    resolvePrompt("helpSupport"),
    [
      ...blocks,
      {
        type: "text",
        text: [
          industryContext(context),
          knowledgeContext(knowledge, "Help & Support"),
          "Audit Help & Support. Return verdict, signals, read, principles, and score.",
        ]
          .filter(Boolean)
          .join("\n\n"),
      },
    ],
    knowledge
  )
}

export async function scoreHelpSupportFromMetrics(
  metrics: ExtractedMetrics,
  apiKey: string,
  knowledge: KnowledgeEntry[] = [],
  context?: SiteContext
): Promise<AIRowResult> {
  const client = makeClient(apiKey)
  const source = metrics.fullPageScreenshot || metrics.screenshot
  const img = imageBlock(source)
  if (!img) throw new Error("No screenshot available")
  const help = metrics.audits.helpPatterns
  const userText = [
    `URL: ${metrics.finalUrl}`,
    screenshotContext(metrics),
    `Detected support patterns: FAQ=${help.hasFaq ? "yes" : "no"}; chat=${help.hasChat ? "yes" : "no"}; contact=${help.hasContact ? "yes" : "no"}; help center=${help.hasHelpCenter ? "yes" : "no"}; phone/hotline=${help.hasPhone ? "yes" : "no"}`,
    industryContext(context),
    knowledgeContext(knowledge, "Help & Support"),
    "Audit Help & Support from the full-page screenshot and detected support patterns. Return verdict, signals, read, principles, and score.",
  ].filter(Boolean).join("\n\n")
  return callScoringModel(
    client,
    SONNET_MODEL,
    resolvePrompt("helpSupport"),
    [img, { type: "text", text: userText }],
    knowledge
  )
}

export const DEFAULT_PROMPTS: Record<PromptKey, string> = {
  firstImpression: FIRST_IMPRESSION_DEFAULT,
  navigation: NAVIGATION_DEFAULT,
  visualHierarchy: VISUAL_HIERARCHY_DEFAULT,
  helpSupport: HELP_SUPPORT_DEFAULT,
}

function resolvePrompt(key: PromptKey): string {
  const overrides = getPromptOverrides()
  const body = overrides[key]?.trim() || DEFAULT_PROMPTS[key]
  return `${body}\n\n${UNPARSEABLE_RULE}\n\n${PRINCIPLES_RULE}`
}

export async function scoreSiteWithAI(
  metrics: ExtractedMetrics,
  apiKey: string,
  knowledge: KnowledgeEntry[] = [],
  context?: SiteContext
): Promise<AISiteResult> {
  const [firstImpression] = await Promise.all([
    scoreFirstImpression(metrics, apiKey, undefined, knowledge, context),
  ])
  return { firstImpression }
}

export function applyAIScores(rubric: RubricScores, result: AISiteResult): RubricScores {
  const next: RubricScores = { ...rubric }
  if (result.firstImpression) {
    next.firstImpression = applyHybridScore(next.firstImpression, result.firstImpression)
  }
  if (result.navigation) {
    next.navigation = applyHybridScore(next.navigation, result.navigation)
  }
  next.uxScoring = { ...next.uxScoring, aiRollup: computeRollup(next) }
  return next
}

export function applyAIRowScore(
  rubric: RubricScores,
  key: "firstImpression" | "navigation" | "visualHierarchy" | "helpSupport",
  result: AIRowResult
): RubricScores {
  const next: RubricScores = {
    ...rubric,
    [key]: applyHybridScore(rubric[key], result),
  }
  next.uxScoring = { ...rubric.uxScoring, aiRollup: computeRollup(next) }
  return next
}

function applyHybridScore(row: HybridScore, result: AIRowResult): HybridScore {
  return {
    ...row,
    score: null,
    source: "ai_suggested",
    aiSuggested: result.score,
    aiReasoning: result.reasoning,
    aiPrinciples: result.principles,
  }
}

function formatScore(s: number | null): string {
  if (s == null) return "n/a"
  return `${Math.round(s * 100)}/100`
}

function knowledgeContext(
  knowledge: KnowledgeEntry[],
  preferCategory?: string
): string {
  const usable = knowledge.filter((k) => k.title.trim() && k.url.trim())
  if (usable.length === 0) return ""
  const ranked = preferCategory
    ? [...usable].sort((a, b) => {
        const aMatch = a.category.toLowerCase() === preferCategory.toLowerCase() ? 0 : 1
        const bMatch = b.category.toLowerCase() === preferCategory.toLowerCase() ? 0 : 1
        return aMatch - bMatch
      })
    : usable
  const top = ranked.slice(0, 24)
  return [
    "Knowledge Library — cite a title in `principles` only when it is the lens behind your judgement:",
    ...top.map(
      (k) => `- [${k.category}] ${k.title}${k.blurb ? ` — ${k.blurb}` : ""}`
    ),
  ].join("\n")
}

function industryContext(context?: SiteContext): string {
  if (!context?.classification) return ""
  const { industry, sites } = context.classification
  const own = sites.find((s) => s.url === context.url)
  const lines: string[] = []
  if (industry) lines.push(`Primary industry: ${industry}`)
  if (own?.role === "reference") {
    const reasonLabel: Record<NonNullable<SiteClassification["reason"]>, string> = {
      similar_ux: "user listed it for similar UX approach / inspiration",
      industry_reference: "user listed it as an industry standard reference",
      user_disputes: "user disputes the off-industry flag",
    }
    const reason = own.reason ? reasonLabel[own.reason] : "off-industry reference"
    lines.push(`This site is a REFERENCE competitor (${reason}), not a direct same-industry competitor. Frame the audit accordingly: surface what the user can borrow without losing the primary industry's user expectations.`)
  } else if (industry) {
    lines.push(`This site is a direct ${industry} competitor. Ground insights in conventions and user expectations of that industry.`)
  }
  return lines.join("\n")
}

function screenshotContext(metrics: ExtractedMetrics): string {
  if (metrics.fullPageScreenshotSource === "screenshotone") {
    return "Screenshot source: ScreenshotOne full-page capture. Use the entire scroll depth when judging information scent, trust, content hierarchy, and available support paths."
  }
  if (metrics.fullPageScreenshot) {
    return "Screenshot source: full-page capture. Use the entire scroll depth when judging the experience."
  }
  return "Screenshot source: above-the-fold capture only. Avoid overclaiming about content below the first viewport."
}
