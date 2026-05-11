"use client"

import type { PresentationElement, PresentationSlide } from "@/lib/presentation"
import { wrapRichText } from "@/lib/rich-text"

export function slideToSvg(slide: PresentationSlide): string {
  const body = slide.elements.map((element) => elementToSvg(element)).join("")
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${slide.width}" height="${slide.height}" viewBox="0 0 ${slide.width} ${slide.height}">`,
    `<rect width="${slide.width}" height="${slide.height}" fill="${slide.background}"/>`,
    `<g font-family="${escapeAttr(slide.fontFamily)}, Arial, sans-serif">${body}</g>`,
    "</svg>",
  ].join("")
}

export function downloadSvg(slide: PresentationSlide): void {
  downloadBlob(`${safeName(slide.title)}.svg`, new Blob([slideToSvg(slide)], { type: "image/svg+xml" }))
}

export async function downloadPng(slide: PresentationSlide): Promise<void> {
  const scale = 2
  const svg = slideToSvg(slide)
  const blob = new Blob([svg], { type: "image/svg+xml" })
  const url = URL.createObjectURL(blob)
  try {
    const image = await loadImage(url)
    const canvas = document.createElement("canvas")
    canvas.width = slide.width * scale
    canvas.height = slide.height * scale
    const ctx = canvas.getContext("2d")
    if (!ctx) throw new Error("Could not create canvas context")
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = "high"
    ctx.fillStyle = slide.background
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height)
    const png = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((next) => (next ? resolve(next) : reject(new Error("Could not create PNG"))), "image/png")
    })
    downloadBlob(`${safeName(slide.title)}.png`, png)
  } finally {
    URL.revokeObjectURL(url)
  }
}

function elementToSvg(element: PresentationElement): string {
  if (element.type === "rect") {
    const stroke = element.stroke
      ? ` stroke="${escapeAttr(element.stroke)}" stroke-width="${element.strokeWidth ?? 1}"`
      : ""
    const dash = element.dash ? ` stroke-dasharray="${element.dash.join(" ")}"` : ""
    const radius = element.borderRadius ? ` rx="${element.borderRadius}" ry="${element.borderRadius}"` : ""
    return `<rect x="${element.x}" y="${element.y}" width="${element.width}" height="${element.height}"${radius} fill="${escapeAttr(element.fill)}"${stroke}${dash}/>`
  }
  if (element.type === "image") {
    const preserve = element.objectFit === "cover" ? "xMidYMid slice" : "xMidYMid meet"
    return `<image href="${escapeAttr(element.url)}" x="${element.x}" y="${element.y}" width="${element.width}" height="${element.height}" preserveAspectRatio="${preserve}"/>`
  }
  if (element.type === "line") {
    const dash = element.dash ? ` stroke-dasharray="${element.dash.join(" ")}"` : ""
    return `<line x1="${element.x1}" y1="${element.y1}" x2="${element.x2}" y2="${element.y2}" stroke="${escapeAttr(element.stroke)}" stroke-width="${element.strokeWidth}"${dash}/>`
  }
  if (element.type === "mosaic") {
    return mosaicToSvg(element)
  }
  if (element.type === "radialChart") {
    return radialChartToSvg(element)
  }

  const anchor = element.align === "center" ? "middle" : element.align === "right" ? "end" : "start"
  const x =
    element.align === "center"
      ? element.x + element.width / 2
      : element.align === "right"
        ? element.x + element.width
        : element.x
  const lines: Array<Array<{ text: string; bold?: boolean; italic?: boolean }>> = element.richText
    ? wrapRichText(element.richText, Math.max(1, element.width), element.fontSize).map((line) => line.runs)
    : wrapTextPreserveLines(element.text, Math.max(1, element.width), element.fontSize).map((line) => [{ text: line }])
  const lineHeight = element.fontSize * 1.16
  const blockHeight = element.fontSize + Math.max(0, lines.length - 1) * lineHeight
  const startY =
    element.valign === "middle"
      ? element.y + (element.height - blockHeight) / 2 + element.fontSize
      : element.valign === "bottom"
        ? element.y + element.height - blockHeight + element.fontSize
        : element.y + element.fontSize
  const body = lines
    .map((line, i) => {
      const spans = line
        .map((run) => {
          const styles = [
            `font-weight="${run.bold ? 700 : (element.weight ?? 400)}"`,
            run.italic ? `font-style="italic"` : "",
          ]
            .filter(Boolean)
            .join(" ")
          return `<tspan ${styles}>${escapeText(run.text)}</tspan>`
        })
        .join("")
      return `<text x="${x}" y="${startY + i * lineHeight}" text-anchor="${anchor}" font-size="${element.fontSize}" fill="${escapeAttr(element.fill)}" xml:space="preserve">${spans}</text>`
    })
    .join("")
  return element.href ? `<a href="${escapeAttr(element.href)}" target="_blank">${body}</a>` : body
}

function mosaicToSvg(element: Extract<PresentationElement, { type: "mosaic" }>): string {
  const colors = ["#111111", "#FE0022", "#D9D9D9", "#F6F6F6"]
  const gap = 8
  const col = (element.width - gap * 3) / 4
  const row = (element.height - gap * 2) / 3
  const rects: string[] = []
  for (let i = 0; i < 12; i += 1) {
    const c = i % 4
    const r = Math.floor(i / 4)
    const spanC = i === 0 || i === 7 ? 2 : 1
    const spanR = i === 0 ? 2 : 1
    rects.push(
      `<rect x="${element.x + c * (col + gap)}" y="${element.y + r * (row + gap)}" width="${col * spanC + gap * (spanC - 1)}" height="${row * spanR + gap * (spanR - 1)}" rx="4" ry="4" fill="${colors[i % colors.length]}"/>`
    )
  }
  return rects.join("")
}

function radialChartToSvg(element: Extract<PresentationElement, { type: "radialChart" }>): string {
  const cx = element.x + element.width / 2
  const cy = element.y + element.height / 2
  const radius = Math.min(element.width, element.height) * 0.36
  const strokeWidth = radius * 0.14
  const circumference = 2 * Math.PI * radius
  const dash = (Math.max(0, Math.min(100, element.value)) / 100) * circumference
  return [
    `<circle cx="${cx}" cy="${cy}" r="${radius}" fill="none" stroke="#EEEEEE" stroke-width="${strokeWidth}"/>`,
    `<circle cx="${cx}" cy="${cy}" r="${radius}" fill="none" stroke="${escapeAttr(element.color)}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-dasharray="${dash} ${circumference - dash}" transform="rotate(-90 ${cx} ${cy})"/>`,
    `<text x="${cx}" y="${cy - element.width * 0.02}" text-anchor="middle" font-size="${element.width * 0.16}" font-weight="800" fill="#111111">${escapeText(element.centerLabel)}</text>`,
    element.subLabel
      ? radialSubLabelToSvg(element.subLabel, cx, cy + element.width * 0.09, element.width * 0.04)
      : "",
    element.footerLabel
      ? `<text x="${cx}" y="${cy + element.width * 0.18}" text-anchor="middle" font-size="${element.width * 0.038}" font-weight="500" fill="#8B8B8B">${escapeText(element.footerLabel)}</text>`
      : "",
  ].join("")
}

function radialSubLabelToSvg(value: string, x: number, y: number, fontSize: number): string {
  const lines = value.split("\n")
  const tspans = lines
    .map((line, i) => `<tspan x="${x}" dy="${i === 0 ? 0 : fontSize * 1.18}">${escapeText(line)}</tspan>`)
    .join("")
  return `<text x="${x}" y="${y}" text-anchor="middle" font-size="${fontSize}" font-weight="600" fill="#666666">${tspans}</text>`
}

function wrapTextPreserveLines(text: string, width: number, fontSize: number): string[] {
  const maxChars = Math.max(8, Math.floor(width / (fontSize * 0.55)))
  const lines: string[] = []

  for (const rawLine of text.split("\n")) {
    const trimmed = rawLine.trim()
    if (!trimmed) {
      lines.push("")
      continue
    }

    const words = trimmed.split(/\s+/)
    let current = ""
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word
      if (candidate.length > maxChars && current) {
        lines.push(current)
        current = word
      } else {
        current = candidate
      }
    }
    if (current) lines.push(current)
  }

  return lines.length > 0 ? lines : [""]
}

function downloadBlob(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error("Could not load generated SVG"))
    img.src = src
  })
}

function safeName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "slide"
}

function escapeAttr(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;")
}

function escapeText(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
}
