import { applyCrossSiteInsightOverrides, buildCrossSiteInsights, buildSiteMeta, type CrossSiteInsight } from "@/lib/analytics"
import { getCrossSiteInsightOverrides, getKnowledge, getTaskEvaluationCriteria } from "@/lib/storage"
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
  fallbackText?: string
  pasteLabel?: string
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

export type PresentationImageGroup = {
  type: "imageGroup"
  id: string
  x: number
  y: number
  width: number
  height: number
  background: string
  elements: PresentationElement[]
}

export type PresentationElement =
  | PresentationRect
  | PresentationText
  | PresentationImage
  | PresentationLine
  | PresentationMosaic
  | PresentationRadialChart
  | PresentationImageGroup

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
  "navigation",
  "taskCompletion",
  "visualHierarchy",
  "consistency",
  "accessibility",
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
const INSIGHT_ROW_GAP = 18

export const EVALUATION_CRITERIA: Partial<Record<DeepDiveCategoryKey, string>> = {
  loadingSpeed: "How fast your site is loading.",
  firstImpression: "Overall look and feel, context and guiding user to explore.",
  navigation: "Clear and easy navigation for users to reach the desired page from multiple entries.",
  taskCompletion: "",
  visualHierarchy: "Easy for user to digest the content. Grouping, focus content based on priority to less priority, use of whitespace/spacing and contrast.",
  consistency: "Look and feel consistent across all pages without confusing the user and having them relearn the structure or tools (if any).",
  accessibility: "Basic web accessibility (A/AA) — able to adjust the font size, change theme, indicate input box when tap/click on label, input box placeholder, clear hyperlink, acceptable spacing, etc.",
  helpSupport: "Easy reach out and useful support (hotline / contact us / contact form / FAQs).",
}

const CATEGORY_SECTION_LABELS: Partial<Record<DeepDiveCategoryKey, string>> = {
  consistency: "screenshot",
  helpSupport: "help & support section",
}

function auditSiteName(audit: SiteAudit): string {
  return audit.customLabel ?? siteNameFor(hostnameFor(audit.url))
}

function addEvaluationCriteria(
  elements: PresentationElement[],
  category: DeepDiveCategoryKey,
  x: number,
  y: number,
  width: number,
  topMargin = 20
): number {
  const criteriaText = category === "taskCompletion"
    ? (getTaskEvaluationCriteria() ?? "")
    : (EVALUATION_CRITERIA[category] ?? "")
  const marginTop = topMargin
  const labelH = 22
  const gap = 6
  const lineCount = Math.min(2, estimateRenderedLineCount(criteriaText, width, 20, 0.5))
  const textH = Math.max(26, Math.ceil(lineCount * 20 * 1.25))
  const lineGap = 0
  const lineY = y + marginTop + labelH + gap + textH + lineGap
  elements.push(
    text(`eval-criteria-label-${category}`, x, y + marginTop, width, labelH, "Evaluation Criteria:", {
      fontSize: 18,
      fill: TEXT,
      weight: 700,
    }),
    text(`eval-criteria-text-${category}`, x, y + marginTop + labelH + gap, width, textH, criteriaText, {
      fontSize: 20,
      fill: TEXT,
      weight: 400,
    }),
    line(`eval-criteria-line-${category}`, x, lineY, x + width, lineY, "#DDDDDD", 1)
  )
  return lineY + 1 + 18
}

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
    const siteName = site.customLabel ?? siteNameFor(hostname)
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

  addScoreIndicators(elements, audits, category)

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

const TONE_DOT_COLOR: Record<PresentationTone, string> = {
  yes: "#22c55e",
  somewhat: "#f59e0b",
  no: "#ef4444",
  na: "#d1d5db",
}

function addScoreIndicators(
  elements: PresentationElement[],
  audits: SiteAudit[],
  category: DeepDiveCategoryKey
) {
  if (audits.length === 0) return
  const ITEM_W = 22  // favicon size
  const DOT_SIZE = 16
  const ITEM_GAP = 20
  const DOT_GAP = 5
  const RIGHT_MARGIN = 70
  const TOP = 50
  const totalWidth = audits.length * ITEM_W + (audits.length - 1) * ITEM_GAP
  const containerLeft = 1600 - RIGHT_MARGIN - totalWidth
  audits.forEach((audit, i) => {
    const itemLeft = containerLeft + i * (ITEM_W + ITEM_GAP)
    const dotLeft = itemLeft + Math.floor((ITEM_W - DOT_SIZE) / 2)
    const tone = toneForPresentation(liveScore(audit, category))
    elements.push(
      {
        type: "rect",
        id: `score-dot-${i}`,
        x: dotLeft,
        y: TOP,
        width: DOT_SIZE,
        height: DOT_SIZE,
        fill: TONE_DOT_COLOR[tone],
        borderRadius: DOT_SIZE / 2,
      },
      image(
        `score-favicon-${i}`,
        itemLeft,
        TOP + DOT_SIZE + DOT_GAP,
        ITEM_W,
        ITEM_W,
        faviconUrl(hostnameFor(audit.url))
      )
    )
  })
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
  const parts = hostname.replace(/^www\./, "").split(".").filter(Boolean)
  const GENERIC_SLDS = new Set(["com", "net", "org", "gov", "edu", "co"])
  const secondLast = parts.at(-2)
  const root =
    parts.length >= 3 && secondLast && GENERIC_SLDS.has(secondLast)
      ? parts.at(-3)
      : secondLast
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
  objectPosition?: string,
  fallbackText?: string,
  pasteLabel?: string
): PresentationImage {
  return { type: "image", id, x, y, width, height, url, objectFit, objectPosition, fallbackText, pasteLabel }
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
  if (category === "consistency" || category === "helpSupport") {
    renderCardsWithImagesLayout(elements, audits, site, category, markedCards)
  } else if (category === "taskCompletion") {
    renderTaskCompletionLayout(elements, site, markedCards)
  } else {
    renderCardsLayout(elements, site, category, includeMetrics, markedCards)
  }
  return principles
}

function renderTaskCompletionLayout(
  elements: PresentationElement[],
  site: SiteAudit,
  cards: DeepDiveInsightCardContent[]
) {
  const listX = 70
  const listW = 640
  const stripX = 740
  const stripW = 790

  let yCursor = addEvaluationCriteria(elements, "taskCompletion", listX, 288, listW)
  cards.forEach((card, i) => {
    const rowH = insightRow(elements, `taskCompletion-${i}`, listX, yCursor, listW, i + 1, card, {
      category: "taskCompletion",
      index: card.originalIndex ?? i,
    })
    yCursor += rowH + INSIGHT_ROW_GAP
  })

  const steps = site.rubricSignals?.taskCompletionClient?.steps ?? []
  if (!steps.length) {
    elements.push(
      text("taskCompletion-empty", stripX, 320, stripW, 60, "No task steps captured for the client.", {
        fontSize: 14,
        fill: "#94a3b8",
        align: "center",
      })
    )
    return
  }

  const count = Math.min(steps.length, 4)
  const arrowW = 28
  const gap = 12
  const stepW = Math.floor((stripW - arrowW * (count - 1) - gap * (count - 1)) / count)
  const stepH = Math.min(320, Math.floor(stepW * 0.72))
  const yTop = 320
  const labelH = 28

  for (let i = 0; i < count; i++) {
    const step = steps[i]
    const x = stripX + i * (stepW + arrowW + gap)
    elements.push(
      image(
        `taskCompletion-step-img-${i}`,
        x,
        yTop,
        stepW,
        stepH,
        step.screenshot ?? "",
        "cover",
        undefined,
        undefined,
        `Paste step ${i + 1}: ${step.label}`
      )
    )
    elements.push(
      text(`taskCompletion-step-label-${i}`, x, yTop + stepH + 6, stepW, labelH, `${i + 1}. ${step.label}`, {
        fontSize: 12,
        fill: "#475569",
        align: "center",
        weight: 600,
      })
    )
    if (i < count - 1) {
      const arrowY = yTop + stepH / 2
      const aX1 = x + stepW + gap / 2
      const aX2 = aX1 + arrowW
      elements.push(line(`taskCompletion-arrow-${i}`, aX1, arrowY, aX2, arrowY, "#94a3b8", 2))
      elements.push(line(`taskCompletion-arrow-${i}-h1`, aX2 - 8, arrowY - 6, aX2, arrowY, "#94a3b8", 2))
      elements.push(line(`taskCompletion-arrow-${i}-h2`, aX2 - 8, arrowY + 6, aX2, arrowY, "#94a3b8", 2))
    }
  }
}

function renderCardsLayout(
  elements: PresentationElement[],
  site: SiteAudit,
  category: DeepDiveCategoryKey,
  includeMetrics: boolean,
  cards: DeepDiveInsightCardContent[]
) {
  let yCursor = addEvaluationCriteria(elements, category, 70, 288, 1460)
  cards.forEach((card, i) => {
    const rowH = insightRow(elements, `${category}-${i}`, 70, yCursor, 1460, i + 1, card, { category, index: card.originalIndex ?? i })
    yCursor += rowH + INSIGHT_ROW_GAP
  })
}

function renderCardsWithImagesLayout(
  elements: PresentationElement[],
  audits: SiteAudit[],
  site: SiteAudit,
  category: DeepDiveCategoryKey,
  cards: DeepDiveInsightCardContent[]
) {
  const listX = 70
  const listW = 640
  const imgX = 740
  const imgW = 790
  const imgGap = 14

  let yCursor = addEvaluationCriteria(elements, category, listX, 288, listW)
  cards.forEach((card, i) => {
    const rowH = insightRow(elements, `${category}-${i}`, listX, yCursor, listW, i + 1, card, { category, index: card.originalIndex ?? i })
    yCursor += rowH + INSIGHT_ROW_GAP
  })

  const largeH = 308
  const smallH = 208
  const largeImgY = 288
  const smallImgY = largeImgY + largeH + imgGap

  const sectionLabel = CATEGORY_SECTION_LABELS[category] ?? "screenshot"
  const clientName = auditSiteName(site)
  const competitors = audits.filter((a) => a.url !== site.url).slice(0, 2)

  const clientShot = category === "helpSupport"
    ? (site.userImages?.helpSupport?.[0] ?? site.userImages?.screenshot ?? site.userImages?.firstImpression ?? site.metrics.fullPageScreenshot ?? site.metrics.screenshot ?? "")
    : (site.userImages?.screenshot ?? site.userImages?.firstImpression ?? site.metrics.fullPageScreenshot ?? site.metrics.screenshot ?? "")

  elements.push(image(
    `${category}-img-0`,
    imgX, largeImgY, imgW, largeH,
    clientShot,
    "cover",
    undefined,
    undefined,
    `Paste ${sectionLabel} from ${clientName}`
  ))

  const smallW = competitors.length === 1 ? imgW : Math.floor((imgW - imgGap) / 2)
  competitors.forEach((competitor, col) => {
    const x = imgX + col * (smallW + imgGap)
    const competitorShot = competitor.userImages?.screenshot ?? competitor.metrics.fullPageScreenshot ?? competitor.metrics.screenshot ?? ""
    const competitorName = auditSiteName(competitor)
    elements.push(image(
      `${category}-img-${col + 1}`,
      x, smallImgY, smallW, smallH,
      competitorShot,
      "cover",
      undefined,
      undefined,
      `Paste ${sectionLabel} from ${competitorName}`
    ))
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
        richText: insight.richText,
      }))
    : fallbackSite
      ? fallbackInsightCards(fallbackSite, "loadingSpeed")
      : []
  const count = Math.max(1, Math.min(3, cards.length))
  const insightGap = count === 3 ? 58 : 84
  const insightW = count === 1 ? 820 : count === 2 ? 560 : 440
  const totalW = count * insightW + (count - 1) * insightGap
  const insightX = (1600 - totalW) / 2

  let yCursor = addEvaluationCriteria(elements, "loadingSpeed", 70, 230, 1460)
  let insightBottomY = yCursor
  cards.slice(0, count).forEach((card, i) => {
    const rowH = insightRow(elements, `page-performance-insight-${i}`, 70, yCursor, 1460, i + 1, card, { category: "loadingSpeed", index: i })
    yCursor += rowH + INSIGHT_ROW_GAP
    insightBottomY = yCursor
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
  const metricY = Math.max(546, insightBottomY + 12)
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
  const hostname = hostnameFor(site.metrics.finalUrl || site.url)
  elements.push(
    rect(`${id}-bg`, x, y, width, height, "#EEEEEE", isClient ? ACCENT : undefined, isClient ? 2 : undefined, undefined, 12),
    image(`${id}-site`, x + 28, y + 22, 36, 36, faviconUrl(hostname), undefined, undefined, label),
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
  const imgTop = 302
  const imgH = 494
  const count = Math.max(1, Math.min(3, sites.length))
  const imgW = count === 1 ? leftW : Math.floor((leftW - imgGap * (count - 1)) / count)

  sites.slice(0, 3).forEach((site, i) => {
    const x = leftX + i * (imgW + imgGap)
    const shot = fullPageScreenshotFor(site, "firstImpression")
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
  let yCursor = addEvaluationCriteria(elements, "firstImpression", cardX, 262, cardW)
  cards.slice(0, 3).forEach((card, i) => {
    const rowH = insightRow(elements, `firstImpression-${i}`, cardX, yCursor, cardW, i + 1, card, { category: "firstImpression", index: i })
    yCursor += rowH + INSIGHT_ROW_GAP
  })
}

function renderScreenshotLayout(
  elements: PresentationElement[],
  sites: SiteAudit[],
  category: DeepDiveCategoryKey,
  cards: DeepDiveInsightCardContent[]
) {
  const site = sites[0]
  const imageY = 262
  const imageGap = 28
  const imageW = 460
  const imageH = 233
  const imageX = (1600 - imageW * 3 - imageGap * 2) / 2
  const sectionImages = site ? sectionEvidenceImages(site, category) : []

  const sectionLabels = ["Hero", "About", "Product / relevant page"]
  const imageSearchTerms = [
    "website hero section screenshot",
    "website about page screenshot",
    "website product page screenshot",
  ]
  sectionLabels.forEach((label, i) => {
    const x = imageX + i * (imageW + imageGap)
    const shot = sectionImages[i] ?? ""
    if (shot) {
      elements.push(image(`screenshot-${i}`, x, imageY, imageW, imageH, shot, "cover"))
    } else {
      elements.push(
        rect(`screenshot-missing-${i}`, x, imageY, imageW, imageH, "#F2F2F2", "#E3E3E3", 1, undefined, 10),
        text(`screenshot-missing-label-${i}`, x + 16, imageY + imageH / 2 - 12, imageW - 32, 22, `Find images of ${label.toLowerCase()}`, {
          align: "center",
          fontSize: 13,
          fill: "#1155CC",
          weight: 600,
          href: `https://www.google.com/search?tbm=isch&q=${encodeURIComponent(imageSearchTerms[i] ?? label)}`,
        })
      )
    }
  })

  let yCursor = addEvaluationCriteria(elements, category, 70, 499, 1460, 0)
  cards.slice(0, 3).forEach((card, i) => {
    const rowH = insightRow(elements, `${category}-${i}`, 70, yCursor, 1460, i + 1, card, { category, index: card.originalIndex ?? i })
    yCursor += rowH + 8
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
  const y = 302
  const h = 470
  const imgGap = 20
  const imgW = 240
  const leftX = 98
  const rightX = leftX + imgW + imgGap

  const navScreenshot = navigationScreenshotFor(site)
  elements.push(
    image("navigation-mobile-screenshot", leftX, y, imgW, h, navScreenshot ?? "", "contain", undefined, undefined, "Paste mobile navigation screenshot")
  )
  elements.push(
    image("navigation-desktop-screenshot", rightX, y, imgW, h, "", "contain", undefined, undefined, "Paste desktop navigation screenshot")
  )

  let yCursor = addEvaluationCriteria(elements, "navigation", 680, 262, 790)
  cards.forEach((card, i) => {
    const rowH = insightRow(elements, `navigation-${i}`, 680, yCursor, 790, i + 1, card, { category: "navigation", index: i })
    yCursor += rowH + INSIGHT_ROW_GAP
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
  const groupElements: PresentationElement[] = []
  groupElements.push({
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
  renderAccessibilityIssueFlags(groupElements, site, 116, 642, 494)
  elements.push({
    type: "imageGroup",
    id: "accessibility-section",
    x: 116,
    y: 288,
    width: 494,
    height: 460,
    background: "#FFFFFF",
    elements: groupElements,
  })
  let yCursor = addEvaluationCriteria(elements, "accessibility", 680, 262, 790)
  cards.forEach((card, i) => {
    const rowH = insightRow(elements, `accessibility-${i}`, 680, yCursor, 790, i + 1, card, { category: "accessibility", index: i })
    yCursor += rowH + INSIGHT_ROW_GAP
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
  richText?: RichTextContent
  originalIndex?: number
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
  const knowledge = getKnowledge()
  const insights = applyCrossSiteInsightOverrides(
    category,
    buildCrossSiteInsights(category, sites, meta, knowledge),
    getCrossSiteInsightOverrides()
  )
  return insights.map((insight) => {
    const body = insight.text.replace(/\s+/g, " ").trim()
    const richText: RichTextContent = insight.richText ?? { blocks: [{ runs: [{ text: body }] }] }
    return {
      headline: insight.headline.replace(/\s+/g, " ").trim(),
      body,
      principle: insight.principle,
      subjects: insight.subjects,
      richText,
      originalIndex: insight.originalIndex,
    }
  })
}

function firstImpressionInsightCards(audits: SiteAudit[], fallbackSite: SiteAudit): DeepDiveInsightWithSubjects[] {
  const insights = crossSiteInsightsFor(audits, "firstImpression")
  if (insights.length > 0) return insights.slice(0, 3)
  return fallbackInsightCards(fallbackSite, "firstImpression").slice(0, 3).map((card) => ({ ...card, subjects: [] }))
}

export function getFirstImpressionSites(audits: SiteAudit[]): SiteAudit[] {
  const client = audits.find((a) => a.isClient) ?? audits[0]
  if (!client) return []
  const cards = firstImpressionInsightCards(audits, client)
  return firstImpressionScreenshotSites(audits, client, cards)
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
    let markedRichText = card.richText
    if (card.richText) {
      const blocks = card.richText.blocks.map((b, bi, arr) => {
        if (bi !== arr.length - 1) return b
        const runs = b.runs.map((r, ri, rarr) => {
          if (ri !== rarr.length - 1) return r
          return { ...r, text: `${r.text} ${marker}` }
        })
        return { ...b, runs }
      })
      markedRichText = { blocks }
    }
    return { ...card, body: `${card.body} ${marker}`, richText: markedRichText }
  })

  return { markedCards, principles }
}


function insightRow(
  elements: PresentationElement[],
  id: string,
  x: number,
  y: number,
  width: number,
  index: number,
  content: DeepDiveInsightCardContent,
  editInsight?: PresentationInsightRef
): number {
  const numW = 30
  const numGap = 14
  const textX = x + numW + numGap
  const textW = width - numW - numGap
  const bodySize = INSIGHT_CARD_BODY_SIZE

  const nonEmptyBlocks = content.richText
    ? content.richText.blocks.filter((b) => b.runs.some((r) => r.text.trim()))
    : null
  const textContent = nonEmptyBlocks
    ? nonEmptyBlocks.map((b) => b.runs.map((r) => r.text).join("")).join("\n")
    : content.body || content.headline
  const lineCount = estimateRenderedLineCount(textContent, textW, bodySize)
  const spaceYExtra = nonEmptyBlocks && nonEmptyBlocks.length > 1
    ? (nonEmptyBlocks.length - 1) * 0.45 * bodySize
    : 0
  const textH = Math.max(Math.ceil(lineCount * bodySize * 1.25 + spaceYExtra), bodySize + 6)

  elements.push(
    rect(`${id}-bg`, x, y, width, textH, "transparent", undefined, undefined, undefined, undefined, editInsight),
    text(`${id}-num`, x, y, numW, textH, `${index}.`, {
      fontSize: bodySize,
      fill: TEXT,
      weight: 700,
    }),
  )
  if (content.richText) {
    elements.push(
      text(`${id}-body`, textX, y, textW, textH, "", {
        fontSize: bodySize,
        fill: TEXT,
        weight: 400,
        richText: content.richText,
      })
    )
  } else {
    elements.push(
      text(`${id}-body`, textX, y, textW, textH, textContent, {
        fontSize: bodySize,
        fill: TEXT,
        weight: 400,
      })
    )
  }
  return textH
}


function estimateRenderedLineCount(value: string, width: number, fontSize: number, charWidthFactor = 0.56): number {
  const charsPerLine = Math.max(1, Math.floor(width / (fontSize * charWidthFactor)))
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
    const clean = value.replace(/\s+/g, " ").trim()
    const [headline, detail] = splitInsightText(value)
    return {
      headline: headline || clean,
      body: detail || headline || clean,
      richText: { blocks: [{ runs: [{ text: clean }] }] },
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
  const userVH = site.userImages?.visualHierarchy ?? []
  if (userVH.length >= 3) {
    return userVH.slice(0, 3)
  }
  // User-uploaded images take priority per slot; fill gaps from captured metrics
  const metricsShots = site.metrics.visualHierarchySectionScreenshots ?? []
  if (userVH.length > 0 || metricsShots.some(Boolean)) {
    const hero =
      userVH[0] ||
      metricsShots[0] ||
      site.userImages?.firstImpression ||
      site.userImages?.screenshot ||
      site.metrics.screenshot ||
      site.metrics.fullPageScreenshot
    const about =
      userVH[1] ||
      metricsShots[1] ||
      site.metrics.fullPageScreenshot ||
      site.userImages?.screenshot ||
      site.metrics.screenshot
    const relevant =
      userVH[2] ||
      metricsShots[2] ||
      userVH[0] ||
      site.metrics.visualHierarchyScreenshot ||
      screenshotFor(site, category)
    return [hero, about, relevant]
  }
  const hero =
    site.userImages?.firstImpression ||
    site.userImages?.screenshot ||
    site.metrics.screenshot ||
    site.metrics.fullPageScreenshot
  const about =
    site.metrics.fullPageScreenshot ||
    site.userImages?.screenshot ||
    site.metrics.screenshot
  const relevant =
    site.metrics.visualHierarchyScreenshot ||
    screenshotFor(site, category)

  return [hero, about, relevant]
}

function fullPageScreenshotFor(site: SiteAudit, category: DeepDiveCategoryKey): string {
  if (category === "firstImpression") {
    return site.userImages?.firstImpression || site.userImages?.screenshot || site.metrics.fullPageScreenshot || site.metrics.screenshot
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
    if (site.isClient) {
      const steps = signals?.taskCompletionClient?.steps
      if (steps?.length) {
        const captured = steps.filter((step) => step.screenshot).length
        return `Client task: ${steps.length} steps (${captured} screenshots captured).`
      }
      return "Client task flow not captured yet."
    }
    const s = signals?.taskCompletion
    return s ? `Ease: ${mini(s.ease)}, duration: ${mini(s.duration)}.` : "Task completion signals are not manually set yet."
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
