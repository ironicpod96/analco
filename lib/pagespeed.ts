import type { ConnectionTest } from "@/lib/types"

const ENDPOINT = "https://www.googleapis.com/pagespeedonline/v5/runPagespeed"

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
