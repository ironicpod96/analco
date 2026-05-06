import type { ApiKeys, LastRun, SiteAudit } from "@/lib/types"

const KEYS = "analco:keys"
const LAST_RUN = "analco:lastRun"
export const PENDING_URLS = "analco:pendingUrls"

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

export function getLastRun(): LastRun | null {
  if (typeof window === "undefined") return null
  try {
    const raw = window.localStorage.getItem(LAST_RUN)
    if (!raw) return null
    return JSON.parse(raw) as LastRun
  } catch {
    return null
  }
}

export function setLastRun(run: LastRun): void {
  if (typeof window === "undefined") return
  try {
    window.localStorage.setItem(LAST_RUN, JSON.stringify(run))
  } catch (err) {
    // Likely a quota error — drop screenshots and retry once.
    if (err instanceof DOMException && err.name === "QuotaExceededError") {
      const trimmed: LastRun = {
        ...run,
        sites: run.sites.map((s) => ({
          ...s,
          metrics: { ...s.metrics, screenshot: "" },
        })),
      }
      try {
        window.localStorage.setItem(LAST_RUN, JSON.stringify(trimmed))
      } catch {
        /* give up silently */
      }
    }
  }
}

export function clearLastRun(): void {
  if (typeof window === "undefined") return
  window.localStorage.removeItem(LAST_RUN)
}

export function upsertSite(audit: SiteAudit): void {
  const run = getLastRun()
  if (!run) return
  const idx = run.sites.findIndex((s) => s.url === audit.url)
  const next = run.sites.slice()
  if (idx >= 0) next[idx] = audit
  else next.push(audit)
  setLastRun({ ...run, sites: next })
}

export function getPendingUrls(): string[] {
  if (typeof window === "undefined") return []
  try {
    const raw = window.sessionStorage.getItem(PENDING_URLS)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter((u): u is string => typeof u === "string") : []
  } catch {
    return []
  }
}

export function setPendingUrls(urls: string[]): void {
  if (typeof window === "undefined") return
  window.sessionStorage.setItem(PENDING_URLS, JSON.stringify(urls))
}

export function clearPendingUrls(): void {
  if (typeof window === "undefined") return
  window.sessionStorage.removeItem(PENDING_URLS)
}
