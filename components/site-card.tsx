import { LoadingState, type CardStatus } from "@/components/loading-state"
import { Skeleton } from "@/components/ui/skeleton"
import type { ExtractedMetrics, SiteAudit } from "@/lib/types"

export type SiteCardState = {
  url: string
  status: CardStatus
  audit: SiteAudit | null
  error?: string
}

export function SiteCard({ state }: { state: SiteCardState }) {
  const { url, status, audit, error } = state
  const metrics = audit?.metrics ?? null
  const hostname = safeHost(metrics?.finalUrl ?? url)
  const favicon = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(hostname)}&sz=64`

  return (
    <div className="flex h-[calc(100vh-7rem)] w-[380px] shrink-0 flex-col overflow-hidden rounded-xl border bg-card">
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
          <UxScore />
        </div>
        <Screenshot data={metrics?.screenshot} alt={hostname} />
        <LoadingState status={status} message={error} />
      </div>
      <div className="flex-1 overflow-y-auto p-4 text-xs text-muted-foreground">
        {metrics ? (
          <MetricsPreview metrics={metrics} />
        ) : (
          <p>Rubric rows render once metrics arrive.</p>
        )}
      </div>
    </div>
  )
}

function safeHost(url: string): string {
  try {
    return new URL(url).hostname
  } catch {
    return url
  }
}

function UxScore() {
  return (
    <div className="text-right">
      <div className="text-2xl font-semibold leading-none tabular-nums text-muted-foreground/60">
        —
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

function MetricsPreview({ metrics }: { metrics: ExtractedMetrics }) {
  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
      <Row k="Performance" v={pct(metrics.scores.performance)} />
      <Row k="Accessibility" v={pct(metrics.scores.accessibility)} />
      <Row k="Best Practices" v={pct(metrics.scores.bestPractices)} />
      <Row k="SEO" v={pct(metrics.scores.seo)} />
      <Row k="LCP" v={ms(metrics.cwv.lcp)} />
      <Row k="INP" v={ms(metrics.cwv.inp)} />
      <Row k="CLS" v={metrics.cwv.cls.toFixed(2)} />
      <Row k="DOM size" v={String(metrics.audits.domSize.numericValue)} />
    </dl>
  )
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <>
      <dt className="text-muted-foreground">{k}</dt>
      <dd className="text-right font-mono tabular-nums text-foreground">{v}</dd>
    </>
  )
}

function pct(score: number): string {
  return `${Math.round(score * 100)}`
}

function ms(value: number): string {
  if (!value) return "—"
  return value > 1000 ? `${(value / 1000).toFixed(1)}s` : `${Math.round(value)}ms`
}
