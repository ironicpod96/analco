import { LoadingState, type CardStatus } from "@/components/loading-state"
import { RubricRow } from "@/components/rubric-row"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import { RUBRIC_LABELS } from "@/lib/rubric"
import type { AutoScore, HybridScore, ManualScore, RubricKey, SiteAudit } from "@/lib/types"

export type SiteCardState = {
  url: string
  status: CardStatus
  audit: SiteAudit | null
  error?: string
}

const INPUT_ROWS: Exclude<RubricKey, "uxScoring">[] = [
  "loadingSpeed",
  "firstImpression",
  "navigation",
  "taskCompletion",
  "visualHierarchy",
  "consistency",
  "accessibility",
  "helpSupport",
]

export function SiteCard({ state }: { state: SiteCardState }) {
  const { url, status, audit, error } = state
  const metrics = audit?.metrics ?? null
  const hostname = safeHost(metrics?.finalUrl ?? url)
  const favicon = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(hostname)}&sz=64`

  return (
    <div className="flex h-[calc(100vh-9rem)] w-[380px] shrink-0 flex-col overflow-hidden rounded-xl border bg-card">
      <div className="space-y-3 border-b bg-card p-4">
        <div className="flex items-start gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={favicon}
            alt=""
            width={32}
            height={32}
            className="h-8 w-8 rounded-md border bg-muted"
          />
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold">{hostname}</div>
            <div className="truncate text-xs text-muted-foreground">{url}</div>
          </div>
          <UxScore audit={audit} />
        </div>
        <Screenshot data={metrics?.screenshot} alt={hostname} />
        <LoadingState status={status} message={error} />
      </div>
      <div className="flex-1 divide-y overflow-y-auto px-4">
        {audit ? (
          INPUT_ROWS.map((key) => (
            <RubricRow
              key={key}
              label={RUBRIC_LABELS[key]}
              row={audit.rubric[key] as AutoScore | HybridScore | ManualScore}
              evidence={evidenceFor(key, audit)}
            />
          ))
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

function evidenceFor(key: RubricKey, audit: SiteAudit) {
  const row = audit.rubric[key as Exclude<RubricKey, "uxScoring">]
  if (!row) return null
  if (row.source === "auto") return row.evidence
  if (row.source === "ai_pending") return "AI suggestion pending…"
  if ("aiReasoning" in row && row.aiReasoning) return row.aiReasoning
  if ("userNote" in row && row.userNote) return row.userNote
  return null
}

function UxScore({ audit }: { audit: SiteAudit | null }) {
  const display = audit?.rubric.uxScoring.userOverride ?? audit?.rubric.uxScoring.aiRollup ?? null
  return (
    <div className="text-right">
      <div className="text-2xl font-semibold leading-none tabular-nums">
        {display ? display.toFixed(1) : "—"}
      </div>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">UX</div>
    </div>
  )
}

function Screenshot({ data, alt }: { data?: string; alt: string }) {
  if (!data) {
    return <Skeleton className="aspect-video w-full rounded-md" />
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={data}
      alt={`Screenshot of ${alt}`}
      className="aspect-video w-full rounded-md border object-cover object-top"
    />
  )
}

function safeHost(url: string): string {
  try {
    return new URL(url).hostname
  } catch {
    return url
  }
}

