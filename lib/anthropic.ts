import Anthropic from "@anthropic-ai/sdk"

import type { ConnectionTest } from "@/lib/types"

export const HAIKU_MODEL = "claude-haiku-4-5-20251001"
export const SONNET_MODEL = "claude-sonnet-4-6"

export function makeClient(apiKey: string): Anthropic {
  return new Anthropic({ apiKey, dangerouslyAllowBrowser: true })
}

/**
 * Validate an Anthropic key with the cheapest possible call:
 * a 1-token Haiku response to a one-character prompt.
 */
export async function testAnthropicKey(apiKey: string): Promise<ConnectionTest> {
  if (!apiKey.trim()) return { ok: false, error: "Key is empty" }
  try {
    const client = makeClient(apiKey)
    await client.messages.create({
      model: HAIKU_MODEL,
      max_tokens: 1,
      messages: [{ role: "user", content: "hi" }],
    })
    return { ok: true }
  } catch (err) {
    if (err instanceof Anthropic.APIError) {
      if (err.status === 401) return { ok: false, error: "API key not valid" }
      return { ok: false, error: err.message }
    }
    return { ok: false, error: err instanceof Error ? err.message : "Network error" }
  }
}
