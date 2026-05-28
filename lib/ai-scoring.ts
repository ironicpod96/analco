import type Anthropic from "@anthropic-ai/sdk"

import { HAIKU_MODEL, makeClient, SONNET_MODEL } from "@/lib/anthropic"
import { computeRollup } from "@/lib/rubric"
import { getPromptOverrides } from "@/lib/storage"
import { getStyleProfile } from "@/lib/style-memory"
import type {
  ExtractedMetrics,
  HybridScore,
  IndustryClassification,
  KnowledgeEntry,
  PrincipleRef,
  PromptKey,
  RichTextContent,
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
    score: { type: "integer", enum: [1, 2, 3] },
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
    score: { type: "integer", enum: [1, 2, 3] },
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

const PRIMARY_OFFERING_SCHEMA = {
  type: "object",
  properties: {
    offering: {
      type: "string",
      description: "The client site's core product, service, platform, or promoted offer.",
    },
    sectionSearchText: {
      type: "string",
      description:
        "A compact search phrase likely to appear in the page section that best explains or sells this offering. Include distinctive product/service words, not generic CTA copy.",
    },
  },
  required: ["offering", "sectionSearchText"],
  additionalProperties: false,
} as const

export type ClassifyResult = {
  industry: string
  impostors: string[]
}

export type PrimaryOfferingTarget = {
  offering: string
  sectionSearchText: string
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

export async function identifyPrimaryOfferingTarget(
  metrics: ExtractedMetrics,
  apiKey: string,
  context?: SiteContext
): Promise<PrimaryOfferingTarget> {
  const client = makeClient(apiKey)
  const source = metrics.fullPageScreenshot || metrics.screenshot
  const img = imageBlock(source)
  if (!img) throw new Error("No screenshot available")
  const res = await client.messages.create({
    model: SONNET_MODEL,
    max_tokens: 512,
    system: `You identify the main commercial or mission-critical offering promoted by a website.

Return JSON only. Pick the page section that should be screenshotted for a visual hierarchy audit: the section that best explains or sells the site's "bread and butter" offer. For ecommerce, this is usually product detail or product listing content. For ecosystem/platform sites, pick the named platform, hub, program, or flagship offer section.`,
    output_config: { format: { type: "json_schema", schema: PRIMARY_OFFERING_SCHEMA } },
    messages: [
      {
        role: "user",
        content: [
          img,
          {
            type: "text",
            text: [
              `URL: ${metrics.finalUrl}`,
              screenshotContext(metrics),
              industryContext(context),
              "Identify the primary offering and the best section search text for a targeted desktop screenshot.",
            ].filter(Boolean).join("\n\n"),
          },
        ],
      },
    ],
  })
  const text = res.content.find((b): b is Anthropic.TextBlock => b.type === "text")
  if (!text) throw new Error("No text in AI response")
  const parsed = JSON.parse(text.text) as PrimaryOfferingTarget
  return {
    offering: parsed.offering?.trim() || "Primary offering",
    sectionSearchText: parsed.sectionSearchText?.trim() || parsed.offering?.trim() || "product solution platform",
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

Return JSON with keys: score (1–3, 3 = excellent), verdict, signals, ctaAboveFold ("yes" or "no"), heroClarity ("confusing" or "clear"), principles.

Rules:
- score is your overall First Impression rating
- verdict: max 1 sentence, sharp UX judgement
- signals: short bullet fragments only, max 4, no paragraphs, no repeated insights
- each signal must stand on its own — do NOT use the "X, but Y" template, do NOT pair every positive with a "however/mismatch/yet" counterpoint, do NOT hedge every observation
- ctaAboveFold: "yes" if a primary call-to-action is visible above the fold, otherwise "no"
- heroClarity: "clear" if the hero's value proposition reads in seconds, otherwise "confusing"
- do NOT include a "read" field; do NOT add any italic narrative paragraph
- no generic UX filler`

const COMPETITOR_FRAMING_ADDENDUM = `This is a COMPETITOR site, not the user's own product. Lead with what is working well and what the design does clearly. Acknowledge weaknesses only when materially relevant; do not pad every positive with a "but…" counterpoint, and avoid framing observations as "mismatches" by default. Stay industry-aware and honest — neutral-to-positive default, not flattery. The score should still reflect actual quality.`

export async function scoreFirstImpression(
  metrics: ExtractedMetrics,
  apiKey: string,
  imageOverride?: string,
  knowledge: KnowledgeEntry[] = [],
  context?: SiteContext,
  scope: "hero" | "full" = "full",
  isClient: boolean = false
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
    isClient ? "" : COMPETITOR_FRAMING_ADDENDUM,
    voiceProfileContext(),
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

Return JSON with keys: score (1–3, 3 = excellent), verdict, signals, read.

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

Return JSON with keys: score (1–3, 3 = excellent), verdict, signals, read.

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
- score 3 = Yes: hotline/phone, Contact Us, contact form or equivalent direct inquiry path, and FAQ/self-serve support are all visible or easy to find from normal page scanning.
- score 2 = Somewhat: support exists but is partial, harder to find than usual, buried deeper than expected, or lacks one important channel while still giving users a plausible way to resolve questions.
- score 1 = No: support is absent, deeply buried, unclear, or missing multiple expected routes such as phone/hotline, Contact Us, contact form, and FAQ.

Rules:
- score MUST be exactly 1, 2, or 3
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

function voiceProfileContext(): string {
  const profile = getStyleProfile()
  if (!profile) return ""
  const rules = (profile.rules ?? []).filter((r) => r.trim()).slice(0, 6)
  const prefer = (profile.vocab?.prefer ?? []).filter(Boolean).slice(0, 8)
  const avoid = (profile.vocab?.avoid ?? []).filter(Boolean).slice(0, 8)
  const lines: string[] = []
  lines.push("USER VOICE PROFILE (mimic this writing style; the user has edited prior outputs to sound like this):")
  if (profile.voice?.trim()) lines.push(`- Voice: ${profile.voice.trim()}`)
  if (rules.length > 0) lines.push(`- Rules: ${rules.join(" · ")}`)
  if (prefer.length > 0) lines.push(`- Prefer: ${prefer.join(", ")}`)
  if (avoid.length > 0) lines.push(`- Avoid: ${avoid.join(", ")}`)
  lines.push("Stay industry-aware and grounded in what the screenshot actually shows; do not invent details to match the style.")
  return lines.join("\n")
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
  context?: SiteContext,
  isClient: boolean = false
): Promise<AISiteResult> {
  const [firstImpression] = await Promise.all([
    scoreFirstImpression(metrics, apiKey, undefined, knowledge, context, "full", isClient),
  ])
  return { firstImpression }
}

export function applyAIScores(rubric: RubricScores, result: AISiteResult): RubricScores {
  const next: RubricScores = { ...rubric }
  if (result.firstImpression) {
    next.firstImpression = applyHybridScore(next.firstImpression, {
      ...result.firstImpression,
      score: firstImpressionCompositeScore(result.firstImpression),
    })
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
  const scored = key === "firstImpression"
    ? { ...result, score: firstImpressionCompositeScore(result) }
    : result
  const next: RubricScores = {
    ...rubric,
    [key]: applyHybridScore(rubric[key], scored),
  }
  next.uxScoring = { ...rubric.uxScoring, aiRollup: computeRollup(next) }
  return next
}

/**
 * 70% binary signals (ctaAboveFold + heroClarity), 30% AI holistic score.
 * Binary: yes/clear → 3, no/confusing → 1, averaged across the two signals.
 * AI score captures whether the positive or negative insights carry more weight.
 */
function firstImpressionCompositeScore(result: AIRowResult): RubricScale {
  const cta = result.ctaAboveFold === "yes" ? 3 : 1
  const hero = result.heroClarity === "clear" ? 3 : 1
  const binaryScore = (cta + hero) / 2
  const raw = 0.7 * binaryScore + 0.3 * result.score
  return Math.max(1, Math.min(3, Math.round(raw))) as RubricScale
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

export type GrowthOpsInsightInput = {
  category: string
  evaluationCriteria: string
  situations: Array<{
    type: "client_weakness" | "competitor_strength" | "client_strength"
    subjectNames: string[]
    matchedHeadline: string
    matchedText: string
    principleTitle?: string
  }>
  clientLabel: string
  availablePrinciples?: Array<{ title: string; blurb?: string }>
  rewriteContext?: {
    previousText: string
    previousPrincipleTitle?: string
  }
}

export type GrowthOpsInsightResult = {
  richText: RichTextContent
  principleTitle: string
}

export async function generateGrowthOpsInsights(
  params: GrowthOpsInsightInput,
  apiKey: string
): Promise<GrowthOpsInsightResult[]> {
  const client = makeClient(apiKey)
  const isRewrite = Boolean(params.rewriteContext)
  const availablePrinciples = params.availablePrinciples ?? []
  const rewriteRules = isRewrite ? `

REWRITE MODE: The user has already seen a previous take on this insight and is asking for a NEW ANGLE. You MUST:
- Not paraphrase or restate the previous take. A reworded version of the same point is unacceptable.
- Surface a genuinely different angle on the same underlying situation: either (a) ground the insight in a DIFFERENT principle from the Available principles list (preferred when a fitting one exists), or (b) make a fresh observation about a different facet (e.g. shift focus from layout to copy, from desktop to mobile, from primary CTA to secondary path, from absolute behaviour to comparative context, from user task to business outcome).
- You may NOT cite the Previously cited principle. Pick a different one or none.` : ""
  const system = `You are a senior UX consultant writing slide insights in GrowthOps style.

Rules:
- Write exactly 1 to 2 short sentences per insight. Maximum 40 words total.
- Ground every insight in what was actually observed on the site (contact form present, FAQ visible, navigation items, CTA placement, etc.). Never discuss scores, point gaps, rankings, or competitive differentiation in the abstract.
- Always tie the observation back to the category being evaluated and what it means for users reaching the outcome described in the Evaluation Criteria.
- Name the specific sites involved.
- Bold only the single most important phrase using the "bold" field.
- Cite principles naturally when relevant (e.g. "according to Miller's Law on working memory"). You may ONLY cite principles whose exact title appears in the Available principles list supplied in the user message. Do not invent principles or cite anything not on that list.
- For every insight, set "principleTitle" to the EXACT title of the principle you grounded the insight in (verbatim from the Available principles list). If the insight does not lean on a specific principle, set "principleTitle" to an empty string. The principle you cite in the prose MUST match the "principleTitle" value — they are the same field shown two ways. Never name one principle in the text and report another in "principleTitle".
- Never use hyphens, en dashes, or em dashes (-, –, —) anywhere in the text.
- No hedging words ("may", "might", "could", "appears to"). Be direct and declarative.
- No separate headline. One paragraph only.
- Each insight in the list must make a distinct point. Do not repeat the same observation, finding, or site name pairing across multiple insights in the same response.
- Each principle or knowledge reference (e.g. Miller's Law, Jacob's Law) may be cited at most once across all insights in the response. Do not mention the same principle in more than one insight.${rewriteRules}

Examples from real GrowthOps reports:
{"segments":[{"text":"The overall look and feel of NGS looks ","bold":false},{"text":"cluttered and dated","bold":true},{"text":" compared with the rest of the competitors.","bold":false}]}
{"segments":[{"text":"Google Arts and Culture and Rijks Museum have several smaller sections focused on different needs, ","bold":false},{"text":"helping to pique users' interests and guide them to explore further","bold":true},{"text":".","bold":false}]}
{"segments":[{"text":"There are ","bold":false},{"text":"too many items in both the primary and secondary navigation","bold":true},{"text":", which can be overwhelming for users.","bold":false}]}
{"segments":[{"text":"According to ","bold":false},{"text":"Miller's Law on working memory","bold":true},{"text":", The Van Gogh Museum and The Met have more concise navigation menus with fewer than 7 items at each level.","bold":false}]}
{"segments":[{"text":"Van Gogh Museum has ","bold":false},{"text":"clear sections for contact details, FAQs and a contact form that allows users to fill in without leaving the page","bold":true},{"text":".","bold":false}]}`

  const previousPrincipleTitle = params.rewriteContext?.previousPrincipleTitle
  const principlesList = availablePrinciples
    .filter((p) => p.title !== previousPrincipleTitle)
    .map((p) => `- ${p.title}${p.blurb ? `: ${p.blurb}` : ""}`)
  const principlesSection = principlesList.length > 0
    ? [
        "",
        isRewrite
          ? "Available principles (pick one that fits for a different angle, or leave principleTitle empty for a fresh observation). Only these titles are allowed; use the title VERBATIM in both the prose and principleTitle:"
          : "Available principles (cite at most one per insight when it genuinely fits; only these titles are allowed; use the title VERBATIM in both the prose and principleTitle, or leave principleTitle empty if you do not cite one):",
        ...principlesList,
      ].join("\n")
    : ""

  const rewriteSection = params.rewriteContext
    ? [
        "",
        "Previous take (do NOT paraphrase, write a NEW ANGLE):",
        `"${params.rewriteContext.previousText.trim()}"`,
        previousPrincipleTitle
          ? `Previously cited principle (do NOT reuse): ${previousPrincipleTitle}`
          : "",
      ].filter(Boolean).join("\n")
    : ""

  const userText = [
    `Category: ${params.category}`,
    `Evaluation Criteria: ${params.evaluationCriteria}`,
    `Client site: ${params.clientLabel}`,
    "",
    "Insights to rewrite in GrowthOps style:",
    ...params.situations.map((s, i) => [
      `${i + 1}. Type: ${s.type}`,
      `   Sites: ${s.subjectNames.join(", ")}`,
      `   Finding: ${s.matchedHeadline}`,
      `   Detail: ${s.matchedText}`,
      s.principleTitle ? `   Principle: ${s.principleTitle}` : "",
    ].filter(Boolean).join("\n")),
    principlesSection,
    rewriteSection,
  ].filter(Boolean).join("\n")

  const schema = {
    type: "object",
    additionalProperties: false,
    properties: {
      insights: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            segments: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                properties: {
                  text: { type: "string" },
                  bold: { type: "boolean" },
                },
                required: ["text", "bold"],
              },
            },
            principleTitle: { type: "string" },
          },
          required: ["segments", "principleTitle"],
        },
      },
    },
    required: ["insights"],
  }

  const response = await client.messages.create({
    model: SONNET_MODEL,
    max_tokens: 1024,
    system,
    output_config: { format: { type: "json_schema", schema } },
    messages: [{ role: "user", content: [{ type: "text", text: userText }] }],
  })

  const textBlock = response.content.find((b): b is Anthropic.TextBlock => b.type === "text")
  if (!textBlock) return []

  const parsed = JSON.parse(textBlock.text) as {
    insights: Array<{ segments: Array<{ text: string; bold: boolean }>; principleTitle?: string }>
  }
  const allowedTitles = new Set(availablePrinciples.map((p) => p.title))
  return parsed.insights.map((insight) => {
    const rawTitle = (insight.principleTitle ?? "").trim()
    const principleTitle = rawTitle && allowedTitles.has(rawTitle) ? rawTitle : ""
    return {
      richText: {
        blocks: [{ runs: insight.segments.map((seg) => ({ text: seg.text, bold: seg.bold || undefined })) }],
      },
      principleTitle,
    }
  })
}

export type TaskEvaluationCriteria = {
  criteria: string
  steps: Array<{ label: string }>
}

export async function identifyTaskEvaluationCriteria(
  clientUrl: string,
  industry: string | undefined,
  apiKey: string,
  stepCount?: number
): Promise<TaskEvaluationCriteria> {
  const client = makeClient(apiKey)
  const n = stepCount && stepCount >= 2 && stepCount <= 4 ? stepCount : undefined
  const stepsRule = n
    ? `an ordered list of EXACTLY ${n} concise step labels`
    : `an ordered list of 2 to 4 concise step labels`
  const system = `You are a UX researcher writing Task Completion evaluation criteria for a GrowthOps 8-step web evaluation.

Return TWO things:
1. "criteria" — one line in the format: "Ease of getting through from entry to the end-point (Primary Action / Secondary Action)"
   Examples: "(Buy Tickets / Become a Member)", "(Make a Booking / Get a Quote)", "(Browse Products / Contact Sales)"
2. "steps" — ${stepsRule} naming the screens a user passes through to complete the primary task on this kind of site. Each label should be 2–5 words (e.g., "Homepage entry", "Product detail page", "Contact sales form", "Submit confirmation"). Match the industry's typical flow.`

  const userText = [
    `Client URL: ${clientUrl}`,
    industry ? `Industry: ${industry}` : "",
    "",
    "Write the Task Completion criteria and steps for this site.",
  ].filter(Boolean).join("\n")

  const schema = {
    type: "object",
    additionalProperties: false,
    properties: {
      criteria: { type: "string" },
      steps: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: { label: { type: "string" } },
          required: ["label"],
        },
      },
    },
    required: ["criteria", "steps"],
  }

  const response = await client.messages.create({
    model: HAIKU_MODEL,
    max_tokens: 384,
    system,
    output_config: { format: { type: "json_schema", schema } },
    messages: [{ role: "user", content: [{ type: "text", text: userText }] }],
  })

  const textBlock = response.content.find((b): b is Anthropic.TextBlock => b.type === "text")
  if (!textBlock) return { criteria: "", steps: [] }
  const parsed = JSON.parse(textBlock.text) as TaskEvaluationCriteria
  return { criteria: parsed.criteria ?? "", steps: parsed.steps ?? [] }
}

export async function scoreTaskCompletionFromSteps(args: {
  steps: Array<{ label: string; screenshot: string }>
  criteria: string
  industry: string | undefined
  apiKey: string
  clientSignals?: { ease: number | null; duration: number | null }
  competitorSignals?: Array<{ name: string; ease: number | null; duration: number | null }>
}): Promise<{ score: RubricScale; reasoning: string; principles: PrincipleRef[] }> {
  const { steps, criteria, industry, apiKey, clientSignals, competitorSignals } = args
  const client = makeClient(apiKey)
  const system = `You are a senior UX researcher scoring the Task Completion of a website on a 1–3 scale by inspecting an ordered sequence of screenshots taken by an evaluator while completing the primary user task. You also receive the evaluator's subjective ease/duration ratings for the client, plus the same ratings on competitor sites for comparison context.

Scale convention for ease/duration: 0 = poor (hard / long), 1 = mid, 2 = good (easy / quick). null = not rated.

Score:
- 3 = the flow is fast, direct, and friction-free across the captured steps, consistent with the evaluator's ratings.
- 2 = workable but shows friction, redundant steps, or weak signposting.
- 1 = the flow breaks down — dead-ends, blockers, hidden CTAs, excessive steps, or confusing transitions.

Weight the screenshots as primary evidence; use the evaluator's ratings to disambiguate close calls and use competitor ratings to calibrate what "normal" looks like in the industry.

Return JSON: { "score": 1|2|3, "reasoning": "2-4 sentences citing specific evidence visible in the screenshots, in order of steps; reference the ratings or competitor comparison when it changes your read", "principles": [{ "title": "Cognitive Load" | "Fitts's Law" | "Progressive Disclosure" | "Error Prevention" | "Recognition Over Recall" | "Cognitive Ease" }] }
Cite at most 2 principles. Ground observations in the industry's user expectations.`

  const intro = [
    criteria ? `Evaluation criteria: ${criteria}` : "",
    industry ? `Industry: ${industry}` : "",
    clientSignals
      ? `Client evaluator ratings — ease: ${clientSignals.ease ?? "—"}, duration: ${clientSignals.duration ?? "—"}`
      : "",
    competitorSignals && competitorSignals.length
      ? "Competitor ratings:\n" +
        competitorSignals
          .map((c) => `  - ${c.name}: ease ${c.ease ?? "—"}, duration ${c.duration ?? "—"}`)
          .join("\n")
      : "",
    `Step sequence (${steps.length} screenshots, in order):`,
    ...steps.map((s, i) => `  ${i + 1}. ${s.label}`),
  ].filter(Boolean).join("\n")

  const content: Anthropic.ContentBlockParam[] = [{ type: "text", text: intro }]
  for (const step of steps) {
    if (!step.screenshot) continue
    const block = imageBlock(step.screenshot)
    if (block) content.push(block)
  }

  const schema = {
    type: "object",
    additionalProperties: false,
    properties: {
      score: { type: "integer", enum: [1, 2, 3] },
      reasoning: { type: "string" },
      principles: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            title: { type: "string" },
            url: { type: "string" },
          },
          required: ["title", "url"],
        },
      },
    },
    required: ["score", "reasoning", "principles"],
  }

  const response = await client.messages.create({
    model: SONNET_MODEL,
    max_tokens: 768,
    system,
    output_config: { format: { type: "json_schema", schema } },
    messages: [{ role: "user", content }],
  })

  const textBlock = response.content.find((b): b is Anthropic.TextBlock => b.type === "text")
  if (!textBlock) return { score: 2, reasoning: "", principles: [] }
  const parsed = JSON.parse(textBlock.text) as {
    score: RubricScale
    reasoning: string
    principles: PrincipleRef[]
  }
  return { score: parsed.score, reasoning: parsed.reasoning ?? "", principles: parsed.principles ?? [] }
}
