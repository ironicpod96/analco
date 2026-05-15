"use client"

import { ChevronDown, FolderOpen, Plus, Save, Trash2 } from "lucide-react"
import { useRouter } from "next/navigation"
import { useEffect, useMemo, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { toast } from "sonner"

import { CrossSitePatterns } from "@/components/cross-site-patterns"
import { useNavbarSlots } from "@/components/navbar-slots"
import { OverviewRubricFrame } from "@/components/overview-rubric-frame"
import { SiteCard, type SiteCardState } from "@/components/site-card"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { applyAIScores, generateGrowthOpsInsights, identifyPrimaryOfferingTarget, identifyTaskEvaluationCriteria, scoreSiteWithAI } from "@/lib/ai-scoring"
import { ANALYTICS_CATEGORIES, buildCrossSiteInsights, buildSiteMeta, type AnalyticsCategoryKey } from "@/lib/analytics"
import { makeClient } from "@/lib/anthropic"
import { runPool } from "@/lib/concurrency"
import { fetchNavData } from "@/lib/nav-extract"
import { extractMetrics, fetchPageSpeed, PageSpeedError } from "@/lib/pagespeed"
import { initialRubric } from "@/lib/rubric"
import { parseUrlInput } from "@/lib/url"
import {
  captureFullPageScreenshot,
  captureNavigationMobileScreenshot,
  captureVisualHierarchyScreenshot,
  captureVisualHierarchySectionScreenshots,
} from "@/lib/screenshot"
import {
  clearLastRun,
  clearPendingClassification,
  clearPendingClientUrl,
  clearPendingUrls,
  defaultRunName,
  getClientLocked,
  setClientLocked,
  deleteSavedRun,
  getActiveSavedRunId,
  getKeys,
  getKnowledge,
  getLastRun,
  getLastRunHydrated,
  getPendingClassification,
  getPendingClientUrl,
  getPendingUrls,
  getSavedRuns,
  loadSavedRun,
  saveCurrentRun,
  savedRunSubtag,
  setCrossSiteInsightOverride,
  setLastRun,
  setTaskEvaluationCriteria,
  upsertSite,
} from "@/lib/storage"
import type { IndustryClassification, LastRun, SavedRun, SiteAudit } from "@/lib/types"

const MAX_SITES = 8

export default function AnalysisPage() {
  const router = useRouter()
  const { leftEl, rightEl } = useNavbarSlots()
  const [states, setStates] = useState<SiteCardState[]>([])
  const [savedRuns, setSavedRuns] = useState<SavedRun[]>([])
  const [activeTab, setActiveTab] = useState<"cards" | "analytics" | "comparison">("cards")
  const [locked, setLocked] = useState(false)
  const [addModalOpen, setAddModalOpen] = useState(false)
  const startedRef = useRef(false)

  useEffect(() => {
    queueMicrotask(() => {
      setSavedRuns(getSavedRuns())
      setLocked(getClientLocked())
    })
  }, [])

  function handleToggleLock() {
    setLocked((prev) => {
      const next = !prev
      setClientLocked(next)
      return next
    })
  }

  useEffect(() => {
    if (startedRef.current) return
    startedRef.current = true
    let cancelled = false

    void initialize()

    async function initialize() {
      const pending = getPendingUrls()
      const pendingClient = getPendingClientUrl()
      const existing = await getLastRunHydrated()

      if (cancelled) return

      if (pending.length > 0) {
        startFreshRun(pending, pendingClient || null)
        return
      }

      if (existing && existing.sites.length > 0) {
        queueMicrotask(() => {
          if (cancelled) return
          setStates(statesFromRun(existing))
        })
        return
      }

      router.replace("/")
    }

    function startFreshRun(urls: string[], clientUrl: string | null) {
      const { pagespeed: psKey, anthropic: aiKey } = getKeys()
      const knowledge = getKnowledge()
      if (!psKey) {
        toast.error("Add your PageSpeed key in Settings to start.")
        router.replace("/settings")
        return
      }

      const pendingClassification = getPendingClassification()
      const orderedUrls = clientUrl
        ? [clientUrl, ...urls.filter((u) => u !== clientUrl)]
        : urls
      const run: LastRun = {
        runId: crypto.randomUUID(),
        startedAt: new Date().toISOString(),
        urls: orderedUrls,
        sites: [],
        classification: pendingClassification ?? undefined,
        clientUrl: clientUrl ?? undefined,
      }
      setLastRun(run)
      clearPendingUrls()
      clearPendingClassification()
      clearPendingClientUrl()

      setStates(orderedUrls.map((url) => ({ url, status: "queued", audit: null })))

      const runOne = async (url: string, i: number) => {
        setStates((prev) => updateAt(prev, i, { status: "fetching" }))
        try {
          const [raw, navData] = await Promise.all([
            fetchPageSpeed(url, psKey),
            fetchNavData(url).catch(() => null),
          ])
          const metrics = extractMetrics(url, raw)
          try {
            metrics.fullPageScreenshot = await captureFullPageScreenshot(metrics.finalUrl || url)
            metrics.fullPageScreenshotSource = "screenshotone"
          } catch (err) {
            const message = err instanceof Error ? err.message : "Screenshot capture failed"
            toast.error(`Full-page screenshot failed for ${url}: ${message}`)
          }
          let audit: SiteAudit = {
            url,
            metrics,
            rubric: initialRubric(metrics),
            lastScoredAt: new Date().toISOString(),
            navData: navData ?? undefined,
            isClient: clientUrl ? url === clientUrl : false,
          }
          if (audit.isClient) {
            try {
              metrics.navigationMobileScreenshot = await captureNavigationMobileScreenshot(metrics.finalUrl || url)
            } catch (err) {
              const message = err instanceof Error ? err.message : "Navigation screenshot capture failed"
              toast.error(`Mobile navigation screenshot failed for ${url}: ${message}`)
            }
          }
          if (aiKey && (audit.isClient || (!clientUrl && i === 0))) {
            try {
              const target = await identifyPrimaryOfferingTarget(metrics, aiKey, {
                url,
                classification: pendingClassification ?? undefined,
              })
              metrics.visualHierarchyScreenshot = await captureVisualHierarchyScreenshot(
                metrics.finalUrl || url,
                `${target.offering} ${target.sectionSearchText}`
              )
              metrics.visualHierarchySectionScreenshots = await captureVisualHierarchySectionScreenshots(
                metrics.finalUrl || url,
                `${target.offering} ${target.sectionSearchText}`
              )
              metrics.visualHierarchyScreenshotTarget = target.offering
            } catch (err) {
              const message = err instanceof Error ? err.message : "Visual hierarchy screenshot failed"
              toast.error(`Visual hierarchy screenshot failed for ${url}: ${message}`)
            }
          }
          upsertSite(audit)
          setStates((prev) => updateAt(prev, i, { status: "scoring", audit }))

          if (aiKey) {
            try {
              const ai = await scoreSiteWithAI(metrics, aiKey, knowledge, {
                url,
                classification: pendingClassification ?? undefined,
              })
              audit = {
                ...audit,
                rubric: applyAIScores(audit.rubric, ai),
                lastScoredAt: new Date().toISOString(),
              }
              upsertSite(audit)
            } catch (err) {
              const message = err instanceof Error ? err.message : "AI scoring failed"
              toast.error(`AI scoring failed for ${url}: ${message}`)
            }
          }

          setStates((prev) => updateAt(prev, i, { status: "done", audit }))
        } catch (err) {
          const message =
            err instanceof PageSpeedError
              ? err.message
              : err instanceof Error
                ? err.message
                : "Unknown error"
          setStates((prev) => updateAt(prev, i, { status: "error", error: message }))
        }
      }

      void (async () => {
        const startIndex = clientUrl ? 1 : 0
        if (clientUrl) {
          await runOne(clientUrl, 0)
        }
        const rest = orderedUrls.slice(startIndex)
        await runPool(rest, 5, (url, j) => runOne(url, startIndex + j)).catch(() => {
          /* per-item errors already captured above */
        })

        if (aiKey) {
          try {
            await generateAndStoreAIInsights(aiKey, pendingClassification ?? undefined)
          } catch {
            /* non-critical — insight cards fall back to rule-based text */
          }
        }
      })()
    }
    return () => {
      cancelled = true
      startedRef.current = false
    }
  }, [router])

  function newAnalysis() {
    clearLastRun()
    clearPendingUrls()
    router.push("/")
  }

  async function handleSave() {
    const run = getLastRun()
    const activeSavedRunId = getActiveSavedRunId()
    const existingSavedRun = activeSavedRunId
      ? getSavedRuns().find((r) => r.id === activeSavedRunId)
      : undefined
    const currentSites = states
      .filter((s): s is SiteCardState & { audit: SiteAudit } => s.status === "done" && !!s.audit)
      .map((s) => s.audit)
    const sourceRun = run ? { ...run, sites: currentSites } : null
    if (!sourceRun || sourceRun.sites.length === 0) {
      toast.error("Nothing to save yet — wait for at least one site to finish.")
      return
    }
    const suggested = defaultRunName(sourceRun)
    const name = existingSavedRun
      ? existingSavedRun.name
      : window.prompt("Name this saved run", suggested)
    if (name === null) return
    const saved = await saveCurrentRun(name, sourceRun)
    if (!saved) {
      toast.error("Could not save run")
      return
    }
    setSavedRuns(getSavedRuns())
    toast.success(
      existingSavedRun ? `Updated "${saved.name}"` : `Saved "${saved.name}"`
    )
  }

  async function handleLoad(id: string) {
    const run = await loadSavedRun(id)
    if (!run) {
      toast.error("Saved run not found")
      return
    }
    setStates(statesFromRun(run))
    const name = savedRuns.find((r) => r.id === id)?.name
    toast.success(name ? `Loaded "${name}"` : "Loaded saved run")
  }

  function handleDelete(id: string, name: string) {
    if (!window.confirm(`Delete "${name}"?`)) return
    deleteSavedRun(id)
    setSavedRuns(getSavedRuns())
  }

  async function handleAddCompetitors(urls: string[]) {
    if (urls.length === 0) return

    const { pagespeed: psKey, anthropic: aiKey } = getKeys()
    if (!psKey) {
      toast.error("Add your PageSpeed key in Settings to add competitors.")
      return
    }

    const toAdd = urls.filter((u) => !states.some((s) => s.url === u)).slice(0, MAX_SITES - states.length)
    if (toAdd.length === 0) {
      toast.error("All of these websites are already in the comparison.")
      return
    }

    setAddModalOpen(false)

    const run = getLastRun()
    if (run) {
      const nextUrls = [...run.urls]
      for (const url of toAdd) {
        if (!nextUrls.includes(url)) nextUrls.push(url)
      }
      setLastRun({ ...run, urls: nextUrls })
    }

    setStates((prev) => [
      ...prev,
      ...toAdd.map((url) => ({ url, status: "queued" as const, audit: null })),
    ])

    const knowledge = getKnowledge()
    const classification = getLastRun()?.classification

    const patchUrl = (url: string, patch: Partial<SiteCardState>) =>
      setStates((prev) => prev.map((s) => (s.url === url ? { ...s, ...patch } : s)))

    await runPool(toAdd, 3, async (url) => {
      patchUrl(url, { status: "fetching" })
      try {
        const [raw, navData] = await Promise.all([
          fetchPageSpeed(url, psKey),
          fetchNavData(url).catch(() => null),
        ])
        const metrics = extractMetrics(url, raw)
        try {
          metrics.fullPageScreenshot = await captureFullPageScreenshot(metrics.finalUrl || url)
          metrics.fullPageScreenshotSource = "screenshotone"
        } catch (err) {
          toast.error(`Screenshot failed for ${url}: ${err instanceof Error ? err.message : "unknown"}`)
        }
        let audit: SiteAudit = {
          url,
          metrics,
          rubric: initialRubric(metrics),
          lastScoredAt: new Date().toISOString(),
          navData: navData ?? undefined,
          isClient: false,
        }
        upsertSite(audit)
        patchUrl(url, { status: "scoring", audit })

        if (aiKey) {
          try {
            if (audit.isClient) {
              const target = await identifyPrimaryOfferingTarget(metrics, aiKey, { url, classification })
              metrics.visualHierarchyScreenshot = await captureVisualHierarchyScreenshot(
                metrics.finalUrl || url,
                `${target.offering} ${target.sectionSearchText}`
              )
              metrics.visualHierarchySectionScreenshots = await captureVisualHierarchySectionScreenshots(
                metrics.finalUrl || url,
                `${target.offering} ${target.sectionSearchText}`
              )
              metrics.visualHierarchyScreenshotTarget = target.offering
            }
            const ai = await scoreSiteWithAI(metrics, aiKey, knowledge, { url, classification })
            audit = {
              ...audit,
              rubric: applyAIScores(audit.rubric, ai),
              lastScoredAt: new Date().toISOString(),
            }
            upsertSite(audit)
          } catch (err) {
            toast.error(`AI scoring failed for ${url}: ${err instanceof Error ? err.message : "unknown"}`)
          }
        }

        patchUrl(url, { status: "done", audit })
      } catch (err) {
        const message =
          err instanceof PageSpeedError
            ? err.message
            : err instanceof Error
              ? err.message
              : "Unknown error"
        patchUrl(url, { status: "error", error: message })
      }
    }).catch(() => { /* per-item errors already captured */ })
  }

  const anyDone = states.some((s) => s.status === "done")
  const canSave = states.some((s) => s.status === "done")
  const completedAudits = states
    .filter((s): s is SiteCardState & { audit: SiteAudit } => s.status === "done" && !!s.audit)
    .map((s) => s.audit)

  const navTabs = (
    <Tabs
      value={activeTab}
      onValueChange={(v) => setActiveTab(v as "cards" | "analytics" | "comparison")}
    >
      <TabsList className="gap-1">
        <TabsTrigger value="cards">Compare</TabsTrigger>
        <TabsTrigger value="analytics" disabled={!anyDone}>
          Analyse
        </TabsTrigger>
        <TabsTrigger value="comparison" disabled={!anyDone}>
          Present
        </TabsTrigger>
      </TabsList>
    </Tabs>
  )

  const navActions = (
    <div className="flex items-center gap-2">
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button variant="outline" size="sm" disabled={savedRuns.length === 0}>
              <FolderOpen className="h-4 w-4" />
              Open
              <ChevronDown className="h-3.5 w-3.5 opacity-60" />
            </Button>
          }
        />
        <DropdownMenuContent align="end" className="w-72">
          {savedRuns.length === 0 ? (
            <div className="px-2 py-3 text-xs text-muted-foreground">
              No saved runs yet.
            </div>
          ) : (
            savedRuns.map((sr) => (
              <DropdownMenuItem
                key={sr.id}
                closeOnClick={false}
                onClick={() => handleLoad(sr.id)}
                className="flex items-center justify-between gap-2"
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm">{sr.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {savedRunSubtag(sr.savedAt)}
                  </div>
                </div>
                <button
                  type="button"
                  aria-label={`Delete ${sr.name}`}
                  onClick={(e) => {
                    e.stopPropagation()
                    handleDelete(sr.id, sr.name)
                  }}
                  className="shrink-0 rounded-md p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </DropdownMenuItem>
            ))
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      <Button variant="outline" size="sm" onClick={handleSave} disabled={!canSave}>
        <Save className="h-4 w-4" />
        Save
      </Button>
    </div>
  )

  return (
    <>
      {leftEl && createPortal(navTabs, leftEl)}
      {rightEl && createPortal(navActions, rightEl)}
      <Dialog open={addModalOpen} onOpenChange={(open) => setAddModalOpen(open)}>
        <DialogContent className="max-w-md">
          <DialogTitle>Add competitor</DialogTitle>
          <AddCompetitorForm
            maxUrls={MAX_SITES - states.length}
            existingUrls={states.map((s) => s.url)}
            onSubmit={handleAddCompetitors}
          />
        </DialogContent>
      </Dialog>
      <div className="flex h-[calc(100vh-3.5rem)] min-h-0 flex-col overflow-hidden">
        <div className="mx-auto flex min-h-0 w-full max-w-7xl flex-1 flex-col px-6 pt-4">
          {activeTab === "cards" ? (
            <div className="-mx-6 flex h-full min-h-0 flex-1 gap-4 overflow-x-auto px-6 pb-6">
              {orderClientFirst(states).map((state) => {
                const isClient = Boolean(state.audit?.isClient)
                return (
                  <SiteCard
                    key={state.url}
                    state={state}
                    isClient={isClient}
                    locked={isClient && locked}
                    onToggleLock={isClient ? handleToggleLock : undefined}
                    onUpdate={(next) => {
                      upsertSite(next)
                      setStates((prev) =>
                        prev.map((s) => (s.url === state.url ? { ...s, audit: next } : s))
                      )
                    }}
                  />
                )
              })}
              {states.length < MAX_SITES && (
                <button
                  type="button"
                  onClick={() => setAddModalOpen(true)}
                  className="flex h-full w-8 shrink-0 items-center justify-center rounded-xl border text-muted-foreground transition-colors hover:border-foreground/40 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  aria-label="Add competitor"
                  title="Add competitor"
                >
                  <Plus className="h-4 w-4" />
                </button>
              )}
            </div>
          ) : activeTab === "analytics" ? (
            <div className="-mx-6 min-h-0 flex-1 overflow-y-auto px-6 pb-8">
              <div className="mx-auto w-full max-w-7xl">
                <CrossSitePatterns audits={completedAudits} />
              </div>
            </div>
          ) : (
            <div className="-mx-6 min-h-0 flex-1 overflow-y-auto px-6 pb-8">
              <div className="mx-auto w-full max-w-7xl space-y-8">
                <OverviewRubricFrame
                  audits={completedAudits}
                  onUpdate={(next) => {
                    upsertSite(next)
                    setStates((prev) =>
                      prev.map((s) => (s.url === next.url ? { ...s, audit: next } : s))
                    )
                  }}
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  )
}

async function generateAndStoreAIInsights(
  aiKey: string,
  classification?: IndustryClassification
) {
  const run = getLastRun()
  if (!run || run.sites.length === 0) return

  const audits = run.sites.filter((s) => s.metrics)
  if (audits.length < 2) return

  const sites = buildSiteMeta(audits)
  const clientMeta = sites.find((s) => s.isClient)
  const clientLabel = clientMeta?.label ?? sites[0]?.label ?? "Client"
  const clientUrl = run.clientUrl ?? audits.find((a) => a.isClient)?.url ?? ""

  const anthropic = makeClient(aiKey)

  // Generate task evaluation criteria
  const industry = classification?.industry
  if (clientUrl) {
    try {
      const criteria = await identifyTaskEvaluationCriteria(clientUrl, industry, anthropic)
      if (criteria) setTaskEvaluationCriteria(criteria)
    } catch {
      /* non-critical */
    }
  }

  // Generate GrowthOps-style insights for each category
  for (const { key: category, label: categoryLabel } of ANALYTICS_CATEGORIES) {
    try {
      const insights = buildCrossSiteInsights(
        category as AnalyticsCategoryKey,
        audits,
        sites,
        []
      )
      if (insights.length === 0) continue

      const situations = insights.map((insight) => ({
        type: insight.type,
        subjectNames: insight.subjects,
        matchedHeadline: insight.headline,
        principleTitle: insight.principle?.title,
        scores: Object.fromEntries(
          sites.map((s) => [s.label, null as number | null])
        ),
      }))

      const richTexts = await generateGrowthOpsInsights(
        { category: categoryLabel, clientLabel, situations },
        anthropic
      )

      richTexts.forEach((richText, index) => {
        if (richText.blocks.length === 0) return
        setCrossSiteInsightOverride(category, index, {
          richText,
          updatedAt: new Date().toISOString(),
        })
      })
    } catch {
      /* skip category on error */
    }
  }
}

function updateAt(
  arr: SiteCardState[],
  i: number,
  patch: Partial<SiteCardState>
): SiteCardState[] {
  const next = arr.slice()
  next[i] = { ...next[i], ...patch }
  return next
}

function orderClientFirst(states: SiteCardState[]): SiteCardState[] {
  const idx = states.findIndex((s) => s.audit?.isClient)
  if (idx <= 0) return states
  const next = states.slice()
  const [client] = next.splice(idx, 1)
  next.unshift(client)
  return next
}

function statesFromRun(run: LastRun): SiteCardState[] {
  const byUrl = new Map(run.sites.map((site) => [site.url, site]))
  const urls = run.urls.length > 0 ? run.urls : run.sites.map((site) => site.url)
  return urls.map((url) => {
    const audit = byUrl.get(url)
    return audit
      ? { url, status: "done", audit }
      : { url, status: "queued", audit: null }
  })
}

function AddCompetitorForm({
  maxUrls,
  existingUrls,
  onSubmit,
}: {
  maxUrls: number
  existingUrls: string[]
  onSubmit: (urls: string[]) => void
}) {
  const [raw, setRaw] = useState("")
  const { valid: parsed, invalid, overflow: parseOverflow } = useMemo(() => parseUrlInput(raw), [raw])
  const newUrls = useMemo(() => parsed.filter((u) => !existingUrls.includes(u)), [parsed, existingUrls])
  const capped = newUrls.slice(0, maxUrls)
  const overflow = parseOverflow + (newUrls.length - capped.length)

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        if (capped.length > 0) onSubmit(capped)
      }}
      className="flex flex-col gap-4 pt-2"
    >
      <div className="space-y-2">
        <label className="text-xs font-medium text-muted-foreground">Competitor websites</label>
        <Textarea
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          placeholder={`apple.com\nnotion.so`}
          className="min-h-36 font-mono text-sm leading-[1.5]"
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          // eslint-disable-next-line jsx-a11y/no-autofocus
          autoFocus
          aria-label="Competitor URLs"
        />
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <AddUrlSummary valid={capped.length} invalid={invalid.length} overflow={overflow} />
          <span>{capped.length} / {maxUrls} URLs</span>
        </div>
        {invalid.length > 0 && (
          <ul className="space-y-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">
            {invalid.slice(0, 5).map((line, i) => (
              <li key={i} className="font-mono">
                <span className="opacity-70">{line.line}</span> — {line.reason}
              </li>
            ))}
            {invalid.length > 5 && <li>…and {invalid.length - 5} more</li>}
          </ul>
        )}
        {overflow > 0 && (
          <p className="text-xs text-amber-500">
            Only the first {maxUrls} new URL{maxUrls === 1 ? "" : "s"} will be added; {overflow} extra will be ignored.
          </p>
        )}
      </div>
      <div className="flex justify-end">
        <Button type="submit" disabled={capped.length === 0}>
          Analyse
        </Button>
      </div>
    </form>
  )
}

function AddUrlSummary({ valid, invalid, overflow }: { valid: number; invalid: number; overflow: number }) {
  if (valid === 0 && invalid === 0) return <span>One URL per line.</span>
  const parts: string[] = []
  if (valid > 0) parts.push(`${valid} valid`)
  if (invalid > 0) parts.push(`${invalid} invalid`)
  if (overflow > 0) parts.push(`${overflow} over limit`)
  return <span>{parts.join(" · ")}</span>
}
