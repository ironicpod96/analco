"use client"

import { Copy, Loader2, RefreshCw } from "lucide-react"
import { toast } from "sonner"

import { ReanalyseMotion } from "@/components/reanalyse-motion"
import { ScoreDots } from "@/components/score-dots"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import type { ExtractedMetrics, RubricScale } from "@/lib/types"
import { cn } from "@/lib/utils"

const TONE_TEXT: Record<"green" | "yellow" | "red" | "neutral", string> = {
  green: "text-green-500",
  yellow: "text-amber-500",
  red: "text-red-500",
  neutral: "text-muted-foreground",
}

export function LoadingSpeedBlock({
  metrics,
  onReanalyse,
  reanalysing,
}: {
  metrics: ExtractedMetrics
  onReanalyse?: () => void
  reanalysing?: boolean
}) {
  const perfPct = Math.round(metrics.scores.performance * 100)
  const lcpMs = metrics.cwv.lcp
  const cls = metrics.cwv.cls
  const inp = metrics.cwv.inp
  const cwvSource = metrics.cwv.source ?? "lighthouse"
  const cwvSourceLabel =
    cwvSource === "field-url"
      ? "Field data for this URL"
      : cwvSource === "field-origin"
        ? "Field data for this origin"
        : "Lighthouse lab data"

  const performanceScore: RubricScale = perfPct >= 90 ? 3 : perfPct >= 50 ? 2 : 1

  return (
    <TooltipProvider>
      <div className="group/performance relative flex items-end justify-between gap-4 py-3">
        <ReanalyseMotion active={reanalysing} className="space-y-2.5">
          <div className="flex items-center gap-2 text-sm font-medium leading-tight">
            <ScoreDots score={performanceScore} ariaLabel="Page Performance score" />
            <Tooltip>
              <TooltipTrigger
                render={
                  <button
                    type="button"
                    className="tooltip-dash-trigger cursor-help transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/45"
                    aria-label="Performance score details"
                  >
                    Page Performance
                  </button>
                }
              />
              <TooltipContent className="max-w-72">
                Lighthouse: &quot;The Performance score is a weighted average of the metric
                scores.&quot; Metrics, not Opportunities or Diagnostics, drive it.
              </TooltipContent>
            </Tooltip>
          </div>
          <div
            className={cn(
              "text-3xl font-semibold leading-none tabular-nums",
              TONE_TEXT[tonePct(perfPct)]
            )}
          >
            {perfPct}
            <span className="ml-0.5 text-base">%</span>
          </div>
        </ReanalyseMotion>
        <ReanalyseMotion active={reanalysing} className="flex items-start gap-4">
          <Metric
            label="LCP"
            value={formatMs(lcpMs)}
            tone={toneCwv("lcp", lcpMs)}
            tooltip={`Largest Contentful Paint — when the biggest visible element finishes loading. ${cwvSourceLabel}. Good: <2.5s · Needs improvement: <4s · Poor: >4s.`}
          />
          <Metric
            label="INP"
            value={formatMs(inp)}
            tone={toneCwv("inp", inp)}
            tooltip={`Interaction to Next Paint — responsiveness to user input. ${cwvSourceLabel}. Good: <200ms · Needs improvement: <500ms · Poor: >500ms.`}
          />
          <Metric
            label="CLS"
            value={cls.toFixed(2)}
            tone={toneCwv("cls", cls)}
            tooltip={`Cumulative Layout Shift — how much the page jumps around as it loads. ${cwvSourceLabel}. Good: <0.1 · Needs improvement: <0.25 · Poor: >0.25.`}
          />
        </ReanalyseMotion>
        <div className="absolute right-0 top-1.5 flex items-center gap-1 opacity-0 transition-opacity group-hover/performance:opacity-100 group-focus-within/performance:opacity-100">
          <button
            type="button"
            aria-label="Copy Page Performance"
            title="Copy"
            className="inline-flex size-5 items-center justify-center rounded text-muted-foreground transition hover:text-foreground active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/45"
            onClick={() =>
              copyPerformanceText({
                perfPct,
                lcp: formatMs(lcpMs),
                inp: formatMs(inp),
                cls: cls.toFixed(2),
                source: cwvSourceLabel,
              })
            }
          >
            <Copy className="h-3 w-3" />
          </button>
          {onReanalyse && (
            <button
              type="button"
              aria-label="Reanalyse Page Performance"
              title="Reanalyse"
              disabled={reanalysing}
              className="inline-flex size-5 items-center justify-center rounded text-muted-foreground transition hover:text-foreground active:scale-95 disabled:pointer-events-none disabled:opacity-45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/45"
              onClick={onReanalyse}
            >
              {reanalysing ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <RefreshCw className="h-3 w-3" />
              )}
            </button>
          )}
        </div>
      </div>
    </TooltipProvider>
  )
}

async function copyPerformanceText({
  perfPct,
  lcp,
  inp,
  cls,
  source,
}: {
  perfPct: number
  lcp: string
  inp: string
  cls: string
  source: string
}) {
  const text = [
    `Page Performance: ${perfPct}%`,
    `LCP: ${lcp}`,
    `INP: ${inp}`,
    `CLS: ${cls}`,
    `Source: ${source}`,
  ].join("\n")

  try {
    await navigator.clipboard.writeText(text)
    toast.success("Copied")
  } catch {
    toast.error("Copy failed")
  }
}

function Metric({
  label,
  value,
  tone,
  tooltip,
}: {
  label: string
  value: string
  tone: "green" | "yellow" | "red" | "neutral"
  tooltip: string
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <div className="flex cursor-help flex-col items-center gap-0.5 whitespace-nowrap">
            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {label}
            </span>
            <span className={cn("text-base font-semibold tabular-nums", TONE_TEXT[tone])}>
              {value}
            </span>
          </div>
        }
      />
      <TooltipContent>{tooltip}</TooltipContent>
    </Tooltip>
  )
}

function tonePct(pct: number): "green" | "yellow" | "red" {
  if (pct >= 90) return "green"
  if (pct >= 50) return "yellow"
  return "red"
}

function toneCwv(metric: "lcp" | "inp" | "cls", value: number): "green" | "yellow" | "red" {
  if (metric === "lcp") return value < 2500 ? "green" : value < 4000 ? "yellow" : "red"
  if (metric === "inp") return value < 200 ? "green" : value < 500 ? "yellow" : "red"
  return value < 0.1 ? "green" : value < 0.25 ? "yellow" : "red"
}

function formatMs(value: number): string {
  if (!value) return "—"
  return value > 1000 ? `${(value / 1000).toFixed(1)}s` : `${Math.round(value)}ms`
}
