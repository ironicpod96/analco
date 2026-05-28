import type Anthropic from "@anthropic-ai/sdk"

import { HAIKU_MODEL, makeClient } from "@/lib/anthropic"

const STYLE_KEY = "analco:styleMemory:firstImpression"
const MAX_EDITS = 50
const REFRESH_DEBOUNCE_MS = 30_000
const NEW_EDITS_THRESHOLD = 3

export type StyleEdit = {
  id: string
  timestamp: string
  url: string
  isClient: boolean
  scope: "hero" | "full"
  industry?: string
  screenshotRef?: string
  aiText: string
  userText: string
}

export type StyleProfile = {
  voice: string
  rules: string[]
  vocab: { prefer: string[]; avoid: string[] }
}

export type StyleMemory = {
  edits: StyleEdit[]
  profile?: StyleProfile
  profileGeneratedAt?: string
  profileFromEditCount?: number
  lastRefreshAttemptAt?: string
}

const EMPTY: StyleMemory = { edits: [] }

function readMemory(): StyleMemory {
  if (typeof window === "undefined") return EMPTY
  try {
    const raw = window.localStorage.getItem(STYLE_KEY)
    if (!raw) return EMPTY
    const parsed = JSON.parse(raw) as StyleMemory
    if (!parsed || !Array.isArray(parsed.edits)) return EMPTY
    return parsed
  } catch {
    return EMPTY
  }
}

function writeMemory(next: StyleMemory): void {
  if (typeof window === "undefined") return
  try {
    window.localStorage.setItem(STYLE_KEY, JSON.stringify(next))
  } catch {
    /* quota: silently drop */
  }
}

export function getStyleMemory(): StyleMemory {
  return readMemory()
}

export function getStyleProfile(): StyleProfile | undefined {
  return readMemory().profile
}

export function getRecentStyleEdits(n: number): StyleEdit[] {
  const mem = readMemory()
  return mem.edits.slice(-Math.max(0, n))
}

export function resetStyleMemory(): void {
  if (typeof window === "undefined") return
  window.localStorage.removeItem(STYLE_KEY)
}

export type RecordStyleEditInput = {
  url: string
  isClient: boolean
  scope: "hero" | "full"
  industry?: string
  screenshotRef?: string
  aiText: string
  userText: string
}

export function recordStyleEdit(input: RecordStyleEditInput): void {
  const aiText = input.aiText.trim()
  const userText = input.userText.trim()
  if (!userText || userText === aiText) return
  const mem = readMemory()
  const edit: StyleEdit = {
    id: typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    timestamp: new Date().toISOString(),
    url: input.url,
    isClient: input.isClient,
    scope: input.scope,
    industry: input.industry,
    screenshotRef: input.screenshotRef,
    aiText,
    userText,
  }
  const edits = [...mem.edits, edit].slice(-MAX_EDITS)
  writeMemory({ ...mem, edits })
}

const PROFILE_SCHEMA = {
  type: "object",
  properties: {
    voice: { type: "string", description: "1–2 sentences describing the user's writing voice and tone." },
    rules: {
      type: "array",
      description: "Up to 6 short imperative do/don't rules the user's edits consistently apply.",
      items: { type: "string" },
    },
    vocab: {
      type: "object",
      properties: {
        prefer: { type: "array", items: { type: "string" } },
        avoid: { type: "array", items: { type: "string" } },
      },
      required: ["prefer", "avoid"],
      additionalProperties: false,
    },
  },
  required: ["voice", "rules", "vocab"],
  additionalProperties: false,
} as const

const PROFILE_SYSTEM = `You distill a user's writing-style preferences for UX first-impression critiques from before/after edit pairs.

Each pair shows an AI's original First Impression text and the user's edit of it. Reverse-engineer the user's voice rules: tone, sentence length, hedging, vocabulary preferences, framing patterns.

Return JSON only. Be specific and prescriptive — these rules will be injected into future AI prompts so the AI mimics this user's style. Avoid generic advice.`

export async function maybeRefreshStyleProfile(apiKey: string): Promise<void> {
  if (!apiKey) return
  if (typeof window === "undefined") return
  const mem = readMemory()
  if (mem.edits.length === 0) return
  const newEdits = mem.edits.length - (mem.profileFromEditCount ?? 0)
  const needsFirst = !mem.profile
  if (!needsFirst && newEdits < NEW_EDITS_THRESHOLD) return
  if (mem.lastRefreshAttemptAt) {
    const elapsed = Date.now() - new Date(mem.lastRefreshAttemptAt).getTime()
    if (elapsed < REFRESH_DEBOUNCE_MS) return
  }

  writeMemory({ ...mem, lastRefreshAttemptAt: new Date().toISOString() })

  const sample = mem.edits.slice(-10)
  const userText = [
    "Reverse-engineer the user's writing style from these edit pairs.",
    "Each pair: AI ORIGINAL → USER EDIT. The USER EDIT is what we want future AI output to sound like.",
    "",
    ...sample.map((e, i) =>
      [
        `--- Pair ${i + 1} (${e.isClient ? "client" : "competitor"}${e.industry ? `, ${e.industry}` : ""}) ---`,
        `AI ORIGINAL:\n${e.aiText}`,
        `USER EDIT:\n${e.userText}`,
      ].join("\n")
    ),
  ].join("\n\n")

  try {
    const client = makeClient(apiKey)
    const res = await client.messages.create({
      model: HAIKU_MODEL,
      max_tokens: 800,
      system: PROFILE_SYSTEM,
      output_config: { format: { type: "json_schema", schema: PROFILE_SCHEMA } },
      messages: [{ role: "user", content: [{ type: "text", text: userText }] }],
    })
    const block = res.content.find((b): b is Anthropic.TextBlock => b.type === "text")
    if (!block) return
    const profile = JSON.parse(block.text) as StyleProfile
    if (!profile?.voice || !Array.isArray(profile.rules) || !profile.vocab) return
    const fresh = readMemory()
    writeMemory({
      ...fresh,
      profile,
      profileGeneratedAt: new Date().toISOString(),
      profileFromEditCount: fresh.edits.length,
    })
  } catch {
    /* silent */
  }
}
