import { applyCrossSiteInsightOverrides, buildCrossSiteInsights, buildSiteMeta, type CrossSiteInsight } from "@/lib/analytics"
import { getCrossSiteInsightOverrides } from "@/lib/storage"
import { effectiveScore, liveScore, RUBRIC_LABELS } from "@/lib/rubric"
import type { AutoScore, HybridScore, ManualScore, PrincipleRef, RichTextContent, RubricKey, SiteAudit } from "@/lib/types"

export type PresentationTone = "yes" | "somewhat" | "no" | "na"

export type PresentationRect = {
  type: "rect"
  id: string
  x: number
  y: number
  width: number
  height: number
  fill: string
  stroke?: string
  strokeWidth?: number
  dash?: number[]
  borderRadius?: number
  editInsight?: PresentationInsightRef
}

export type PresentationInsightRef = {
  category: DeepDiveCategoryKey
  index: number
}

export type PresentationText = {
  type: "text"
  id: string
  x: number
  y: number
  width: number
  height: number
  text: string
  richText?: RichTextContent
  fill: string
  fontSize: number
  weight?: 400 | 500 | 600 | 700 | 800
  align?: "left" | "center" | "right"
  valign?: "top" | "middle" | "bottom"
  href?: string
}

export type PresentationImage = {
  type: "image"
  id: string
  x: number
  y: number
  width: number
  height: number
  url: string
  objectFit?: "contain" | "cover"
  objectPosition?: string
}

export type PresentationLine = {
  type: "line"
  id: string
  x1: number
  y1: number
  x2: number
  y2: number
  stroke: string
  strokeWidth: number
  dash?: number[]
}

export type PresentationMosaic = {
  type: "mosaic"
  id: string
  x: number
  y: number
  width: number
  height: number
}

export type PresentationRadialChart = {
  type: "radialChart"
  id: string
  x: number
  y: number
  width: number
  height: number
  value: number
  color: string
  centerLabel: string
  subLabel?: string
  footerLabel?: string
}

export type PresentationElement =
  | PresentationRect
  | PresentationText
  | PresentationImage
  | PresentationLine
  | PresentationMosaic
  | PresentationRadialChart

export type PresentationSlide = {
  id: string
  title: string
  width: number
  height: number
  background: string
  fontFamily: "Montserrat"
  elements: PresentationElement[]
}

export type DeepDiveCategoryKey = Exclude<RubricKey, "uxScoring">

export const DEEP_DIVE_CATEGORIES: DeepDiveCategoryKey[] = [
  "loadingSpeed",
  "firstImpression",
  "accessibility",
  "visualHierarchy",
  "navigation",
  "taskCompletion",
  "consistency",
  "helpSupport",
]

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

const TONE_FILL: Record<PresentationTone, string> = {
  yes: "#22c55e",
  somewhat: "#f59e0b",
  no: "#ef4444",
  na: "#A6A6A6",
}

const GRID_STROKE = "#D9D9D9"
const TEXT = "#111111"
const MUTED = "#8B8B8B"
const ACCENT = "#FE0022"
const INSIGHT_CARD_BODY_SIZE = 19

export function buildOverviewRubricSlide(audits: SiteAudit[]): PresentationSlide {
  const sites = audits.filter(Boolean)
  const width = 1600
  const height = 900
  const rowHeaderW = 280
  const indexW = 30
  const gridY = 262
  const rowH = 56
  const scoreH = 56
  const maxTableW = width - 144
  const siteCount = Math.max(sites.length, 1)
  const colW = Math.min(150, (maxTableW - indexW - rowHeaderW) / siteCount)
  const tableW = indexW + rowHeaderW + colW * siteCount
  const x0 = (width - tableW) / 2
  const gridX = x0 + indexW + rowHeaderW
  const elements: PresentationElement[] = []

  elements.push(
    text("eyebrow", 330, 54, 940, 30, "And we have dived a little deeper into understanding the whys...", {
      align: "center",
      fontSize: 24,
      fill: "#2F2F2F",
      weight: 400,
    }),
    text("title-left", 0, 90, 538, 48, "GrowthOps", {
      align: "right",
      fontSize: 41,
      fill: TEXT,
      weight: 400,
    }),
    text("title-right", 548, 90, 980, 48, " 8-step Web Evaluation and Review", {
      align: "left",
      fontSize: 41,
      fill: ACCENT,
      weight: 400,
    })
  )

  sites.forEach((site, i) => {
    const x = gridX + i * colW
    const hostname = hostnameFor(site.url)
    const siteName = siteNameFor(hostname)
    elements.push(
      image(`logo-${i}`, x + colW / 2 - 17, 194, 34, 34, faviconUrl(hostname)),
      text(`host-${i}`, x + 8, 231, colW - 16, 22, siteName, {
        align: "center",
        fontSize: 15,
        fill: "#333333",
        weight: 700,
      })
    )
  })

  for (let row = 0; row < INPUT_ROWS.length; row += 1) {
    const key = INPUT_ROWS[row]
    const y = gridY + row * rowH
    elements.push(
      rect(`index-box-${row}`, x0, y, indexW, rowH, "#FFFFFF"),
      rect(`label-box-${row}`, x0 + indexW, y, rowHeaderW, rowH, "#FFFFFF"),
      text(`index-${row}`, x0 - 4, y, indexW - 6, rowH, String(row + 1), {
        align: "center",
        valign: "middle",
        fontSize: 18,
        fill: "#4B4B4B",
        weight: 400,
      }),
      text(`label-${row}`, x0 + indexW + 4, y + 9, rowHeaderW - 12, rowH - 14, RUBRIC_LABELS[key], {
        align: "left",
        valign: "middle",
        fontSize: key === "taskCompletion" ? 20 : 21,
        fill: TEXT,
        weight: 700,
      })
    )

    sites.forEach((site, col) => {
      const tone = toneForPresentation(liveScore(site, key))
      const x = gridX + col * colW
      elements.push(
        rect(`cell-${row}-${col}`, x, y, colW, rowH, TONE_FILL[tone]),
        ...(tone === "na"
          ? [
              text(`na-${row}-${col}`, x, y + 14, colW, 28, "N/A", {
                align: "center",
                fontSize: 23,
                fill: "#050505",
                weight: 800,
              }),
            ]
          : [])
      )
    })
  }

  const scoreY = gridY + INPUT_ROWS.length * rowH
  elements.push(
    rect("score-label-index", x0, scoreY, indexW, scoreH, "#FFFFFF"),
    rect("score-label-box", x0 + indexW, scoreY, rowHeaderW, scoreH, "#FFFFFF"),
    text("score-label", x0 + indexW + 4, scoreY, rowHeaderW - 12, scoreH, "UX SCORING", {
      align: "left",
      valign: "middle",
      fontSize: 20,
      fill: TEXT,
      weight: 800,
    })
  )

  sites.forEach((site, col) => {
    const x = gridX + col * colW
    elements.push(
      rect(`score-box-${col}`, x, scoreY, colW, scoreH, "#FFFFFF"),
      text(`score-${col}`, x + 6, scoreY, colW - 12, scoreH, uxPercent(site), {
        align: "center",
        valign: "middle",
        fontSize: 25,
        fill: "#000000",
        weight: 800,
      })
    )
  })

  const tableBottom = scoreY + scoreH
  const verticals = [x0, x0 + indexW, gridX]
  for (let i = 0; i <= siteCount; i += 1) verticals.push(gridX + i * colW)
  Array.from(new Set(verticals)).forEach((x, i) => {
    elements.push(line(`grid-v-${i}`, x, gridY, x, tableBottom, GRID_STROKE, 1, [6, 6]))
  })
  for (let i = 0; i <= INPUT_ROWS.length + 1; i += 1) {
    const y = gridY + i * rowH
    elements.push(line(`grid-h-${i}`, x0, y, x0 + tableW, y, GRID_STROKE, 1, [6, 6]))
  }

  const legendY = scoreY + scoreH + 32
  const legendW = 398
  const legendX = (width - legendW) / 2
  elements.push(
    rect("legend-yes", legendX, legendY, 28, 28, TONE_FILL.yes),
    text("legend-yes-text", legendX + 38, legendY + 1, 78, 26, "- Yes", {
      fontSize: 16,
      fill: TEXT,
      weight: 700,
    }),
    rect("legend-somewhat", legendX + 134, legendY, 28, 28, TONE_FILL.somewhat),
    text("legend-somewhat-text", legendX + 172, legendY + 1, 136, 26, "- Somewhat", {
      fontSize: 16,
      fill: TEXT,
      weight: 700,
    }),
    rect("legend-no", legendX + 310, legendY, 28, 28, TONE_FILL.no),
    text("legend-no-text", legendX + 348, legendY + 1, 50, 26, "- No", {
      fontSize: 16,
      fill: TEXT,
      weight: 700,
    })
  )

  return {
    id: "overview-rubric",
    title: "Overview Rubric",
    width,
    height,
    background: "#FFFFFF",
    fontFamily: "Montserrat",
    elements,
  }
}

export function buildDeepDiveSlide(
  audits: SiteAudit[],
  category: DeepDiveCategoryKey
): PresentationSlide {
  const site = audits.find((audit) => audit.isClient) ?? audits[0]
  const elements: PresentationElement[] = []
  const label = RUBRIC_LABELS[category]
  const sectionNumber = DEEP_DIVE_CATEGORIES.indexOf(category) + 1
  const finalUrl = site?.metrics.finalUrl || site?.url || ""

  elements.push(
    text("deck-title", 70, 50, 780, 32, "GrowthOps 8-step Web Evaluation and Review", {
      fontSize: 22,
      fill: "#555555",
      weight: 400,
    }),
    text("slide-title", 70, 85, 720, 42, `${sectionNumber}. ${label}`, {
      fontSize: 28,
      fill: TEXT,
      weight: 800,
    }),
    text("headline", 70, 142, 1300, 136, headlineFor(site, category), {
      fontSize: 36,
      fill: ACCENT,
      weight: 400,
    })
  )

  if (!site) {
    elements.push(
      text("empty", 70, 360, 1460, 70, "No completed audit is available for this Deep Dive slide.", {
        align: "center",
        fontSize: 28,
        fill: MUTED,
        weight: 500,
      })
    )
    return deepDiveSlide(category, elements)
  }

  let insightPrinciples: PrincipleRef[] = []
  if (category === "firstImpression" || category === "visualHierarchy") {
    insightPrinciples = buildScreenshotLayout(elements, audits, site, category)
  } else if (category === "accessibility") {
    buildAccessibilityLayout(elements, audits, site)
  } else if (category === "loadingSpeed") {
    buildPagePerformanceLayout(elements, audits)
  } else if (category === "navigation") {
    insightPrinciples = buildNavigationLayout(elements, audits, site)
  } else {
    insightPrinciples = buildCardsLayout(elements, audits, site, category, false)
  }

  addAddenda(elements, site, category, finalUrl, insightPrinciples)

  return deepDiveSlide(category, elements)
}

export function toneForPresentation(score: number | null): PresentationTone {
  if (score == null) return "na"
  if (score >= 3) return "yes"
  if (score >= 2) return "somewhat"
  return "no"
}

export function faviconUrl(hostname: string): string {
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(hostname)}&sz=64`
}

export function hostnameFor(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "")
  } catch {
    return url.replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0] || url
  }
}

export function siteNameFor(hostname: string): string {
  const root = hostname
    .replace(/^www\./, "")
    .split(".")
    .filter(Boolean)
    .at(-2)
  const name = root ?? hostname
  const known: Record<string, string> = {
    airbnb: "Airbnb",
    google: "Google",
    youtube: "YouTube",
    facebook: "Facebook",
    instagram: "Instagram",
    linkedin: "LinkedIn",
    github: "GitHub",
    tiktok: "TikTok",
    netflix: "Netflix",
    paypal: "PayPal",
    ebay: "eBay",
    moma: "MoMA",
  }
  const normalized = name.toLowerCase()
  if (known[normalized]) return known[normalized]
  return normalized
    .split(/[-_]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ")
}

function uxPercent(site: SiteAudit): string {
  const value = site.rubric.uxScoring.userOverride ?? site.rubric.uxScoring.aiRollup ?? null
  return value == null ? "N/A" : `${Math.round((value / 3) * 100)}%`
}

function rect(
  id: string,
  x: number,
  y: number,
  width: number,
  height: number,
  fill: string,
  stroke?: string,
  strokeWidth?: number,
  dash?: number[],
  borderRadius?: number,
  editInsight?: PresentationInsightRef
): PresentationRect {
  return { type: "rect", id, x, y, width, height, fill, stroke, strokeWidth, dash, borderRadius, editInsight }
}

function text(
  id: string,
  x: number,
  y: number,
  width: number,
  height: number,
  textValue: string,
  options: Omit<PresentationText, "type" | "id" | "x" | "y" | "width" | "height" | "text">
): PresentationText {
  return { type: "text", id, x, y, width, height, text: textValue, ...options }
}

function image(
  id: string,
  x: number,
  y: number,
  width: number,
  height: number,
  url: string,
  objectFit?: PresentationImage["objectFit"],
  objectPosition?: string
): PresentationImage {
  return { type: "image", id, x, y, width, height, url, objectFit, objectPosition }
}

function line(
  id: string,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  stroke: string,
  strokeWidth: number,
  dash?: number[]
): PresentationLine {
  return { type: "line", id, x1, y1, x2, y2, stroke, strokeWidth, dash }
}

function deepDiveSlide(category: DeepDiveCategoryKey, elements: PresentationElement[]): PresentationSlide {
  return {
    id: `deep-dive-${category}`,
    title: `Deep Dive - ${RUBRIC_LABELS[category]}`,
    width: 1600,
    height: 900,
    background: "#FFFFFF",
    fontFamily: "Montserrat",
    elements,
  }
}

function buildCardsLayout(
  elements: PresentationElement[],
  audits: SiteAudit[],
  site: SiteAudit,
  category: DeepDiveCategoryKey,
  includeMetrics: boolean
): PrincipleRef[] {
  const cards = deepDiveInsightCards(audits, site, category)
  const { markedCards, principles } = buildCardFootnotes(cards)
  renderCardsLayout(elements, site, category, includeMetrics, markedCards)
  return principles
}

function renderCardsLayout(
  elements: PresentationElement[],
  site: SiteAudit,
  category: DeepDiveCategoryKey,
  includeMetrics: boolean,
  cards: DeepDiveInsightCardContent[]
) {
  const cardY = 336
  const cardW = 472
  const gap = 22
  const x0 = 70
  cards.forEach((card, i) => {
    const x = x0 + i * (cardW + gap)
    const layout = insightCardLayout(x, cardY, cardW, card, false, false)
    insightCard(elements, `${category}-${i}`, layout, i + 1, { category, index: i })
    if (includeMetrics) {
      metricStrip(elements, `metric-${i}`, x + 22, cardY + layout.height - 128, cardW - 44, site, category)
    }
  })
}

function buildPagePerformanceLayout(elements: PresentationElement[], audits: SiteAudit[]) {
  const sites = audits.filter(Boolean)
  const meta = buildSiteMeta(sites)
  const insights = applyCrossSiteInsightOverrides(
    "loadingSpeed",
    buildCrossSiteInsights("loadingSpeed", sites, meta, []),
    getCrossSiteInsightOverrides()
  )
  buildPagePerformanceLayoutFromInsights(elements, audits, insights.slice(0, 3))
}

function buildPagePerformanceLayoutFromInsights(
  elements: PresentationElement[],
  audits: SiteAudit[],
  insights: CrossSiteInsight[],
  fallbackSite?: SiteAudit
) {
  const sites = audits.filter(Boolean)
  const meta = buildSiteMeta(sites)
  const cards = insights.length
    ? insights.map<DeepDiveInsightCardContent>((insight) => ({
        headline: insight.headline,
        body: insight.text,
      }))
    : fallbackSite
      ? fallbackInsightCards(fallbackSite, "loadingSpeed")
      : []
  const count = Math.max(1, Math.min(3, cards.length))
  const insightGap = count === 3 ? 58 : 84
  const insightW = count === 1 ? 820 : count === 2 ? 560 : 440
  const totalW = count * insightW + (count - 1) * insightGap
  const insightX = (1600 - totalW) / 2

  const insightLayouts = cards.slice(0, count).map((card, i) => ({
    index: i,
    layout: insightCardLayout(insightX + i * (insightW + insightGap), 274, insightW, card, true, false),
  }))

  insightLayouts.forEach(({ layout, index }) => {
    insightCard(elements, `page-performance-insight-${index}`, layout, index + 1, { category: "loadingSpeed", index })
  })

  const ordered = sites
    .map((audit, i) => ({ audit, meta: meta[i] }))
    .sort((a, b) => {
      if (a.audit.isClient && !b.audit.isClient) return -1
      if (!a.audit.isClient && b.audit.isClient) return 1
      return b.audit.metrics.scores.performance - a.audit.metrics.scores.performance
    })
    .slice(0, 3)
  const cardGap = 22
  const cardW = ordered.length === 1 ? 560 : ordered.length === 2 ? 560 : 472
  const totalCardW = ordered.length * cardW + (ordered.length - 1) * cardGap
  const cardX = (1600 - totalCardW) / 2
  const metricY = Math.max(546, ...insightLayouts.map(({ layout }) => layout.y + layout.height + 28))
  ordered.forEach((entry, i) => {
    pagePerformanceMetricCard(
      elements,
      `page-performance-card-${i}`,
      cardX + i * (cardW + cardGap),
      metricY,
      cardW,
      240,
      entry.audit,
      entry.meta.label
    )
  })
}

function pagePerformanceMetricCard(
  elements: PresentationElement[],
  id: string,
  x: number,
  y: number,
  width: number,
  height: number,
  site: SiteAudit,
  label: string
) {
  const m = site.metrics
  const perf = Math.round(m.scores.performance * 100)
  const isClient = Boolean(site.isClient)
  const perfColor = performanceToneColor(perf)
  elements.push(
    rect(`${id}-bg`, x, y, width, height, "#EEEEEE", isClient ? ACCENT : undefined, isClient ? 2 : undefined, undefined, 12),
    text(`${id}-site`, x + 28, y + 26, width - 56, 36, label, {
      fontSize: 28,
      fill: TEXT,
      weight: 800,
    }),
    text(`${id}-label`, x + 28, y + 84, 245, 44, "Page\nPerformance", {
      fontSize: 18,
      fill: TEXT,
      weight: 500,
    }),
    text(`${id}-score`, x + 28, y + 132, 250, 74, `${perf}%`, {
      fontSize: 68,
      fill: perfColor,
      weight: 500,
    })
  )

  const metrics = [
    ["Largest\nContentful Paint", formatDuration(m.cwv.lcp), m.cwv.lcp <= 2500 ? "#008D3F" : ACCENT],
    ["Interaction to\nNext Paint", formatDuration(m.cwv.inp), m.cwv.inp <= 200 ? "#008D3F" : ACCENT],
    ["Cumulative\nLayout Shift", m.cwv.cls.toFixed(2), m.cwv.cls <= 0.1 ? "#008D3F" : ACCENT],
  ] as const
  const metricRowH = 56
  metrics.forEach(([metricLabel, value, color], i) => {
    const rowY = y + 76 + i * metricRowH
    elements.push(
      text(`${id}-metric-label-${i}`, x + width - 258, rowY, 130, 40, metricLabel, {
        fontSize: 13,
        fill: TEXT,
        weight: 500,
      }),
      text(`${id}-metric-value-${i}`, x + width - 122, rowY - 1, 98, 40, value, {
        fontSize: 30,
        fill: color,
        weight: 400,
      })
    )
  })
}

function buildScreenshotLayout(
  elements: PresentationElement[],
  audits: SiteAudit[],
  site: SiteAudit,
  category: DeepDiveCategoryKey
): PrincipleRef[] {
  const firstImpressionCards = category === "firstImpression" ? firstImpressionInsightCards(audits, site) : []
  const rawCards = category === "firstImpression"
    ? firstImpressionCards
    : deepDiveInsightCards(audits, site, category).slice(0, 3)
  const { markedCards, principles } = buildCardFootnotes(rawCards)
  const screenshotSites = category === "firstImpression"
    ? firstImpressionScreenshotSites(audits, site, firstImpressionCards)
    : [site]
  if (category === "firstImpression") {
    renderFirstImpressionLayout(elements, screenshotSites, markedCards)
  } else {
    renderScreenshotLayout(elements, screenshotSites, category, markedCards)
  }
  return principles
}

function renderFirstImpressionLayout(
  elements: PresentationElement[],
  sites: SiteAudit[],
  cards: DeepDiveInsightCardContent[]
) {
  const leftX = 70
  const leftW = 570
  const imgGap = 20
  const labelY = 302
  const labelH = 24
  const imgTop = labelY + labelH + 10
  const imgH = 460
  const count = Math.max(1, Math.min(3, sites.length))
  const imgW = count === 1 ? leftW : Math.floor((leftW - imgGap * (count - 1)) / count)

  sites.slice(0, 3).forEach((site, i) => {
    const x = leftX + i * (imgW + imgGap)
    const label = siteNameFor(hostnameFor(site.url))
    const shot = fullPageScreenshotFor(site, "firstImpression")
    elements.push(
      text(`fi-label-${i}`, x, labelY, imgW, labelH, label, {
        align: "center",
        fontSize: 13,
        fill: TEXT,
        weight: 800,
      })
    )
    if (shot) {
      elements.push(image(`fi-screenshot-${i}`, x, imgTop, imgW, imgH, shot, "cover", "top"))
    } else {
      elements.push(
        rect(`fi-missing-${i}`, x, imgTop, imgW, imgH, "#F2F2F2", "#E3E3E3", 1, undefined, 10),
        text(`fi-missing-label-${i}`, x + 16, imgTop + imgH / 2 - 18, imgW - 32, 36, "No image available", {
          align: "center",
          fontSize: 14,
          fill: MUTED,
          weight: 500,
        })
      )
    }
  })

  const cardX = leftX + leftW + 30
  const cardW = 1530 - cardX
  let yCursor = 302
  cards.slice(0, 3).forEach((card, i) => {
    const layout = insightCardLayout(cardX, yCursor, cardW, card, true, false)
    insightCard(elements, `firstImpression-${i}`, layout, i + 1, { category: "firstImpression", index: i })
    yCursor += layout.height + 18
  })
}

function renderScreenshotLayout(
  elements: PresentationElement[],
  sites: SiteAudit[],
  category: DeepDiveCategoryKey,
  cards: DeepDiveInsightCardContent[]
) {
  const site = sites[0]
  const imageY = 286
  const imageGap = 28
  const imageW = 460
  const imageH = 233
  const imageX = (1600 - imageW * 3 - imageGap * 2) / 2
  const sectionImages = site ? sectionEvidenceImages(site, category) : []

  ;["Hero", "About", "Product / relevant page"].forEach((label, i) => {
    const x = imageX + i * (imageW + imageGap)
    const shot = sectionImages[i] ?? ""
    elements.push(
      text(`section-image-label-${i}`, x, imageY, imageW, 24, label, {
        align: "center",
        fontSize: 15,
        fill: TEXT,
        weight: 800,
      })
    )
    if (shot) {
      elements.push(image(`screenshot-${i}`, x, imageY + 34, imageW, imageH, shot, "cover"))
    } else {
      elements.push(
        rect(`screenshot-missing-${i}`, x, imageY + 34, imageW, imageH, "#F2F2F2", "#E3E3E3", 1, undefined, 10),
        text(`screenshot-missing-label-${i}`, x + 28, imageY + 134, imageW - 56, 36, "No image available", {
          align: "center",
          fontSize: 18,
          fill: MUTED,
          weight: 500,
        })
      )
    }
  })

  const cardY = 594
  const visibleCards = cards.slice(0, 3)
  const cardCount = Math.max(1, visibleCards.length)
  const cardW = (1460 - 22 * (cardCount - 1)) / cardCount
  const cardGap = 22
  const cardX = 70
  visibleCards.forEach((card, i) => {
    const layout = insightCardLayout(cardX + i * (cardW + cardGap), cardY, cardW, card, true, false)
    insightCard(elements, `${category}-${i}`, layout, i + 1, { category, index: i })
  })
}

function buildNavigationLayout(
  elements: PresentationElement[],
  audits: SiteAudit[],
  site: SiteAudit
): PrincipleRef[] {
  const rawCards = deepDiveInsightCards(audits, site, "navigation").slice(0, 3)
  const { markedCards, principles } = buildCardFootnotes(rawCards)
  renderNavigationLayout(elements, site, markedCards)
  return principles
}

function renderNavigationLayout(
  elements: PresentationElement[],
  site: SiteAudit,
  cards: DeepDiveInsightCardContent[]
) {
  const x = 98
  const y = 302
  const w = 500
  const h = 470
  elements.push(
    text("navigation-screenshot-label", x, y, w, 24, "Mobile navigation", {
      align: "center",
      fontSize: 15,
      fill: TEXT,
      weight: 800,
    })
  )
  const navScreenshot = navigationScreenshotFor(site)
  if (navScreenshot) {
    elements.push(image("navigation-mobile-screenshot", x, y + 34, w, h - 34, navScreenshot, "contain"))
  } else {
    elements.push(
      rect("navigation-mobile-missing-bg", x, y + 34, w, h - 34, "#F2F2F2", "#E3E3E3", 1, undefined, 12),
      text(
        "navigation-mobile-missing",
        x + 34,
        y + 198,
        w - 68,
        70,
        "Reanalyse Navigation to capture the mobile menu state.",
        {
          align: "center",
          fontSize: 18,
          fill: MUTED,
          weight: 700,
        }
      )
    )
  }

  let yCursor = 302
  cards.forEach((card, i) => {
    const layout = insightCardLayout(680, yCursor, 790, card, true, false)
    insightCard(elements, `navigation-${i}`, layout, i + 1, { category: "navigation", index: i })
    yCursor += layout.height + 18
  })
}

function buildAccessibilityLayout(elements: PresentationElement[], audits: SiteAudit[], site: SiteAudit) {
  const cards = deepDiveInsightCards(audits, site, "accessibility").slice(0, 3)
  renderAccessibilityLayout(elements, site, cards)
}

function renderAccessibilityLayout(
  elements: PresentationElement[],
  site: SiteAudit,
  cards: DeepDiveInsightCardContent[]
) {
  const score = Math.round(site.metrics.scores.accessibility * 100)
  const color = score >= 90 ? TONE_FILL.yes : score >= 50 ? TONE_FILL.somewhat : TONE_FILL.no
  elements.push({
    type: "radialChart",
    id: "accessibility-radial",
    x: 198,
    y: 288,
    width: 330,
    height: 330,
    value: score,
    color,
    centerLabel: `${score}%`,
    subLabel: "Lighthouse\nPerformance Score",
  })
  renderAccessibilityIssueFlags(elements, site, 116, 642, 494)
  let yCursor = 308
  cards.forEach((card, i) => {
    const layout = insightCardLayout(680, yCursor, 790, card, true, false)
    insightCard(elements, `accessibility-${i}`, layout, i + 1, { category: "accessibility", index: i })
    yCursor += layout.height + 18
  })
}

function renderAccessibilityIssueFlags(
  elements: PresentationElement[],
  site: SiteAudit,
  x: number,
  y: number,
  width: number
) {
  const flags = site.metrics.audits.accessibilityInsights
    .map((group) => ({
      label: accessibilityFlagLabel(group.title),
      count: group.items.length,
    }))
    .filter((flag) => flag.count > 0)
    .slice(0, 6)

  if (flags.length === 0) return

  const badgeFill = TONE_FILL.somewhat
  elements.push(
    text("accessibility-flags-title", x + 24, y, width - 48, 22, "Issues Flagged", {
      align: "left",
      fontSize: 15,
      fill: TEXT,
      weight: 800,
    })
  )

  const colW = (width - 64) / 3
  flags.forEach((flag, i) => {
    const col = i % 3
    const row = Math.floor(i / 3)
    const itemX = x + 24 + col * (colW + 20)
    const itemY = y + 36 + row * 30
    const badgeSize = 24
    elements.push(
      rect(`accessibility-flag-badge-${i}`, itemX, itemY, badgeSize, badgeSize, badgeFill, undefined, undefined, undefined, badgeSize / 2),
      text(`accessibility-flag-count-${i}`, itemX, itemY + 4, badgeSize, 16, String(flag.count), {
        align: "center",
        fontSize: flag.count > 99 ? 8 : 10,
        fill: "#FFFFFF",
        weight: 800,
      }),
      text(`accessibility-flag-label-${i}`, itemX + badgeSize + 8, itemY + 4, colW - badgeSize - 8, 16, flag.label, {
        fontSize: 12,
        fill: TEXT,
        weight: 700,
      })
    )
  })
}

type DeepDiveInsightCardContent = {
  headline: string
  body: string
  principle?: PrincipleRef
}

type DeepDiveInsightWithSubjects = DeepDiveInsightCardContent & {
  subjects: string[]
}

function deepDiveInsightCards(
  audits: SiteAudit[],
  fallbackSite: SiteAudit,
  category: DeepDiveCategoryKey
): DeepDiveInsightCardContent[] {
  if (category === "loadingSpeed") return fallbackInsightCards(fallbackSite, category)

  const insights = crossSiteInsightsFor(audits, category)
  if (insights.length > 0) return insights.slice(0, 3)
  return fallbackInsightCards(fallbackSite, category)
}

function crossSiteInsightsFor(audits: SiteAudit[], category: DeepDiveCategoryKey): DeepDiveInsightWithSubjects[] {
  const sites = audits.filter(Boolean)
  const meta = buildSiteMeta(sites)
  const insights = applyCrossSiteInsightOverrides(
    category,
    buildCrossSiteInsights(category, sites, meta, []),
    getCrossSiteInsightOverrides()
  )
  return insights.map((insight) => ({
    headline: insight.headline.replace(/\s+/g, " ").trim(),
    body: insight.text.replace(/\s+/g, " ").trim(),
    principle: insight.principle,
    subjects: insight.subjects,
  }))
}

function firstImpressionInsightCards(audits: SiteAudit[], fallbackSite: SiteAudit): DeepDiveInsightWithSubjects[] {
  const insights = crossSiteInsightsFor(audits, "firstImpression")
  if (insights.length > 0) return insights.slice(0, 3)
  return fallbackInsightCards(fallbackSite, "firstImpression").slice(0, 3).map((card) => ({ ...card, subjects: [] }))
}

function firstImpressionScreenshotSites(
  audits: SiteAudit[],
  client: SiteAudit,
  insights: DeepDiveInsightWithSubjects[]
): SiteAudit[] {
  const sites = audits.filter(Boolean)
  const meta = buildSiteMeta(sites)
  const auditByLabel = new Map<string, SiteAudit>()
  meta.forEach((siteMeta, index) => {
    const audit = sites[index]
    if (!audit || audit.isClient) return
    auditByLabel.set(siteMeta.label.toLowerCase(), audit)
  })

  const competitors: SiteAudit[] = []
  const seen = new Set<string>()
  for (const insight of insights) {
    for (const label of mentionedCompetitorLabels(insight, auditByLabel)) {
      const competitor = auditByLabel.get(label)
      if (!competitor || seen.has(competitor.url)) continue
      seen.add(competitor.url)
      competitors.push(competitor)
      if (competitors.length === 2) return [client, ...competitors]
    }
  }

  return [client, ...competitors]
}

function mentionedCompetitorLabels(
  insight: DeepDiveInsightWithSubjects,
  auditByLabel: Map<string, SiteAudit>
): string[] {
  const labels: string[] = []
  const add = (label: string) => {
    const normalized = label.toLowerCase()
    if (auditByLabel.has(normalized) && !labels.includes(normalized)) labels.push(normalized)
  }

  insight.subjects.forEach(add)
  const insightText = `${insight.headline} ${insight.body}`.toLowerCase()
  for (const label of auditByLabel.keys()) {
    if (insightText.includes(label)) add(label)
  }
  return labels
}

const SLIDE_FOOTNOTE_MARKERS = ['*', '†', '‡']

function buildCardFootnotes(cards: DeepDiveInsightCardContent[]): {
  markedCards: DeepDiveInsightCardContent[]
  principles: PrincipleRef[]
} {
  const seenUrls = new Map<string, string>()
  const principles: PrincipleRef[] = []

  for (const card of cards) {
    if (card.principle?.url && !seenUrls.has(card.principle.url)) {
      const marker = SLIDE_FOOTNOTE_MARKERS[principles.length] ?? String(principles.length + 1)
      seenUrls.set(card.principle.url, marker)
      principles.push(card.principle)
    }
  }

  const markedCards = cards.map((card) => {
    const marker = card.principle?.url ? seenUrls.get(card.principle.url) : undefined
    if (!marker) return card
    return { ...card, body: `${card.body} ${marker}` }
  })

  return { markedCards, principles }
}


type InsightCardLayout = {
  x: number
  y: number
  width: number
  height: number
  insetX: number
  textWidth: number
  headlineY: number
  headlineH: number
  bodyY: number
  bodyH: number
  headlineText: string
  headlineSize: number
  bodyText: string
  bodySize: number
  showIndex: boolean
}

function insightCardLayout(
  x: number,
  y: number,
  width: number,
  content: DeepDiveInsightCardContent,
  compact: boolean,
  showIndex: boolean
): InsightCardLayout {
  const insetX = 22
  const textWidth = width - insetX * 2
  const headlineText = ensureTrailingPeriod(content.headline)
  const headlineSize = fitFontSize(headlineText, textWidth, 20, 15, 2)
  const bodyText = content.body || content.headline
  const bodySize = INSIGHT_CARD_BODY_SIZE
  const headlineLines = estimateRenderedLineCount(headlineText, textWidth, headlineSize)
  const bodyLines = estimateRenderedLineCount(bodyText, textWidth, bodySize)
  const headlineLineHeight = headlineSize * 1.16
  const bodyLineHeight = bodySize * 1.16
  const headlineH = Math.ceil(headlineLines * headlineLineHeight)
  const bodyH = Math.ceil(bodyLines * bodyLineHeight)
  const headlineY = (compact ? y + (showIndex ? 54 : 34) : y + 74) - 12
  const bodyY = headlineY + headlineH + 12
  const minHeight = compact ? 120 : 384
  const trailingSpace = compact ? 18 : 134
  const height = Math.max(minHeight, bodyY + bodyH + trailingSpace - y)

  return {
    x,
    y,
    width,
    height,
    insetX,
    textWidth,
    headlineY,
    headlineH,
    bodyY,
    bodyH,
    headlineText,
    headlineSize,
    bodyText,
    bodySize,
    showIndex,
  }
}

function insightCard(
  elements: PresentationElement[],
  id: string,
  layout: InsightCardLayout,
  index: number,
  editInsight?: PresentationInsightRef
) {
  elements.push(
    rect(`${id}-bg`, layout.x, layout.y, layout.width, layout.height, "#EEEEEE", undefined, undefined, undefined, 12, editInsight),
    ...(layout.showIndex
      ? [
          rect(`${id}-dot`, layout.x + 22, layout.y + 20, 34, 34, "#000000"),
          text(`${id}-num`, layout.x + 22, layout.y + 22, 34, 26, String(index), {
            align: "center",
            fontSize: 20,
            fill: "#FFFFFF",
            weight: 800,
          }),
        ]
      : []),
    text(`${id}-headline`, layout.x + layout.insetX, layout.headlineY, layout.textWidth, layout.headlineH, layout.headlineText, {
      fontSize: layout.headlineSize,
      fill: TEXT,
      weight: 800,
    }),
    text(`${id}-body`, layout.x + layout.insetX, layout.bodyY, layout.textWidth, layout.bodyH, layout.bodyText, {
      fontSize: layout.bodySize,
      fill: TEXT,
      weight: 400,
    })
  )
}

function estimateRenderedLineCount(value: string, width: number, fontSize: number): number {
  const charsPerLine = Math.max(1, Math.floor(width / (fontSize * 0.56)))
  return value
    .split("\n")
    .reduce((total, line) => total + Math.max(1, Math.ceil(line.length / charsPerLine)), 0)
}

function metricStrip(
  elements: PresentationElement[],
  id: string,
  x: number,
  y: number,
  width: number,
  site: SiteAudit,
  category: DeepDiveCategoryKey
) {
  const metrics = site.metrics
  const score = category === "accessibility" ? metrics.scores.accessibility : metrics.scores.performance
  const pctValue = Math.round(score * 100)
  const scoreColor = pctValue >= 90 ? "#008D3F" : pctValue >= 50 ? "#E68A00" : ACCENT
  elements.push(
    rect(`${id}-bg`, x, y, width, 104, "#FFFFFF"),
    rect(`${id}-bullet`, x + 8, y + 20, 16, 16, ACCENT),
    text(`${id}-label`, x + 34, y + 13, 248, 28, category === "accessibility" ? "Accessibility" : "Page Performance", {
      fontSize: 20,
      fill: TEXT,
      weight: 700,
    }),
    line(`${id}-dash`, x + 34, y + 47, x + 224, y + 47, "#9B9B9B", 1, [6, 6]),
    text(`${id}-score`, x + 8, y + 48, 112, 44, `${pctValue}%`, {
      fontSize: 38,
      fill: scoreColor,
      weight: 800,
    })
  )
  if (category === "accessibility") {
    const failed = metrics.audits.accessibilityInsights.reduce((sum, group) => sum + group.items.length, 0)
    elements.push(
      text(`${id}-issues-label`, x + width - 170, y + 34, 150, 24, "ISSUES", {
        align: "right",
        fontSize: 16,
        fill: "#666666",
        weight: 500,
      }),
      text(`${id}-issues`, x + width - 170, y + 60, 150, 26, String(failed), {
        align: "right",
        fontSize: 22,
        fill: failed ? ACCENT : "#008D3F",
        weight: 800,
      })
    )
    return
  }
  const cells = [
    ["LCP", formatDuration(metrics.cwv.lcp), metrics.cwv.lcp <= 2500 ? "#008D3F" : ACCENT],
    ["INP", formatDuration(metrics.cwv.inp), metrics.cwv.inp <= 200 ? "#008D3F" : ACCENT],
    ["CLS", metrics.cwv.cls.toFixed(2), metrics.cwv.cls <= 0.1 ? "#008D3F" : ACCENT],
  ] as const
  cells.forEach(([label, value, color], i) => {
    const cellX = x + width - 230 + i * 74
    elements.push(
      text(`${id}-${label}-label`, cellX, y + 40, 62, 22, label, {
        align: "right",
        fontSize: 16,
        fill: "#666666",
        weight: 500,
      }),
      text(`${id}-${label}`, cellX, y + 64, 62, 24, value, {
        align: "right",
        fontSize: 20,
        fill: color,
        weight: 800,
      })
    )
  })
}

function addAddenda(
  elements: PresentationElement[],
  site: SiteAudit,
  category: DeepDiveCategoryKey,
  finalUrl: string,
  insightPrinciples: PrincipleRef[] = []
) {
  let y = 806
  if (category === "loadingSpeed" || category === "accessibility") {
    elements.push(
      text("pagespeed-addendum", 70, y, 760, 24, "Assessment performed using PageSpeed Insights", {
        fontSize: 15,
        fill: "#555555",
        weight: 400,
        href: pageSpeedUrl(finalUrl),
      })
    )
    y += 27
  }

  const refsToShow = insightPrinciples.length > 0
    ? insightPrinciples
    : knowledgeRefs(site, category)

  refsToShow.slice(0, 3).forEach((ref, i) => {
    const marker = insightPrinciples.length > 0 ? `${SLIDE_FOOTNOTE_MARKERS[i] ?? String(i + 1)} ` : ""
    elements.push(
      text(`knowledge-${i}`, 70, y + i * 24, 1100, 22, `${marker}${ref.title} — ${domainFor(ref.url)}`, {
        fontSize: 14,
        fill: "#555555",
        weight: 400,
        href: ref.url,
      })
    )
  })
}

function insightCardsFor(site: SiteAudit, category: DeepDiveCategoryKey): string[] {
  if (category === "loadingSpeed") {
    const opportunities = site.metrics.opportunities.slice(0, 2).map((item) => item.title)
    return compactCards([
      site.rubric.loadingSpeed.evidence,
      opportunities.length ? `Largest PageSpeed opportunities: ${opportunities.join("; ")}.` : "No major PageSpeed opportunities were returned for this run.",
      `Resources total ${Math.round(site.metrics.resourceSummary.total / 1024)} KB across JavaScript, CSS, images, fonts, and other assets.`,
    ])
  }
  if (category === "accessibility") {
    const groups = site.metrics.audits.accessibilityInsights.slice(0, 2)
    return compactCards([
      site.rubric.accessibility.evidence,
      groups.length ? groups.map((group) => `${group.title}: ${group.items.slice(0, 2).join(", ")}`).join(" ") : "No grouped accessibility issues were returned.",
      `Heading order score ${scoreLabel(site.metrics.audits.headingOrder.score)}; tap targets score ${scoreLabel(site.metrics.audits.tapTargets.score)}; link text score ${scoreLabel(site.metrics.audits.linkText.score)}.`,
    ])
  }
  const row = site.rubric[category] as HybridScore | ManualScore
  const aiReasoning = "aiReasoning" in row ? row.aiReasoning : ""
  const note = row.userNote ?? ""
  const score = effectiveScore(row)
  const signal = signalSummary(site, category)
  return compactCards([
    aiReasoning || note || `${RUBRIC_LABELS[category]} needs review against the completed audit signals.`,
    signal,
    score == null ? "No final category score is currently set." : `Current category score is ${score.toFixed(1)} out of 3.`,
  ])
}

function fallbackInsightCards(site: SiteAudit, category: DeepDiveCategoryKey): DeepDiveInsightCardContent[] {
  return insightCardsFor(site, category).map((value) => {
    const [headline, detail] = splitInsightText(value)
    return {
      headline: headline || value,
      body: detail || headline || value,
    }
  })
}

function compactCards(values: string[]): string[] {
  return values.map((value) => clampText(value.replace(/\s+/g, " ").trim(), 172))
}

function headlineFor(site: SiteAudit | undefined, category: DeepDiveCategoryKey): string {
  if (!site) return "Deep Dive evidence will appear here once an audit is completed."
  const staticHeadlines: Partial<Record<DeepDiveCategoryKey, string>> = {
    firstImpression:
      "First impressions count. They reflect the image of the company and cue users in to what to expect.",
    navigation:
      "Relevance, relevance, relevance. Focus on how they look for information and avoid second guessing for your users.",
    taskCompletion:
      "Stop focusing on how many steps it takes to reach a goal. It's all about how easy and intuitive it is to get from entry point to task completion.",
    visualHierarchy:
      "Let the eyes 'breathe'; through whitespaces or contrasting background between sections, and make sure the CTAs are clear.",
    consistency:
      "There will always be a learning curve when a user visits a site, especially one that they don't often frequent. Consistency in visuals, sections and actions would help to flatten it.",
    accessibility:
      "It's the small little delightful moments that build a relationship. Ensuring accessibility is not just a choice, it's a commitment to inclusivity.",
    helpSupport:
      "Make it easy for users to reach out for help or give them avenues for self-help (e.g. contact information, FAQs, etc.). Users are getting used to self-help portals.",
  }
  if (staticHeadlines[category]) return staticHeadlines[category]
  if (category === "loadingSpeed") {
    return "Every second counts. Users expect fast load times (>3s on mobile), any later and they would leave."
  }
  const row = site.rubric[category] as AutoScore | HybridScore | ManualScore
  const score = effectiveScore(row)
  return score == null
    ? `${RUBRIC_LABELS[category]} insights are based on the captured page evidence.`
    : `${RUBRIC_LABELS[category]} currently rates ${score.toFixed(1)} out of 3 for the client page.`
}

function screenshotFor(site: SiteAudit, category: DeepDiveCategoryKey): string {
  if (category === "firstImpression") {
    return site.userImages?.firstImpression || site.userImages?.screenshot || site.metrics.fullPageScreenshot || site.metrics.screenshot
  }
  return site.userImages?.visualHierarchy?.[0] || site.metrics.visualHierarchyScreenshot || site.userImages?.screenshot || site.metrics.fullPageScreenshot || site.metrics.screenshot
}

function sectionEvidenceImages(site: SiteAudit, category: DeepDiveCategoryKey): string[] {
  if (site.userImages?.visualHierarchy && site.userImages.visualHierarchy.length >= 3) {
    return site.userImages.visualHierarchy.slice(0, 3)
  }
  if (site.metrics.visualHierarchySectionScreenshots?.some(Boolean)) {
    return site.metrics.visualHierarchySectionScreenshots.slice(0, 3)
  }
  const hero =
    site.userImages?.firstImpression ||
    site.userImages?.screenshot ||
    site.metrics.screenshot ||
    site.metrics.fullPageScreenshot
  const about =
    site.userImages?.visualHierarchy?.[1] ||
    site.metrics.fullPageScreenshot ||
    site.userImages?.screenshot ||
    site.metrics.screenshot
  const relevant =
    site.userImages?.visualHierarchy?.[2] ||
    site.userImages?.visualHierarchy?.[0] ||
    site.metrics.visualHierarchyScreenshot ||
    screenshotFor(site, category)

  return [hero, about, relevant]
}

function fullPageScreenshotFor(site: SiteAudit, category: DeepDiveCategoryKey): string {
  if (category === "firstImpression") {
    return site.metrics.fullPageScreenshot || site.userImages?.firstImpression || site.userImages?.screenshot || site.metrics.screenshot
  }
  return screenshotFor(site, category)
}

function navigationScreenshotFor(site: SiteAudit): string | undefined {
  return site.metrics.navigationMobileScreenshot
}

function knowledgeRefs(site: SiteAudit, category: DeepDiveCategoryKey): PrincipleRef[] {
  const row = site.rubric[category] as AutoScore | HybridScore | ManualScore
  if (!("aiPrinciples" in row) || !row.aiPrinciples) return []
  const seen = new Set<string>()
  return row.aiPrinciples.filter((ref) => {
    const key = `${ref.title}:${ref.url}`
    if (seen.has(key)) return false
    seen.add(key)
    return Boolean(ref.title && ref.url)
  })
}

function domainFor(url: string): string {
  try {
    return new URL(url).hostname
  } catch {
    return url
  }
}

function signalSummary(site: SiteAudit, category: DeepDiveCategoryKey): string {
  const signals = site.rubricSignals
  if (category === "firstImpression") {
    const s = signals?.firstImpression
    return s ? `Scope: ${s.scope}; CTA above fold: ${s.ctaAboveFold ?? "not set"}; hero clarity: ${s.heroClarity ?? "not set"}.` : "First impression was evaluated from the captured page screenshot."
  }
  if (category === "navigation") {
    const s = signals?.navigation
    return s ? `Label clarity ${mini(s.labelClarity)}, path confidence ${mini(s.pathConfidence)}, navbar load ${mini(s.navbarLoad)}, L1 items ${mini(s.l1ItemCount)}.` : "Navigation signals are not manually set yet."
  }
  if (category === "taskCompletion") {
    const s = signals?.taskCompletion
    return s ? `Interruption: ${mini(s.interrupted)}, ease: ${mini(s.ease)}, duration: ${mini(s.duration)}.` : "Task completion signals are not manually set yet."
  }
  if (category === "visualHierarchy") {
    const s = signals?.visualHierarchy
    return s ? `Scan ease ${mini(s.scanEase)}, font balance ${mini(s.fontBalance)}, whitespace ${mini(s.whitespaceUsage)}, CTA placement ${mini(s.ctaPlacement)}.` : "Visual hierarchy was evaluated from the captured page screenshot."
  }
  if (category === "consistency") {
    const s = signals?.consistency
    return s ? `Page coherence ${mini(s.pageCoherence)}, navigation ${mini(s.navigation)}, visual language ${mini(s.visualLang)}, interaction consistency ${mini(s.interactions)}.` : site.consistencyReport || "Consistency signals are not manually set yet."
  }
  const s = signals?.helpSupport
  return s ? `Support within reach: ${mini(s.supportWithinReach)}, FAQ answered: ${mini(s.faqAnswered)}.` : "Help and support cues were evaluated from detected support patterns and screenshot review."
}

function mini(value: number | null | undefined): string {
  if (value == null) return "not set"
  if (value === 2) return "strong"
  if (value === 1) return "mixed"
  return "weak"
}

function accessibilityFlagLabel(value: string): string {
  if (/inter[nr]?alization|internationalization|internalization/i.test(value)) return "Localization"
  const compact = value
    .replace(/\b(accessibility|issues?|audit|audits|failures?)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim()
  return clampText(compact || value, 18)
}

function formatDuration(ms: number): string {
  if (!ms) return "N/A"
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${Math.round(ms)}ms`
}

function performanceToneColor(pct: number): string {
  if (pct >= 90) return "#22c55e"
  if (pct >= 50) return "#f59e0b"
  return "#ef4444"
}

function scoreLabel(score: number | null): string {
  return score == null ? "N/A" : `${Math.round(score * 100)}%`
}

function clampText(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max - 1).trim()}...` : value
}

function fitFontSize(value: string, width: number, max: number, min: number, lines: number): number {
  const charsPerLineAtMax = Math.max(1, Math.floor(width / (max * 0.56)))
  const neededLines = Math.max(1, Math.ceil(value.length / charsPerLineAtMax))
  if (neededLines <= lines) return max
  const fitted = Math.floor((width * lines) / Math.max(1, value.length) / 0.56)
  return Math.max(min, Math.min(max, fitted))
}

function splitInsightText(value: string): [string, string] {
  const clean = value.replace(/\s+/g, " ").trim()
  const match = clean.match(/^(.+?[.!?])\s+(.+)$/)
  if (!match) return [clean, ""]
  return [match[1].replace(/[.!?]$/, ""), match[2]]
}

function ensureTrailingPeriod(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) return trimmed
  return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`
}

function pageSpeedUrl(url: string): string {
  return url ? `https://pagespeed.web.dev/analysis?url=${encodeURIComponent(url)}` : "https://pagespeed.web.dev/"
}
