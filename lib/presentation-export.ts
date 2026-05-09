"use client"

import type { PresentationElement, PresentationSlide } from "@/lib/presentation"

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
  const svg = slideToSvg(slide)
  const blob = new Blob([svg], { type: "image/svg+xml" })
  const url = URL.createObjectURL(blob)
  try {
    const image = await loadImage(url)
    const canvas = document.createElement("canvas")
    canvas.width = slide.width
    canvas.height = slide.height
    const ctx = canvas.getContext("2d")
    if (!ctx) throw new Error("Could not create canvas context")
    ctx.fillStyle = slide.background
    ctx.fillRect(0, 0, slide.width, slide.height)
    ctx.drawImage(image, 0, 0)
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
    return `<rect x="${element.x}" y="${element.y}" width="${element.width}" height="${element.height}" fill="${escapeAttr(element.fill)}"${stroke}${dash}/>`
  }
  if (element.type === "image") {
    return `<image href="${escapeAttr(element.url)}" x="${element.x}" y="${element.y}" width="${element.width}" height="${element.height}" preserveAspectRatio="xMidYMid meet"/>`
  }
  if (element.type === "line") {
    const dash = element.dash ? ` stroke-dasharray="${element.dash.join(" ")}"` : ""
    return `<line x1="${element.x1}" y1="${element.y1}" x2="${element.x2}" y2="${element.y2}" stroke="${escapeAttr(element.stroke)}" stroke-width="${element.strokeWidth}"${dash}/>`
  }

  const anchor = element.align === "center" ? "middle" : element.align === "right" ? "end" : "start"
  const x =
    element.align === "center"
      ? element.x + element.width / 2
      : element.align === "right"
        ? element.x + element.width
        : element.x
  const y =
    element.valign === "middle"
      ? element.y + element.height / 2 + element.fontSize * 0.34
      : element.valign === "bottom"
        ? element.y + element.height
        : element.y + element.fontSize
  const lines = wrapText(element.text, Math.max(1, element.width), element.fontSize)
  const lineHeight = element.fontSize * 1.16
  const startY = y - ((lines.length - 1) * lineHeight) / 2
  return lines
    .map(
      (line, i) =>
        `<text x="${x}" y="${startY + i * lineHeight}" text-anchor="${anchor}" font-size="${element.fontSize}" font-weight="${element.weight ?? 400}" fill="${escapeAttr(element.fill)}">${escapeText(line)}</text>`
    )
    .join("")
}

function wrapText(text: string, width: number, fontSize: number): string[] {
  const words = text.split(/\s+/)
  const maxChars = Math.max(8, Math.floor(width / (fontSize * 0.55)))
  const lines: string[] = []
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
  return lines
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
