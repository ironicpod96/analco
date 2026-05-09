"use client"

import { useMemo, useState } from "react"
import {
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
} from "recharts"

import { Badge } from "@/components/ui/badge"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import {
  ANALYTICS_CATEGORIES,
  type AnalyticsCategoryKey,
  buildCriteriaRows,
  buildRadarData,
  buildSiteMeta,
  buildSummary,
  categoryScore,
  missingCategories,
  principlesByCategory,
  type SiteMeta,
  summarySentence,
} from "@/lib/analytics"
import type { SiteAudit } from "@/lib/types"
import { cn } from "@/lib/utils"

export function CrossSitePatterns({ audits }: { audits: SiteAudit[] }) {
  const sites = useMemo(() => buildSiteMeta(audits), [audits])
  const radarData = useMemo(() => buildRadarData(audits, sites), [audits, sites])
  const [highlight, setHighlight] = useState<string | null>(null)
  const [drillKey, setDrillKey] = useState<AnalyticsCategoryKey | null>(null)

  const completeSites = audits.filter((a) => missingCategories(a).length === 0)
  const showEmpty = completeSites.length < 1 && audits.length < 2

  if (showEmpty) {
    return (
      <section className="space-y-3">
        <Header />
        <div className="rounded-lg border bg-muted/20 px-6 py-16 text-center text-sm text-muted-foreground">
          No data yet. Add ratings to at least one site to start comparing.
        </div>
      </section>
    )
  }

  return (
    <section className="space-y-6">
      <Header />

      <div className="rounded-lg border bg-card p-4">
        <div
          className={cn(
            "grid grid-cols-1 gap-4",
            drillKey && "lg:grid-cols-2"
          )}
        >
          <div className="min-w-0">
            <RadarBlock
              data={radarData}
              sites={sites}
              highlight={highlight}
              onAxisClick={(label) => {
                const cat = ANALYTICS_CATEGORIES.find((c) => c.label === label)
                if (cat) setDrillKey(cat.key)
              }}
            />
          </div>
          {drillKey && (
            <div className="min-w-0 border-t pt-4 lg:border-l lg:border-t-0 lg:pl-5 lg:pt-0">
              <DrillDown category={drillKey} audits={audits} sites={sites} />
            </div>
          )}
        </div>
      </div>

      <Legend
        audits={audits}
        sites={sites}
        highlight={highlight}
        onHover={setHighlight}
      />
    </section>
  )
}

function Header() {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <h2 className="text-base font-semibold">Cross-site patterns</h2>
      <p className="text-xs text-muted-foreground">
        Click an axis label or a category to drill in.
      </p>
    </div>
  )
}

function RadarBlock({
  data,
  sites,
  highlight,
  onAxisClick,
}: {
  data: ReturnType<typeof buildRadarData>
  sites: SiteMeta[]
  highlight: string | null
  onAxisClick: (label: string) => void
}) {
  return (
    <div className="h-[520px] w-full [&_svg]:outline-none [&_svg]:focus:outline-none">
      <ResponsiveContainer width="100%" height="100%">
        <RadarChart data={data} outerRadius="68%" margin={{ top: 24, right: 80, bottom: 24, left: 80 }}>
          <PolarGrid stroke="var(--border)" />
          <PolarAngleAxis
            dataKey="category"
            tick={(props) => {
              const p = props as unknown as {
                payload: { value: string }
                x: number
                y: number
                textAnchor: "start" | "middle" | "end" | "inherit"
              }
              return (
                <text
                  x={p.x}
                  y={p.y}
                  textAnchor={p.textAnchor}
                  fill="currentColor"
                  className="cursor-pointer text-xs font-medium"
                  onClick={() => onAxisClick(p.payload.value)}
                >
                  {p.payload.value}
                </text>
              )
            }}
          />
          <PolarRadiusAxis domain={[0, 5]} tick={false} axisLine={false} />
          {[...sites].sort((a) => (a.isClient ? 1 : -1)).map((site) => {
            const dim = highlight && highlight !== site.url
            const fillOpacity = dim ? 0.02 : site.isClient ? 0.55 : 0.2
            const stroke = site.isClient ? "#ffffff" : site.color
            const fill = site.isClient ? "#ffffff" : site.color
            return (
              <Radar
                key={site.url}
                name={site.label}
                dataKey={site.url}
                stroke={stroke}
                fill={fill}
                fillOpacity={fillOpacity}
                strokeOpacity={dim ? 0.06 : 1}
                strokeWidth={site.isClient ? 2.5 : 1.5}
                isAnimationActive={false}
              />
            )
          })}
        </RadarChart>
      </ResponsiveContainer>
    </div>
  )
}

function Legend({
  audits,
  sites,
  highlight,
  onHover,
}: {
  audits: SiteAudit[]
  sites: SiteMeta[]
  highlight: string | null
  onHover: (url: string | null) => void
}) {
  return (
    <ul className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border bg-card px-4 py-2.5 text-sm">
      {sites.map((site, i) => {
        const audit = audits[i]
        const missing = missingCategories(audit)
        const dim = highlight && highlight !== site.url
        return (
          <li
            key={site.url}
            onMouseEnter={() => onHover(site.url)}
            onMouseLeave={() => onHover(null)}
            className={cn(
              "flex items-center gap-2 transition-opacity",
              dim && "opacity-15"
            )}
          >
            <span
              aria-hidden
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{
                backgroundColor: site.isClient ? "#ffffff" : site.color,
                opacity: site.isClient ? 1 : 0.85,
              }}
            />
            <span className="truncate" title={site.label}>
              {site.label}
            </span>
            {site.isClient && (
              <Badge variant="outline" className="text-[10px]">
                Client
              </Badge>
            )}
            {missing.length > 0 && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <button type="button" className="cursor-help">
                        <Badge variant="secondary" className="text-[10px]">
                          Incomplete
                        </Badge>
                      </button>
                    }
                  />
                  <TooltipContent side="left">
                    <div className="text-xs">
                      Missing: {missing.join(", ")}
                    </div>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
          </li>
        )
      })}
    </ul>
  )
}

function DrillDown({
  category,
  audits,
  sites,
}: {
  category: AnalyticsCategoryKey
  audits: SiteAudit[]
  sites: SiteMeta[]
}) {
  const cat = ANALYTICS_CATEGORIES.find((c) => c.key === category)!
  const summary = useMemo(() => buildSummary(category, audits, sites), [category, audits, sites])
  const sentence = useMemo(() => summarySentence(cat.label, summary), [cat.label, summary])
  const criteria = useMemo(() => buildCriteriaRows(category, audits), [category, audits])
  const principles = useMemo(() => principlesByCategory(category, audits, sites), [category, audits, sites])

  // Order: client first, then competitors sorted desc by category score
  const orderedIdx = useMemo(() => {
    const indexed = audits.map((_, i) => i)
    indexed.sort((a, b) => {
      if (sites[a].isClient && !sites[b].isClient) return -1
      if (!sites[a].isClient && sites[b].isClient) return 1
      const sa = categoryScore(audits[a], category) ?? -1
      const sb = categoryScore(audits[b], category) ?? -1
      return sb - sa
    })
    return indexed
  }, [audits, sites, category])

  return (
    <div className="space-y-5">
      <h3 className="text-base font-semibold">{cat.label}</h3>

      <p className="text-sm leading-snug text-muted-foreground">{sentence}</p>

      {/* Bar chart */}
      <BarBlock ordered={orderedIdx} audits={audits} sites={sites} category={category} />

      {/* Heatmap */}
      <Heatmap rows={criteria} ordered={orderedIdx} sites={sites} />

      {/* Principles */}
      {principles.length > 0 && (
        <div className="space-y-2">
          <div className="text-xs font-semibold text-muted-foreground">Knowledge library</div>
          <div className="flex flex-wrap gap-1.5">
            {principles.map((p) => (
              <a
                key={p.title}
                href={p.url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 rounded-full border bg-muted/40 px-2.5 py-1 text-xs hover:bg-muted"
              >
                <span>{p.title}</span>
                <span className="text-muted-foreground">· {p.competitorCount} sites</span>
                {p.clientHas && (
                  <span className="rounded bg-foreground/10 px-1 text-[10px]">incl. client</span>
                )}
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function BarBlock({
  ordered,
  audits,
  sites,
  category,
}: {
  ordered: number[]
  audits: SiteAudit[]
  sites: SiteMeta[]
  category: AnalyticsCategoryKey
}) {
  const max = 5
  return (
    <div className="space-y-1.5">
      <div className="relative space-y-1.5 rounded-md border bg-muted/20 p-3">
        {ordered.map((i, displayIdx) => {
          const site = sites[i]
          const score = categoryScore(audits[i], category)
          const pct = score == null ? 0 : (score / max) * 100
          const prevWasClient = displayIdx > 0 && sites[ordered[displayIdx - 1]].isClient
          return (
            <div key={site.url}>
              {prevWasClient && <div className="my-1.5 border-t border-dashed border-border" />}
              <div className="flex items-center gap-2 text-xs">
                <div className="w-32 shrink-0 truncate">
                  <span className="truncate" title={site.label}>{site.label}</span>
                </div>
                <div className="relative h-4 flex-1 overflow-hidden rounded bg-background">
                  <div
                    className="h-full rounded"
                    style={{
                      width: `${pct}%`,
                      backgroundColor: site.isClient ? "var(--foreground)" : site.color,
                      opacity: site.isClient ? 0.5 : 0.85,
                    }}
                  />
                </div>
                <div className="w-10 shrink-0 text-right tabular-nums">
                  {score == null ? "—" : score.toFixed(1)}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

const TONE_BG: Record<"green" | "amber" | "red" | "neutral", string> = {
  green: "bg-green-500/80 text-white",
  amber: "bg-amber-500/80 text-white",
  red: "bg-red-500/80 text-white",
  neutral: "bg-muted text-muted-foreground",
}

function Heatmap({
  rows,
  ordered,
  sites,
}: {
  rows: ReturnType<typeof buildCriteriaRows>
  ordered: number[]
  sites: SiteMeta[]
}) {
  if (rows.length === 0) return null
  return (
    <div className="space-y-1.5">
      <div className="overflow-x-auto rounded-md border">
        <table className="w-full border-collapse text-xs table-fixed">
          <colgroup>
            <col className="w-[30%]" />
            {ordered.map((i) => (
              <col key={i} style={{ width: `${70 / ordered.length}%` }} />
            ))}
          </colgroup>
          <thead>
            <tr className="bg-muted/40">
              <th className="px-2 py-1.5 text-left font-medium">Criterion</th>
              {ordered.map((i) => {
                const site = sites[i]
                return (
                  <th
                    key={site.url}
                    className={cn(
                      "px-2 py-1.5 text-center font-medium",
                      site.isClient && "bg-foreground/5"
                    )}
                  >
                    <span className="truncate" title={site.label}>{site.label}</span>
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.label} className="border-t">
                <td className="px-2 py-1.5 font-medium text-muted-foreground align-middle">{row.label}</td>
                {ordered.map((i) => {
                  const site = sites[i]
                  const cell = row.cells.find((c) => c.url === site.url)
                  if (!cell) return <td key={site.url} />
                  return (
                    <td
                      key={site.url}
                      className={cn(
                        "px-2 py-1.5 text-center align-middle",
                        site.isClient && "bg-foreground/5"
                      )}
                    >
                      <span className={cn("inline-flex w-full items-center justify-center rounded px-1.5 py-0.5 text-[11px]", TONE_BG[cell.tone])}>
                        {cell.display}
                      </span>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
