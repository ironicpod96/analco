"use client"

import { AlertTriangle, ArrowUpRight, Check, ChevronDown, ChevronsDown, ChevronsUp, ClipboardPaste, Loader2, Lock, LockOpen, MoreHorizontal, Pencil, RefreshCw, Trash2, Upload, X as XIcon } from "lucide-react"
import { useRef, useState, type ComponentProps, type Dispatch, type ReactNode, type SetStateAction } from "react"
import { toast } from "sonner"

import { EditableInsight, PrincipleBadges } from "@/components/editable-insight"
import { LoadingState, type CardStatus } from "@/components/loading-state"
import { ReanalyseMotion } from "@/components/reanalyse-motion"
import { RubricRow } from "@/components/rubric-row"
import { LoadingSpeedBlock } from "@/components/score-block"
import { Button, buttonVariants } from "@/components/ui/button"
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import {
  applyAIRowScore,
  applyAIScores,
  identifyPrimaryOfferingTarget,
  identifyTaskEvaluationCriteria,
  scoreFirstImpression,
  scoreNavigation,
  scoreSiteWithAI,
  scoreTaskCompletionFromSteps,
  scoreVisualHierarchy,
} from "@/lib/ai-scoring"
import { fetchNavData } from "@/lib/nav-extract"
import { extractMetrics, fetchPageSpeed } from "@/lib/pagespeed"
import { computeRollup, effectiveScore, initialRubric, RUBRIC_LABELS, scoreFromLighthouse } from "@/lib/rubric"
import {
  captureFullPageScreenshot,
  captureNavigationMobileScreenshot,
  captureVisualHierarchyScreenshot,
  captureVisualHierarchySectionScreenshots,
} from "@/lib/screenshot"
import {
  defaultConsistencySignals,
  defaultHelpSupportSignals,
  defaultNavigationSignals,
  defaultTaskCompletionSignals,
  defaultVisualHierarchySignals,
} from "@/lib/rubric-insights"
import { getKeys, getKnowledge, getLastRun, upsertSite } from "@/lib/storage"
import { maybeRefreshStyleProfile, recordStyleEdit } from "@/lib/style-memory"
import { cn } from "@/lib/utils"
import type {
  AccessibilityInsightGroup,
  AutoScore,
  ConsistencySignals,
  FirstImpressionSignals,
  HelpSupportSignals,
  HybridScore,
  KnowledgeEntry,
  ManualScore,
  MiniScaleValue,
  NavData,
  NavItem,
  NavigationSignals,
  NullableMiniScaleValue,
  RubricKey,
  RubricScale,
  RubricScores,
  SiteAudit,
  TaskCompletionSignals,
  TaskStep,
  VisualHierarchySignals,
} from "@/lib/types"

export type SiteCardState = {
  url: string
  status: CardStatus
  audit: SiteAudit | null
  error?: string
}

const INPUT_ROWS: Exclude<RubricKey, "uxScoring" | "loadingSpeed">[] = [
  "firstImpression",
  "navigation",
  "taskCompletion",
  "visualHierarchy",
  "consistency",
  "accessibility",
  "helpSupport",
]

const SCORE_INPUT_ROWS: Exclude<RubricKey, "uxScoring">[] = [
  "loadingSpeed",
  ...INPUT_ROWS,
]

const HYBRID_KEYS: Array<Exclude<RubricKey, "uxScoring" | "loadingSpeed" | "accessibility" | "taskCompletion" | "consistency">> = [
  "firstImpression",
  "navigation",
  "visualHierarchy",
  "helpSupport",
]

type SectionLoadingSetter = Dispatch<SetStateAction<Partial<Record<RubricKey, boolean>>>>

export function SiteCard({
  state,
  onUpdate,
  isClient = false,
  locked = false,
  onToggleLock,
  onRemove,
}: {
  state: SiteCardState
  onUpdate: (next: SiteAudit) => void
  isClient?: boolean
  locked?: boolean
  onToggleLock?: () => void
  onRemove?: () => void
}) {
  const { url, status, audit, error } = state
  const [reanalysing, setReanalysing] = useState(false)
  const [screenshotReanalysing, setScreenshotReanalysing] = useState(false)
  const [sectionLoading, setSectionLoading] = useState<Partial<Record<RubricKey, boolean>>>({})
  const [renameOpen, setRenameOpen] = useState(false)
  const [renameValue, setRenameValue] = useState("")
  const [removeOpen, setRemoveOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const renameInputRef = useRef<HTMLInputElement>(null)
  const metrics = audit?.metrics ?? null
  const hostname = safeHost(metrics?.finalUrl ?? url)
  const displayName = audit?.customLabel ?? siteName(hostname)
  const externalHref = externalUrl(metrics?.finalUrl ?? url)
  const favicon = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(hostname)}&sz=64`
  const handleScreenshotUpload = audit
    ? (image: string) => {
      onUpdate({
        ...audit,
        userImages: {
          ...audit.userImages,
          screenshot: image,
          firstImpression: image,
          visualHierarchy: [image],
          helpSupport: [image],
        },
        lastScoredAt: new Date().toISOString(),
      })
    }
    : undefined

  return (
    <>
      <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
        <DialogContent className="max-w-sm">
          <DialogTitle>Rename website</DialogTitle>
          <form
            onSubmit={(e) => {
              e.preventDefault()
              if (!audit) return
              onUpdate({ ...audit, customLabel: renameValue.trim() || undefined })
              setRenameOpen(false)
            }}
            className="flex flex-col gap-4 pt-1"
          >
            <Input
              ref={renameInputRef}
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              placeholder={siteName(hostname)}
              // eslint-disable-next-line jsx-a11y/no-autofocus
              autoFocus
            />
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setRenameOpen(false)}>
                Cancel
              </Button>
              <Button type="submit">Save</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog open={removeOpen} onOpenChange={setRemoveOpen}>
        <DialogContent className="max-w-sm">
          <DialogTitle>Remove website</DialogTitle>
          <p className="text-sm text-muted-foreground">
            Remove <strong>{displayName}</strong> from this comparison?
          </p>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setRemoveOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                setRemoveOpen(false)
                onRemove?.()
              }}
            >
              Remove
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      <div
        className={cn(
          "group/card flex h-full min-h-0 w-[380px] shrink-0 flex-col overflow-hidden rounded-xl border bg-card",
          isClient && locked && "sticky left-0 z-20"
        )}
      >
      <div className="relative flex h-[73px] shrink-0 items-center border-b bg-card px-4">
        <div className="flex w-full items-center gap-3">
          <div className="group/favicon relative h-8 w-8 shrink-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={favicon}
              alt=""
              width={32}
              height={32}
              className={cn(
                "h-8 w-8 rounded-md border bg-muted transition-opacity group-hover/favicon:opacity-0",
                menuOpen && "opacity-0"
              )}
            />
            <div
              className={cn(
                "absolute inset-0 flex items-center justify-center opacity-0 transition-opacity group-hover/favicon:opacity-100",
                menuOpen && "opacity-100"
              )}
            >
              <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
                <DropdownMenuTrigger
                  render={
                    <button
                      type="button"
                      aria-label="Card options"
                      className="flex h-8 w-8 items-center justify-center rounded-md border bg-muted text-muted-foreground transition hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <MoreHorizontal className="h-4 w-4" />
                    </button>
                  }
                />
                <DropdownMenuContent side="bottom" align="start">
                  <DropdownMenuItem
                    onClick={() => {
                      setRenameValue(audit?.customLabel ?? siteName(hostname))
                      setRenameOpen(true)
                    }}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                    Edit
                  </DropdownMenuItem>
                  {onRemove && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem variant="destructive" onClick={() => setRemoveOpen(true)}>
                        <Trash2 className="h-3.5 w-3.5" />
                        Remove
                      </DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
          <a
            href={externalHref}
            target="_blank"
            rel="noreferrer"
            className="group/link min-w-0 flex-1 cursor-pointer rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            aria-label={`Open ${displayName} in a new tab`}
          >
            <div className="flex min-w-0 items-center gap-1.5">
              <div className="truncate text-sm font-semibold transition-colors group-hover/link:text-foreground group-focus-visible/link:text-foreground">
                {displayName}
              </div>
              {isClient && (
                <span className="shrink-0 rounded-full border border-primary/40 bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase leading-none tracking-wide text-primary">
                  Client
                </span>
              )}
              <ArrowUpRight className="h-3.5 w-3.5 shrink-0 opacity-0 transition-opacity group-hover/link:opacity-70 group-focus-visible/link:opacity-70" />
            </div>
            <div className="truncate text-xs text-muted-foreground transition-colors group-hover/link:text-foreground/70 group-focus-visible/link:text-foreground/70">
              {url}
            </div>
          </a>
          <div className="ml-auto shrink-0">
            <UxScore audit={audit} />
          </div>
        </div>
      </div>
      <div className="flex-1 space-y-3 overflow-y-auto px-4 py-3" style={{ willChange: "transform" }}>
        <Screenshot
          data={audit?.userImages?.screenshot ?? getDisplayScreenshot(metrics)}
          alt={hostname}
          contained={Boolean(audit?.userImages?.screenshot || metrics?.fullPageScreenshot)}
          onReanalyse={
            audit
              ? () => reanalyseScreenshot(audit, onUpdate, setScreenshotReanalysing)
              : undefined
          }
          reanalysing={screenshotReanalysing}
        />
        {audit && (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ScreenshotUploadButton onUpload={handleScreenshotUpload} />
              {isClient && onToggleLock && (
                <Button
                  variant="outline"
                  size="icon-sm"
                  aria-label={locked ? "Unlock client card" : "Lock client card"}
                  aria-pressed={locked}
                  title={locked ? "Unlock client card" : "Lock client card"}
                  onClick={onToggleLock}
                  className={cn(locked && "border-primary text-primary")}
                >
                  {locked ? (
                    <Lock className="h-3.5 w-3.5" />
                  ) : (
                    <LockOpen className="h-3.5 w-3.5" />
                  )}
                </Button>
              )}
            </div>
            <Button
              variant="outline"
              size="icon-sm"
              aria-label="Reanalyse"
              title="Reanalyse"
              onClick={() => reanalyseCard(audit, onUpdate, setReanalysing)}
              disabled={reanalysing}
            >
              {reanalysing ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" />
              )}
            </Button>
          </div>
        )}
        <ReanalyseMotion active={reanalysing}>
          <LoadingState status={status} message={error} />
        </ReanalyseMotion>
        {audit ? (
          <div className="divide-y border-t">
            <LoadingSpeedBlock
              metrics={audit.metrics}
              onReanalyse={() =>
                reanalysePageSpeedSection(audit, "loadingSpeed", onUpdate, setSectionLoading)
              }
              reanalysing={sectionLoading.loadingSpeed}
            />
            {INPUT_ROWS.map((key) =>
              key === "firstImpression" ? (
                <FirstImpressionRubricRow
                  key="firstImpression"
                  audit={audit}
                  onUpdate={onUpdate}
                />
              ) : (
                <RubricRow
                  key={key}
                  label={RUBRIC_LABELS[key]}
                  row={
                    key === "accessibility" && audit.metrics.scores.accessibility != null
                      ? { ...audit.rubric.accessibility, score: scoreFromLighthouse(audit.metrics.scores.accessibility) } as AutoScore
                      : audit.rubric[key] as AutoScore | HybridScore | ManualScore
                  }
                  evidence={renderEvidence(
                    key,
                    audit,
                    onUpdate,
                    sectionLoading,
                    setSectionLoading
                  )}
                  onScoreChange={scoreChangeFor(key, audit, onUpdate)}
                  onManualAssess={manualAssessFor(key, audit, onUpdate)}
                  controls={renderControls(key, audit, onUpdate)}
                  headerMeta={renderHeaderMeta(key, audit, onUpdate)}
                />
              )
            )}
          </div>
        ) : (
          <div className="space-y-3 py-4">
            {INPUT_ROWS.map((key) => (
              <div key={key} className="flex items-center justify-between gap-2">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-2 w-16" />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
    </>
  )
}

function renderHeaderMeta(
  key: Exclude<RubricKey, "uxScoring" | "loadingSpeed">,
  audit: SiteAudit,
  onUpdate: (next: SiteAudit) => void
) {
  if (key === "navigation" && audit.navData?.meta) {
    return <NavigationHeaderMeta audit={audit} onUpdate={onUpdate} />
  }
  return null
}

function NavigationHeaderMeta({
  audit,
  onUpdate,
}: {
  audit: SiteAudit
  onUpdate: (next: SiteAudit) => void
}) {
  const [reanalysing, setReanalysing] = useState(false)
  if (!audit.navData?.meta) return null
  return (
    <div className="flex items-center gap-1">
      <Dialog>
        <DialogTrigger
          render={
            <Button variant="outline" size="sm" className="h-7 text-xs">
              IA
            </Button>
          }
        />
        <DialogContent>
          <div className="flex items-center gap-2">
            <DialogTitle>Information Architecture</DialogTitle>
            <InlineIconButton
              aria-label="Reanalyse navigation IA"
              title="Reanalyse IA"
              disabled={reanalysing}
              onClick={() => reanalyseNavIa(audit, onUpdate, setReanalysing)}
            >
              {reanalysing ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <RefreshCw className="h-3 w-3" />
              )}
            </InlineIconButton>
          </div>
          <div className="max-h-[70vh] space-y-3 overflow-y-auto pr-1">
            {audit.navData.meta.confidence === "low" && (
              <p className="text-[11px] text-muted-foreground">
                {audit.navData.meta.notes.find((n) => n.includes("link graph"))
                  ? "Nav not found in rendered HTML — showing estimated structure from site links."
                  : "Low-confidence parse — dropdowns may be missing."}
              </p>
            )}
            {(audit.navData.brand || audit.navData.utilities.length > 0 || audit.navData.ctas.length > 0) && (
              <div className="flex items-stretch gap-2">
                <NavLevelLabel label="Home" />
                <div className="flex flex-1 items-center justify-between gap-2">
                  <div className="flex flex-wrap gap-1">
                    {audit.navData.brand && <NavChip label="Home" home />}
                  </div>
                  {(audit.navData.utilities.length > 0 || audit.navData.ctas.length > 0) && (
                    <div className="flex flex-wrap justify-end gap-1">
                      {audit.navData.utilities.map((u, i) => (
                        <NavChip key={i} label={u.label} home />
                      ))}
                      {audit.navData.ctas.map((c, i) => (
                        <NavChip key={`cta-${i}`} label={c.label} cta />
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {visiblePrimary(audit.navData.primary).length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <NavLevelLabel label="L1" />
                  <div className="flex flex-1 gap-2">
                    {visiblePrimary(audit.navData.primary).map((item, i) => (
                      <div key={i} className="flex min-w-0 flex-1 basis-0">
                        <NavChip label={item.label} wide />
                      </div>
                    ))}
                  </div>
                </div>
                {visiblePrimary(audit.navData.primary).some((p) => p.children && p.children.length > 0) && (
                  <div className="flex items-stretch gap-2">
                    <NavLevelLabel label="L2" />
                    <div className="flex flex-1 items-start gap-2">
                      {visiblePrimary(audit.navData.primary).map((item, i) => (
                        <div
                          key={i}
                          className="flex min-w-0 flex-1 basis-0 flex-col gap-1"
                        >
                          {(item.children ?? []).map((child, j) => (
                            <NavBranch key={j} item={child} />
                          ))}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {audit.navData.breadcrumbs && audit.navData.breadcrumbs.length > 0 && (
              <NavRow label="Crumb">
                {audit.navData.breadcrumbs.map((b, i) => (
                  <span key={i} className="inline-flex items-center gap-1">
                    {i > 0 && <span className="text-[11px] text-muted-foreground/60">›</span>}
                    <NavChip label={b.label} muted />
                  </span>
                ))}
              </NavRow>
            )}

            {audit.navData.sidebar && audit.navData.sidebar.length > 0 && (
              <NavRow label={`Side (${audit.navData.sidebar.length})`}>
                {audit.navData.sidebar.map((s, i) => (
                  <NavChip key={i} label={s.label} muted />
                ))}
              </NavRow>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function renderEvidence(
  key: Exclude<RubricKey, "uxScoring" | "loadingSpeed">,
  audit: SiteAudit,
  onUpdate: (next: SiteAudit) => void,
  sectionLoading: Partial<Record<RubricKey, boolean>>,
  setSectionLoading: SectionLoadingSetter
) {
  const row = audit.rubric[key]
  if (key === "navigation") {
    return null
  }
  if (key === "visualHierarchy") {
    const signals = defaultVisualHierarchySignals(audit.rubricSignals?.visualHierarchy)
    return (
      <VisualHierarchyMiniScorer
        value={signals}
        onSave={(score, note, nextSignals) => {
          const assessed = manualAssess(audit, key, score, note)
          onUpdate(setRubricSignals(assessed, "visualHierarchy", nextSignals))
        }}
      />
    )
  }
  if (key === "consistency") return null
  if (key === "taskCompletion") return null
  if (key === "helpSupport") return null
  if (row.source === "auto") {
    if (key === "accessibility") {
      return (
        <AccessibilityEvidence
          audit={audit}
          onReanalyse={() =>
            reanalysePageSpeedSection(audit, "accessibility", onUpdate, setSectionLoading)
          }
          reanalysing={sectionLoading.accessibility}
        />
      )
    }
    return <span>{row.evidence}</span>
  }
  if (row.source === "ai_pending") {
    return <span className="text-xs italic leading-snug text-muted-foreground">AI suggestion pending…</span>
  }

  const aiText = "aiReasoning" in row ? row.aiReasoning : ""
  const userNote = "userNote" in row ? row.userNote : undefined
  const cleanedAiText = key === "firstImpression" ? stripItalicReadParagraph(aiText) : aiText
  const display = userNote ?? cleanedAiText ?? ""
  const placeholder =
    row.source === "manual" ? "Add a note (optional)" : "Edit insight…"

  function EditableEvidence({
    setEditing,
  }: {
    setEditing: (editing: boolean) => void
  }) {
    return (
      <EditableInsight
        value={display}
        placeholder={placeholder}
        copyLabel={RUBRIC_LABELS[key]}
        onEditingChange={setEditing}
        onReanalyse={
          canReanalyseRow(key) ? () => scoreHybridRow(key, audit, onUpdate) : undefined
        }
        reanalysing={audit.scoringStatus?.[key] === "scoring"}
        onSave={(next) => {
          if (key === "firstImpression") captureFirstImpressionEdit(audit, display, next)
          onUpdate(setNote(audit, key, next))
        }}
      />
    )
  }

  return EditableEvidence
}

function renderControls(
  key: Exclude<RubricKey, "uxScoring" | "loadingSpeed">,
  audit: SiteAudit,
  onUpdate: (next: SiteAudit) => void
) {
  if (key === "helpSupport") {
    const signals = defaultHelpSupportSignals(audit.rubricSignals?.helpSupport)
    return (
      <HelpSupportMiniScorer
        value={signals}
        onSave={(score, nextSignals) => {
          const assessed = manualAssess(audit, "helpSupport", score, "")
          onUpdate(setRubricSignals(assessed, "helpSupport", nextSignals))
        }}
      />
    )
  }
  if (key === "taskCompletion") {
    if (audit.isClient) {
      return <TaskCompletionStepEditor audit={audit} onUpdate={onUpdate} />
    }
    const signals = defaultTaskCompletionSignals(audit.rubricSignals?.taskCompletion)
    return (
      <TaskCompletionMiniScorer
        value={signals}
        onSave={(score, nextSignals) => {
          const assessed = manualAssess(audit, "taskCompletion", score, "")
          onUpdate(setRubricSignals(assessed, "taskCompletion", nextSignals))
        }}
      />
    )
  }
  if (key === "navigation") {
    const signals = defaultNavigationSignals(audit.rubricSignals?.navigation)
    return (
      <NavigationMiniScorer
        value={signals}
        onSave={(score, nextSignals) => {
          const assessed = manualAssess(audit, "navigation", score, "")
          onUpdate(setRubricSignals(assessed, "navigation", nextSignals))
        }}
      />
    )
  }
  if (key === "consistency") {
    const signals = defaultConsistencySignals(audit.rubricSignals?.consistency)
    return (
      <ConsistencyMiniScorer
        value={signals}
        onSave={(score, nextSignals) => {
          const nextRubric: RubricScores = {
            ...audit.rubric,
            consistency: { ...audit.rubric.consistency, score },
          }
          nextRubric.uxScoring = { ...audit.rubric.uxScoring, aiRollup: computeRollup(nextRubric) }
          onUpdate(
            setRubricSignals(
              { ...audit, rubric: nextRubric, lastScoredAt: new Date().toISOString() },
              "consistency",
              nextSignals
            )
          )
        }}
      />
    )
  }
  return null
}

function canReanalyseRow(
  key: Exclude<RubricKey, "uxScoring" | "loadingSpeed">
): key is "firstImpression" | "navigation" | "visualHierarchy" {
  return key === "firstImpression" || key === "navigation" || key === "visualHierarchy"
}

function AccessibilityEvidence({
  audit,
  onReanalyse,
  reanalysing,
}: {
  audit: SiteAudit
  onReanalyse?: () => void
  reanalysing?: boolean
}) {
  const insights = normalizeAccessibilityInsights(audit.metrics.audits.accessibilityInsights)
  const [expanded, setExpanded] = useState(false)
  const count = insights.reduce((total, group) => total + group.items.length, 0)
  const scorePct = Math.round(audit.metrics.scores.accessibility * 100)

  return (
    <TooltipProvider>
      <div className="relative space-y-2">
        {onReanalyse && (
          <div className="absolute -top-7 right-0 flex items-center gap-1 opacity-0 transition-opacity group-hover/row:opacity-100 group-focus-within/row:opacity-100">
            <InlineIconButton
              aria-label="Reanalyse Accessibility"
              title="Reanalyse"
              disabled={reanalysing}
              onClick={onReanalyse}
            >
              {reanalysing ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <RefreshCw className="h-3 w-3" />
              )}
            </InlineIconButton>
          </div>
        )}
        <ReanalyseMotion active={reanalysing} className="flex items-end justify-between gap-4">
          <div
            className={cn(
              "text-3xl font-semibold leading-none tabular-nums",
              scorePct >= 90
                ? "text-emerald-500"
                : scorePct >= 50
                  ? "text-amber-500"
                  : "text-rose-500"
            )}
          >
            {scorePct}
            <span className="ml-0.5 text-base">%</span>
          </div>
          <div>
            {count > 0 ? (
              <button
                type="button"
                onClick={() => setExpanded((next) => !next)}
                aria-expanded={expanded}
                className="flex items-center gap-1 rounded text-xs font-medium text-muted-foreground transition hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/45"
              >
                {count} issue{count === 1 ? "" : "s"} flagged
                <ChevronDown
                  className={cn(
                    "h-3.5 w-3.5 transition-transform",
                    expanded && "rotate-180"
                  )}
                />
              </button>
            ) : (
              <span className="text-xs font-medium text-muted-foreground">No issues flagged</span>
            )}
          </div>
        </ReanalyseMotion>
        {expanded && insights.length > 0 && (
          <ReanalyseMotion active={reanalysing} className="space-y-2 pt-1">
            {insights.map((group) => (
              <div key={group.id} className="space-y-2.5">
                <div className="text-xs font-medium text-foreground">
                  {group.description ? (
                    <Tooltip>
                      <TooltipTrigger
                        render={
                          <button
                            type="button"
                            className="tooltip-dash-trigger cursor-help transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/45"
                            aria-label={`${group.title} accessibility context`}
                          >
                            {group.title}
                          </button>
                        }
                      />
                      <TooltipContent className="max-w-72">{group.description}</TooltipContent>
                    </Tooltip>
                  ) : (
                    group.title
                  )}
                </div>
                <ul className="space-y-2.5">
                  {group.items.map((insight) => (
                    <li key={insight} className="flex gap-1.5 text-rose-600 dark:text-rose-400">
                      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 fill-rose-600/15" />
                      <span>{insight}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </ReanalyseMotion>
        )}
      </div>
    </TooltipProvider>
  )
}

function normalizeAccessibilityInsights(
  insights: AccessibilityInsightGroup[] | string[]
): AccessibilityInsightGroup[] {
  if (insights.length === 0) return []
  if (typeof insights[0] === "string") {
    return [
      {
        id: "legacy",
        title: "Accessibility flags",
        description: "These are opportunities to improve accessibility for users of assistive technology.",
        items: insights as string[],
      },
    ]
  }
  return insights as AccessibilityInsightGroup[]
}

function HelpSupportMiniScorer({
  value,
  onSave,
}: {
  value: HelpSupportSignals
  onSave: (score: RubricScale | null, signals: HelpSupportSignals) => void
}) {
  const [supportWithinReach, setSupportWithinReach] = useState<NullableMiniScaleValue>(value.supportWithinReach)
  const [faqAnswered, setFaqAnswered] = useState<NullableMiniScaleValue>(value.faqAnswered)

  function apply(next: Partial<HelpSupportSignals>) {
    const state = { supportWithinReach, faqAnswered, ...next }
    if (next.supportWithinReach !== undefined) setSupportWithinReach(next.supportWithinReach)
    if (next.faqAnswered !== undefined) setFaqAnswered(next.faqAnswered)
    const score =
      state.supportWithinReach == null || state.faqAnswered == null
        ? null
        : helpSupportScore(state)
    onSave(score, state)
  }

  return (
    <TooltipProvider>
      <div className="grid grid-cols-2 gap-x-4 gap-y-4 py-1">
        <div className="min-w-0">
          <MiniScale
            label="Support access"
            left="no"
            right="yes"
            value={supportWithinReach}
            onChange={(next) => apply({ supportWithinReach: next })}
            tooltip="Is a direct support channel (live chat, phone, email) visible and easy to reach? Score 0 if absent, 1 if present but hard to find, 2 if clearly accessible."
          />
        </div>
        <div className="min-w-0">
          <MiniScale
            label="FAQ helpfulness"
            left="no"
            right="yes"
            value={faqAnswered}
            onChange={(next) => apply({ faqAnswered: next })}
            tooltip="Does the FAQ or help content answer the questions a typical visitor would have? Score 0 if absent or unhelpful, 1 if partial, 2 if comprehensive."
          />
        </div>
      </div>
    </TooltipProvider>
  )
}

function TaskCompletionMiniScorer({
  value,
  onSave,
}: {
  value: TaskCompletionSignals
  onSave: (score: RubricScale | null, signals: TaskCompletionSignals) => void
}) {
  const [ease, setEase] = useState<NullableMiniScaleValue>(value.ease)
  const [duration, setDuration] = useState<NullableMiniScaleValue>(value.duration)

  function apply(next: Partial<TaskCompletionSignals>) {
    const state = { ease, duration, ...next }
    if (next.ease !== undefined) setEase(next.ease)
    if (next.duration !== undefined) setDuration(next.duration)

    const score =
      state.ease == null || state.duration == null
        ? null
        : taskCompletionScore(state)
    onSave(score, state)
  }

  return (
    <TooltipProvider>
      <div className="grid grid-cols-2 gap-x-4 gap-y-4 py-1">
        <div className="min-w-0">
          <MiniScale
            label="Ease"
            left="hard"
            right="easy"
            value={ease}
            onChange={(next) => apply({ ease: next })}
            tooltip="How much mental effort did completing the task require? Score 0 if difficult, 1 if manageable, 2 if straightforward."
          />
        </div>
        <div className="min-w-0">
          <MiniScale
            label="Duration"
            left="long"
            right="quick"
            value={duration}
            onChange={(next) => apply({ duration: next })}
            tooltip="How long did the task take relative to what a direct path should require? Score 0 if much longer than expected, 1 if moderate, 2 if quick."
          />
        </div>
      </div>
    </TooltipProvider>
  )
}

function TaskCompletionStepEditor({
  audit,
  onUpdate,
}: {
  audit: SiteAudit
  onUpdate: (next: SiteAudit) => void
}) {
  const persisted = audit.rubricSignals?.taskCompletionClient?.steps
  const steps: TaskStep[] = persisted ?? []
  const [stepCount, setStepCount] = useState<2 | 3 | 4>(3)
  const [generating, setGenerating] = useState(false)
  const [scoring, setScoring] = useState(false)
  const [forceEdit, setForceEdit] = useState(false)

  const taskRow = audit.rubric.taskCompletion as HybridScore
  const isScored = !forceEdit && steps.length > 0 && (taskRow.aiSuggested != null || taskRow.score != null)

  function commitSteps(next: TaskStep[], opts: { invalidateScore?: boolean } = {}) {
    let rubric = audit.rubric
    if (opts.invalidateScore) {
      const tc = audit.rubric.taskCompletion as HybridScore
      const nextTc: HybridScore = {
        ...tc,
        score: null,
        source: "ai_pending",
        aiSuggested: null,
        aiReasoning: "",
        aiPrinciples: undefined,
      }
      rubric = { ...audit.rubric, taskCompletion: nextTc }
      rubric.uxScoring = { ...audit.rubric.uxScoring, aiRollup: computeRollup(rubric) }
    }
    const nextAudit: SiteAudit = {
      ...audit,
      rubric,
      rubricSignals: { ...audit.rubricSignals, taskCompletionClient: { steps: next } },
      lastScoredAt: new Date().toISOString(),
    }
    upsertSite(nextAudit)
    onUpdate(nextAudit)
  }

  async function handleConfirmCount(n: number) {
    const keys = getKeys()
    if (!keys?.anthropic) {
      toast.error("Set the Anthropic API key in settings first.")
      return
    }
    setGenerating(true)
    try {
      const run = getLastRun()
      const result = await identifyTaskEvaluationCriteria(
        audit.url,
        run?.classification?.industry,
        keys.anthropic,
        n
      )
      const next: TaskStep[] = result.steps
        .slice(0, n)
        .map((s) => ({ id: crypto.randomUUID(), label: s.label }))
      while (next.length < n) {
        next.push({ id: crypto.randomUUID(), label: `Step ${next.length + 1}` })
      }
      commitSteps(next, { invalidateScore: true })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to generate steps")
    } finally {
      setGenerating(false)
    }
  }

  function handleReset() {
    if (!window.confirm("Clear all task steps and screenshots?")) return
    commitSteps([], { invalidateScore: true })
  }

  async function handleScore() {
    const ready = steps.filter((s) => s.screenshot)
    if (ready.length < 2) {
      toast.error("Add screenshots for at least 2 steps before scoring.")
      return
    }
    const keys = getKeys()
    if (!keys?.anthropic) {
      toast.error("Set the Anthropic API key in settings first.")
      return
    }
    setScoring(true)
    try {
      const run = getLastRun()
      const clientSig = audit.rubricSignals?.taskCompletion
      const competitorSignals = (run?.sites ?? [])
        .filter((s) => !s.isClient && s.url !== audit.url)
        .map((s) => ({
          name: s.customLabel || new URL(s.metrics.finalUrl || s.url).hostname,
          ease: s.rubricSignals?.taskCompletion?.ease ?? null,
          duration: s.rubricSignals?.taskCompletion?.duration ?? null,
        }))
      const result = await scoreTaskCompletionFromSteps({
        steps: ready.map((s) => ({ label: s.label, screenshot: s.screenshot ?? "" })),
        criteria: run?.taskEvaluationCriteria ?? "",
        industry: run?.classification?.industry,
        apiKey: keys.anthropic,
        clientSignals: clientSig
          ? { ease: clientSig.ease, duration: clientSig.duration }
          : undefined,
        competitorSignals,
      })
      const row = audit.rubric.taskCompletion as HybridScore
      const nextRow: HybridScore = {
        ...row,
        score: null,
        source: "ai_suggested",
        aiSuggested: result.score,
        aiReasoning: result.reasoning,
        aiPrinciples: result.principles,
      }
      const nextRubric: RubricScores = { ...audit.rubric, taskCompletion: nextRow }
      nextRubric.uxScoring = { ...audit.rubric.uxScoring, aiRollup: computeRollup(nextRubric) }
      const nextAudit: SiteAudit = {
        ...audit,
        rubric: nextRubric,
        lastScoredAt: new Date().toISOString(),
      }
      upsertSite(nextAudit)
      onUpdate(nextAudit)
      setForceEdit(false)
      toast.success(`Task scored: ${result.score}/3`)
    } catch (err) {
      console.error("[task-completion] score failed", err)
      toast.error(err instanceof Error ? err.message : "Scoring failed")
    } finally {
      setScoring(false)
    }
  }

  const signals = defaultTaskCompletionSignals(audit.rubricSignals?.taskCompletion)

  function handleSignals(nextSignals: TaskCompletionSignals) {
    onUpdate(setRubricSignals(audit, "taskCompletion", nextSignals))
  }

  if (steps.length === 0) {
    return (
      <div className="space-y-3 py-1">
        <TaskCompletionMiniScorer value={signals} onSave={(_, next) => handleSignals(next)} />
        <div className="flex flex-col gap-2 border-t border-border/50 pt-2">
          <span className="text-xs text-muted-foreground">How many steps did it take to complete?</span>
          <div className="flex items-center justify-between gap-3">
            <StepCounter value={stepCount} min={2} max={4} onChange={(n) => setStepCount(n as 2 | 3 | 4)} />
            <Button
              size="sm"
              onClick={() => handleConfirmCount(stepCount)}
              disabled={generating}
              className="h-8 px-3 text-xs"
            >
              {generating ? <Loader2 className="h-3 w-3 animate-spin" /> : "Confirm"}
            </Button>
          </div>
        </div>
      </div>
    )
  }

  const readyCount = steps.filter((s) => s.screenshot).length
  const canCancelEdit = forceEdit && (taskRow.aiSuggested != null || taskRow.score != null)

  if (isScored) {
    return (
      <div className="group/scored space-y-2 py-1">
        <TaskCompletionMiniScorer value={signals} onSave={(_, next) => handleSignals(next)} />
        <div className="relative border-t border-border/50 pt-2">
          <button
            type="button"
            onClick={() => setForceEdit(true)}
            aria-label="Edit task steps"
            className="absolute right-0 top-2 opacity-0 transition-opacity group-hover/scored:opacity-100 focus:opacity-100"
          >
            <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
          </button>
          <ol className="space-y-1 text-xs text-foreground">
            {steps.map((step, i) => (
              <li key={step.id} className="flex items-start gap-2">
                <span className="shrink-0 font-medium text-muted-foreground">{i + 1}.</span>
                <span className="truncate" title={step.label}>{step.label}</span>
              </li>
            ))}
          </ol>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-2 py-1">
      <TaskCompletionMiniScorer value={signals} onSave={(_, next) => handleSignals(next)} />
      <div className="flex items-center justify-between gap-2 border-t border-border/50 pt-2">
        <Button size="sm" variant="ghost" onClick={handleReset} disabled={generating || scoring} className="h-7 px-2 text-xs">
          Reset
        </Button>
        <div className="flex items-center gap-2">
          {canCancelEdit && (
            <Button size="sm" variant="ghost" onClick={() => setForceEdit(false)} disabled={scoring} className="h-7 px-2 text-xs">
              Cancel
            </Button>
          )}
          <Button size="sm" onClick={handleScore} disabled={scoring || readyCount < 2} className="h-7 px-2 text-xs">
            {scoring ? <Loader2 className="h-3 w-3 animate-spin" /> : "Score task"}
          </Button>
        </div>
      </div>
      <div className="space-y-1.5">
        {steps.map((step, i) => (
          <TaskStepRow
            key={step.id}
            index={i}
            step={step}
            onRename={(label) => {
              const next = steps.map((s) => (s.id === step.id ? { ...s, label } : s))
              commitSteps(next, { invalidateScore: true })
            }}
            onSetScreenshot={(screenshot) => {
              const next = steps.map((s) => (s.id === step.id ? { ...s, screenshot } : s))
              commitSteps(next, { invalidateScore: true })
            }}
            onClear={() => {
              const next = steps.map((s) =>
                s.id === step.id ? { ...s, screenshot: undefined } : s
              )
              commitSteps(next, { invalidateScore: true })
            }}
          />
        ))}
      </div>
    </div>
  )
}

function StepCounter({
  value,
  min,
  max,
  onChange,
}: {
  value: number
  min: number
  max: number
  onChange: (n: number) => void
}) {
  const dec = () => onChange(Math.max(min, value - 1))
  const inc = () => onChange(Math.min(max, value + 1))
  return (
    <div className="inline-flex items-center rounded-md border border-border bg-background">
      <button
        type="button"
        onClick={dec}
        disabled={value <= min}
        aria-label="Decrease steps"
        className="flex h-8 w-8 items-center justify-center text-sm text-muted-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
      >
        −
      </button>
      <span className="min-w-[2.5rem] px-2 text-center text-sm font-semibold tabular-nums">{value}</span>
      <button
        type="button"
        onClick={inc}
        disabled={value >= max}
        aria-label="Increase steps"
        className="flex h-8 w-8 items-center justify-center text-sm text-muted-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
      >
        +
      </button>
    </div>
  )
}

function TaskStepRow({
  index,
  step,
  onRename,
  onSetScreenshot,
  onClear,
}: {
  index: number
  step: TaskStep
  onRename: (label: string) => void
  onSetScreenshot: (dataUrl: string) => void
  onClear: () => void
}) {
  const editRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(step.label)

  async function handleFile(file: File) {
    setBusy(true)
    try {
      const dataUrl = await readImageFile(file)
      onSetScreenshot(dataUrl)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not read image")
    } finally {
      setBusy(false)
    }
  }

  async function handlePasteFromClipboard() {
    setBusy(true)
    try {
      if (!navigator.clipboard?.read) {
        toast.error("Clipboard not available — copy an image then try again.")
        return
      }
      const items = await navigator.clipboard.read()
      for (const item of items) {
        const imageType = item.types.find((t) => t.startsWith("image/"))
        if (!imageType) continue
        const blob = await item.getType(imageType)
        const file = new File([blob], "pasted", { type: imageType })
        await handleFile(file)
        return
      }
      toast.error("No image found on clipboard.")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not read clipboard")
    } finally {
      setBusy(false)
    }
  }

  function startEdit() {
    setDraft(step.label)
    setEditing(true)
    requestAnimationFrame(() => {
      editRef.current?.focus()
      editRef.current?.select()
    })
  }
  function cancelEdit() {
    setEditing(false)
    setDraft(step.label)
  }
  function confirmEdit() {
    const trimmed = draft.trim()
    if (trimmed && trimmed !== step.label) onRename(trimmed)
    setEditing(false)
  }

  return (
    <div className="group/step flex items-center gap-2 rounded-md border border-border/60 bg-background/40 p-1.5">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-medium text-muted-foreground">
        {index + 1}
      </span>
      {editing ? (
        <input
          ref={editRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") confirmEdit()
            else if (e.key === "Escape") cancelEdit()
          }}
          className="flex-1 border-0 bg-transparent p-0 text-xs text-foreground outline-none focus:outline-none focus:ring-0"
        />
      ) : (
        <div className="flex flex-1 items-center gap-1.5 min-w-0">
          <span className="truncate text-xs text-foreground" title={step.label}>{step.label}</span>
          <button
            type="button"
            onClick={startEdit}
            aria-label="Edit step label"
            className="opacity-0 transition-opacity group-hover/step:opacity-100 focus:opacity-100"
          >
            <Pencil className="h-3 w-3 text-muted-foreground" />
          </button>
        </div>
      )}
      {editing ? (
        <>
          <InlineIconButton onClick={cancelEdit} aria-label="Cancel" title="Cancel">
            <XIcon className="h-3 w-3" />
          </InlineIconButton>
          <InlineIconButton onClick={confirmEdit} aria-label="Confirm" title="Confirm">
            <Check className="h-3 w-3" />
          </InlineIconButton>
        </>
      ) : step.screenshot ? (
        <>
          <div className="h-9 w-12 overflow-hidden rounded border border-border/60">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={step.screenshot} alt={step.label} className="h-full w-full object-cover" />
          </div>
          <InlineIconButton onClick={onClear} aria-label="Clear screenshot" title="Clear">
            <XIcon className="h-3 w-3" />
          </InlineIconButton>
        </>
      ) : (
        <Button
          size="sm"
          variant="outline"
          onClick={handlePasteFromClipboard}
          disabled={busy}
          className="h-7 gap-1 px-2 text-xs"
        >
          {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <ClipboardPaste className="h-3 w-3" />}
          Paste
        </Button>
      )}
    </div>
  )
}

function VisualHierarchyMiniScorer({
  value,
  onSave,
}: {
  value: VisualHierarchySignals
  onSave: (score: RubricScale, note: string, signals: VisualHierarchySignals) => void
}) {
  const [scanEase, setScanEase] = useState<NullableMiniScaleValue>(value.scanEase)
  const [fontBalance, setFontBalance] = useState<NullableMiniScaleValue>(value.fontBalance)
  const [whitespaceUsage, setWhitespaceUsage] = useState<NullableMiniScaleValue>(value.whitespaceUsage)
  const [sectionColorDiff, setSectionColorDiff] = useState<NullableMiniScaleValue>(value.sectionColorDiff)
  const [ctaPlacement, setCtaPlacement] = useState<NullableMiniScaleValue>(value.ctaPlacement)

  function apply(next: {
    scanEase?: NullableMiniScaleValue
    fontBalance?: NullableMiniScaleValue
    whitespaceUsage?: NullableMiniScaleValue
    sectionColorDiff?: NullableMiniScaleValue
    ctaPlacement?: NullableMiniScaleValue
  }) {
    const state = {
      scanEase,
      fontBalance,
      whitespaceUsage,
      sectionColorDiff,
      ctaPlacement,
      ...next,
    }
    if (next.scanEase != null) setScanEase(next.scanEase)
    if (next.fontBalance != null) setFontBalance(next.fontBalance)
    if (next.whitespaceUsage != null) setWhitespaceUsage(next.whitespaceUsage)
    if (next.sectionColorDiff != null) setSectionColorDiff(next.sectionColorDiff)
    if (next.ctaPlacement != null) setCtaPlacement(next.ctaPlacement)

    const total =
      (state.scanEase ?? 0) +
      (state.fontBalance ?? 0) +
      (state.whitespaceUsage ?? 0) +
      (state.sectionColorDiff ?? 0) +
      (state.ctaPlacement ?? 0)
    const hasScaleAnswer =
      state.scanEase != null ||
      state.fontBalance != null ||
      state.whitespaceUsage != null ||
      state.sectionColorDiff != null ||
      state.ctaPlacement != null
    const score: RubricScale = !hasScaleAnswer ? 1 : total >= 8 ? 3 : total >= 4 ? 2 : 1
    const note = [
      `Scan-through: ${scaleLabel(state.scanEase, "hard", "balanced", "easy")}`,
      `Font size and weight balance: ${scaleLabel(state.fontBalance, "bad", "mixed", "good")}`,
      `Whitespace: ${scaleLabel(state.whitespaceUsage, "cramped", "okay", "breathing")}`,
      `Section color differentiation: ${scaleLabel(state.sectionColorDiff, "absent", "subtle", "present")}`,
      `CTA placement: ${scaleLabel(state.ctaPlacement, "bottom only", "mixed", "top + bottom")}`,
    ].join("\n")
    onSave(score, note, state)
  }

  return (
    <TooltipProvider>
      <div className="grid grid-cols-2 gap-x-4 gap-y-4 py-1">
        <div className="min-w-0">
          <MiniScale
            label="Scan through"
            left="hard"
            right="easy"
            value={scanEase}
            onChange={(next) => apply({ scanEase: next })}
            tooltip="Score how quickly someone can scan the page and understand the next useful thing to inspect or do."
          />
        </div>
        <div className="min-w-0">
          <MiniScale
            label="Font balance"
            left="bad"
            right="good"
            value={fontBalance}
            onChange={(next) => apply({ fontBalance: next })}
            tooltip="Score whether font sizes and weights create clear emphasis without shouting, flattening, or fighting each other."
          />
        </div>
        <div className="min-w-0">
          <MiniScale
            label="Whitespace"
            left="few"
            right="lots"
            value={whitespaceUsage}
            onChange={(next) => apply({ whitespaceUsage: next })}
            tooltip="Whitespace separates groups, directs attention, and reduces cognitive load. Cramped layouts collapse hierarchy."
          />
        </div>
        <div className="min-w-0">
          <MiniScale
            label="Section colors"
            left="absent"
            right="present"
            value={sectionColorDiff}
            onChange={(next) => apply({ sectionColorDiff: next })}
            tooltip="Different section backgrounds or accent colors help users see structure. Flat color across the page flattens the visual hierarchy."
          />
        </div>
        <div className="min-w-0">
          <MiniScale
            label="CTA placement"
            left="one"
            right="many"
            value={ctaPlacement}
            onChange={(next) => apply({ ctaPlacement: next })}
            tooltip="Where do primary CTAs appear on the page? Bottom-only buries the action below the fold; top + bottom keeps it within reach."
          />
        </div>

      </div>
    </TooltipProvider>
  )
}

function ConsistencyMiniScorer({
  value,
  onSave,
}: {
  value: ConsistencySignals
  onSave: (score: RubricScale, signals: ConsistencySignals) => void
}) {
  const [pageCoherence, setPageCoherence] = useState<NullableMiniScaleValue>(value.pageCoherence)
  const [navigation, setNavigation] = useState<NullableMiniScaleValue>(value.navigation)
  const [visualLang, setVisualLang] = useState<NullableMiniScaleValue>(value.visualLang)
  const [interactions, setInteractions] = useState<NullableMiniScaleValue>(value.interactions)
  const [terminologyShifts, setTerminologyShifts] = useState(value.terminologyShifts)
  const [contentAvailabilityIssue, setContentAvailabilityIssue] = useState(
    value.contentAvailabilityIssue
  )

  function apply(next: {
    pageCoherence?: NullableMiniScaleValue
    navigation?: NullableMiniScaleValue
    visualLang?: NullableMiniScaleValue
    interactions?: NullableMiniScaleValue
    terminologyShifts?: boolean
    contentAvailabilityIssue?: boolean
  }) {
    const state = {
      pageCoherence,
      navigation,
      visualLang,
      interactions,
      terminologyShifts,
      contentAvailabilityIssue,
      ...next,
    }
    if (next.pageCoherence != null) setPageCoherence(next.pageCoherence)
    if (next.navigation != null) setNavigation(next.navigation)
    if (next.visualLang != null) setVisualLang(next.visualLang)
    if (next.interactions != null) setInteractions(next.interactions)
    if (next.terminologyShifts != null) setTerminologyShifts(next.terminologyShifts)
    if (next.contentAvailabilityIssue != null)
      setContentAvailabilityIssue(next.contentAvailabilityIssue)

    const total =
      (state.pageCoherence ?? 0) +
      (state.navigation ?? 0) +
      (state.visualLang ?? 0) +
      (state.interactions ?? 0) -
      (state.terminologyShifts ? 1 : 0) -
      (state.contentAvailabilityIssue ? 1 : 0)
    const score: RubricScale = total >= 6 ? 3 : total >= 3 ? 2 : 1
    onSave(score, state)
  }

  return (
    <TooltipProvider>
      <div className="grid grid-cols-2 gap-x-4 gap-y-4 py-1">
        <div className="min-w-0">
          <MiniScale
            label="Page coherence"
            left="choppy"
            right="smooth"
            value={pageCoherence}
            onChange={(next) => apply({ pageCoherence: next })}
            tooltip="Do inner pages (product, about, contact) feel like the same site as the homepage? Penalize obvious visual or structural drift between pages."
          />
        </div>
        <div className="min-w-0">
          <MiniScale
            label="Navigation"
            left="shifts"
            right="stable"
            value={navigation}
            onChange={(next) => apply({ navigation: next })}
            tooltip="Does the nav structure, items, and position stay the same across pages? Changes force users to reorient on every new page."
          />
        </div>
        <div className="min-w-0">
          <MiniScale
            label="Visual Uniformity"
            left="low"
            right="high"
            value={visualLang}
            onChange={(next) => apply({ visualLang: next })}
            tooltip="Are colors, typography, spacing, and component styles applied uniformly? Noticeable differences signal a broken design system."
          />
        </div>
        <div className="min-w-0">
          <MiniScale
            label="Interactions"
            left="weird"
            right="good"
            value={interactions}
            onChange={(next) => apply({ interactions: next })}
            tooltip="Do buttons, links, hover states, and forms behave the same way across pages? Inconsistent behavior forces users to relearn."
          />
        </div>
        <div className="col-span-2 min-w-0 space-y-2.5">
          <MiniLabel
            label="Flags"
            tooltip="Terminology shifts mean labels for the same thing differ across pages. Component breaks mean the same function uses different UI treatments (e.g., a button in one place, a link in another). Each flag reduces the score."
          />
          <div className="space-y-2.5 text-xs">
            <label className="flex items-center gap-1.5">
              <input
                type="checkbox"
                checked={terminologyShifts}
                onChange={(e) => apply({ terminologyShifts: e.target.checked })}
                className="h-3.5 w-3.5"
              />
              terminology / labels shift across pages
            </label>
            <label className="flex items-center gap-1.5">
              <input
                type="checkbox"
                checked={contentAvailabilityIssue}
                onChange={(e) => apply({ contentAvailabilityIssue: e.target.checked })}
                className="h-3.5 w-3.5"
              />
              content available on some pages but missing on others
            </label>
          </div>
        </div>

      </div>
    </TooltipProvider>
  )
}

function NavigationMiniScorer({
  value,
  onSave,
}: {
  value: NavigationSignals
  onSave: (score: RubricScale, signals: NavigationSignals) => void
}) {
  const [labelClarity, setLabelClarity] = useState<NullableMiniScaleValue>(value.labelClarity)
  const [pathConfidence, setPathConfidence] = useState<NullableMiniScaleValue>(value.pathConfidence)
  const [navbarLoad, setNavbarLoad] = useState<NullableMiniScaleValue>(value.navbarLoad)
  const [l1ItemCount, setL1ItemCount] = useState<NullableMiniScaleValue>(value.l1ItemCount)

  function apply(next: {
    labelClarity?: NullableMiniScaleValue
    pathConfidence?: NullableMiniScaleValue
    navbarLoad?: NullableMiniScaleValue
    l1ItemCount?: NullableMiniScaleValue
  }) {
    const state = {
      labelClarity,
      pathConfidence,
      navbarLoad,
      l1ItemCount,
      ...next,
    }
    if (next.labelClarity != null) setLabelClarity(next.labelClarity)
    if (next.pathConfidence != null) setPathConfidence(next.pathConfidence)
    if (next.navbarLoad != null) setNavbarLoad(next.navbarLoad)
    if (next.l1ItemCount !== undefined) setL1ItemCount(next.l1ItemCount)
    // l1ItemCount is reversed: 0=<8 (good)=2pts, 1==8 (mid)=1pt, 2=>8 (bad)=0pts
    const l1Contribution = state.l1ItemCount != null ? 2 - state.l1ItemCount : 0
    const total =
      (state.labelClarity ?? 0) +
      (state.pathConfidence ?? 0) +
      (state.navbarLoad ?? 0) +
      l1Contribution
    const score: RubricScale = total >= 6 ? 3 : total >= 3 ? 2 : 1
    onSave(score, state)
  }

  return (
    <TooltipProvider>
      <div className="grid grid-cols-2 gap-x-4 gap-y-4 py-1">
        <div className="min-w-0">
          <MiniScale
            label="Label clarity"
            left="vague"
            right="clear"
            value={labelClarity}
            onChange={(next) => apply({ labelClarity: next })}
            tooltip="Are nav labels specific enough that users know what they'll find before clicking? Penalize generic labels like 'Services' or 'Solutions' with no further context."
          />
        </div>
        <div className="min-w-0">
          <MiniScale
            label="Path confidence"
            left="low"
            right="high"
            value={pathConfidence}
            onChange={(next) => apply({ pathConfidence: next })}
            tooltip="Can users predict where to click to reach a goal? Low confidence means too many ambiguous choices or missing obvious paths."
          />
        </div>
        <div className="min-w-0">
          <MiniScale
            label="Navbar load"
            left="heavy"
            right="light"
            value={navbarLoad}
            onChange={(next) => apply({ navbarLoad: next })}
            tooltip="How much effort does it take to scan the nav? Heavy means too many items, long labels, or poor grouping. Light means scannable with clear structure."
          />
        </div>
        <div className="min-w-0">
          <MiniScale
            label="L1 item count"
            left="<8"
            right=">8"
            value={l1ItemCount}
            onChange={(next) => apply({ l1ItemCount: next })}
            tooltip="Number of top-level nav items. <8 is within Miller's 7±2 working-memory limit; 8 is borderline; >8 risks cognitive overload."
          />
        </div>

      </div>
    </TooltipProvider>
  )
}

function visiblePrimary(primary: NavItem[]): NavItem[] {
  return primary.filter((item) => item.label.trim().toLowerCase() !== "home")
}

function NavBranch({ item }: { item: NavItem }) {
  const children = item.children ?? []
  return (
    <div className="flex flex-col gap-1">
      <NavChip label={item.label} muted wide hasChildren={children.length > 0} />
      {children.length > 0 && (
        <div className="flex flex-col gap-1">
          {children.map((leaf, k) => (
            <NavChip key={k} label={leaf.label} muted wide />
          ))}
        </div>
      )}
    </div>
  )
}

function NavLevelLabel({ label }: { label: string }) {
  return (
    <div className="flex w-5 shrink-0 items-center justify-center">
      <span
        className="select-none text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60"
        style={{ writingMode: "vertical-rl", transform: "rotate(180deg)" }}
      >
        {label}
      </span>
    </div>
  )
}

function NavRow({
  label,
  sublabel,
  children,
}: {
  label: string
  sublabel?: string
  children: ReactNode
}) {
  return (
    <div className="flex items-stretch gap-2">
      <div className="flex w-5 shrink-0 items-center justify-center">
        <span
          className="select-none text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60"
          style={{ writingMode: "vertical-rl", transform: "rotate(180deg)" }}
        >
          {label}
        </span>
      </div>
      <div className="flex flex-1 flex-col gap-1 self-center">
        {sublabel && (
          <span className="text-[11px] text-muted-foreground">↳ {sublabel}</span>
        )}
        <div className="flex flex-wrap gap-1">{children}</div>
      </div>
    </div>
  )
}

function NavChip({
  label,
  bold,
  muted,
  home,
  cta,
  hasChildren,
  wide,
}: {
  label: string
  bold?: boolean
  muted?: boolean
  home?: boolean
  cta?: boolean
  hasChildren?: boolean
  wide?: boolean
}) {
  return (
    <span
      className={cn(
        "rounded px-1.5 text-[12px]",
        wide
          ? "flex w-full min-w-0 items-center justify-center break-words py-1 text-center leading-tight"
          : "inline-flex items-center gap-0.5 py-0.5 leading-none",
        cta && "rounded-sm bg-primary px-2 font-medium text-primary-foreground",
        home && !cta && "bg-muted text-muted-foreground",
        !home && !cta && "border",
        bold && !home && !cta && "border-foreground/20 bg-foreground/5 font-medium",
        muted && !home && !cta && "text-muted-foreground",
        !bold && !muted && !home && !cta && "border-border"
      )}
    >
      {label}
      {hasChildren && <span className="opacity-50">▾</span>}
    </span>
  )
}


function MiniLabel({ label, tooltip }: { label: string; tooltip: string }) {
  return (
    <div className="text-xs font-medium text-foreground">
      <Tooltip>
        <TooltipTrigger
          render={
            <button
              type="button"
              className="tooltip-dash-trigger cursor-help transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/45"
              aria-label={`${label} guidance`}
            >
              {label}
            </button>
          }
        />
        <TooltipContent className="max-w-64">{tooltip}</TooltipContent>
      </Tooltip>
    </div>
  )
}

function MiniScale({
  label,
  left,
  right,
  value,
  onChange,
  tooltip,
}: {
  label: string
  left: string
  right: string
  value: NullableMiniScaleValue
  onChange: (next: MiniScaleValue) => void
  tooltip: string
}) {
  return (
    <div className="space-y-2.5">
      <MiniLabel label={label} tooltip={tooltip} />
      <div className="flex items-center gap-1 text-xs text-muted-foreground">
        <span className="w-11 text-left">{left}</span>
        <div className="flex items-center gap-1">
          {[0, 1, 2].map((n) => (
            <button
              key={n}
              type="button"
              aria-label={`${label}: ${n + 1}`}
              onClick={() => onChange(n as MiniScaleValue)}
              className={cn(
                "h-3 w-3 rounded-full border transition-none",
                value === n
                  ? "border-foreground bg-foreground"
                  : "border-muted-foreground/40 hover:border-foreground"
              )}
            />
          ))}
        </div>
        <span className="w-11 text-right">{right}</span>
      </div>
    </div>
  )
}

function extractCtaHeroLine(text: string): { mainText: string; ctaHeroLine: string | null } {
  const blocks = text.split(/\n{2,}/).map((b) => b.trim()).filter(Boolean)
  const ctaIndex = blocks.findIndex((b) => /^\*\*CTA above fold:/i.test(b))
  if (ctaIndex === -1) return { mainText: text, ctaHeroLine: null }
  return {
    mainText: blocks.slice(0, ctaIndex).join("\n\n"),
    ctaHeroLine: blocks[ctaIndex],
  }
}

function parseCtaHeroLine(
  line: string
): { cta: "yes" | "no" | null; hero: "clear" | "confusing" | null } {
  const ctaMatch = line.match(/\*\*CTA above fold:\*\*\s*(\w+)/i)
  const heroMatch = line.match(/\*\*Hero clarity:\*\*\s*(\w+)/i)
  const ctaValue = ctaMatch?.[1]?.toLowerCase()
  const heroValue = heroMatch?.[1]?.toLowerCase()
  return {
    cta: ctaValue === "yes" ? "yes" : ctaValue === "no" ? "no" : null,
    hero: heroValue === "clear" ? "clear" : heroValue === "confusing" ? "confusing" : null,
  }
}

function FirstImpressionRubricRow({
  audit,
  onUpdate,
}: {
  audit: SiteAudit
  onUpdate: (next: SiteAudit) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const row = audit.rubric.firstImpression as HybridScore

  const aiText = row.aiReasoning ?? ""
  const cleanedAiText = stripItalicReadParagraph(aiText)
  const { mainText, ctaHeroLine } = extractCtaHeroLine(cleanedAiText)
  const parsedCtaHero = ctaHeroLine ? parseCtaHeroLine(ctaHeroLine) : null

  // Prefer stored signals over parsed text
  const storedSignals = audit.rubricSignals?.firstImpression
  const effectiveCta = storedSignals?.ctaAboveFold != null ? storedSignals.ctaAboveFold : (parsedCtaHero?.cta ?? null)
  const effectiveHero = storedSignals?.heroClarity != null ? storedSignals.heroClarity : (parsedCtaHero?.hero ?? null)
  const hasCtaHeroData = effectiveCta !== null || effectiveHero !== null

  // Full display text (verdict + signals, no CTA/hero line)
  const displayText = row.userNote ?? mainText
  // Collapsed view shows only the first paragraph (verdict)
  const allBlocks = displayText.split(/\n{2,}/).map((b) => b.trim()).filter(Boolean)
  const verdictText = allBlocks[0] ?? ""
  const hasSignals = allBlocks.length > 1

  const canExpand = hasSignals || hasCtaHeroData

  function handleToggleCta() {
    const next: "yes" | "no" = effectiveCta === "yes" ? "no" : "yes"
    onUpdate(updateFirstImpressionSignal(audit, { ctaAboveFold: next }))
  }

  function handleToggleHero() {
    const next: "clear" | "confusing" = effectiveHero === "clear" ? "confusing" : "clear"
    onUpdate(updateFirstImpressionSignal(audit, { heroClarity: next }))
  }

  function Evidence({ setEditing }: { setEditing: (editing: boolean) => void }) {
    if (row.source === "ai_pending") {
      return (
        <span className="text-xs italic leading-snug text-muted-foreground">
          AI suggestion pending…
        </span>
      )
    }
    return (
      <div>
        <EditableInsight
          value={expanded ? displayText : verdictText}
          placeholder="Edit insight…"
          copyLabel={RUBRIC_LABELS.firstImpression}
          onEditingChange={setEditing}
          onReanalyse={() => scoreHybridRow("firstImpression", audit, onUpdate)}
          reanalysing={audit.scoringStatus?.firstImpression === "scoring"}
          onSave={(next) => {
            captureFirstImpressionEdit(audit, displayText, next)
            onUpdate(setNote(audit, "firstImpression", next))
          }}
        />
        {hasCtaHeroData && (
          <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
            {effectiveCta !== null && (
              <button
                type="button"
                onClick={handleToggleCta}
                className="flex items-center gap-1 rounded transition hover:text-foreground active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/45"
                title={`CTA above fold: ${effectiveCta} — click to toggle`}
              >
                {effectiveCta === "yes"
                  ? <Check className="h-3 w-3 text-green-500" />
                  : <XIcon className="h-3 w-3" />
                }
                CTA above fold
              </button>
            )}
            {effectiveHero !== null && (
              <button
                type="button"
                onClick={handleToggleHero}
                className="flex items-center gap-1 rounded transition hover:text-foreground active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/45"
                title={`Hero clarity: ${effectiveHero} — click to toggle`}
              >
                {effectiveHero === "clear"
                  ? <Check className="h-3 w-3 text-green-500" />
                  : <XIcon className="h-3 w-3" />
                }
                Hero clarity
              </button>
            )}
          </div>
        )}
      </div>
    )
  }

  return (
    <RubricRow
      label={RUBRIC_LABELS.firstImpression}
      row={row}
      headerMeta={
        canExpand ? (
          <button
            type="button"
            onClick={() => setExpanded((e) => !e)}
            className="rounded text-muted-foreground transition hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/45"
          >
            {expanded ? <ChevronsUp className="h-3.5 w-3.5" /> : <ChevronsDown className="h-3.5 w-3.5" />}
          </button>
        ) : null
      }
      evidence={Evidence}
      onScoreChange={scoreChangeFor("firstImpression", audit, onUpdate)}
      onManualAssess={manualAssessFor("firstImpression", audit, onUpdate)}
    />
  )
}

function stripItalicReadParagraph(text: string): string {
  if (!text) return text
  // Drop standalone single-paragraph italics (e.g. "_behavioral read…_") that older
  // First Impression scans appended below the verdict + signals.
  const paragraphs = text.split(/\n{2,}/)
  const filtered = paragraphs.filter((p) => !/^\s*_[^_].*[^_]_\s*$/.test(p.trim()))
  return filtered.join("\n\n").trim()
}

function scaleLabel(value: NullableMiniScaleValue, low: string, mid: string, high: string): string {
  if (value == null) return "—"
  if (value === 0) return low
  if (value === 1) return mid
  return high
}

function taskCompletionScore(state: TaskCompletionSignals): RubricScale {
  const total = (state.ease ?? 0) + (state.duration ?? 0)
  return total >= 4 ? 3 : total >= 2 ? 2 : 1
}

function helpSupportScore(state: HelpSupportSignals): RubricScale {
  const total = (state.supportWithinReach ?? 0) + (state.faqAnswered ?? 0)
  return total >= 3 ? 3 : total >= 1 ? 2 : 1
}

function InlineIconButton(props: ComponentProps<"button">) {
  return (
    <button
      {...props}
      type="button"
      className={cn(
        "inline-flex size-5 items-center justify-center rounded text-muted-foreground transition hover:text-foreground active:scale-95 disabled:pointer-events-none disabled:opacity-45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/45",
        props.className
      )}
    />
  )
}

async function reanalyseCard(
  audit: SiteAudit,
  onUpdate: (next: SiteAudit) => void,
  setLoading: (loading: boolean) => void
) {
  const { pagespeed, anthropic } = getKeys()
  if (!pagespeed) {
    toast.error("Add your PageSpeed key in Settings to reanalyse.")
    return
  }
  setLoading(true)
  try {
    const [raw, navData] = await Promise.all([
      fetchPageSpeed(audit.url, pagespeed),
      fetchNavData(audit.url).catch(() => null),
    ])
    const metrics = extractMetrics(audit.url, raw)
    try {
      metrics.fullPageScreenshot = await captureFullPageScreenshot(metrics.finalUrl || audit.url)
      metrics.fullPageScreenshotSource = "screenshotone"
    } catch (err) {
      toast.error(
        err instanceof Error
          ? `Full-page screenshot failed: ${err.message}`
          : "Full-page screenshot failed"
      )
    }
    if (audit.isClient) {
      try {
        metrics.navigationMobileScreenshot = await captureNavigationMobileScreenshot(metrics.finalUrl || audit.url)
      } catch (err) {
        toast.error(
          err instanceof Error
            ? `Mobile navigation screenshot failed: ${err.message}`
            : "Mobile navigation screenshot failed"
          )
      }
    }
    if (audit.isClient && anthropic) {
      try {
        const target = await identifyPrimaryOfferingTarget(metrics, anthropic, {
          url: audit.url,
          classification: getLastRun()?.classification,
        })
        metrics.visualHierarchyScreenshot = await captureVisualHierarchyScreenshot(
          metrics.finalUrl || audit.url,
          `${target.offering} ${target.sectionSearchText}`
        )
        metrics.visualHierarchySectionScreenshots = await captureVisualHierarchySectionScreenshots(
          metrics.finalUrl || audit.url,
          `${target.offering} ${target.sectionSearchText}`
        )
        metrics.visualHierarchyScreenshotTarget = target.offering
      } catch (err) {
        toast.error(
          err instanceof Error
            ? `Visual hierarchy screenshot failed: ${err.message}`
            : "Visual hierarchy screenshot failed"
        )
      }
    }
    const fresh = initialRubric(metrics)
    const mergedRubric: RubricScores = {
      ...fresh,
      firstImpression: {
        ...fresh.firstImpression,
        userNote: audit.rubric.firstImpression.userNote,
      },
      navigation: audit.rubric.navigation,
      visualHierarchy: {
        ...fresh.visualHierarchy,
        userNote: audit.rubric.visualHierarchy.userNote,
      },
      helpSupport: {
        ...fresh.helpSupport,
        userNote: audit.rubric.helpSupport.userNote,
      },
      taskCompletion: audit.rubric.taskCompletion,
      consistency: audit.rubric.consistency,
    }
    let next: SiteAudit = {
      ...audit,
      metrics,
      rubric: mergedRubric,
      navData: navData ?? audit.navData,
      scoringStatus: {},
      lastScoredAt: new Date().toISOString(),
    }
    if (anthropic) {
      const knowledge = getKnowledge()
      const context = { url: audit.url, classification: getLastRun()?.classification }
      try {
        const ai = await scoreSiteWithAI(metrics, anthropic, knowledge, context, Boolean(audit.isClient))
        next = {
          ...next,
          rubric: applyAIScores(next.rubric, ai),
          rubricSignals: {
            ...next.rubricSignals,
            firstImpression: {
              scope: (next.rubricSignals?.firstImpression?.scope ?? "full") as "hero" | "full",
              ctaAboveFold: ai.firstImpression?.ctaAboveFold,
              heroClarity: ai.firstImpression?.heroClarity,
            },
          },
          lastScoredAt: new Date().toISOString(),
        }
      } catch (err) {
        toast.error(
          err instanceof Error ? `AI scoring failed: ${err.message}` : "AI scoring failed"
        )
      }
      const vh = audit.userImages?.visualHierarchy ??
        metrics.visualHierarchySectionScreenshots ??
        (metrics.visualHierarchyScreenshot ? [metrics.visualHierarchyScreenshot] : [])
      if (vh.length > 0) {
        try {
          const result = await scoreVisualHierarchy(vh, anthropic, knowledge, context)
          next = {
            ...next,
            rubric: applyAIRowScore(next.rubric, "visualHierarchy", result),
            lastScoredAt: new Date().toISOString(),
          }
        } catch (err) {
          toast.error(
            err instanceof Error
              ? `Visual hierarchy rescore failed: ${err.message}`
              : "Visual hierarchy rescore failed"
          )
        }
      }
    }
    onUpdate(next)
    toast.success("Reanalysed")
  } catch (err) {
    toast.error(err instanceof Error ? err.message : "Reanalyse failed")
  } finally {
    setLoading(false)
  }
}

async function reanalyseNavIa(
  audit: SiteAudit,
  onUpdate: (next: SiteAudit) => void,
  setLoading: (loading: boolean) => void
) {
  setLoading(true)
  try {
    const navData = await fetchNavData(audit.url).catch(() => null)
    onUpdate({
      ...audit,
      navData: navData ?? audit.navData,
    })
  } finally {
    setLoading(false)
  }
}

async function reanalyseScreenshot(
  audit: SiteAudit,
  onUpdate: (next: SiteAudit) => void,
  setLoading: (loading: boolean) => void
) {
  setLoading(true)
  try {
    const fullPageScreenshot = await captureFullPageScreenshot(
      audit.metrics.finalUrl || audit.url
    )
    onUpdate({
      ...audit,
      metrics: {
        ...audit.metrics,
        fullPageScreenshot,
        fullPageScreenshotSource: "screenshotone",
      },
      userImages: audit.userImages
        ? {
          ...audit.userImages,
          screenshot: undefined,
        }
        : undefined,
      lastScoredAt: new Date().toISOString(),
    })
    toast.success("Screenshot reanalysed")
  } catch (err) {
    toast.error(err instanceof Error ? err.message : "Could not reanalyse screenshot")
  } finally {
    setLoading(false)
  }
}

async function reanalysePageSpeedSection(
  audit: SiteAudit,
  key: "loadingSpeed" | "accessibility",
  onUpdate: (next: SiteAudit) => void,
  setLoading: SectionLoadingSetter
) {
  const { pagespeed } = getKeys()
  if (!pagespeed) {
    toast.error("Add your PageSpeed key in Settings to reanalyse this section.")
    return
  }

  setLoading((prev) => ({ ...prev, [key]: true }))
  try {
    const raw = await fetchPageSpeed(audit.url, pagespeed)
    const metrics = extractMetrics(audit.url, raw)
    try {
      metrics.fullPageScreenshot = await captureFullPageScreenshot(metrics.finalUrl || audit.url)
      metrics.fullPageScreenshotSource = "screenshotone"
    } catch {
      metrics.fullPageScreenshot = audit.metrics.fullPageScreenshot
      metrics.fullPageScreenshotSource = audit.metrics.fullPageScreenshotSource
    }
    const fresh = initialRubric(metrics)
    const nextRubric: RubricScores = {
      ...audit.rubric,
      [key]: fresh[key],
    }
    nextRubric.uxScoring = {
      ...audit.rubric.uxScoring,
      aiRollup: computeRollup(nextRubric),
    }
    onUpdate({
      ...audit,
      metrics,
      rubric: nextRubric,
      lastScoredAt: new Date().toISOString(),
    })
    toast.success(`Reanalysed ${RUBRIC_LABELS[key]}`)
  } catch (err) {
    toast.error(err instanceof Error ? err.message : `Could not reanalyse ${RUBRIC_LABELS[key]}`)
  } finally {
    setLoading((prev) => ({ ...prev, [key]: false }))
  }
}

async function scoreHybridRow(
  key: "firstImpression" | "navigation" | "visualHierarchy",
  audit: SiteAudit,
  onUpdate: (next: SiteAudit) => void
) {
  const { anthropic } = getKeys()
  if (!anthropic) {
    toast.error("Add your Anthropic key in Settings to score with AI.")
    return
  }
  const knowledge = getKnowledge()
  const context = { url: audit.url, classification: getLastRun()?.classification }
  onUpdate(setScoringStatus(audit, key, "scoring"))
  try {
    const result =
      key === "firstImpression"
        ? await scoreFirstImpression(
          audit.metrics,
          anthropic,
          audit.userImages?.firstImpression,
          knowledge,
          context,
          audit.rubricSignals?.firstImpression?.scope ?? "full",
          Boolean(audit.isClient)
        )
        : key === "navigation"
          ? await scoreNavigation(audit.metrics, anthropic, knowledge, context)
          : await scoreVisualHierarchy(
            audit.userImages?.visualHierarchy ??
            audit.metrics.visualHierarchySectionScreenshots ??
            [audit.metrics.visualHierarchyScreenshot || audit.metrics.fullPageScreenshot || audit.metrics.screenshot],
            anthropic,
            knowledge,
            context
          )

    const nextRubric = applyAIRowScore(audit.rubric, key, result)
    const nextAudit = {
      ...audit,
      rubric: nextRubric,
      scoringStatus: { ...audit.scoringStatus, [key]: "idle" },
      lastScoredAt: new Date().toISOString(),
    }
    if (key === "firstImpression") {
      nextAudit.rubricSignals = {
        ...nextAudit.rubricSignals,
        firstImpression: {
          scope: (nextAudit.rubricSignals?.firstImpression?.scope ?? "full") as "hero" | "full",
          ctaAboveFold: (result as any).ctaAboveFold,
          heroClarity: (result as any).heroClarity,
        },
      }
    }
    onUpdate(nextAudit)
  } catch (err) {
    onUpdate(setScoringStatus(audit, key, "error"))
    toast.error(err instanceof Error ? err.message : "AI scoring failed")
  }
}


function setScoringStatus(
  audit: SiteAudit,
  key: RubricKey,
  status: "idle" | "scoring" | "error"
): SiteAudit {
  return {
    ...audit,
    scoringStatus: { ...audit.scoringStatus, [key]: status },
    lastScoredAt: new Date().toISOString(),
  }
}

function readImageFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = async () => {
      try {
        resolve(await normalizeImageForAI(String(reader.result ?? "")))
      } catch (err) {
        reject(err)
      }
    }
    reader.onerror = () => reject(new Error(`Could not read ${file.name}`))
    reader.readAsDataURL(file)
  })
}

async function normalizeImageForAI(dataUrl: string): Promise<string> {
  const img = await loadImage(dataUrl)
  const maxDimension = 7800
  const maxShortSide = 1800
  const scale = Math.min(1, maxDimension / img.width, maxDimension / img.height, maxShortSide / Math.min(img.width, img.height))
  if (scale >= 1) return dataUrl

  const canvas = document.createElement("canvas")
  canvas.width = Math.max(1, Math.round(img.width * scale))
  canvas.height = Math.max(1, Math.round(img.height * scale))
  const ctx = canvas.getContext("2d")
  if (!ctx) throw new Error("Could not prepare uploaded screenshot")
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
  return canvas.toDataURL("image/jpeg", 0.88)
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error("Could not decode uploaded screenshot"))
    img.src = src
  })
}

function getDisplayScreenshot(metrics: SiteAudit["metrics"] | null): string | undefined {
  if (!metrics) return undefined
  return metrics.fullPageScreenshot || metrics.screenshot
}

function scoreChangeFor(
  key: Exclude<RubricKey, "uxScoring" | "loadingSpeed">,
  audit: SiteAudit,
  onUpdate: (next: SiteAudit) => void
): ((score: RubricScale | null) => void) | undefined {
  const row = audit.rubric[key]
  if (row.source === "auto") return undefined
  return (score) => onUpdate(setScore(audit, key, score))
}

function setScore(
  audit: SiteAudit,
  key: Exclude<RubricKey, "uxScoring" | "loadingSpeed">,
  score: RubricScale | null
): SiteAudit {
  const row = audit.rubric[key]
  let nextRow: HybridScore | ManualScore

  if (row.source === "manual") {
    nextRow = { ...row, score }
  } else {
    const isHybrid = (HYBRID_KEYS as readonly string[]).includes(key)
    if (!isHybrid) return audit
    const hybrid = row as HybridScore
    nextRow = {
      ...hybrid,
      score,
      source: score != null && hybrid.aiSuggested === score ? "confirmed" : "manual_override",
    }
  }

  const nextRubric: RubricScores = { ...audit.rubric, [key]: nextRow }
  nextRubric.uxScoring = {
    ...audit.rubric.uxScoring,
    aiRollup: computeRollup(nextRubric),
  }

  return {
    ...audit,
    rubric: nextRubric,
    lastScoredAt: new Date().toISOString(),
  }
}

function captureFirstImpressionEdit(audit: SiteAudit, previousText: string, nextText: string): void {
  const run = getLastRun()
  recordStyleEdit({
    url: audit.url,
    isClient: Boolean(audit.isClient),
    scope: (audit.rubricSignals?.firstImpression?.scope ?? "full") as "hero" | "full",
    industry: run?.classification?.industry,
    screenshotRef: run ? `${run.runId}:${audit.url}:fullPage` : undefined,
    aiText: previousText,
    userText: nextText,
  })
  const { anthropic } = getKeys()
  if (anthropic) void maybeRefreshStyleProfile(anthropic)
}

function setNote(
  audit: SiteAudit,
  key: Exclude<RubricKey, "uxScoring" | "loadingSpeed">,
  note: string
): SiteAudit {
  const row = audit.rubric[key]
  if (row.source === "auto") return audit
  const nextRow = { ...row, userNote: note }
  return {
    ...audit,
    rubric: { ...audit.rubric, [key]: nextRow },
    lastScoredAt: new Date().toISOString(),
  }
}

function setRubricSignals<K extends keyof NonNullable<SiteAudit["rubricSignals"]>>(
  audit: SiteAudit,
  key: K,
  signals: NonNullable<SiteAudit["rubricSignals"]>[K]
): SiteAudit {
  return {
    ...audit,
    rubricSignals: {
      ...audit.rubricSignals,
      [key]: signals,
    },
    lastScoredAt: new Date().toISOString(),
  }
}

function manualAssess(
  audit: SiteAudit,
  key: Exclude<RubricKey, "uxScoring" | "loadingSpeed">,
  score: RubricScale | null,
  note: string
): SiteAudit {
  const row = audit.rubric[key]
  let nextRow: HybridScore | ManualScore
  if (row.source === "manual") {
    nextRow = { ...row, score, userNote: note }
  } else if (row.source === "auto") {
    return audit
  } else {
    const hybrid = row as HybridScore
    nextRow = {
      ...hybrid,
      score,
      source: "manual_override",
      aiReasoning: "",
      userNote: note,
    }
  }
  const nextRubric: RubricScores = { ...audit.rubric, [key]: nextRow }
  nextRubric.uxScoring = {
    ...audit.rubric.uxScoring,
    aiRollup: computeRollup(nextRubric),
  }
  return {
    ...audit,
    rubric: nextRubric,
    lastScoredAt: new Date().toISOString(),
  }
}

function updateFirstImpressionSignal(
  audit: SiteAudit,
  patch: { ctaAboveFold?: "yes" | "no" } | { heroClarity?: "clear" | "confusing" }
): SiteAudit {
  const current = audit.rubricSignals?.firstImpression ?? { scope: "hero" as const }
  const nextSignals: FirstImpressionSignals = { ...current, ...patch }

  const cta = nextSignals.ctaAboveFold ?? null
  const hero = nextSignals.heroClarity ?? null
  const ctaScore = cta === "yes" ? 3 : cta === "no" ? 1 : null
  const heroScore = hero === "clear" ? 3 : hero === "confusing" ? 1 : null

  const row = audit.rubric.firstImpression as HybridScore
  const aiHolistic = row.aiSuggested ?? 2

  let newScore: RubricScale | null = null
  if (ctaScore !== null && heroScore !== null) {
    const binary = (ctaScore + heroScore) / 2
    newScore = Math.max(1, Math.min(3, Math.round(0.7 * binary + 0.3 * aiHolistic))) as RubricScale
  } else if (ctaScore !== null) {
    newScore = Math.max(1, Math.min(3, Math.round(0.7 * ctaScore + 0.3 * aiHolistic))) as RubricScale
  } else if (heroScore !== null) {
    newScore = Math.max(1, Math.min(3, Math.round(0.7 * heroScore + 0.3 * aiHolistic))) as RubricScale
  }

  const nextRow: HybridScore = { ...row, score: newScore, source: "manual_override" }
  const nextRubric: RubricScores = { ...audit.rubric, firstImpression: nextRow }
  nextRubric.uxScoring = { ...audit.rubric.uxScoring, aiRollup: computeRollup(nextRubric) }

  return {
    ...audit,
    rubricSignals: { ...audit.rubricSignals, firstImpression: nextSignals },
    rubric: nextRubric,
    lastScoredAt: new Date().toISOString(),
  }
}

function manualAssessFor(
  key: Exclude<RubricKey, "uxScoring" | "loadingSpeed">,
  audit: SiteAudit,
  onUpdate: (next: SiteAudit) => void
): ((score: RubricScale, note: string) => void) | undefined {
  if (key === "navigation") return undefined
  if (key === "consistency") return undefined
  const row = audit.rubric[key]
  if (row.source === "auto") return undefined
  return (score, note) => onUpdate(manualAssess(audit, key, score, note))
}

function UxScore({ audit }: { audit: SiteAudit | null }) {
  if (!audit) {
    return (
      <div className="flex size-10 items-center justify-center rounded-full border text-xs font-medium text-muted-foreground">
        —
      </div>
    )
  }

  const missing = SCORE_INPUT_ROWS.filter((key) => effectiveScore(audit.rubric[key]) == null)
  const complete = SCORE_INPUT_ROWS.length - missing.length
  const progress = complete / SCORE_INPUT_ROWS.length
  if (missing.length > 0) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger
            render={
              <div
                className="relative size-10"
                aria-label={`${complete} of ${SCORE_INPUT_ROWS.length} categories complete`}
              >
                <CircularProgress value={progress} />
                <div className="absolute inset-0 flex items-center justify-center text-[11px] font-semibold tabular-nums text-foreground">
                  {complete}/{SCORE_INPUT_ROWS.length}
                </div>
              </div>
            }
          />
          <TooltipContent side="bottom" className="max-w-64">
            <span>
              Before showing the UX score, complete:{" "}
              <strong>{missing.map((key) => RUBRIC_LABELS[key]).join(", ")}</strong>
            </span>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    )
  }

  const display = audit?.rubric.uxScoring.userOverride ?? audit?.rubric.uxScoring.aiRollup ?? null
  const percentage = display == null ? null : Math.round((display / 3) * 100)
  return (
    <div className="flex size-10 items-center justify-end text-right">
      <div className="flex items-baseline justify-end gap-0.5 leading-none">
        {percentage == null ? "—" : (
          <>
            <span className="text-3xl font-semibold tabular-nums">{percentage}</span>
            <span className="text-sm font-semibold">%</span>
          </>
        )}
      </div>
    </div>
  )
}

function CircularProgress({ value }: { value: number }) {
  const radius = 17
  const circumference = 2 * Math.PI * radius
  const offset = circumference * (1 - Math.max(0, Math.min(1, value)))

  return (
    <svg viewBox="0 0 40 40" className="size-10 -rotate-90">
      <circle
        cx="20"
        cy="20"
        r={radius}
        fill="none"
        stroke="currentColor"
        strokeWidth="4"
        className="text-muted"
      />
      <circle
        cx="20"
        cy="20"
        r={radius}
        fill="none"
        stroke="currentColor"
        strokeWidth="4"
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        className="text-foreground transition-[stroke-dashoffset]"
      />
    </svg>
  )
}

function Screenshot({
  data,
  alt,
  contained,
  onReanalyse,
  reanalysing,
}: {
  data?: string
  alt: string
  contained?: boolean
  onReanalyse?: () => void
  reanalysing?: boolean
}) {
  const reanalyseButton = onReanalyse && (
    <div className="absolute right-2 top-2 z-10 opacity-0 transition-opacity group-hover/screenshot:opacity-100 group-focus-within/screenshot:opacity-100">
      <InlineIconButton
        aria-label="Reanalyse screenshot"
        title="Reanalyse screenshot"
        onClick={onReanalyse}
        disabled={reanalysing}
        className="bg-background/90 shadow-sm backdrop-blur"
      >
        {reanalysing ? (
          <Loader2 className="h-3 w-3 animate-spin" />
        ) : (
          <RefreshCw className="h-3 w-3" />
        )}
      </InlineIconButton>
    </div>
  )
  if (!data) {
    return (
      <div className="group/screenshot relative aspect-video w-full rounded-md">
        {reanalyseButton}
        <Skeleton className="h-full w-full rounded-md" />
      </div>
    )
  }
  return (
    <div className={cn("group/screenshot relative aspect-video w-full overflow-hidden rounded-md border", reanalysing && "bg-muted")}>
      {reanalyseButton}
      <div className="h-full overflow-y-auto">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={data}
          alt={`Screenshot of ${alt}`}
          className={cn(
            contained ? "w-full object-contain object-top" : "min-h-full w-full object-cover object-top",
            "transition-opacity",
            reanalysing && "opacity-50"
          )}
        />
      </div>
    </div>
  )
}

function ScreenshotUploadButton({ onUpload }: { onUpload?: (image: string) => void }) {
  return (
    <label
      className={cn(
        buttonVariants({ variant: "outline", size: "icon-sm" }),
        "cursor-pointer",
        !onUpload && "pointer-events-none opacity-50"
      )}
      title="Use my screenshot"
      aria-label="Use my screenshot"
    >
      <Upload className="h-3.5 w-3.5" />
      <input
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        className="sr-only"
        disabled={!onUpload}
        onChange={async (e) => {
          const file = e.target.files?.[0]
          if (!file || !onUpload) return
          onUpload(await readImageFile(file))
          e.target.value = ""
        }}
      />
    </label>
  )
}

function safeHost(url: string): string {
  try {
    return new URL(url).hostname
  } catch {
    return url
  }
}

function externalUrl(url: string): string {
  if (/^https?:\/\//i.test(url)) return url
  return `https://${url}`
}

const SITE_NAME_GENERIC_SLDS = new Set(["com", "net", "org", "gov", "edu", "co", "ac"])

function siteName(hostname: string): string {
  const clean = hostname.replace(/^www\./i, "")
  const parts = clean.split(".").filter(Boolean)
  const secondLast = parts.at(-2)
  const root =
    parts.length >= 3 && secondLast && SITE_NAME_GENERIC_SLDS.has(secondLast)
      ? parts.at(-3)
      : (secondLast ?? parts[0])
  const label = root ?? clean
  return label
    .split(/[-_]/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ")
}
