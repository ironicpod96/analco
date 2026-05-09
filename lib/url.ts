export const MAX_URLS = 10

export type UrlValidation = {
  valid: string[]            // normalized URLs (with scheme)
  invalid: { line: string; reason: string }[]
  overflow: number           // count beyond MAX_URLS
}

export function normalizeUrl(raw: string): string | null {
  const line = raw.trim()
  if (!line) return null
  const normalized = /^https?:\/\//i.test(line) ? line : `https://${line}`
  try {
    const u = new URL(normalized)
    if (!u.hostname.includes(".")) return null
    return u.toString().replace(/\/$/, "")
  } catch {
    return null
  }
}

export function parseUrlInput(raw: string): UrlValidation {
  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0)

  const valid: string[] = []
  const invalid: { line: string; reason: string }[] = []

  for (const line of lines) {
    const normalized = /^https?:\/\//i.test(line) ? line : `https://${line}`
    try {
      const u = new URL(normalized)
      if (!u.hostname.includes(".")) {
        invalid.push({ line, reason: "Missing domain" })
        continue
      }
      valid.push(u.toString().replace(/\/$/, ""))
    } catch {
      invalid.push({ line, reason: "Not a valid URL" })
    }
  }

  const dedupedValid = Array.from(new Set(valid))
  const capped = dedupedValid.slice(0, MAX_URLS)
  const overflow = Math.max(0, dedupedValid.length - MAX_URLS)

  return { valid: capped, invalid, overflow }
}
