"use client"

import { ChevronDown, Download, FileImage, FolderOpen, Image as ImageIcon, Loader2, Presentation, RefreshCw } from "lucide-react"
import { useMemo, useState } from "react"
import { toast } from "sonner"

import { InsightEditorDialog } from "@/components/cross-site-editable-insight"
import { Button } from "@/components/ui/button"
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
  type DeepDiveCategoryKey,
  type PresentationElement,
  type PresentationInsightRef,
  type PresentationSlide,
} from "@/lib/presentation"
import { downloadPng, downloadSvg } from "@/lib/presentation-export"
import {
  exportSlideToNewPresentation,
  exportSlideToPickedPresentation,
} from "@/lib/google-slides"
import {
  getCrossSiteInsightOverrides,
  getKeys,
  getGoogleWorkspaceKeys,
  getKnowledge,
  setCrossSiteInsightOverride,
} from "@/lib/storage"
import { identifyPrimaryOfferingTarget } from "@/lib/ai-scoring"
import {
  captureFullPageScreenshot,
  captureNavigationMobileScreenshot,
  captureVisualHierarchyScreenshot,
  captureVisualHierarchySectionScreenshots,
} from "@/lib/screenshot"
import type { KnowledgeEntry, PrincipleRef, RichTextContent, SiteAudit } from "@/lib/types"
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
  const knowledge = useMemo(() => getKnowledge(), [])
  const editableInsights = useMemo(
    () => buildEditableInsights(audits, category, knowledge),
    [audits, category, knowledge, overrideVersion]
  )
  const [exporting, setExporting] = useState<"png" | "svg" | "new" | "append" | null>(null)
  const [editingInsight, setEditingInsight] = useState<PresentationInsightRef | null>(null)
  const [reloadingScreenshot, setReloadingScreenshot] = useState(false)
  const activeInsight = editingInsight ? editableInsights[editingInsight.index] : undefined

  function handleCategoryChange(next: DeepDiveCategoryKey) {
    setCategory(next)
  }

  function handleSaveInsight(next: { headline: string; text: string; principle: PrincipleRef | null }) {
    if (!editingInsight) return
    setCrossSiteInsightOverride(editingInsight.category, editingInsight.index, {
      headline: next.headline,
      text: next.text,
      principle: next.principle,
      updatedAt: new Date().toISOString(),
    })
    setOverrideVersion((value) => value + 1)
    setEditingInsight(null)
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
    <section className="space-y-3">
      <div className="grid items-center gap-3 md:grid-cols-[1fr_auto_1fr]">
        <h2 className="text-base font-semibold">Deep Dive</h2>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button variant="outline" size="sm" className="min-w-56 justify-between">
                {slide.title.replace("Deep Dive - ", "")}
                <ChevronDown className="h-3.5 w-3.5 opacity-60" />
              </Button>
            }
          />
          <DropdownMenuContent align="center" className="w-64">
            {DEEP_DIVE_CATEGORIES.map((key) => (
              <DropdownMenuItem key={key} onClick={() => handleCategoryChange(key)}>
                {key === "loadingSpeed" ? "Page Performance" : slideLabel(key)}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <div className="flex justify-start md:justify-end">
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
      </div>
      <SlidePreview
        slide={slide}
        onEditInsight={setEditingInsight}
        onReloadScreenshot={
          onUpdate && ["firstImpression", "visualHierarchy", "navigation"].includes(category)
            ? reloadScreenshot
            : undefined
        }
        reloadingScreenshot={reloadingScreenshot}
      />
      {activeInsight && editingInsight ? (
        <InsightEditorDialog
          key={`${editingInsight.category}:${editingInsight.index}:${activeInsight.headline}:${activeInsight.text}`}
          open
          onOpenChange={(open) => {
            if (!open) setEditingInsight(null)
          }}
          insight={activeInsight}
          knowledgeEntries={knowledge}
          onSave={handleSaveInsight}
        />
      ) : null}
    </section>
  )
}

function SlidePreview({
  slide,
  onEditInsight,
  onReloadScreenshot,
  reloadingScreenshot,
}: {
  slide: PresentationSlide
  onEditInsight?: (ref: PresentationInsightRef) => void
  onReloadScreenshot?: () => void
  reloadingScreenshot?: boolean
}) {
  return (
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
        {slide.elements.map((element) => (
          <SlideElement
            key={element.id}
            element={element}
            slide={slide}
            onEditInsight={onEditInsight}
            onReloadScreenshot={onReloadScreenshot}
            reloadingScreenshot={reloadingScreenshot}
          />
        ))}
      </div>
    </div>
  )
}

function SlideElement({
  element,
  slide,
  onEditInsight,
  onReloadScreenshot,
  reloadingScreenshot,
}: {
  element: PresentationElement
  slide: PresentationSlide
  onEditInsight?: (ref: PresentationInsightRef) => void
  onReloadScreenshot?: () => void
  reloadingScreenshot?: boolean
}) {
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
    left: pct(element.x, slide.width),
    top: pct(element.y, slide.height),
    width: pct(element.width, slide.width),
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
    return (
      <div
        className={cn("absolute", reloadable && "group/reload-screenshot")}
        style={style}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          alt=""
          src={element.url}
          className={cn("h-full w-full", reloadingScreenshot && reloadable && "opacity-55")}
          style={{ objectFit: element.objectFit ?? "contain" }}
          draggable={false}
        />
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
  return (
    <div className="space-y-[0.45em]">
      {content.blocks.map((block, blockIndex) => (
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

function pct(value: number, max: number): string {
  return `${(value / max) * 100}%`
}

function isReloadableScreenshotImage(id: string): boolean {
  return (
    id === "visual-hierarchy-screenshot" ||
    id === "navigation-mobile-screenshot" ||
    /^screenshot-\d+$/.test(id)
  )
}

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
