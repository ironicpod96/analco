import type { RichTextBlock, RichTextContent, RichTextRun } from "@/lib/types"

export type RichTextLine = {
  runs: RichTextRun[]
}

export function richTextFromPlainText(text: string): RichTextContent {
  const normalized = text.replace(/\r\n?/g, "\n")
  const blocks = normalized
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map<RichTextBlock>((block) => ({ runs: [{ text: block }] }))
  return { blocks: blocks.length > 0 ? blocks : [{ runs: [{ text: normalized.trim() }] }] }
}

export function plainTextFromRichText(content: RichTextContent | undefined): string {
  if (!content) return ""
  return content.blocks
    .map((block) => block.runs.map((run) => run.text).join(""))
    .join("\n\n")
    .trim()
}

export function richTextToHtml(content: RichTextContent | undefined): string {
  if (!content) return ""
  return content.blocks
    .map((block) => {
      const body = block.runs.map((run) => richRunToHtml(run)).join("")
      return `<p>${body || "<br>"}</p>`
    })
    .join("")
}

export function richTextFromHtml(html: string): RichTextContent {
  if (typeof window === "undefined") return richTextFromPlainText(html)
  const root = document.createElement("div")
  root.innerHTML = html
  const blocks = collectBlocks(root)
  return { blocks: blocks.length > 0 ? blocks : [{ runs: [{ text: "" }] }] }
}

export function wrapRichText(
  content: RichTextContent | undefined,
  width: number,
  fontSize: number
): RichTextLine[] {
  if (!content) return [{ runs: [{ text: "" }] }]
  const maxChars = Math.max(8, Math.floor(width / (fontSize * 0.55)))
  const lines: RichTextLine[] = []

  for (const block of content.blocks) {
    const tokens = tokenizeBlock(block)
    let current: RichTextRun[] = []
    let currentLength = 0

    for (const token of tokens) {
      const isWhitespace = /^\s+$/.test(token.text)
      const tokenLength = token.text.length
      if (isWhitespace) {
        if (current.length === 0) continue
        appendRun(current, token)
        currentLength += tokenLength
        continue
      }

      if (currentLength + tokenLength > maxChars && current.length > 0) {
        trimTrailingWhitespace(current)
        lines.push({ runs: current.length > 0 ? current : [{ text: "" }] })
        current = []
        currentLength = 0
      }

      appendRun(current, token)
      currentLength += tokenLength
    }

    trimTrailingWhitespace(current)
    lines.push({ runs: current.length > 0 ? current : [{ text: "" }] })
    lines.push({ runs: [{ text: "" }] })
  }

  if (lines.length > 0) lines.pop()
  return lines.length > 0 ? lines : [{ runs: [{ text: "" }] }]
}

export function richTextStyleRanges(content: RichTextContent | undefined): Array<{
  start: number
  end: number
  bold?: boolean
  italic?: boolean
}> {
  if (!content) return []
  const ranges: Array<{ start: number; end: number; bold?: boolean; italic?: boolean }> = []
  let index = 0
  content.blocks.forEach((block, blockIndex) => {
    block.runs.forEach((run) => {
      const start = index
      index += run.text.length
      if (run.bold || run.italic) {
        ranges.push({
          start,
          end: index,
          bold: run.bold,
          italic: run.italic,
        })
      }
    })
    if (blockIndex < content.blocks.length - 1) index += 2
  })
  return ranges.filter((range) => range.end > range.start)
}

function richRunToHtml(run: RichTextRun): string {
  let body = escapeHtml(run.text).replace(/\n/g, "<br>")
  if (run.italic) body = `<em>${body}</em>`
  if (run.bold) body = `<strong>${body}</strong>`
  return body
}

function tokenizeBlock(block: RichTextBlock): RichTextRun[] {
  const tokens: RichTextRun[] = []
  for (const run of block.runs) {
    for (const piece of run.text.split(/(\s+)/)) {
      if (!piece) continue
      tokens.push({ text: piece, bold: run.bold, italic: run.italic })
    }
  }
  return tokens
}

function appendRun(target: RichTextRun[], next: RichTextRun) {
  const last = target[target.length - 1]
  if (last && last.bold === next.bold && last.italic === next.italic) {
    last.text += next.text
    return
  }
  target.push({ ...next })
}

function trimTrailingWhitespace(runs: RichTextRun[]) {
  while (runs.length > 0) {
    const last = runs[runs.length - 1]
    const trimmed = last.text.replace(/\s+$/g, "")
    if (trimmed) {
      last.text = trimmed
      return
    }
    runs.pop()
  }
}

function collectBlocks(root: HTMLElement): RichTextBlock[] {
  const blockElements = Array.from(root.childNodes).flatMap((node) => {
    if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node as HTMLElement
      if (el.tagName === "P" || el.tagName === "DIV") return [el]
    }
    if (node.nodeType === Node.TEXT_NODE && node.textContent?.trim()) {
      const wrapper = document.createElement("p")
      wrapper.textContent = node.textContent
      return [wrapper]
    }
    return []
  })

  if (blockElements.length === 0 && root.textContent?.trim()) {
    return [{ runs: [{ text: root.textContent.trim() }] }]
  }

  return blockElements.map((block) => ({
    runs: collectRuns(block).filter((run) => run.text.length > 0),
  })).filter((block) => block.runs.length > 0)
}

function collectRuns(node: Node, marks: Pick<RichTextRun, "bold" | "italic"> = {}): RichTextRun[] {
  if (node.nodeType === Node.TEXT_NODE) {
    return [{ text: node.textContent ?? "", ...marks }]
  }

  if (node.nodeType !== Node.ELEMENT_NODE) return []
  const el = node as HTMLElement
  if (el.tagName === "BR") return [{ text: "\n", ...marks }]

  const nextMarks = {
    bold: marks.bold || el.tagName === "B" || el.tagName === "STRONG",
    italic: marks.italic || el.tagName === "I" || el.tagName === "EM",
  }

  const runs = Array.from(el.childNodes).flatMap((child) => collectRuns(child, nextMarks))
  return mergeRuns(runs)
}

function mergeRuns(runs: RichTextRun[]): RichTextRun[] {
  const merged: RichTextRun[] = []
  runs.forEach((run) => appendRun(merged, run))
  return merged
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}
