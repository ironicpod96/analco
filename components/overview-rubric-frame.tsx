"use client"

import { ChevronDown, Clipboard, Download, FileImage, FolderOpen, Image as ImageIcon, Loader2, Presentation, RefreshCw, X } from "lucide-react"
import React from "react"
import type { SVGProps } from "react"

function UilArrowResizeDiagonal(props: SVGProps<SVGSVGElement>) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 24 24" {...props}>{/* Icon from Unicons by Iconscout - https://github.com/Iconscout/unicons/blob/master/LICENSE */}<path fill="currentColor" d="M21.92 2.62a1 1 0 0 0-.54-.54A1 1 0 0 0 21 2h-6a1 1 0 0 0 0 2h3.59L4 18.59V15a1 1 0 0 0-2 0v6a1 1 0 0 0 .08.38a1 1 0 0 0 .54.54A1 1 0 0 0 3 22h6a1 1 0 0 0 0-2H5.41L20 5.41V9a1 1 0 0 0 2 0V3a1 1 0 0 0-.08-.38" /></svg>
  )
}
import { useEffect, useMemo, useState } from "react"
import { toast } from "sonner"

import { InsightEditorDialog } from "@/components/cross-site-editable-insight"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  applyCrossSiteInsightOverrides,
  buildCrossSiteInsights,
  buildSiteMeta,
  type CrossSiteInsight,
} from "@/lib/analytics"
import {
  buildDeepDiveSlide,
  buildOverviewRubricSlide,
  DEEP_DIVE_CATEGORIES,
  EVALUATION_CRITERIA,
  getFirstImpressionSites,
  hostnameFor,
  siteNameFor,
  type DeepDiveCategoryKey,
  type PresentationElement,
  type PresentationInsightRef,
  type PresentationSlide,
} from "@/lib/presentation"
import { downloadPng, downloadSvg } from "@/lib/presentation-export"
import {
  exportSlideToNewPresentation,
  exportSlideToPickedPresentation,
  exportSlidesToNewPresentation,
  exportSlidesToPickedPresentation,
} from "@/lib/google-slides"
import {
  getCrossSiteInsightOverrides,
  getKeys,
  getGoogleWorkspaceKeys,
  getKnowledge,
  getLastRun,
  getTaskEvaluationCriteria,
  setCrossSiteInsightOverride,
  setTaskEvaluationCriteria,
  setTaskEvaluationSteps,
} from "@/lib/storage"
import { generateGrowthOpsInsights, identifyPrimaryOfferingTarget, identifyTaskEvaluationCriteria } from "@/lib/ai-scoring"
import {
  captureFullPageScreenshot,
  captureNavigationMobileScreenshot,
  captureVisualHierarchyScreenshot,
  captureVisualHierarchySectionScreenshots,
} from "@/lib/screenshot"
import { ANALYTICS_KEY_TO_KNOWLEDGE_CATEGORY, type KnowledgeEntry, type PrincipleRef, type RichTextContent, type SiteAudit } from "@/lib/types"
import { cn } from "@/lib/utils"

export function OverviewRubricFrame({
  audits,
  onUpdate,
}: {
  audits: SiteAudit[]
  onUpdate?: (next: SiteAudit) => void
}) {
  const [includeClient, setIncludeClient] = useState(false)
  const filteredAudits = useMemo(
    () => audits.filter((audit) => includeClient || !audit.isClient),
    [audits, includeClient]
  )
  const slide = useMemo(() => buildOverviewRubricSlide(filteredAudits), [filteredAudits])
  const [exporting, setExporting] = useState<"png" | "svg" | "new" | "append" | null>(null)

  async function runExport(kind: "png" | "svg" | "new" | "append") {
    setExporting(kind)
    try {
      if (kind === "svg") {
        downloadSvg(slide)
        toast.success("SVG exported")
      } else if (kind === "png") {
        await downloadPng(slide)
        toast.success("PNG exported")
      } else if (kind === "new") {
        const id = await exportSlideToNewPresentation(slide, getGoogleWorkspaceKeys())
        toast.success("Google Slides deck created", {
          action: {
            label: "Open",
            onClick: () => window.open(`https://docs.google.com/presentation/d/${id}/edit`, "_blank"),
          },
        })
      } else {
        const id = await exportSlideToPickedPresentation(slide, getGoogleWorkspaceKeys())
        toast.success("Slide added to Google Slides", {
          action: {
            label: "Open",
            onClick: () => window.open(`https://docs.google.com/presentation/d/${id}/edit`, "_blank"),
          },
        })
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Export failed")
    } finally {
      setExporting(null)
    }
  }

  return (
    <>
      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h2 className="text-base font-semibold">Overview Rubric</h2>
          <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer">
            <input
              type="checkbox"
              checked={includeClient}
              onChange={(e) => setIncludeClient(e.target.checked)}
              className="rounded border-gray-300"
            />
            Include client
          </label>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button variant="outline" size="sm" disabled={exporting != null}>
                <Download className="h-3.5 w-3.5" />
                {exporting ? "Exporting" : "Export"}
              </Button>
            }
          />
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuItem onClick={() => runExport("new")}>
              <Presentation className="h-3.5 w-3.5" />
              New Google Slides deck
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => runExport("append")}>
              <FolderOpen className="h-3.5 w-3.5" />
              Add to existing deck
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => runExport("svg")}>
              <FileImage className="h-3.5 w-3.5" />
              SVG
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => runExport("png")}>
              <ImageIcon className="h-3.5 w-3.5" />
              PNG
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        </div>
        <SlidePreview slide={slide} />
      </section>
      <DeepDiveFrame audits={audits} onUpdate={onUpdate} />
    </>
  )
}

function DeepDiveFrame({ audits, onUpdate }: { audits: SiteAudit[]; onUpdate?: (next: SiteAudit) => void }) {
  const [category, setCategory] = useState<DeepDiveCategoryKey>("loadingSpeed")
  const [overrideVersion, setOverrideVersion] = useState(0)
  const slide = useMemo<PresentationSlide>(() => buildDeepDiveSlide(audits, category), [audits, category, overrideVersion])
  const fiSites = useMemo(
    () => category === "firstImpression" ? getFirstImpressionSites(audits) : undefined,
    [audits, category]
  )
  const knowledge = useMemo(() => getKnowledge(), [])
  const editableInsights = useMemo(
    () => buildEditableInsights(audits, category, knowledge),
    [audits, category, knowledge, overrideVersion]
  )
  const [exporting, setExporting] = useState<"png" | "svg" | "new" | "append" | null>(null)
  const [editingInsight, setEditingInsight] = useState<PresentationInsightRef | null>(null)
  const [reloadingScreenshot, setReloadingScreenshot] = useState(false)
  const [rewritingInsights, setRewritingInsights] = useState(false)

  async function handleRewriteInsights() {
    const { anthropic: aiKey } = getKeys()
    if (!aiKey) {
      toast.error("Add your Anthropic key in Settings to rewrite insights.")
      return
    }
    const run = getLastRun()
    if (!run || audits.length === 0) {
      toast.error("No active run found.")
      return
    }
    setRewritingInsights(true)
    try {
      const siteMeta = buildSiteMeta(audits)
      const overrides = getCrossSiteInsightOverrides()
      const clientLabel = siteMeta.find((m) => m.isClient)?.label ?? siteMeta[0]?.label ?? ""
      await Promise.allSettled(
        DEEP_DIVE_CATEGORIES.map(async (cat) => {
          try {
            const insights = applyCrossSiteInsightOverrides(
              cat,
              buildCrossSiteInsights(cat, audits, siteMeta, []),
              overrides
            )
            if (insights.length === 0) return
            const situations = insights.map((insight) => ({
              type: insight.type,
              subjectNames: insight.subjects,
              matchedHeadline: insight.headline,
              matchedText: insight.text,
              principleTitle: insight.principle?.title,
            }))
            const evaluationCriteria = cat === "taskCompletion"
              ? (getTaskEvaluationCriteria() ?? "")
              : (EVALUATION_CRITERIA[cat] ?? "")
            const categoryKnowledge = knowledge.filter((e) => e.category === ANALYTICS_KEY_TO_KNOWLEDGE_CATEGORY[cat])
            const results = await generateGrowthOpsInsights(
              {
                category: cat,
                evaluationCriteria,
                situations,
                clientLabel,
                availablePrinciples: categoryKnowledge.map((e) => ({ title: e.title, blurb: e.blurb })),
              },
              aiKey
            )
            results.forEach((result, i) => {
              const matched = result.principleTitle
                ? categoryKnowledge.find((e) => e.title === result.principleTitle)
                : undefined
              const principle = matched ? { title: matched.title, url: matched.url } : null
              setCrossSiteInsightOverride(cat, i, {
                richText: result.richText,
                principle,
                updatedAt: new Date().toISOString(),
              })
            })
          } catch {
            // per-category failures are silent
          }
        })
      )

      if (run.clientUrl) {
        try {
          const result = await identifyTaskEvaluationCriteria(run.clientUrl, run.classification?.industry, aiKey)
          if (result.criteria) setTaskEvaluationCriteria(result.criteria)
          if (result.steps.length) {
            setTaskEvaluationSteps(result.steps.map((s) => ({ id: crypto.randomUUID(), label: s.label })))
          }
        } catch {
          // non-blocking
        }
      }

      setOverrideVersion((v) => v + 1)
      toast.success("Insights rewritten in GrowthOps style.")
    } catch (err) {
      toast.error(`Insight rewrite failed: ${err instanceof Error ? err.message : "unknown"}`)
    } finally {
      setRewritingInsights(false)
    }
  }
  const activeInsight = editingInsight
    ? editableInsights.find((i) => i.originalIndex === editingInsight.index) ?? editableInsights[editingInsight.index]
    : undefined

  function handleCategoryChange(next: DeepDiveCategoryKey) {
    setCategory(next)
  }

  function handleSaveInsight(next: { headline: string; text: string; richText: RichTextContent; principle: PrincipleRef | null }) {
    if (!editingInsight) return
    setCrossSiteInsightOverride(editingInsight.category, editingInsight.index, {
      text: next.text,
      richText: next.richText,
      principle: next.principle,
      updatedAt: new Date().toISOString(),
    })
    setOverrideVersion((value) => value + 1)
    setEditingInsight(null)
  }

  function handleDeleteInsight() {
    if (!editingInsight) return
    setCrossSiteInsightOverride(editingInsight.category, editingInsight.index, {
      removed: true,
      updatedAt: new Date().toISOString(),
    })
    setOverrideVersion((value) => value + 1)
    setEditingInsight(null)
    toast.success("Insight removed")
  }

  async function reloadScreenshot() {
    const site = audits.find((audit) => audit.isClient) ?? audits[0]
    if (!site || !onUpdate) return
    setReloadingScreenshot(true)
    try {
      const url = site.metrics.finalUrl || site.url
      if (category === "visualHierarchy") {
        const { anthropic } = getKeys()
        if (!anthropic) {
          toast.error("Add your Anthropic key in Settings to find the primary offering section.")
          return
        }
        const target = await identifyPrimaryOfferingTarget(site.metrics, anthropic, {
          url: site.url,
          classification: undefined,
        })
        const visualHierarchyScreenshot = await captureVisualHierarchyScreenshot(
          url,
          `${target.offering} ${target.sectionSearchText}`
        )
        const visualHierarchySectionScreenshots = await captureVisualHierarchySectionScreenshots(
          url,
          `${target.offering} ${target.sectionSearchText}`
        )
        onUpdate({
          ...site,
          metrics: {
            ...site.metrics,
            visualHierarchyScreenshot,
            visualHierarchySectionScreenshots,
            visualHierarchyScreenshotTarget: target.offering,
          },
          lastScoredAt: new Date().toISOString(),
        })
      } else if (category === "navigation") {
        const navigationMobileScreenshot = await captureNavigationMobileScreenshot(url)
        onUpdate({
          ...site,
          metrics: { ...site.metrics, navigationMobileScreenshot },
          lastScoredAt: new Date().toISOString(),
        })
      } else if (category === "firstImpression") {
        const fullPageScreenshot = await captureFullPageScreenshot(url)
        onUpdate({
          ...site,
          metrics: {
            ...site.metrics,
            fullPageScreenshot,
            fullPageScreenshotSource: "screenshotone",
          },
          lastScoredAt: new Date().toISOString(),
        })
      }
      setOverrideVersion((value) => value + 1)
      toast.success("Screenshot reloaded")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not reload screenshot")
    } finally {
      setReloadingScreenshot(false)
    }
  }

  async function runExport(kind: "png" | "svg" | "new" | "append") {
    setExporting(kind)
    try {
      if (kind === "svg") {
        downloadSvg(slide)
        toast.success("SVG exported")
      } else if (kind === "png") {
        await downloadPng(slide)
        toast.success("PNG exported")
      } else if (kind === "new") {
        const allSlides = DEEP_DIVE_CATEGORIES.map((cat) => buildDeepDiveSlide(audits, cat))
        const stored = await idbGet<[string, { url?: string; objectFit?: "contain" | "cover" | "fill" }][]>(IDB_KEY_IMAGES)
        const imageOverrides = new Map(stored ?? [])
        const id = await exportSlidesToNewPresentation(allSlides, "Deep Dive", getGoogleWorkspaceKeys(), imageOverrides)
        toast.success("Google Slides deck created", {
          action: {
            label: "Open",
            onClick: () => window.open(`https://docs.google.com/presentation/d/${id}/edit`, "_blank"),
          },
        })
      } else {
        const allSlides = DEEP_DIVE_CATEGORIES.map((cat) => buildDeepDiveSlide(audits, cat))
        const stored = await idbGet<[string, { url?: string; objectFit?: "contain" | "cover" | "fill" }][]>(IDB_KEY_IMAGES)
        const imageOverrides = new Map(stored ?? [])
        const id = await exportSlidesToPickedPresentation(allSlides, getGoogleWorkspaceKeys(), imageOverrides)
        toast.success("All slides added to Google Slides", {
          action: {
            label: "Open",
            onClick: () => window.open(`https://docs.google.com/presentation/d/${id}/edit`, "_blank"),
          },
        })
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Export failed")
    } finally {
      setExporting(null)
    }
  }

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold">Deep Dive</h2>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button variant="outline" size="sm" disabled={exporting != null}>
                <Download className="h-3.5 w-3.5" />
                {exporting ? "Exporting" : "Export All"}
              </Button>
            }
          />
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuItem onClick={() => runExport("new")}>
              <Presentation className="h-3.5 w-3.5" />
              New Google Slides deck
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => runExport("append")}>
              <FolderOpen className="h-3.5 w-3.5" />
              Add all to existing deck
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => runExport("svg")}>
              <FileImage className="h-3.5 w-3.5" />
              SVG
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => runExport("png")}>
              <ImageIcon className="h-3.5 w-3.5" />
              PNG
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <div className="flex w-full">
        {DEEP_DIVE_CATEGORIES.map((key, index) => {
          const active = key === category
          return (
            <button
              key={key}
              type="button"
              onClick={() => handleCategoryChange(key)}
              className={cn(
                "flex flex-1 flex-col items-center gap-1.5 py-2 text-center transition",
                active ? "opacity-100" : "opacity-50 hover:opacity-75"
              )}
            >
              <div
                className={cn(
                  "flex h-7 w-7 items-center justify-center rounded-full text-sm font-bold transition",
                  active ? "bg-foreground text-background" : "border-2 border-current text-foreground"
                )}
              >
                {index + 1}
              </div>
              <span className="text-[11px] font-medium leading-tight">
                {slideLabel(key)}
              </span>
            </button>
          )
        })}
      </div>
      <SlidePreview
        slide={slide}
        onEditInsight={setEditingInsight}
        onReloadScreenshot={
          onUpdate && category === "firstImpression"
            ? reloadScreenshot
            : undefined
        }
        reloadingScreenshot={reloadingScreenshot}
        fiSites={fiSites}
        allAudits={audits}
      />
      {activeInsight && editingInsight ? (
        <InsightEditorDialog
          key={`${editingInsight.category}:${editingInsight.index}:${activeInsight.text}`}
          open
          onOpenChange={(open) => {
            if (!open) setEditingInsight(null)
          }}
          insight={activeInsight}
          knowledgeEntries={knowledge.filter((e) => e.category === ANALYTICS_KEY_TO_KNOWLEDGE_CATEGORY[category])}
          onSave={handleSaveInsight}
          onDelete={handleDeleteInsight}
        />
      ) : null}
    </section>
  )
}

const IDB_DB = "analco"
const IDB_STORE = "slide-data"
const IDB_KEY_IMAGES = "imageStates"
const IDB_KEY_REMOVED = "removedImages"
const IDB_KEY_FI_SLOTS = "fiSlotAuditUrls"

function openSlideDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_DB, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(IDB_STORE)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function idbGet<T>(key: string): Promise<T | undefined> {
  const db = await openSlideDb()
  return new Promise((resolve, reject) => {
    const req = db.transaction(IDB_STORE, "readonly").objectStore(IDB_STORE).get(key)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function idbSet(key: string, value: unknown): Promise<void> {
  const db = await openSlideDb()
  return new Promise((resolve, reject) => {
    const req = db.transaction(IDB_STORE, "readwrite").objectStore(IDB_STORE).put(value, key)
    req.onsuccess = () => resolve()
    req.onerror = () => reject(req.error)
  })
}

function SlidePreview({
  slide,
  onEditInsight,
  onReloadScreenshot,
  reloadingScreenshot,
  fiSites,
  allAudits,
}: {
  slide: PresentationSlide
  onEditInsight?: (ref: PresentationInsightRef) => void
  onReloadScreenshot?: () => void
  reloadingScreenshot?: boolean
  fiSites?: SiteAudit[]
  allAudits?: SiteAudit[]
}) {
  const [imageStates, setImageStates] = useState<Map<string, PastedImage>>(new Map())
  const [removedImages, setRemovedImages] = useState<Set<string>>(new Set())
  const [idbLoaded, setIdbLoaded] = useState(false)

  const [fiSlotAuditUrls, setFiSlotAuditUrls] = useState<Map<string, string>>(new Map())

  const fiSlotOverrides = useMemo(() => {
    const result = new Map<string, SiteAudit>()
    for (const [elementId, auditUrl] of fiSlotAuditUrls) {
      const audit = allAudits?.find((a) => a.url === auditUrl)
      if (audit) result.set(elementId, audit)
    }
    return result
  }, [fiSlotAuditUrls, allAudits])

  useEffect(() => {
    async function load() {
      try {
        const [images, removed, fiSlots] = await Promise.all([
          idbGet<[string, PastedImage][]>(IDB_KEY_IMAGES),
          idbGet<string[]>(IDB_KEY_REMOVED),
          idbGet<[string, string][]>(IDB_KEY_FI_SLOTS),
        ])
        if (images) setImageStates(new Map(images))
        if (removed) setRemovedImages(new Set(removed))
        if (fiSlots) setFiSlotAuditUrls(new Map(fiSlots))
      } catch {}
      setIdbLoaded(true)
    }
    load()
  }, [])

  useEffect(() => {
    if (!idbLoaded) return
    idbSet(IDB_KEY_IMAGES, [...imageStates]).catch(() => {})
  }, [imageStates, idbLoaded])

  useEffect(() => {
    if (!idbLoaded) return
    idbSet(IDB_KEY_REMOVED, [...removedImages]).catch(() => {})
  }, [removedImages, idbLoaded])

  useEffect(() => {
    if (!idbLoaded) return
    idbSet(IDB_KEY_FI_SLOTS, [...fiSlotAuditUrls]).catch(() => {})
  }, [fiSlotAuditUrls, idbLoaded])

  const positionOverrides = useMemo(
    () => computeGroupPositionOverrides(removedImages, slide.elements),
    [removedImages, slide.elements]
  )

  function handleClearImage(elementId: string) {
    setImageStates((prev) => {
      const next = new Map(prev)
      const current = next.get(elementId)
      if (current) {
        next.set(elementId, { objectFit: current.objectFit })
      }
      return next
    })
  }

  async function handlePaste(elementId: string) {
    try {
      const items = await navigator.clipboard.read()
      for (const item of items) {
        const imageType = item.types.find((t) => t.startsWith("image/"))
        if (imageType) {
          const blob = await item.getType(imageType)
          const reader = new FileReader()
          reader.onload = (e) => {
            const url = e.target?.result as string
            setImageStates((prev) => {
              const current = prev.get(elementId)
              return new Map(prev).set(elementId, { url, objectFit: current?.objectFit ?? "contain" })
            })
          }
          reader.readAsDataURL(blob)
          return
        }
      }
      toast.error("No image found in clipboard")
    } catch {
      toast.error("Could not read clipboard — copy an image first")
    }
  }

  function handleCycleFit(elementId: string, defaultFit: PastedImage["objectFit"]) {
    setImageStates((prev) => {
      const entry = prev.get(elementId)
      const currentFit = entry?.objectFit ?? defaultFit
      const next = new Map(prev)
      next.set(elementId, { url: entry?.url, objectFit: FIT_CYCLE[(FIT_CYCLE.indexOf(currentFit) + 1) % FIT_CYCLE.length] })
      return next
    })
  }

  function handleSwitchFiSite(elementId: string, audit: SiteAudit) {
    const m = elementId.match(/^fi-(?:screenshot|missing)-(\d+)$/)
    if (!m) return
    const idx = m[1]
    const url = fiAuditScreenshotUrl(audit) || undefined
    setFiSlotAuditUrls((prev) => {
      const next = new Map(prev)
      next.set(`fi-screenshot-${idx}`, audit.url)
      next.set(`fi-missing-${idx}`, audit.url)
      return next
    })
    setImageStates((prev) => {
      const current = prev.get(elementId)
      const next = new Map(prev)
      next.set(`fi-screenshot-${idx}`, { url, objectFit: current?.objectFit ?? "cover" })
      next.set(`fi-missing-${idx}`, { url, objectFit: current?.objectFit ?? "cover" })
      return next
    })
  }

  function fiSiteFor(elementId: string): SiteAudit | undefined {
    const m = elementId.match(/^fi-(?:screenshot|missing)-(\d+)$/)
    if (!m) return undefined
    return fiSlotOverrides.get(elementId) ?? fiSites?.[parseInt(m[1])]
  }

  return (
    <>
      <div className="w-full overflow-auto rounded-lg border bg-muted/30 p-4">
        <div
          className="relative mx-auto max-h-[66vh] min-h-[480px] max-w-full overflow-hidden bg-white shadow-sm"
          style={{
            aspectRatio: `${slide.width} / ${slide.height}`,
            height: "min(66vh, calc((100vw - 5rem) * 0.5625))",
            fontFamily: "var(--font-montserrat), Montserrat, Arial, sans-serif",
            containerType: "inline-size",
          }}
        >
          {slide.elements.flatMap((element) => {
            if (element.type === "imageGroup") {
              return element.elements.map((subEl) => (
                <SlideElement
                  key={subEl.id}
                  element={subEl}
                  slide={slide}
                />
              ))
            }
            if (removedImages.has(element.id)) return []
            const pasteOwnerId = linkedPasteOwnerId(element.id)
            if (pasteOwnerId && (imageStates.get(pasteOwnerId)?.url || removedImages.has(pasteOwnerId))) return []
            const isFiSlot = /^fi-(?:screenshot|missing)-\d+$/.test(element.id)
            return [
              <SlideElement
                key={element.id}
                element={element}
                slide={slide}
                onEditInsight={onEditInsight}
                onReloadScreenshot={onReloadScreenshot}
                reloadingScreenshot={reloadingScreenshot}
                imageState={imageStates.get(element.id)}
                onPaste={isPasteTargetImage(element.id) ? () => handlePaste(element.id) : undefined}
                onCycleFit={isPasteTargetImage(element.id) ? (defaultFit) => handleCycleFit(element.id, defaultFit) : undefined}
                onRemove={isPasteTargetImage(element.id) && imageStates.get(element.id)?.url ? () => handleClearImage(element.id) : undefined}
                styleOverride={positionOverrides.get(element.id)}
                fiSite={isFiSlot ? fiSiteFor(element.id) : undefined}
                allAudits={isFiSlot ? allAudits : undefined}
                onSwitchFiSite={isFiSlot ? (audit) => handleSwitchFiSite(element.id, audit) : undefined}
              />
            ]
          })}
        </div>
      </div>
    </>
  )
}


function SlideElement({
  element,
  slide,
  onEditInsight,
  onReloadScreenshot,
  reloadingScreenshot,
  imageState,
  onPaste,
  onCycleFit,
  onRemove,
  styleOverride,
  fiSite,
  allAudits,
  onSwitchFiSite,
}: {
  element: PresentationElement
  slide: PresentationSlide
  onEditInsight?: (ref: PresentationInsightRef) => void
  onReloadScreenshot?: () => void
  reloadingScreenshot?: boolean
  imageState?: PastedImage
  onPaste?: () => void
  onCycleFit?: (defaultFit: PastedImage["objectFit"]) => void
  onRemove?: () => void
  styleOverride?: { x?: number; width?: number }
  fiSite?: SiteAudit
  allAudits?: SiteAudit[]
  onSwitchFiSite?: (audit: SiteAudit) => void
}) {
  const [imageFailed, setImageFailed] = useState(false)

  if (element.type === "imageGroup") return null

  if (element.type === "line") {
    const horizontal = element.y1 === element.y2
    return (
      <div
        className="absolute"
        style={{
          left: pct(Math.min(element.x1, element.x2), slide.width),
          top: pct(Math.min(element.y1, element.y2), slide.height),
          width: horizontal ? pct(Math.abs(element.x2 - element.x1), slide.width) : `${element.strokeWidth}px`,
          height: horizontal ? `${element.strokeWidth}px` : pct(Math.abs(element.y2 - element.y1), slide.height),
          borderTop: horizontal
            ? `${element.strokeWidth}px ${element.dash ? "dashed" : "solid"} ${element.stroke}`
            : undefined,
          borderLeft: horizontal
            ? undefined
            : `${element.strokeWidth}px ${element.dash ? "dashed" : "solid"} ${element.stroke}`,
        }}
      />
    )
  }

  const style = {
    left: pct(styleOverride?.x ?? element.x, slide.width),
    top: pct(element.y, slide.height),
    width: pct(styleOverride?.width ?? element.width, slide.width),
    height: pct(element.height, slide.height),
  }

  if (element.type === "rect") {
    return (
      <>
        <div
          className="absolute"
          style={{
            ...style,
            backgroundColor: element.fill,
            borderColor: element.stroke,
            borderStyle: element.dash ? "dashed" : "solid",
            borderWidth: element.stroke ? `${element.strokeWidth ?? 1}px` : 0,
            borderRadius: element.borderRadius ? `${element.borderRadius}px` : undefined,
          }}
        />
        {imageState?.url && (
          <div className="absolute overflow-hidden" style={{ ...style, borderRadius: element.borderRadius ? `${element.borderRadius}px` : undefined }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img alt="" src={imageState.url} className="h-full w-full" style={{ objectFit: imageState.objectFit, objectPosition: imageState.objectFit === "cover" ? "top center" : undefined }} draggable={false} />
          </div>
        )}
        {(onPaste || onCycleFit) && (
          <div className="group/img-ctrl absolute z-30 flex flex-col items-center justify-center gap-2" style={style}>
            <div className="absolute inset-0 bg-black/0 transition group-hover/img-ctrl:bg-black/35" style={{ borderRadius: element.borderRadius ? `${element.borderRadius}px` : undefined }} />
            {onPaste && (
              <button type="button" className="relative rounded-full bg-white p-2 text-black opacity-0 shadow-sm transition group-hover/img-ctrl:opacity-100" onClick={onPaste} title="Paste image from clipboard">
                <Clipboard className="h-4 w-4" />
              </button>
            )}
            {onCycleFit && (
              <button type="button" className="relative flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-sm font-semibold text-black opacity-0 shadow-sm transition group-hover/img-ctrl:opacity-100" onClick={() => onCycleFit("contain")}>
                <UilArrowResizeDiagonal className="h-4 w-4" />
                {FIT_LABELS[imageState?.objectFit ?? "contain"]}
              </button>
            )}
            {onRemove && (
              <button type="button" className="absolute right-1 top-1 z-10 rounded-full bg-white p-1 text-black opacity-0 shadow-sm transition group-hover/img-ctrl:opacity-100" onClick={onRemove} title="Clear image">
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
        )}
        {fiSite && (
          <div
            className="absolute flex items-end justify-center pb-1 pointer-events-none"
            style={{ left: style.left, width: style.width, top: `calc(${style.top} - 1.25rem)`, height: "1.25rem" }}
          >
            <span className="truncate text-[9px] font-semibold uppercase tracking-wide text-gray-400">{auditLabel(fiSite)}</span>
          </div>
        )}
        {fiSite && allAudits && onSwitchFiSite && (
          <FiSiteSwitcher style={style} site={fiSite} allAudits={allAudits} onSwitch={onSwitchFiSite} />
        )}
        {element.editInsight && onEditInsight ? (
          <div
            className="group/edit-insight absolute z-20 flex items-center justify-center"
            style={style}
          >
            <div
              className="absolute inset-0 bg-black/0 transition group-hover/edit-insight:bg-black/35 group-focus-within/edit-insight:bg-black/35"
              style={{ borderRadius: element.borderRadius ? `${element.borderRadius}px` : undefined }}
            />
            <button
              type="button"
              className="relative rounded-full bg-white px-4 py-1.5 text-sm font-semibold text-black opacity-0 shadow-sm transition group-hover/edit-insight:opacity-100 group-focus-within/edit-insight:opacity-100"
              onClick={() => onEditInsight(element.editInsight!)}
            >
              Edit
            </button>
          </div>
        ) : null}
      </>
    )
  }

  if (element.type === "image") {
    const reloadable = Boolean(onReloadScreenshot && isReloadableScreenshotImage(element.id))
    const defaultFit = (element.objectFit ?? "contain") as PastedImage["objectFit"]
    const activeFit = imageState?.objectFit ?? defaultFit
    const isDefaultHiddenImage = isDefaultHiddenClientImage(element.id) && !imageState?.url

    if (element.fallbackText && imageFailed) {
      return (
        <div
          className="absolute flex items-center overflow-hidden"
          style={{
            ...style,
            color: "#111111",
            fontSize: `${(28 / slide.width) * 100}cqw`,
            fontWeight: 800,
          }}
        >
          <span className="truncate">{element.fallbackText}</span>
        </div>
      )
    }

    return (
      <div
        className={cn("absolute group/slide-img bg-white", reloadable && "group/reload-screenshot")}
        style={style}
      >
        {fiSite && (
          <div className="absolute bottom-full left-0 w-full flex justify-center pb-1 pointer-events-none">
            <span className="truncate text-[9px] font-semibold uppercase tracking-wide text-gray-400">{auditLabel(fiSite)}</span>
          </div>
        )}
        {!isDefaultHiddenImage && (imageState?.url || element.url) && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            alt={element.fallbackText ?? ""}
            src={imageState?.url ?? element.url}
            className={cn("h-full w-full", reloadingScreenshot && reloadable && "opacity-55")}
            style={{ objectFit: activeFit, objectPosition: activeFit === "cover" ? "top center" : undefined }}
            draggable={false}
            onError={element.fallbackText ? () => setImageFailed(true) : undefined}
          />
        )}
        {(onPaste || onCycleFit) && (
          <div className={cn("group/img-ctrl absolute inset-0 z-20 flex flex-col items-center justify-center gap-2", isDefaultHiddenImage && "bg-muted/20")}>
            <div className={cn("absolute inset-0 transition", isDefaultHiddenImage ? "bg-black/0" : "bg-black/0 group-hover/img-ctrl:bg-black/35")} />
            {onPaste && (
              <button
                type="button"
                className={cn(
                  "relative rounded-xl bg-white p-3 text-black shadow-sm transition",
                  isDefaultHiddenImage ? "opacity-100" : "opacity-0 group-hover/img-ctrl:opacity-100"
                )}
                onClick={onPaste}
                title="Paste image from clipboard"
              >
                <Clipboard className="h-5 w-5" />
              </button>
            )}
            {isDefaultHiddenImage && element.pasteLabel && (
              <span className="relative px-3 text-center text-xs font-medium text-foreground/60">{element.pasteLabel}</span>
            )}
            {onCycleFit && !isDefaultHiddenImage && (
              <button type="button" className="relative flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-sm font-semibold text-black opacity-0 shadow-sm transition group-hover/img-ctrl:opacity-100" onClick={() => onCycleFit(defaultFit)}>
                <UilArrowResizeDiagonal className="h-4 w-4" />
                {FIT_LABELS[activeFit]}
              </button>
            )}
          </div>
        )}
        {reloadable ? (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/0 transition group-hover/reload-screenshot:bg-black/35 group-focus-within/reload-screenshot:bg-black/35">
            <button
              type="button"
              className="relative inline-flex items-center gap-1.5 rounded-full bg-white px-4 py-1.5 text-sm font-semibold text-black opacity-0 shadow-sm transition group-hover/reload-screenshot:opacity-100 group-focus-within/reload-screenshot:opacity-100 disabled:cursor-not-allowed disabled:opacity-70"
              onClick={onReloadScreenshot}
              disabled={reloadingScreenshot}
              aria-label="Reload screenshot"
              title="Reload screenshot"
            >
              {reloadingScreenshot ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" />
              )}
              Reload
            </button>
          </div>
        ) : null}
        {onRemove && (
          <button
            type="button"
            className="absolute right-1 top-1 z-30 rounded-full bg-white p-1 text-black opacity-0 shadow-sm transition group-hover/slide-img:opacity-100"
            onClick={onRemove}
            title="Clear image"
          >
            <X className="h-3 w-3" />
          </button>
        )}
        {fiSite && allAudits && onSwitchFiSite && (
          <div className="absolute bottom-2 left-0 right-0 z-30 flex justify-center">
            <FiSiteSwitcherInline site={fiSite} allAudits={allAudits} onSwitch={onSwitchFiSite} />
          </div>
        )}
      </div>
    )
  }

  if (element.type === "mosaic") {
    return (
      <div className="absolute grid grid-cols-4 gap-2 overflow-hidden" style={style}>
        {Array.from({ length: 12 }).map((_, i) => (
          <div
            key={i}
            className="rounded-sm"
            style={{
              backgroundColor: ["#111111", "#FE0022", "#D9D9D9", "#F6F6F6"][i % 4],
              gridColumn: i === 0 || i === 7 ? "span 2" : undefined,
              gridRow: i === 0 ? "span 2" : undefined,
            }}
          />
        ))}
      </div>
    )
  }

  if (element.type === "radialChart") {
    const radius = 44
    const strokeWidth = 6
    const circumference = 2 * Math.PI * radius
    const dash = (Math.max(0, Math.min(100, element.value)) / 100) * circumference
    return (
      <div className="absolute" style={style}>
        <svg viewBox="0 0 100 100" className="h-full w-full">
          <circle cx="50" cy="50" r={radius} fill="none" stroke="#EEEEEE" strokeWidth={strokeWidth} />
          <circle
            cx="50"
            cy="50"
            r={radius}
            fill="none"
            stroke={element.color}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={`${dash} ${circumference - dash}`}
            transform="rotate(-90 50 50)"
          />
          <text x="50" y="46" textAnchor="middle" fontSize="18" fontWeight="800" fill="#111111">
            {element.centerLabel}
          </text>
          {element.subLabel && (
            <text x="50" y="58" textAnchor="middle" fontSize="4.5" fontWeight="600" fill="#666666">
              {element.subLabel.split("\n").map((line, i) => (
                <tspan key={line} x="50" dy={i === 0 ? 0 : "1.18em"}>
                  {line}
                </tspan>
              ))}
            </text>
          )}
          {element.footerLabel && (
            <text x="50" y="70" textAnchor="middle" fontSize="4.4" fontWeight="500" fill="#8B8B8B">
              {element.footerLabel}
            </text>
          )}
        </svg>
      </div>
    )
  }

  const textNode = (
    <div
      className={cn(
        "absolute flex overflow-hidden leading-tight",
        element.align === "center" && "justify-center text-center",
        element.align === "right" && "justify-end text-right",
        element.valign === "middle" && "items-center",
        element.valign === "bottom" && "items-end"
      )}
      style={{
        ...style,
        color: element.fill,
        fontSize: `${(element.fontSize / slide.width) * 100}cqw`,
        fontWeight: element.weight ?? 400,
        whiteSpace: "pre-line",
      }}
    >
      {element.richText ? <PreviewRichText content={element.richText} /> : element.text}
    </div>
  )

  if (element.href) {
    return (
      <a href={element.href} target="_blank" rel="noreferrer" className="contents">
        {textNode}
      </a>
    )
  }

  return textNode
}

function PreviewRichText({ content }: { content: RichTextContent }) {
  const nonEmptyBlocks = content.blocks.filter((b) => b.runs.some((r) => r.text.trim()))
  return (
    <div className="space-y-[0.45em]">
      {nonEmptyBlocks.map((block, blockIndex) => (
        <p key={blockIndex}>
          {block.runs.map((run, runIndex) => {
            let node = <>{run.text}</>
            if (run.italic) node = <em>{node}</em>
            if (run.bold) node = <strong>{node}</strong>
            return <span key={runIndex}>{node}</span>
          })}
        </p>
      ))}
    </div>
  )
}

function auditLabel(audit: SiteAudit): string {
  return audit.customLabel ?? siteNameFor(hostnameFor(audit.url))
}

function fiAuditScreenshotUrl(audit: SiteAudit): string {
  return (
    audit.userImages?.firstImpression ||
    audit.userImages?.screenshot ||
    audit.metrics.fullPageScreenshot ||
    audit.metrics.screenshot ||
    ""
  )
}

function FiSiteSwitcherInline({
  site,
  allAudits,
  onSwitch,
}: {
  site: SiteAudit
  allAudits: SiteAudit[]
  onSwitch: (audit: SiteAudit) => void
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button
            type="button"
            className="flex items-center gap-1 rounded-full bg-black/55 px-2.5 py-1 text-xs font-semibold text-white backdrop-blur-sm hover:bg-black/70 transition"
          >
            {auditLabel(site)}
            <ChevronDown className="h-3 w-3 opacity-70" />
          </button>
        }
      />
      <DropdownMenuContent align="center">
        {allAudits.map((audit) => (
          <DropdownMenuItem key={audit.url} onClick={() => onSwitch(audit)}>
            {auditLabel(audit)}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function FiSiteSwitcher({
  style,
  site,
  allAudits,
  onSwitch,
}: {
  style: React.CSSProperties
  site: SiteAudit
  allAudits: SiteAudit[]
  onSwitch: (audit: SiteAudit) => void
}) {
  return (
    <div className="absolute z-40 flex items-end justify-center pb-2" style={style}>
      <FiSiteSwitcherInline site={site} allAudits={allAudits} onSwitch={onSwitch} />
    </div>
  )
}

function pct(value: number, max: number): string {
  return `${(value / max) * 100}%`
}

function isDefaultHiddenClientImage(id: string): boolean {
  return (
    id === "navigation-mobile-screenshot" ||
    id === "navigation-desktop-screenshot" ||
    id === "visual-hierarchy-screenshot" ||
    /^screenshot-\d+$/.test(id) ||
    /^(?:consistency|helpSupport)-img-\d+$/.test(id)
  )
}

function isReloadableScreenshotImage(id: string): boolean {
  return (
    id === "navigation-mobile-screenshot" ||
    /^screenshot-\d+$/.test(id)
  )
}

function linkedPasteOwnerId(id: string): string | null {
  const screenshotMissing = id.match(/^screenshot-missing-label-(\d+)$/)
  if (screenshotMissing) return `screenshot-missing-${screenshotMissing[1]}`
  const fiMissing = id.match(/^fi-missing-label-(\d+)$/)
  if (fiMissing) return `fi-missing-${fiMissing[1]}`
  const deepDiveImgLink = id.match(/^(.+)-img-link-(\d+)$/)
  if (deepDiveImgLink) return `${deepDiveImgLink[1]}-img-${deepDiveImgLink[2]}`
  return null
}

function isPasteTargetImage(id: string): boolean {
  return (
    /^fi-screenshot-\d+$/.test(id) ||
    /^fi-missing-\d+$/.test(id) ||
    /^screenshot-\d+$/.test(id) ||
    /^screenshot-missing-\d+$/.test(id) ||
    /^(?:consistency|helpSupport)-img-\d+$/.test(id) ||
    /^taskCompletion-step-img-\d+$/.test(id) ||
    id === "navigation-mobile-screenshot" ||
    id === "navigation-desktop-screenshot" ||
    id === "visual-hierarchy-screenshot"
  )
}

function computeGroupPositionOverrides(
  removedImages: Set<string>,
  elements: PresentationElement[]
): Map<string, { x?: number; width?: number }> {
  const overrides = new Map<string, { x?: number; width?: number }>()

  // fi-screenshot group: images at leftX=70, total width 570, gap 20
  {
    const leftX = 70, leftW = 570, imgGap = 20
    const allIndices = Array.from(new Set(
      elements.flatMap((e) => {
        const m = e.id.match(/^fi-(?:screenshot|missing)-(\d+)$/)
        return m ? [parseInt(m[1])] : []
      })
    )).sort((a, b) => a - b)
    const activeIndices = allIndices.filter(
      (i) => !removedImages.has(`fi-screenshot-${i}`) && !removedImages.has(`fi-missing-${i}`)
    )
    if (activeIndices.length > 0 && activeIndices.length < allIndices.length) {
      const count = activeIndices.length
      const imgW = count === 1 ? leftW : Math.floor((leftW - imgGap * (count - 1)) / count)
      activeIndices.forEach((origIdx, newIdx) => {
        const newX = leftX + newIdx * (imgW + imgGap)
        for (const mainId of [`fi-screenshot-${origIdx}`, `fi-missing-${origIdx}`]) {
          if (elements.some((e) => e.id === mainId)) {
            overrides.set(mainId, { x: newX, width: imgW })
          }
        }
        const labelId = `fi-missing-label-${origIdx}`
        if (elements.some((e) => e.id === labelId)) {
          overrides.set(labelId, { x: newX + 16, width: imgW - 32 })
        }
      })
    }
  }

  // screenshot group: 3 section images centered, total width 1436, gap 28
  {
    const origGap = 28, origX = Math.floor((1600 - 460 * 3 - 28 * 2) / 2), totalW = 460 * 3 + 28 * 2
    const allIndices = Array.from(new Set(
      elements.flatMap((e) => {
        const m = e.id.match(/^screenshot(?:-missing)?-(\d+)$/)
        return m ? [parseInt(m[1])] : []
      })
    )).sort((a, b) => a - b)
    const activeIndices = allIndices.filter(
      (i) => !removedImages.has(`screenshot-${i}`) && !removedImages.has(`screenshot-missing-${i}`)
    )
    if (activeIndices.length > 0 && activeIndices.length < allIndices.length) {
      const count = activeIndices.length
      const imgW = Math.floor((totalW - origGap * (count - 1)) / count)
      activeIndices.forEach((origIdx, newIdx) => {
        const newX = origX + newIdx * (imgW + origGap)
        for (const mainId of [`screenshot-${origIdx}`, `screenshot-missing-${origIdx}`]) {
          if (elements.some((e) => e.id === mainId)) {
            overrides.set(mainId, { x: newX, width: imgW })
          }
        }
        const labelId = `screenshot-missing-label-${origIdx}`
        if (elements.some((e) => e.id === labelId)) {
          overrides.set(labelId, { x: newX + 16, width: imgW - 32 })
        }
      })
    }
  }

  // consistency / helpSupport small image pair (indices 1 and 2)
  for (const category of ["consistency", "helpSupport"] as const) {
    const imgX = 740, imgW = 790, imgGap = 14
    const smallPresent = [1, 2].filter((i) => elements.some((e) => e.id === `${category}-img-${i}`))
    const smallActive = smallPresent.filter((i) => !removedImages.has(`${category}-img-${i}`))
    if (smallActive.length === 1 && smallPresent.length === 2) {
      const [remaining] = smallActive
      overrides.set(`${category}-img-${remaining}`, { x: imgX, width: imgW })
      const linkId = `${category}-img-link-${remaining}`
      if (elements.some((e) => e.id === linkId)) {
        overrides.set(linkId, { x: imgX + 16, width: imgW - 32 })
      }
    }
  }

  return overrides
}

type PastedImage = {
  url?: string
  objectFit: "contain" | "cover" | "fill"
}

const FIT_LABELS: Record<PastedImage["objectFit"], string> = {
  contain: "Fit",
  cover: "Cover",
  fill: "Fill",
}

const FIT_CYCLE: PastedImage["objectFit"][] = ["contain", "cover", "fill"]

function buildEditableInsights(
  audits: SiteAudit[],
  category: DeepDiveCategoryKey,
  knowledge: KnowledgeEntry[]
): CrossSiteInsight[] {
  const sites = audits.filter(Boolean)
  const meta = buildSiteMeta(sites)
  return applyCrossSiteInsightOverrides(
    category,
    buildCrossSiteInsights(category, sites, meta, knowledge),
    getCrossSiteInsightOverrides()
  )
}

function slideLabel(key: DeepDiveCategoryKey): string {
  const labels: Record<DeepDiveCategoryKey, string> = {
    loadingSpeed: "Page Performance",
    firstImpression: "First Impression",
    accessibility: "Accessibility",
    visualHierarchy: "Visual Hierarchy",
    navigation: "Navigation",
    taskCompletion: "Task Completion",
    consistency: "Consistency",
    helpSupport: "Help & Support",
  }
  return labels[key]
}
