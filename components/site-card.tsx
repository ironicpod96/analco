"use client"

import { AlertTriangle, ArrowUpRight, ChevronDown, Loader2, Lock, LockOpen, RefreshCw, Upload } from "lucide-react"
import { useState, type ComponentProps, type Dispatch, type ReactNode, type SetStateAction } from "react"
import { toast } from "sonner"

import { EditableInsight, PrincipleBadges } from "@/components/editable-insight"
import { LoadingState, type CardStatus } from "@/components/loading-state"
import { ReanalyseMotion } from "@/components/reanalyse-motion"
import { RubricRow } from "@/components/rubric-row"
import { LoadingSpeedBlock } from "@/components/score-block"
import { Button, buttonVariants } from "@/components/ui/button"
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
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
  scoreFirstImpression,
  scoreNavigation,
  scoreSiteWithAI,
  scoreVisualHierarchy,
} from "@/lib/ai-scoring"
import { fetchNavData } from "@/lib/nav-extract"
import { extractMetrics, fetchPageSpeed } from "@/lib/pagespeed"
import { computeRollup, effectiveScore, initialRubric, RUBRIC_LABELS, scoreFromLighthouse } from "@/lib/rubric"
import { captureFullPageScreenshot } from "@/lib/screenshot"
import {
  defaultConsistencySignals,
  defaultFirstImpressionSignals,
  defaultHelpSupportSignals,
  defaultNavigationSignals,
  defaultTaskCompletionSignals,
  defaultVisualHierarchySignals,
} from "@/lib/rubric-insights"
import { getKeys, getKnowledge, getLastRun } from "@/lib/storage"
import { cn } from "@/lib/utils"
import type {
  AccessibilityInsightGroup,
  AutoScore,
  ConsistencySignals,
  FirstImpressionSignals,
  HelpSupportSignals,
  HybridScore,
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
}: {
  state: SiteCardState
  onUpdate: (next: SiteAudit) => void
  isClient?: boolean
  locked?: boolean
  onToggleLock?: () => void
}) {
  const { url, status, audit, error } = state
  const [reanalysing, setReanalysing] = useState(false)
  const [screenshotReanalysing, setScreenshotReanalysing] = useState(false)
  const [sectionLoading, setSectionLoading] = useState<Partial<Record<RubricKey, boolean>>>({})
  const metrics = audit?.metrics ?? null
  const hostname = safeHost(metrics?.finalUrl ?? url)
  const displayName = siteName(hostname)
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
    <div
      className={cn(
        "flex h-full min-h-0 w-[380px] shrink-0 flex-col overflow-hidden rounded-xl border bg-card",
        isClient && locked && "sticky left-0 z-20 shadow-[4px_0_12px_-6px_rgba(0,0,0,0.25)]",
        isClient && "ring-1 ring-primary/30"
      )}
      style={{ contain: "layout style paint" }}
    >
      <div className="flex h-[73px] shrink-0 items-center border-b bg-card px-4">
        <div className="flex w-full items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={favicon}
            alt=""
            width={32}
            height={32}
            className="h-8 w-8 rounded-md border bg-muted"
          />
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
            {INPUT_ROWS.map((key) => (
              <RubricRow
                key={key}
                label={RUBRIC_LABELS[key]}
                row={
                  key === "accessibility" && audit.metrics.scores.accessibility != null
                    ? { ...audit.rubric.accessibility, score: scoreFromLighthouse(audit.metrics.scores.accessibility) } as AutoScore
                    : audit.rubric[key] as AutoScore | HybridScore | ManualScore
                }
                evidence={null}
                onScoreChange={scoreChangeFor(key, audit, onUpdate)}
                onManualAssess={manualAssessFor(key, audit, onUpdate)}
                controls={renderControls(key, audit, onUpdate)}
                headerMeta={renderHeaderMeta(key, audit, onUpdate)}
              />
            ))}
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
  )
}

function renderHeaderMeta(
  key: Exclude<RubricKey, "uxScoring" | "loadingSpeed">,
  audit: SiteAudit,
  onUpdate: (next: SiteAudit) => void
) {
  if (key !== "firstImpression") return null
  const signals = defaultFirstImpressionSignals(audit.rubricSignals?.firstImpression)
  const scope = signals.scope
  const next: "hero" | "full" = scope === "hero" ? "full" : "hero"
  return (
    <button
      type="button"
      onClick={() =>
        onUpdate(
          setRubricSignals(audit, "firstImpression", { ...signals, scope: next })
        )
      }
      title={`Scope: ${scope === "hero" ? "Hero only" : "Full page"} — click to switch`}
      aria-label={`Toggle First Impression scope (currently ${scope === "hero" ? "hero only" : "full page"})`}
      className="rounded-full border border-foreground/20 px-1.5 py-0.5 text-[11px] font-semibold leading-none text-muted-foreground transition hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/45"
    >
      {scope === "hero" ? "HERO ONLY" : "FULL PAGE"}
    </button>
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
    return (
      <NavTreeVisualization
        navData={audit.navData}
        onReanalyse={() => reanalyseNavSection(audit, onUpdate, setSectionLoading)}
        reanalysing={sectionLoading.navigation}
      />
    )
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
        onSave={(next) => onUpdate(setNote(audit, key, next))}
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
    const signals = defaultTaskCompletionSignals(audit.rubricSignals?.taskCompletion)
    return (
      <TaskCompletionMiniScorer
        value={signals}
        onSave={(score, nextSignals) => {
          const nextRubric: RubricScores = {
            ...audit.rubric,
            taskCompletion: { ...audit.rubric.taskCompletion, score, userNote: "" },
          }
          nextRubric.uxScoring = { ...audit.rubric.uxScoring, aiRollup: computeRollup(nextRubric) }
          onUpdate(
            setRubricSignals(
              { ...audit, rubric: nextRubric, lastScoredAt: new Date().toISOString() },
              "taskCompletion",
              nextSignals
            )
          )
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
  const [signals, setSignals] = useState(value)
  const items: Array<{ key: keyof HelpSupportSignals; label: string }> = [
    { key: "supportWithinReach", label: "Is support within reach?" },
    { key: "faqAnswered", label: "Did the FAQs answer your question?" },
  ]

  function apply(key: keyof HelpSupportSignals, answer: boolean) {
    const next = { ...signals, [key]: answer }
    setSignals(next)
    const answers = Object.values(next)
    const score = answers.some((a) => a == null) ? null : helpSupportScore(next)
    onSave(score, next)
  }

  return (
    <div className="space-y-2.5 py-1">
      {items.map((item) => (
        <MiniYesNo
          key={item.key}
          label={item.label}
          value={signals[item.key]}
          onChange={(next) => apply(item.key, next)}
        />
      ))}
    </div>
  )
}

function TaskCompletionMiniScorer({
  value,
  onSave,
}: {
  value: TaskCompletionSignals
  onSave: (score: RubricScale | null, signals: TaskCompletionSignals) => void
}) {
  const [interrupted, setInterrupted] = useState(value.interrupted)
  const [ease, setEase] = useState(value.ease)
  const [duration, setDuration] = useState(value.duration)

  function apply(next: Partial<TaskCompletionSignals>) {
    const state = { interrupted, ease, duration, ...next }
    if (next.interrupted !== undefined) setInterrupted(next.interrupted)
    if (next.ease !== undefined) setEase(next.ease)
    if (next.duration !== undefined) setDuration(next.duration)

    const score =
      state.interrupted == null || state.ease == null || state.duration == null
        ? null
        : taskCompletionScore(state)
    onSave(score, state)
  }

  return (
    <div className="space-y-2.5 py-1">
      <MiniSelect
        label="Were you interrupted?"
        value={interrupted}
        options={[
          { value: "frequently", label: "Frequently" },
          { value: "somewhat", label: "Somewhat" },
          { value: "no", label: "No" },
        ]}
        onChange={(next) => apply({ interrupted: next as TaskCompletionSignals["interrupted"] })}
      />
      <MiniSelect
        label="Is it easy?"
        value={ease}
        options={[
          { value: "easy", label: "Easy" },
          { value: "ok", label: "OK" },
          { value: "hard", label: "Hard" },
        ]}
        onChange={(next) => apply({ ease: next as TaskCompletionSignals["ease"] })}
      />
      <MiniSelect
        label="How long?"
        value={duration}
        options={[
          { value: "quick", label: "Quick" },
          { value: "moderate", label: "Moderate" },
          { value: "long", label: "Long" },
        ]}
        onChange={(next) => apply({ duration: next as TaskCompletionSignals["duration"] })}
      />
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
    const score: RubricScale = !hasScaleAnswer ? 1 : total >= 8 ? 5 : total >= 4 ? 3 : 1
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
            left="1"
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
    const score: RubricScale = total >= 6 ? 5 : total >= 3 ? 3 : 1
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
  const [l1ItemCount, setL1ItemCount] = useState<number | null>(value.l1ItemCount)

  function apply(next: {
    labelClarity?: NullableMiniScaleValue
    pathConfidence?: NullableMiniScaleValue
    navbarLoad?: NullableMiniScaleValue
    l1ItemCount?: number | null
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
    const total =
      (state.labelClarity ?? 0) +
      (state.pathConfidence ?? 0) +
      (state.navbarLoad ?? 0)
    const score: RubricScale = total >= 5 ? 5 : total >= 3 ? 3 : 1
    onSave(score, state)
  }

  const millersFlag = (l1ItemCount ?? 0) > 7

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
        <div className="min-w-0 space-y-2.5">
          <MiniLabel
            label="L1 item count"
            tooltip="Number of items in the top-level navigation. Counts above 7 surface Miller's Law in the principle panel below."
          />
          <input
            type="number"
            min={0}
            inputMode="numeric"
            value={l1ItemCount ?? ""}
            onChange={(e) => {
              const raw = e.target.value
              const next = raw === "" ? null : Math.max(0, Math.floor(Number(raw)))
              apply({ l1ItemCount: Number.isFinite(next as number) ? next : null })
            }}
            className={cn(
              "h-7 w-20 rounded-md border bg-background px-2 text-xs",
              millersFlag && "border-foreground"
            )}
            aria-label="L1 item count"
          />
        </div>

      </div>
    </TooltipProvider>
  )
}

function NavTreeVisualization({
  navData,
  onReanalyse,
  reanalysing,
}: {
  navData?: NavData | null
  onReanalyse?: () => void
  reanalysing?: boolean
}) {
  const reanalyseBtn = onReanalyse && (
    <div className="absolute -top-7 right-0 flex items-center gap-1 opacity-0 transition-opacity group-hover/row:opacity-100 group-focus-within/row:opacity-100">
      <InlineIconButton aria-label="Reanalyse Navigation" title="Reanalyse" disabled={reanalysing} onClick={onReanalyse}>
        {reanalysing ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
      </InlineIconButton>
    </div>
  )

  if (!navData || !navData.meta) {
    return (
      <div className="relative">
        {reanalyseBtn}
        <ReanalyseMotion active={reanalysing} className="text-xs italic text-muted-foreground">
          Nav not extracted yet — reanalyse the card to fetch it.
        </ReanalyseMotion>
      </div>
    )
  }

  const hasContent =
    navData.brand ||
    navData.primary.length > 0 ||
    navData.utilities.length > 0 ||
    navData.ctas.length > 0 ||
    (navData.breadcrumbs?.length ?? 0) > 0 ||
    (navData.sidebar?.length ?? 0) > 0
  if (!hasContent) {
    return (
      <div className="relative">
        {reanalyseBtn}
        <ReanalyseMotion active={reanalysing}>
          <p className="text-xs italic text-muted-foreground">
            No nav structure detected from static HTML.
          </p>
          {navData.meta.notes.length > 0 && (
            <p className="mt-1 text-[12px] text-amber-500">
              {navData.meta.notes.join(" · ")}
            </p>
          )}
        </ReanalyseMotion>
      </div>
    )
  }

  const hasMore =
    visiblePrimary(navData.primary).some((p) => p.children && p.children.length > 0) ||
    navData.ctas.length > 0 ||
    (navData.breadcrumbs?.length ?? 0) > 0 ||
    (navData.sidebar?.length ?? 0) > 0
  const primary = visiblePrimary(navData.primary)

  return (
    <div className="relative space-y-2 py-1">
      {reanalyseBtn}

      <ReanalyseMotion active={reanalysing} className="space-y-2">
        {(navData.brand || navData.utilities.length > 0) && (
          <div className="flex items-start justify-between gap-2">
            <div className="flex flex-wrap gap-1">
              {navData.brand && <NavChip label="Home" home />}
            </div>
            {(navData.utilities.length > 0 || navData.ctas.length > 0) && (
              <div className="flex flex-wrap justify-end gap-1">
                {navData.utilities.map((u, i) => (
                  <NavChip key={i} label={u.label} home />
                ))}
                {navData.ctas.map((c, i) => (
                  <NavChip key={`cta-${i}`} label={c.label} home />
                ))}
              </div>
            )}
          </div>
        )}

        {primary.length > 0 && (
          <div className="space-y-2.5">
            <div className="flex gap-1">
              {primary.map((item, i) => (
                <div key={i} className="flex min-w-0 flex-1 basis-0">
                  <NavChip label={item.label} wide />
                </div>
              ))}
            </div>
          </div>
        )}

        {hasMore && (
          <div className="pt-1">
            <NavTreeFullModal navData={navData} />
          </div>
        )}

        {navData.meta.notes.length > 0 && (
          <p className="text-[12px] text-amber-500">
            {navData.meta.notes.join(" · ")}
          </p>
        )}
      </ReanalyseMotion>
    </div>
  )
}

function NavTreeFullModal({ navData }: { navData: NavData }) {
  const [open, setOpen] = useState(false)
  const primary = visiblePrimary(navData.primary)

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button variant="outline" size="sm" className="h-7 text-xs">
            Show all
          </Button>
        }
      />
      <DialogContent>
        <DialogTitle>Navigation structure</DialogTitle>
        <div className="max-h-[70vh] space-y-3 overflow-y-auto pr-1">
          {(navData.brand || navData.utilities.length > 0 || navData.ctas.length > 0) && (
            <div className="flex items-stretch gap-2">
              <NavLevelLabel label="Home" />
              <div className="flex flex-1 items-center justify-between gap-2">
                <div className="flex flex-wrap gap-1">
                  {navData.brand && <NavChip label="Home" home />}
                </div>
                {(navData.utilities.length > 0 || navData.ctas.length > 0) && (
                  <div className="flex flex-wrap justify-end gap-1">
                    {navData.utilities.map((u, i) => (
                      <NavChip key={i} label={u.label} home />
                    ))}
                    {navData.ctas.map((c, i) => (
                      <NavChip key={`cta-${i}`} label={c.label} home />
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {primary.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <NavLevelLabel label="L1" />
                <div className="flex flex-1 gap-2">
                  {primary.map((item, i) => (
                    <div key={i} className="flex min-w-0 flex-1 basis-0">
                      <NavChip label={item.label} wide />
                    </div>
                  ))}
                </div>
              </div>
              {primary.some((p) => p.children && p.children.length > 0) && (
                <div className="flex items-stretch gap-2">
                  <NavLevelLabel label="L2" />
                  <div className="flex flex-1 items-start gap-2">
                    {primary.map((item, i) => (
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

          {navData.breadcrumbs && navData.breadcrumbs.length > 0 && (
            <NavRow label="Crumb">
              {navData.breadcrumbs.map((b, i) => (
                <span key={i} className="inline-flex items-center gap-1">
                  {i > 0 && <span className="text-[11px] text-muted-foreground/60">›</span>}
                  <NavChip label={b.label} muted />
                </span>
              ))}
            </NavRow>
          )}

          {navData.sidebar && navData.sidebar.length > 0 && (
            <NavRow label={`Side (${navData.sidebar.length})`}>
              {navData.sidebar.map((s, i) => (
                <NavChip key={i} label={s.label} muted />
              ))}
            </NavRow>
          )}
        </div>
      </DialogContent>
    </Dialog>
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
  hasChildren,
  wide,
}: {
  label: string
  bold?: boolean
  muted?: boolean
  home?: boolean
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
        home && "bg-muted text-muted-foreground",
        !home && "border",
        bold && !home && "border-foreground/20 bg-foreground/5 font-medium",
        muted && !home && "text-muted-foreground",
        !bold && !muted && !home && "border-border"
      )}
    >
      {label}
      {hasChildren && <span className="opacity-50">▾</span>}
    </span>
  )
}

function MiniSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: string | null
  options: Array<{ value: string; label: string }>
  onChange: (next: string | null) => void
}) {
  return (
    <label className="flex items-center justify-between gap-3 text-xs">
      <span className="font-medium text-foreground">{label}</span>
      <select
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value || null)}
        className="h-7 w-28 rounded-md border bg-background py-0 pl-2 pr-3 text-xs text-foreground"
      >
        <option value="">—</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  )
}

function MiniYesNo({
  label,
  value,
  onChange,
}: {
  label: string
  value: boolean | null
  onChange: (next: boolean) => void
}) {
  return (
    <label className="flex items-center justify-between gap-3 text-xs">
      <span className="font-medium text-foreground">{label}</span>
      <select
        value={value == null ? "" : value ? "yes" : "no"}
        onChange={(e) => {
          if (!e.target.value) return
          onChange(e.target.value === "yes")
        }}
        className="h-7 w-28 rounded-md border bg-background py-0 pl-2 pr-3 text-xs text-foreground"
      >
        <option value="">—</option>
        <option value="yes">Yes</option>
        <option value="no">No</option>
      </select>
    </label>
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

function taskInterruptedScore(value: TaskCompletionSignals["interrupted"]): number {
  if (value == null) return 0
  if (value === "no") return 2
  if (value === "somewhat") return 1
  return 0
}

function taskEaseScore(value: TaskCompletionSignals["ease"]): number {
  if (value == null) return 0
  if (value === "easy") return 2
  if (value === "ok") return 1
  return 0
}

function taskDurationScore(value: TaskCompletionSignals["duration"]): number {
  if (value == null) return 0
  if (value === "quick") return 2
  if (value === "moderate") return 1
  return 0
}

function taskCompletionScore(state: TaskCompletionSignals): RubricScale {
  const total =
    taskInterruptedScore(state.interrupted) +
    taskEaseScore(state.ease) +
    taskDurationScore(state.duration)
  return total >= 5 ? 5 : total >= 3 ? 3 : 1
}

function helpSupportScore(state: HelpSupportSignals): RubricScale {
  const yesCount = [state.supportWithinReach, state.faqAnswered].filter(Boolean).length
  return yesCount === 2 ? 5 : yesCount >= 1 ? 3 : 1
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
        const ai = await scoreSiteWithAI(metrics, anthropic, knowledge, context)
        next = {
          ...next,
          rubric: applyAIScores(next.rubric, ai),
          lastScoredAt: new Date().toISOString(),
        }
      } catch (err) {
        toast.error(
          err instanceof Error ? `AI scoring failed: ${err.message}` : "AI scoring failed"
        )
      }
      const vh = audit.userImages?.visualHierarchy ?? []
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

async function reanalyseNavSection(
  audit: SiteAudit,
  onUpdate: (next: SiteAudit) => void,
  setLoading: SectionLoadingSetter
) {
  setLoading((prev) => ({ ...prev, navigation: true }))
  try {
    const navData = await fetchNavData(audit.url)
    onUpdate({ ...audit, navData: navData ?? audit.navData })
  } catch {
    // keep existing navData on error
  } finally {
    setLoading((prev) => ({ ...prev, navigation: false }))
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
          audit.rubricSignals?.firstImpression?.scope ?? "full"
        )
        : key === "navigation"
          ? await scoreNavigation(audit.metrics, anthropic, knowledge, context)
          : await scoreVisualHierarchy(
            audit.userImages?.visualHierarchy ??
            [audit.metrics.fullPageScreenshot || audit.metrics.screenshot],
            anthropic,
            knowledge,
            context
          )

    const nextRubric = applyAIRowScore(audit.rubric, key, result)
    onUpdate({
      ...audit,
      rubric: nextRubric,
      scoringStatus: { ...audit.scoringStatus, [key]: "idle" },
      lastScoredAt: new Date().toISOString(),
    })
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
  const percentage = display == null ? null : Math.round((display / 5) * 100)
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
    <div className="group/screenshot relative aspect-video w-full overflow-hidden rounded-md border bg-muted">
      {reanalyseButton}
      <div className="h-full overflow-y-auto">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={data}
          alt={`Screenshot of ${alt}`}
          className={contained ? "w-full object-contain object-top" : "min-h-full w-full object-cover object-top"}
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

function siteName(hostname: string): string {
  const clean = hostname.replace(/^www\./i, "")
  const parts = clean.split(".").filter(Boolean)
  const label = parts.length >= 2 ? parts[parts.length - 2] : parts[0] ?? clean
  return label
    .split(/[-_]/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ")
}
