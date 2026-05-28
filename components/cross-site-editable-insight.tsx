"use client"

import { Bold, Copy, Italic, Pencil, RefreshCw, Trash2 } from "lucide-react"
import { useEffect, useRef, useState, type ComponentProps } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import type { CrossSiteInsight } from "@/lib/analytics"
import type { KnowledgeEntry, PrincipleRef, RichTextContent } from "@/lib/types"
import { cn } from "@/lib/utils"

function richTextToPlain(richText: NonNullable<CrossSiteInsight["richText"]>): string {
  return richText.blocks.map((b) => b.runs.map((r) => r.text).join("")).join("\n")
}

function richTextToHtml(content: RichTextContent): string {
  return content.blocks
    .map((block) => {
      const inner = block.runs
        .map((run) => {
          let text = run.text
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
          if (run.bold && run.italic) text = `<strong><em>${text}</em></strong>`
          else if (run.bold) text = `<strong>${text}</strong>`
          else if (run.italic) text = `<em>${text}</em>`
          return text
        })
        .join("")
      return `<div>${inner || "<br>"}</div>`
    })
    .join("")
}

function htmlToRichText(html: string): RichTextContent {
  const container = document.createElement("div")
  container.innerHTML = html

  const blocks: RichTextContent["blocks"] = []
  let currentRuns: RichTextContent["blocks"][0]["runs"] = []

  function flush() {
    if (currentRuns.length > 0) {
      blocks.push({ runs: currentRuns })
      currentRuns = []
    }
  }

  function processNode(node: Node, bold: boolean, italic: boolean) {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent ?? ""
      if (text) {
        currentRuns.push({
          text,
          ...(bold ? { bold: true } : {}),
          ...(italic ? { italic: true } : {}),
        })
      }
      return
    }
    if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node as Element
      const tag = el.tagName.toLowerCase()
      if (tag === "br") {
        flush()
        return
      }
      if (tag === "div") {
        if (currentRuns.length > 0) flush()
        for (const child of el.childNodes) processNode(child, bold, italic)
        flush()
        return
      }
      const b = bold || tag === "b" || tag === "strong"
      const i = italic || tag === "i" || tag === "em"
      for (const child of el.childNodes) processNode(child, b, i)
    }
  }

  for (const child of container.childNodes) processNode(child, false, false)
  flush()

  if (blocks.length === 0) blocks.push({ runs: [{ text: "" }] })
  return { blocks }
}

function plainToRichText(text: string): RichTextContent {
  const blocks = text.split("\n").map((line) => ({ runs: [{ text: line }] }))
  return { blocks: blocks.length > 0 ? blocks : [{ runs: [{ text: "" }] }] }
}

function RichTextEditor({
  initial,
  onChange,
}: {
  initial: RichTextContent
  onChange: (content: RichTextContent) => void
}) {
  const editorRef = useRef<HTMLDivElement>(null)
  const [bold, setBold] = useState(false)
  const [italic, setItalic] = useState(false)

  useEffect(() => {
    if (editorRef.current) {
      editorRef.current.innerHTML = richTextToHtml(initial)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    function handleSelection() {
      setBold(document.queryCommandState("bold"))
      setItalic(document.queryCommandState("italic"))
    }
    document.addEventListener("selectionchange", handleSelection)
    return () => document.removeEventListener("selectionchange", handleSelection)
  }, [])

  function applyFormat(format: "bold" | "italic") {
    editorRef.current?.focus()
    document.execCommand(format)
    if (editorRef.current) onChange(htmlToRichText(editorRef.current.innerHTML))
  }

  return (
    <div className="overflow-hidden rounded-md border border-input focus-within:ring-2 focus-within:ring-ring/45">
      <div className="flex items-center gap-0.5 border-b border-input px-1.5 py-1">
        <button
          type="button"
          onMouseDown={(e) => { e.preventDefault(); applyFormat("bold") }}
          className={cn(
            "inline-flex h-6 w-6 items-center justify-center rounded text-xs font-bold transition hover:bg-accent",
            bold ? "bg-accent text-foreground" : "text-muted-foreground"
          )}
          title="Bold (⌘B)"
        >
          <Bold className="h-3 w-3" />
        </button>
        <button
          type="button"
          onMouseDown={(e) => { e.preventDefault(); applyFormat("italic") }}
          className={cn(
            "inline-flex h-6 w-6 items-center justify-center rounded text-xs transition hover:bg-accent",
            italic ? "bg-accent text-foreground" : "text-muted-foreground"
          )}
          title="Italic (⌘I)"
        >
          <Italic className="h-3 w-3" />
        </button>
      </div>
      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        onInput={() => {
          if (editorRef.current) onChange(htmlToRichText(editorRef.current.innerHTML))
        }}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === "b") {
            e.preventDefault()
            applyFormat("bold")
          }
          if ((e.metaKey || e.ctrlKey) && e.key === "i") {
            e.preventDefault()
            applyFormat("italic")
          }
        }}
        className="min-h-[160px] px-3 py-2 text-sm leading-relaxed outline-none [&_strong]:font-semibold [&_em]:italic"
      />
    </div>
  )
}

export function CrossSiteEditableInsight({
  insight,
  knowledgeEntries,
  onSave,
  onDelete,
  onRewrite,
}: {
  insight: CrossSiteInsight
  knowledgeEntries: KnowledgeEntry[]
  onSave: (next: { headline: string; text: string; richText: RichTextContent; principle: PrincipleRef | null }) => void
  onDelete?: () => void
  onRewrite?: () => Promise<void>
}) {
  const [open, setOpen] = useState(false)
  const [rewriting, setRewriting] = useState(false)

  async function copyText() {
    const value = insight.richText
      ? richTextToPlain(insight.richText)
      : `${insight.headline} ${insight.text}`.trim()
    if (!value) return
    try {
      await navigator.clipboard.writeText(value)
      toast.success("Copied")
    } catch {
      toast.error("Copy failed")
    }
  }

  const actions = (
    <div className="absolute right-0 top-0 flex items-center gap-1 opacity-0 transition-opacity group-hover/insight:opacity-100 group-focus-within/insight:opacity-100">
      <IconAction aria-label="Copy insight" title="Copy" onClick={copyText}>
        <Copy className="h-3 w-3" />
      </IconAction>
      {onRewrite && (
        <IconAction
          aria-label="Rewrite insight"
          title="Rewrite with AI"
          disabled={rewriting}
          onClick={async () => {
            setRewriting(true)
            try { await onRewrite() } finally { setRewriting(false) }
          }}
        >
          <RefreshCw className={cn("h-3 w-3", rewriting && "animate-spin")} />
        </IconAction>
      )}
      <IconAction aria-label="Edit insight" title="Edit" onClick={() => setOpen(true)}>
        <Pencil className="h-3 w-3" />
      </IconAction>
    </div>
  )

  return (
    <>
      <div className="group/insight text-sm leading-snug text-muted-foreground">
        <div className="relative pr-14">
          <p className="text-foreground">
            {insight.richText
              ? insight.richText.blocks.flatMap((block, bi) =>
                  block.runs.map((run, ri) =>
                    run.bold
                      ? <strong key={`${bi}-${ri}`}>{run.text}</strong>
                      : <span key={`${bi}-${ri}`}>{run.text}</span>
                  )
                )
              : insight.text}
            {insight.principle?.url && insight.principle.title ? (
              <>
                {" "}
                <a
                  href={insight.principle.url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex h-5 max-w-full align-baseline items-center rounded-full border border-foreground/15 bg-foreground/5 px-2 text-[11px] font-medium leading-none text-foreground/80 transition hover:border-foreground/40 hover:bg-foreground/10 hover:text-foreground"
                  title={`${insight.principle.title} - open reference`}
                >
                  {insight.principle.title}
                </a>
              </>
            ) : null}
          </p>
          {actions}
        </div>
      </div>
      <InsightEditorDialog
        key={`${insight.text}|${open ? "open" : "closed"}`}
        open={open}
        onOpenChange={setOpen}
        insight={insight}
        knowledgeEntries={knowledgeEntries}
        onSave={(next) => {
          onSave(next)
          setOpen(false)
        }}
        onDelete={onDelete ? () => { onDelete(); setOpen(false) } : undefined}
      />
    </>
  )
}

export function InsightEditorDialog({
  open,
  onOpenChange,
  insight,
  knowledgeEntries,
  onSave,
  onDelete,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  insight: CrossSiteInsight
  knowledgeEntries: KnowledgeEntry[]
  onSave: (next: { headline: string; text: string; richText: RichTextContent; principle: PrincipleRef | null }) => void
  onDelete?: () => void
}) {
  const initialRichText: RichTextContent = insight.richText ?? plainToRichText(insight.text)
  const [richText, setRichText] = useState<RichTextContent>(initialRichText)
  const [principleUrl, setPrincipleUrl] = useState<string>(insight.principle?.url ?? "")
  const [confirmDelete, setConfirmDelete] = useState(false)

  const selectedEntry = knowledgeEntries.find((e) => e.url === principleUrl) ?? null

  function handleSave() {
    const principle: PrincipleRef | null = selectedEntry
      ? { title: selectedEntry.title, url: selectedEntry.url }
      : null
    const text = richText.blocks.map((b) => b.runs.map((r) => r.text).join("")).join("\n").trim()
    onSave({ headline: "", text: text || insight.text, richText, principle })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl" hideClose>
        {onDelete && (
          <button
            type="button"
            aria-label="Delete insight"
            onClick={() => setConfirmDelete(true)}
            className="absolute right-4 top-4 rounded-sm text-muted-foreground opacity-70 transition-opacity hover:text-destructive hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        )}
        <div className="space-y-1">
          <DialogTitle>Edit insight</DialogTitle>
        </div>
        {confirmDelete && (
          <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm">
            <p className="font-medium text-destructive">Delete this insight?</p>
            <p className="mt-1 text-muted-foreground">It will be removed from the deep dive slide. You can&apos;t undo this in the current session.</p>
            <div className="mt-3 flex justify-end gap-2">
              <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(false)}>
                Cancel
              </Button>
              <Button
                size="sm"
                variant="destructive"
                onClick={() => {
                  onDelete?.()
                  setConfirmDelete(false)
                }}
              >
                Delete
              </Button>
            </div>
          </div>
        )}
        <div className="space-y-4">
          <RichTextEditor key={open ? "open" : "closed"} initial={initialRichText} onChange={setRichText} />
          <div className="space-y-2">
            <div className="text-sm font-medium text-foreground">Knowledge reference</div>
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => setPrincipleUrl("")}
                className={cn(
                  "inline-flex h-6 items-center rounded-full border px-2.5 text-xs font-medium transition",
                  principleUrl === ""
                    ? "border-foreground/40 bg-foreground/10 text-foreground"
                    : "border-foreground/15 bg-foreground/5 text-foreground/60 hover:border-foreground/30 hover:text-foreground/80"
                )}
              >
                None
              </button>
              {knowledgeEntries.map((entry) => (
                <button
                  key={entry.id}
                  type="button"
                  onClick={() => setPrincipleUrl(entry.url)}
                  className={cn(
                    "inline-flex h-6 items-center rounded-full border px-2.5 text-xs font-medium transition",
                    principleUrl === entry.url
                      ? "border-foreground/40 bg-foreground/10 text-foreground"
                      : "border-foreground/15 bg-foreground/5 text-foreground/60 hover:border-foreground/30 hover:text-foreground/80"
                  )}
                >
                  {entry.title}
                </button>
              ))}
            </div>
            {selectedEntry?.blurb && (
              <div className="rounded-md border border-foreground/10 bg-muted/50 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
                {selectedEntry.blurb}
              </div>
            )}
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave}>Save</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function IconAction(props: ComponentProps<"button">) {
  return (
    <button
      type="button"
      {...props}
      className={cn(
        "inline-flex size-5 items-center justify-center rounded text-muted-foreground transition hover:text-foreground active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/45",
        props.className
      )}
    />
  )
}
