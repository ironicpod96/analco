"use client"

import { ChevronDown, FolderOpen, Plus, Save, Trash2 } from "lucide-react"
import { useRouter } from "next/navigation"
import { useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { toast } from "sonner"

import { CrossSitePatterns } from "@/components/cross-site-patterns"
import { useNavbarSlots } from "@/components/navbar-slots"
import { OverviewRubricFrame } from "@/components/overview-rubric-frame"
import { SiteCard, type SiteCardState } from "@/components/site-card"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { applyAIScores, scoreSiteWithAI } from "@/lib/ai-scoring"
import { runPool } from "@/lib/concurrency"
import { fetchNavData } from "@/lib/nav-extract"
import { extractMetrics, fetchPageSpeed, PageSpeedError } from "@/lib/pagespeed"
import { initialRubric } from "@/lib/rubric"
import { captureFullPageScreenshot } from "@/lib/screenshot"
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
  setLastRun,
  upsertSite,
} from "@/lib/storage"
import type { LastRun, SavedRun, SiteAudit } from "@/lib/types"

export default function AnalysisPage() {
  const router = useRouter()
  const { leftEl, rightEl } = useNavbarSlots()
  const [states, setStates] = useState<SiteCardState[]>([])
  const [savedRuns, setSavedRuns] = useState<SavedRun[]>([])
  const [activeTab, setActiveTab] = useState<"cards" | "analytics" | "comparison">("cards")
  const [locked, setLocked] = useState(false)
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
      <TabsList>
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
                <OverviewRubricFrame audits={completedAudits} />
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  )
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
