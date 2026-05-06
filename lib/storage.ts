import type { ApiKeys } from "@/lib/types"

const KEYS = "analco:keys"
const LAST_RUN = "analco:lastRun"

const EMPTY: ApiKeys = { pagespeed: "", anthropic: "" }

export function getKeys(): ApiKeys {
  if (typeof window === "undefined") return EMPTY
  try {
    const raw = window.localStorage.getItem(KEYS)
    if (!raw) return EMPTY
    const parsed = JSON.parse(raw) as Partial<ApiKeys>
    return {
      pagespeed: typeof parsed.pagespeed === "string" ? parsed.pagespeed : "",
      anthropic: typeof parsed.anthropic === "string" ? parsed.anthropic : "",
    }
  } catch {
    return EMPTY
  }
}

export function setKeys(keys: ApiKeys): void {
  if (typeof window === "undefined") return
  window.localStorage.setItem(KEYS, JSON.stringify(keys))
}

export function hasKeys(): boolean {
  const k = getKeys()
  return k.pagespeed.length > 0 && k.anthropic.length > 0
}

export function resetAll(): void {
  if (typeof window === "undefined") return
  window.localStorage.removeItem(KEYS)
  window.localStorage.removeItem(LAST_RUN)
}
