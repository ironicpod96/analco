import { effectiveScore, RUBRIC_LABELS } from "@/lib/rubric"
import type { RubricKey, SiteAudit } from "@/lib/types"

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
}

export type PresentationText = {
  type: "text"
  id: string
  x: number
  y: number
  width: number
  height: number
  text: string
  fill: string
  fontSize: number
  weight?: 400 | 500 | 600 | 700 | 800
  align?: "left" | "center" | "right"
  valign?: "top" | "middle" | "bottom"
}

export type PresentationImage = {
  type: "image"
  id: string
  x: number
  y: number
  width: number
  height: number
  url: string
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

export type PresentationElement = PresentationRect | PresentationText | PresentationImage | PresentationLine

export type PresentationSlide = {
  id: string
  title: string
  width: number
  height: number
  background: string
  fontFamily: "Montserrat"
  elements: PresentationElement[]
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

const TONE_FILL: Record<PresentationTone, string> = {
  yes: "#35AE58",
  somewhat: "#FF9902",
  no: "#FF0000",
  na: "#A6A6A6",
}

const GRID_STROKE = "#D9D9D9"
const TEXT = "#111111"
const MUTED = "#8B8B8B"
const ACCENT = "#E43F4A"

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
      const tone = toneForPresentation(effectiveScore(site.rubric[key]))
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

export function toneForPresentation(score: number | null): PresentationTone {
  if (score == null) return "na"
  if (score >= 4) return "yes"
  if (score >= 3) return "somewhat"
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
  return value == null ? "N/A" : `${Math.round((value / 5) * 100)}%`
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
  dash?: number[]
): PresentationRect {
  return { type: "rect", id, x, y, width, height, fill, stroke, strokeWidth, dash }
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
  url: string
): PresentationImage {
  return { type: "image", id, x, y, width, height, url }
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
