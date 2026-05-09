import type {
  ApiKeys,
  GoogleWorkspaceKeys,
  IndustryClassification,
  KnowledgeEntry,
  LastRun,
  PromptKey,
  PromptOverrides,
  SavedRun,
  SiteAudit,
} from "@/lib/types"

const KEYS = "analco:keys"
const GOOGLE_WORKSPACE = "analco:googleWorkspace"
const CONNECTION_TESTS = "analco:connectionTests"
const LAST_RUN = "analco:lastRun"
const KNOWLEDGE = "analco:knowledge"
const LEGACY_FINDINGS = "analco:findings"
const SAVED_RUNS = "analco:savedRuns"
const PROMPTS = "analco:prompts"
const ACTIVE_RUN_ID = "analco:activeRunId"
const ACTIVE_SAVED_RUN_ID = "analco:activeSavedRunId"
const LAST_RUN_IMAGE_REFS = "analco:lastRunImageRefs"
export const PENDING_URLS = "analco:pendingUrls"
export const PENDING_CLASSIFICATION = "analco:pendingClassification"
export const PENDING_CLIENT_URL = "analco:pendingClientUrl"
const CLIENT_LOCKED = "analco:clientLocked"
const IMAGE_DB = "analco:imageStore"
const IMAGE_STORE = "screenshots"

const EMPTY: ApiKeys = { pagespeed: "", anthropic: "" }
const EMPTY_GOOGLE: GoogleWorkspaceKeys = { apiKey: "", clientId: "" }

type SavedRunImageRefs = NonNullable<SavedRun["imageRefs"]>
type SiteImageRefs = SavedRunImageRefs[string]
type UserImageRefs = NonNullable<SiteImageRefs["userImages"]>
type LastRunImageRefs = Record<string, SiteImageRefs>

type LastRunRefsPayload = {
  runId: string
  refs: LastRunImageRefs
}

let lastRunPersistVersion = 0

function openImageDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB is not available"))
      return
    }
    const request = indexedDB.open(IMAGE_DB, 1)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(IMAGE_STORE)) db.createObjectStore(IMAGE_STORE)
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error("Could not open image store"))
  })
}

async function putStoredImage(id: string, data: string): Promise<void> {
  const db = await openImageDb()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(IMAGE_STORE, "readwrite")
    tx.objectStore(IMAGE_STORE).put(data, id)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error ?? new Error("Could not store image"))
  }).finally(() => db.close())
}

async function getStoredImage(id: string): Promise<string | undefined> {
  const db = await openImageDb()
  return new Promise<string | undefined>((resolve, reject) => {
    const tx = db.transaction(IMAGE_STORE, "readonly")
    const request = tx.objectStore(IMAGE_STORE).get(id)
    request.onsuccess = () => resolve(typeof request.result === "string" ? request.result : undefined)
    request.onerror = () => reject(request.error ?? new Error("Could not read image"))
    tx.oncomplete = () => db.close()
    tx.onerror = () => db.close()
  })
}

async function deleteStoredImagesForRun(savedRunId: string): Promise<void> {
  const db = await openImageDb()
  await new Promise<void>((resolve, reject) => {
    const prefix = `${savedRunId}:`
    const tx = db.transaction(IMAGE_STORE, "readwrite")
    const store = tx.objectStore(IMAGE_STORE)
    const request = store.openCursor()
    request.onsuccess = () => {
      const cursor = request.result
      if (!cursor) return
      if (typeof cursor.key === "string" && cursor.key.startsWith(prefix)) cursor.delete()
      cursor.continue()
    }
    request.onerror = () => reject(request.error ?? new Error("Could not delete images"))
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error ?? new Error("Could not delete images"))
  }).finally(() => db.close())
}

export const SEED_KNOWLEDGE: KnowledgeEntry[] = [
  {
    id: "seed-aesthetic-usability",
    category: "First Impressions",
    title: "Aesthetic-Usability Effect",
    url: "https://www.nngroup.com/articles/aesthetic-usability-effect/",
  },
  {
    id: "seed-halo-effect",
    category: "First Impressions",
    title: "Halo Effect",
    url: "https://thedecisionlab.com/biases/halo-effect",
  },
  {
    id: "seed-mere-exposure",
    category: "First Impressions",
    title: "Mere-Exposure Effect",
    url: "https://www.simplypsychology.org/mere-exposure-effect.html",
  },
  {
    id: "seed-expectation-confirmation",
    category: "First Impressions",
    title: "Expectation Confirmation Theory",
    url: "https://www.sciencedirect.com/topics/computer-science/expectation-confirmation-theory",
  },
  {
    id: "seed-information-scent",
    category: "Navigation",
    title: "Information Scent",
    url: "https://www.nngroup.com/articles/information-scent/",
  },
  {
    id: "seed-hicks-law",
    category: "Navigation",
    title: "Hick's Law",
    url: "https://lawsofux.com/hicks-law/",
  },
  {
    id: "seed-jakobs-law-nav",
    category: "Navigation",
    title: "Jakob's Law",
    url: "https://lawsofux.com/jakobs-law/",
  },
  {
    id: "seed-recognition-recall-nav",
    category: "Navigation",
    title: "Recognition Over Recall",
    url: "https://www.nngroup.com/articles/recognition-and-recall/",
  },
  {
    id: "seed-mental-models-nav",
    category: "Navigation",
    title: "Mental Models",
    url: "https://www.nngroup.com/articles/mental-models/",
  },
  {
    id: "seed-progressive-disclosure-nav",
    category: "Navigation",
    title: "Progressive Disclosure",
    url: "https://www.nngroup.com/articles/progressive-disclosure/",
  },
  {
    id: "seed-goal-gradient",
    category: "Task Completion",
    title: "Goal-Gradient Effect",
    url: "https://www.nngroup.com/articles/goal-gradient-effect/",
  },
  {
    id: "seed-zeigarnik",
    category: "Task Completion",
    title: "Zeigarnik Effect",
    url: "https://www.interaction-design.org/literature/topics/zeigarnik-effect",
  },
  {
    id: "seed-endowed-progress",
    category: "Task Completion",
    title: "Endowed Progress Effect",
    url: "https://www.nngroup.com/articles/endowed-progress-effect/",
  },
  {
    id: "seed-cognitive-load",
    category: "Task Completion",
    title: "Cognitive Load Theory",
    url: "https://www.interaction-design.org/literature/topics/cognitive-load",
  },
  {
    id: "seed-peak-end",
    category: "Task Completion",
    title: "Peak-End Rule",
    url: "https://www.nngroup.com/articles/peak-end-rule/",
  },
  {
    id: "seed-jtbd",
    category: "Task Completion",
    title: "Jobs To Be Done",
    url: "https://www.intercom.com/blog/jobs-to-be-done-framework/",
  },
  {
    id: "seed-fitts-law",
    category: "Visual Hierarchy",
    title: "Fitts's Law",
    url: "https://lawsofux.com/fittss-law/",
  },
  {
    id: "seed-von-restorff",
    category: "Visual Hierarchy",
    title: "Von Restorff Effect",
    url: "https://lawsofux.com/von-restorff-effect/",
  },
  {
    id: "seed-gestalt",
    category: "Visual Hierarchy",
    title: "Gestalt Principles",
    url: "https://www.interaction-design.org/literature/topics/gestalt-principles",
  },
  {
    id: "seed-visual-search",
    category: "Visual Hierarchy",
    title: "Visual Search Theory",
    url: "https://www.nngroup.com/articles/visual-scanning-patterns/",
  },
  {
    id: "seed-serial-position",
    category: "Visual Hierarchy",
    title: "Serial Position Effect",
    url: "https://www.simplypsychology.org/primacy-recency.html",
  },
  {
    id: "seed-jakobs-law-cons",
    category: "Consistency",
    title: "Jakob's Law",
    url: "https://lawsofux.com/jakobs-law/",
  },
  {
    id: "seed-consistency-standards",
    category: "Consistency",
    title: "Consistency and Standards",
    url: "https://www.nngroup.com/articles/ten-usability-heuristics/",
  },
  {
    id: "seed-mental-models-cons",
    category: "Consistency",
    title: "Mental Models",
    url: "https://www.nngroup.com/articles/mental-models/",
  },
  {
    id: "seed-recognition-recall-cons",
    category: "Consistency",
    title: "Recognition Over Recall",
    url: "https://www.nngroup.com/articles/recognition-and-recall/",
  },
  {
    id: "seed-wcag",
    category: "Accessibility",
    title: "WCAG Guidelines",
    url: "https://www.w3.org/WAI/standards-guidelines/wcag/",
  },
  {
    id: "seed-color-contrast",
    category: "Accessibility",
    title: "Color Contrast Accessibility",
    url: "https://webaim.org/articles/contrast/",
  },
  {
    id: "seed-touch-target",
    category: "Accessibility",
    title: "Touch Target Accessibility",
    url: "https://www.w3.org/WAI/WCAG21/Understanding/target-size.html",
  },
  {
    id: "seed-cognitive-accessibility",
    category: "Accessibility",
    title: "Cognitive Accessibility",
    url: "https://www.w3.org/WAI/cognitive/",
  },
  {
    id: "seed-error-prevention",
    category: "Help & Support",
    title: "Error Prevention",
    url: "https://www.nngroup.com/articles/slips/",
  },
  {
    id: "seed-help-documentation",
    category: "Help & Support",
    title: "Help and Documentation",
    url: "https://www.nngroup.com/articles/help-and-documentation/",
  },
  {
    id: "seed-form-fatigue",
    category: "Help & Support",
    title: "Form Field Fatigue",
    url: "https://www.nngroup.com/articles/web-form-design/",
  },
  {
    id: "seed-progressive-disclosure-help",
    category: "Help & Support",
    title: "Progressive Disclosure",
    url: "https://www.nngroup.com/articles/progressive-disclosure/",
  },
  {
    id: "seed-recognition-recall-help",
    category: "Help & Support",
    title: "Recognition Over Recall",
    url: "https://www.nngroup.com/articles/recognition-and-recall/",
  },
  {
    id: "seed-millers-law",
    category: "Navigation",
    title: "Miller's Law",
    url: "https://lawsofux.com/millers-law/",
    blurb:
      "Users can only hold 7 (±2) items in working memory.",
  },
  {
    id: "seed-f-pattern-reading",
    category: "First Impressions",
    title: "F-Pattern Reading",
    url: "https://www.nngroup.com/articles/f-shaped-pattern-reading-web-content/",
    blurb:
      "Users scan in an F-shape, critical content and CTAs must land in the first two horizontal sweeps.",
  },
  {
    id: "seed-above-the-fold",
    category: "First Impressions",
    title: "Above the Fold Principle",
    url: "https://www.nngroup.com/articles/page-fold-manifesto/",
    blurb:
      "Content above the fold receives disproportionate attention.",
  },
  {
    id: "seed-signifier-affordance",
    category: "Task Completion",
    title: "Signifier and Affordance",
    url: "https://www.nngroup.com/articles/affordances-and-signifiers/",
    blurb:
      "CTAs must visually signal what they do and where they lead.",
  },
  {
    id: "seed-cognitive-load-task",
    category: "Task Completion",
    title: "Cognitive Load Theory",
    url: "https://www.nngroup.com/articles/minimize-cognitive-load/",
    blurb:
      "Every extra step or decision in a task flow adds cognitive load.",
  },
  {
    id: "seed-law-of-proximity",
    category: "Visual Hierarchy",
    title: "Law of Proximity",
    url: "https://www.nngroup.com/articles/gestalt-proximity/",
    blurb:
      "Elements close together are perceived as related.",
  },
  {
    id: "seed-law-of-similarity",
    category: "Visual Hierarchy",
    title: "Law of Similarity",
    url: "https://www.nngroup.com/articles/gestalt-similarity/",
    blurb:
      "Elements that look alike are assumed to share function.",
  },
  {
    id: "seed-whitespace-principle",
    category: "Visual Hierarchy",
    title: "Whitespace Principle",
    url: "https://www.nngroup.com/articles/white-space/",
    blurb:
      "Whitespace is not empty space, it directs attention, separates sections and reduces cognitive load.",
  },
  {
    id: "seed-aesthetic-consistency",
    category: "Consistency",
    title: "Aesthetic Consistency",
    url: "https://www.nngroup.com/articles/consistency-and-standards/",
    blurb:
      "Visual elements (headers, color, type) should look the same across pages, inconsistency signals separate products.",
  },
  {
    id: "seed-functional-consistency",
    category: "Consistency",
    title: "Functional Consistency",
    url: "https://www.nngroup.com/articles/consistency-and-standards/",
    blurb:
      "Features that do the same thing should look and behave the same.",
  },
  {
    id: "seed-error-of-omission",
    category: "Consistency",
    title: "Error of Omission",
    url: "https://www.nngroup.com/articles/errors-of-omission/",
    blurb:
      "Missing content that users expect (e.g. products not appearing in a list) reads as a system error, not a design choice.",
  },
  {
    id: "seed-aria-authoring",
    category: "Accessibility",
    title: "ARIA Authoring Practices",
    url: "https://www.w3.org/WAI/ARIA/apg/",
    blurb:
      "ARIA roles and attributes must match element behavior.",
  },
  {
    id: "seed-screen-reader-compat",
    category: "Accessibility",
    title: "Screen Reader Compatibility",
    url: "https://www.nngroup.com/articles/screen-reader-users/",
    blurb:
      "Semantic HTML and correct ARIA labeling ensures assistive technology can interpret and announce content correctly.",
  },
  {
    id: "seed-system-status",
    category: "Help & Support",
    title: "Visibility of System Status",
    url: "https://www.nngroup.com/articles/visibility-system-status/",
    blurb:
      "Users should always know where they are and how to get help.",
  },
  {
    id: "seed-self-service-ux",
    category: "Help & Support",
    title: "Self-Service UX",
    url: "https://www.nngroup.com/articles/self-service-ux/",
    blurb:
      "Users increasingly expect to solve problems without contacting support.",
  },
  {
    id: "seed-wayfinding",
    category: "Help & Support",
    title: "Wayfinding",
    url: "https://www.nngroup.com/articles/navigation-ia-tests/",
    blurb:
      "Users need persistent signals showing how to navigate to help.",
  },
]

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

export function getGoogleWorkspaceKeys(): GoogleWorkspaceKeys {
  if (typeof window === "undefined") return EMPTY_GOOGLE
  try {
    const raw = window.localStorage.getItem(GOOGLE_WORKSPACE)
    if (!raw) return EMPTY_GOOGLE
    const parsed = JSON.parse(raw) as Partial<GoogleWorkspaceKeys>
    return {
      apiKey: typeof parsed.apiKey === "string" ? parsed.apiKey : "",
      clientId: typeof parsed.clientId === "string" ? parsed.clientId : "",
    }
  } catch {
    return EMPTY_GOOGLE
  }
}

export function setGoogleWorkspaceKeys(keys: GoogleWorkspaceKeys): void {
  if (typeof window === "undefined") return
  window.localStorage.setItem(GOOGLE_WORKSPACE, JSON.stringify(keys))
}

export function getRememberedConnection(id: string): string | null {
  if (typeof window === "undefined") return null
  try {
    const raw = window.localStorage.getItem(CONNECTION_TESTS)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Record<string, unknown>
    const value = parsed[id]
    return typeof value === "string" ? value : null
  } catch {
    return null
  }
}

export function rememberConnection(id: string, signature: string): void {
  if (typeof window === "undefined") return
  let existing: Record<string, string> = {}
  try {
    const raw = window.localStorage.getItem(CONNECTION_TESTS)
    if (raw) {
      const parsed = JSON.parse(raw) as Record<string, unknown>
      existing = Object.fromEntries(
        Object.entries(parsed).filter(([, value]) => typeof value === "string")
      ) as Record<string, string>
    }
  } catch {
    existing = {}
  }
  window.localStorage.setItem(CONNECTION_TESTS, JSON.stringify({ ...existing, [id]: signature }))
}

export function forgetConnection(id: string): void {
  if (typeof window === "undefined") return
  try {
    const raw = window.localStorage.getItem(CONNECTION_TESTS)
    if (!raw) return
    const parsed = JSON.parse(raw) as Record<string, unknown>
    delete parsed[id]
    window.localStorage.setItem(CONNECTION_TESTS, JSON.stringify(parsed))
  } catch {
    window.localStorage.removeItem(CONNECTION_TESTS)
  }
}

export function hasKeys(): boolean {
  const k = getKeys()
  return k.pagespeed.length > 0 && k.anthropic.length > 0
}

export function resetAll(): void {
  if (typeof window === "undefined") return
  window.localStorage.removeItem(KEYS)
  window.localStorage.removeItem(GOOGLE_WORKSPACE)
  window.localStorage.removeItem(CONNECTION_TESTS)
  window.localStorage.removeItem(LAST_RUN)
  window.localStorage.removeItem(KNOWLEDGE)
  window.localStorage.removeItem(LEGACY_FINDINGS)
  window.localStorage.removeItem(SAVED_RUNS)
  window.localStorage.removeItem(PROMPTS)
  window.localStorage.removeItem(ACTIVE_RUN_ID)
  window.localStorage.removeItem(ACTIVE_SAVED_RUN_ID)
  window.localStorage.removeItem(CLIENT_LOCKED)
}

const PROMPT_KEYS: PromptKey[] = [
  "firstImpression",
  "navigation",
  "visualHierarchy",
  "helpSupport",
]

export function getPromptOverrides(): PromptOverrides {
  if (typeof window === "undefined") return {}
  try {
    const raw = window.localStorage.getItem(PROMPTS)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== "object") return {}
    const out: PromptOverrides = {}
    for (const key of PROMPT_KEYS) {
      const value = (parsed as Record<string, unknown>)[key]
      if (typeof value === "string" && value.trim().length > 0) {
        out[key] = value
      }
    }
    return out
  } catch {
    return {}
  }
}

export function setPromptOverrides(next: PromptOverrides): void {
  if (typeof window === "undefined") return
  const cleaned: PromptOverrides = {}
  for (const key of PROMPT_KEYS) {
    const value = next[key]
    if (typeof value === "string" && value.trim().length > 0) {
      cleaned[key] = value
    }
  }
  window.localStorage.setItem(PROMPTS, JSON.stringify(cleaned))
}

export function resetPromptOverride(key: PromptKey): void {
  const all = getPromptOverrides()
  delete all[key]
  setPromptOverrides(all)
}

export function resetAllPrompts(): void {
  if (typeof window === "undefined") return
  window.localStorage.removeItem(PROMPTS)
}

export function getKnowledge(): KnowledgeEntry[] {
  if (typeof window === "undefined") return SEED_KNOWLEDGE
  try {
    // Drop any legacy seed payload — the curated principle list supersedes it.
    if (window.localStorage.getItem(LEGACY_FINDINGS)) {
      window.localStorage.removeItem(LEGACY_FINDINGS)
    }
    const raw = window.localStorage.getItem(KNOWLEDGE)
    if (!raw) {
      setKnowledge(SEED_KNOWLEDGE)
      return SEED_KNOWLEDGE
    }
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return SEED_KNOWLEDGE
    const cleaned = parsed.filter(isKnowledgeEntry)
    if (cleaned.length === 0) return SEED_KNOWLEDGE
    const seenIds = new Set(cleaned.map((e) => e.id))
    const seenKeys = new Set(
      cleaned.map((e) => `${e.category.toLowerCase()}::${e.title.toLowerCase()}`)
    )
    const additions = SEED_KNOWLEDGE.filter(
      (seed) =>
        !seenIds.has(seed.id) &&
        !seenKeys.has(`${seed.category.toLowerCase()}::${seed.title.toLowerCase()}`)
    )
    if (additions.length === 0) return cleaned
    const merged = [...cleaned, ...additions]
    setKnowledge(merged)
    return merged
  } catch {
    return SEED_KNOWLEDGE
  }
}

export function setKnowledge(entries: KnowledgeEntry[]): void {
  if (typeof window === "undefined") return
  window.localStorage.setItem(KNOWLEDGE, JSON.stringify(entries))
}

export function resetKnowledge(): void {
  setKnowledge(SEED_KNOWLEDGE)
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
    window.localStorage.setItem(ACTIVE_RUN_ID, run.runId)
    const version = ++lastRunPersistVersion
    void persistLastRunImages(run, version)
  } catch (err) {
    // Likely a quota error — drop screenshots and retry once.
    if (err instanceof DOMException && err.name === "QuotaExceededError") {
      const trimmed: LastRun = {
        ...run,
        sites: run.sites.map((s) => ({
          ...s,
          metrics: { ...s.metrics, screenshot: "", fullPageScreenshot: "" },
        })),
      }
      try {
        window.localStorage.setItem(LAST_RUN, JSON.stringify(trimmed))
        window.localStorage.setItem(ACTIVE_RUN_ID, trimmed.runId)
        const version = ++lastRunPersistVersion
        void persistLastRunImages(run, version)
      } catch {
        /* give up silently */
      }
    }
  }
}

export async function getLastRunHydrated(): Promise<LastRun | null> {
  const run = getLastRun()
  if (!run) return null
  const payload = getLastRunImageRefsPayload()
  if (!payload || payload.runId !== run.runId) return run
  return hydrateRunWithImageRefs(run, payload.refs)
}

export function clearLastRun(): void {
  if (typeof window === "undefined") return
  window.localStorage.removeItem(LAST_RUN)
  window.localStorage.removeItem(ACTIVE_RUN_ID)
  window.localStorage.removeItem(LAST_RUN_IMAGE_REFS)
  window.localStorage.removeItem(ACTIVE_SAVED_RUN_ID)
}

export function getActiveRunId(): string | null {
  if (typeof window === "undefined") return null
  return window.localStorage.getItem(ACTIVE_RUN_ID)
}

export function getActiveSavedRunId(): string | null {
  if (typeof window === "undefined") return null
  return window.localStorage.getItem(ACTIVE_SAVED_RUN_ID)
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

export function getSavedRuns(): SavedRun[] {
  if (typeof window === "undefined") return []
  try {
    const raw = window.localStorage.getItem(SAVED_RUNS)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(isSavedRun)
  } catch {
    return []
  }
}

function writeSavedRuns(runs: SavedRun[]): void {
  if (typeof window === "undefined") return
  try {
    window.localStorage.setItem(SAVED_RUNS, JSON.stringify(runs))
  } catch (err) {
    if (err instanceof DOMException && err.name === "QuotaExceededError") {
      const trimmed: SavedRun[] = runs.map((sr) => ({
        ...sr,
        run: {
          ...sr.run,
          sites: sr.run.sites.map((s) => ({
            ...s,
            metrics: { ...s.metrics, screenshot: "", fullPageScreenshot: "" },
          })),
        },
      }))
      try {
        window.localStorage.setItem(SAVED_RUNS, JSON.stringify(trimmed))
      } catch {
        /* give up silently */
      }
    }
  }
}

export function defaultRunName(run: LastRun): string {
  const clientName = clientNameFromRun(run)
  if (clientName) return clientName
  const industry = run.classification?.industry.trim()
  return `${industry || "Website"} Analysis`
}

function clientNameFromRun(run: LastRun): string {
  const clientSite = run.sites.find((s) => s.isClient)
  const url = clientSite?.metrics.finalUrl || clientSite?.url || run.clientUrl || ""
  if (!url) return ""
  let hostname = url
  try {
    hostname = new URL(url).hostname
  } catch {
    /* fall through with raw value */
  }
  const clean = hostname.replace(/^www\./i, "")
  const parts = clean.split(".").filter(Boolean)
  const label = parts.length >= 2 ? parts[parts.length - 2] : parts[0] ?? clean
  return label
    .split(/[-_]/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ")
}

export function savedRunSubtag(savedAt: string): string {
  return new Date(savedAt).toLocaleString(undefined, {
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })
}

export async function saveCurrentRun(name: string, sourceRun?: LastRun): Promise<SavedRun | null> {
  const run = sourceRun ?? getLastRun()
  if (!run) return null
  const trimmed = name.trim()
  const all = getSavedRuns()
  const activeSavedId = getActiveSavedRunId()
  const existingIndex = activeSavedId ? all.findIndex((r) => r.id === activeSavedId) : -1
  const existing = existingIndex >= 0 ? all[existingIndex] : undefined

  const base: SavedRun = {
    id: existing?.id ?? crypto.randomUUID(),
    name: trimmed || existing?.name || defaultRunName(run),
    savedAt: new Date().toISOString(),
    run,
  }

  if (existing) {
    await deleteStoredImagesForRun(existing.id).catch(() => {
      /* continue and re-store best effort */
    })
  }

  const saved = await prepareSavedRunImages(base)
  if (existingIndex >= 0) {
    const next = all.slice()
    next[existingIndex] = saved
    writeSavedRuns(next)
  } else {
    writeSavedRuns([saved, ...all])
  }
  if (typeof window !== "undefined") {
    window.localStorage.setItem(ACTIVE_SAVED_RUN_ID, saved.id)
  }
  return saved
}

export function deleteSavedRun(id: string): void {
  const all = getSavedRuns()
  writeSavedRuns(all.filter((r) => r.id !== id))
  if (typeof window !== "undefined" && window.localStorage.getItem(ACTIVE_SAVED_RUN_ID) === id) {
    window.localStorage.removeItem(ACTIVE_SAVED_RUN_ID)
  }
  deleteStoredImagesForRun(id).catch(() => {
    /* local metadata is already removed */
  })
}

export async function loadSavedRun(id: string): Promise<LastRun | null> {
  const saved = getSavedRuns().find((r) => r.id === id)
  if (!saved) return null
  const run = await hydrateSavedRunImages(saved)
  clearPendingUrls()
  clearPendingClassification()
  setLastRun(run)
  if (typeof window !== "undefined") {
    window.localStorage.setItem(ACTIVE_SAVED_RUN_ID, id)
  }
  return run
}

export function renameSavedRun(id: string, name: string): void {
  const trimmed = name.trim()
  if (!trimmed) return
  const all = getSavedRuns()
  writeSavedRuns(all.map((r) => (r.id === id ? { ...r, name: trimmed } : r)))
}

async function prepareSavedRunImages(saved: SavedRun): Promise<SavedRun> {
  const imageRefs: SavedRunImageRefs = {}
  const sites = await Promise.all(
    saved.run.sites.map(async (site) => {
      const refs: SiteImageRefs = {}
      const metrics = { ...site.metrics }

      for (const field of ["screenshot", "fullPageScreenshot"] as const) {
        const value = metrics[field]
        if (!value) continue
        const imageId = `${saved.id}:${encodeURIComponent(site.url)}:metrics:${field}`
        try {
          await putStoredImage(imageId, value)
          refs.metrics = { ...refs.metrics, [field]: imageId }
          metrics[field] = ""
        } catch {
          /* keep the inline image; localStorage quota fallback may still strip it */
        }
      }

      const userImages = site.userImages ? { ...site.userImages } : undefined
      if (userImages) {
        const userRefs: UserImageRefs = {}
        if (userImages.screenshot) {
          const imageId = `${saved.id}:${encodeURIComponent(site.url)}:user:screenshot`
          try {
            await putStoredImage(imageId, userImages.screenshot)
            userRefs.screenshot = imageId
            userImages.screenshot = ""
          } catch {
            /* keep inline */
          }
        }
        if (userImages.firstImpression) {
          const imageId = `${saved.id}:${encodeURIComponent(site.url)}:user:firstImpression`
          try {
            await putStoredImage(imageId, userImages.firstImpression)
            userRefs.firstImpression = imageId
            userImages.firstImpression = ""
          } catch {
            /* keep inline */
          }
        }
        if (userImages.visualHierarchy?.length) {
          const refsForField: string[] = []
          const nextImages = await Promise.all(
            userImages.visualHierarchy.map(async (image, i) => {
              const imageId = `${saved.id}:${encodeURIComponent(site.url)}:user:visualHierarchy:${i}`
              try {
                await putStoredImage(imageId, image)
                refsForField[i] = imageId
                return ""
              } catch {
                return image
              }
            })
          )
          if (refsForField.some(Boolean)) userRefs.visualHierarchy = refsForField
          userImages.visualHierarchy = nextImages
        }
        if (userImages.helpSupport?.length) {
          const refsForField: string[] = []
          const nextImages = await Promise.all(
            userImages.helpSupport.map(async (image, i) => {
              const imageId = `${saved.id}:${encodeURIComponent(site.url)}:user:helpSupport:${i}`
              try {
                await putStoredImage(imageId, image)
                refsForField[i] = imageId
                return ""
              } catch {
                return image
              }
            })
          )
          if (refsForField.some(Boolean)) userRefs.helpSupport = refsForField
          userImages.helpSupport = nextImages
        }
        if (Object.keys(userRefs).length > 0) refs.userImages = userRefs
      }

      if (Object.keys(refs).length > 0) imageRefs[site.url] = refs
      return {
        ...site,
        metrics,
        userImages,
      }
    })
  )

  return {
    ...saved,
    imageRefs: Object.keys(imageRefs).length > 0 ? imageRefs : undefined,
    run: { ...saved.run, sites },
  }
}

async function hydrateSavedRunImages(saved: SavedRun): Promise<LastRun> {
  const imageRefs = saved.imageRefs
  if (!imageRefs) return saved.run

  const sites = await Promise.all(
    saved.run.sites.map(async (site) => {
      const refs = imageRefs[site.url]
      if (!refs) return site
      const metrics = { ...site.metrics }
      for (const field of ["screenshot", "fullPageScreenshot"] as const) {
        const imageId = refs.metrics?.[field]
        if (!imageId) continue
        metrics[field] = (await getStoredImage(imageId).catch(() => undefined)) ?? metrics[field]
      }

      const userImages = site.userImages ? { ...site.userImages } : undefined
      if (userImages && refs.userImages) {
        if (refs.userImages.screenshot) {
          userImages.screenshot =
            (await getStoredImage(refs.userImages.screenshot).catch(() => undefined)) ??
            userImages.screenshot
        }
        if (refs.userImages.firstImpression) {
          userImages.firstImpression =
            (await getStoredImage(refs.userImages.firstImpression).catch(() => undefined)) ??
            userImages.firstImpression
        }
        if (refs.userImages.visualHierarchy?.length) {
          userImages.visualHierarchy = await Promise.all(
            refs.userImages.visualHierarchy.map(async (imageId, i) =>
              imageId
                ? ((await getStoredImage(imageId).catch(() => undefined)) ??
                  userImages.visualHierarchy?.[i] ??
                  "")
                : (userImages.visualHierarchy?.[i] ?? "")
            )
          )
        }
        if (refs.userImages.helpSupport?.length) {
          userImages.helpSupport = await Promise.all(
            refs.userImages.helpSupport.map(async (imageId, i) =>
              imageId
                ? ((await getStoredImage(imageId).catch(() => undefined)) ??
                  userImages.helpSupport?.[i] ??
                  "")
                : (userImages.helpSupport?.[i] ?? "")
            )
          )
        }
      }

      return { ...site, metrics, userImages }
    })
  )

  return { ...saved.run, sites }
}

function getLastRunImageRefsPayload(): LastRunRefsPayload | null {
  if (typeof window === "undefined") return null
  try {
    const raw = window.localStorage.getItem(LAST_RUN_IMAGE_REFS)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<LastRunRefsPayload>
    if (!parsed || typeof parsed !== "object") return null
    if (typeof parsed.runId !== "string") return null
    if (!parsed.refs || typeof parsed.refs !== "object") return null
    return { runId: parsed.runId, refs: parsed.refs as LastRunImageRefs }
  } catch {
    return null
  }
}

function setLastRunImageRefsPayload(payload: LastRunRefsPayload): void {
  if (typeof window === "undefined") return
  window.localStorage.setItem(LAST_RUN_IMAGE_REFS, JSON.stringify(payload))
}

async function persistLastRunImages(run: LastRun, version: number): Promise<void> {
  const imageRefs: LastRunImageRefs = {}
  const sites = await Promise.all(
    run.sites.map(async (site) => {
      const refs: SiteImageRefs = {}
      const metrics = { ...site.metrics }
      for (const field of ["screenshot", "fullPageScreenshot"] as const) {
        const value = metrics[field]
        if (!value) continue
        const imageId = `lastRun:${run.runId}:${encodeURIComponent(site.url)}:metrics:${field}`
        try {
          await putStoredImage(imageId, value)
          refs.metrics = { ...refs.metrics, [field]: imageId }
          metrics[field] = ""
        } catch {
          /* keep inline */
        }
      }

      if (Object.keys(refs).length > 0) imageRefs[site.url] = refs
      return {
        ...site,
        metrics,
      }
    })
  )

  if (version !== lastRunPersistVersion || typeof window === "undefined") return
  const trimmed: LastRun = { ...run, sites }
  try {
    window.localStorage.setItem(LAST_RUN, JSON.stringify(trimmed))
    window.localStorage.setItem(ACTIVE_RUN_ID, trimmed.runId)
    setLastRunImageRefsPayload({ runId: trimmed.runId, refs: imageRefs })
  } catch {
    // Keep whatever state is already persisted.
  }
}

async function hydrateRunWithImageRefs(
  run: LastRun,
  refsByUrl: LastRunImageRefs
): Promise<LastRun> {
  const sites = await Promise.all(
    run.sites.map(async (site) => {
      const refs = refsByUrl[site.url]
      if (!refs?.metrics) return site
      const metrics = { ...site.metrics }
      for (const field of ["screenshot", "fullPageScreenshot"] as const) {
        const imageId = refs.metrics[field]
        if (!imageId) continue
        metrics[field] = (await getStoredImage(imageId).catch(() => undefined)) ?? metrics[field]
      }
      return { ...site, metrics }
    })
  )
  return { ...run, sites }
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
  window.localStorage.removeItem(ACTIVE_RUN_ID)
  window.localStorage.removeItem(ACTIVE_SAVED_RUN_ID)
  window.sessionStorage.setItem(PENDING_URLS, JSON.stringify(urls))
}

export function clearPendingUrls(): void {
  if (typeof window === "undefined") return
  window.sessionStorage.removeItem(PENDING_URLS)
}

export function getPendingClassification(): IndustryClassification | null {
  if (typeof window === "undefined") return null
  try {
    const raw = window.sessionStorage.getItem(PENDING_CLASSIFICATION)
    if (!raw) return null
    const parsed = JSON.parse(raw) as IndustryClassification
    if (typeof parsed.industry !== "string" || !Array.isArray(parsed.sites)) return null
    return parsed
  } catch {
    return null
  }
}

export function setPendingClassification(c: IndustryClassification): void {
  if (typeof window === "undefined") return
  window.sessionStorage.setItem(PENDING_CLASSIFICATION, JSON.stringify(c))
}

export function clearPendingClassification(): void {
  if (typeof window === "undefined") return
  window.sessionStorage.removeItem(PENDING_CLASSIFICATION)
}

export function getPendingClientUrl(): string {
  if (typeof window === "undefined") return ""
  return window.sessionStorage.getItem(PENDING_CLIENT_URL) ?? ""
}

export function setPendingClientUrl(url: string): void {
  if (typeof window === "undefined") return
  if (url) window.sessionStorage.setItem(PENDING_CLIENT_URL, url)
  else window.sessionStorage.removeItem(PENDING_CLIENT_URL)
}

export function clearPendingClientUrl(): void {
  if (typeof window === "undefined") return
  window.sessionStorage.removeItem(PENDING_CLIENT_URL)
}

export function getClientLocked(): boolean {
  if (typeof window === "undefined") return false
  return window.localStorage.getItem(CLIENT_LOCKED) === "1"
}

export function setClientLocked(locked: boolean): void {
  if (typeof window === "undefined") return
  if (locked) window.localStorage.setItem(CLIENT_LOCKED, "1")
  else window.localStorage.removeItem(CLIENT_LOCKED)
}

function isKnowledgeEntry(value: unknown): value is KnowledgeEntry {
  if (!value || typeof value !== "object") return false
  const entry = value as Partial<KnowledgeEntry>
  return (
    typeof entry.id === "string" &&
    typeof entry.category === "string" &&
    typeof entry.title === "string" &&
    typeof entry.url === "string"
  )
}

function isSavedRun(value: unknown): value is SavedRun {
  if (!value || typeof value !== "object") return false
  const sr = value as Partial<SavedRun>
  return (
    typeof sr.id === "string" &&
    typeof sr.name === "string" &&
    typeof sr.savedAt === "string" &&
    !!sr.run &&
    typeof sr.run === "object" &&
    Array.isArray((sr.run as LastRun).sites)
  )
}
