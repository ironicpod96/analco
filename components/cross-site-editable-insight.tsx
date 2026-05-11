"use client"

import { Copy, Pencil } from "lucide-react"
import { useState, type ComponentProps } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import type { CrossSiteInsight } from "@/lib/analytics"
import type { KnowledgeEntry, PrincipleRef } from "@/lib/types"
import { cn } from "@/lib/utils"

export function CrossSiteEditableInsight({
  insight,
  knowledgeEntries,
  onSave,
}: {
  insight: CrossSiteInsight
  knowledgeEntries: KnowledgeEntry[]
  onSave: (next: { headline: string; text: string; principle: PrincipleRef | null }) => void
}) {
  const [open, setOpen] = useState(false)

  async function copyText() {
    const value = `${insight.headline} ${insight.text}`.trim()
    if (!value) return
    try {
      await navigator.clipboard.writeText(value)
      toast.success("Copied")
    } catch {
      toast.error("Copy failed")
    }
  }

  return (
    <>
      <div className="group/insight text-sm leading-snug text-muted-foreground">
        <div className="relative pr-14">
          <p className="font-semibold text-foreground">{insight.headline}</p>
          <div className="absolute right-0 top-0 flex items-center gap-1 opacity-0 transition-opacity group-hover/insight:opacity-100 group-focus-within/insight:opacity-100">
            <IconAction aria-label="Copy insight" title="Copy" onClick={copyText}>
              <Copy className="h-3 w-3" />
            </IconAction>
            <IconAction aria-label="Edit insight" title="Edit" onClick={() => setOpen(true)}>
              <Pencil className="h-3 w-3" />
            </IconAction>
          </div>
        </div>
        <div className="h-2" />
        <p>
          {insight.text}
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
      </div>
      <InsightEditorDialog
        key={`${insight.headline}|${insight.text}|${open ? "open" : "closed"}`}
        open={open}
        onOpenChange={setOpen}
        insight={insight}
        knowledgeEntries={knowledgeEntries}
        onSave={(next) => {
          onSave(next)
          setOpen(false)
        }}
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
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  insight: CrossSiteInsight
  knowledgeEntries: KnowledgeEntry[]
  onSave: (next: { headline: string; text: string; principle: PrincipleRef | null }) => void
}) {
  const [headline, setHeadline] = useState(insight.headline)
  const [text, setText] = useState(insight.text)
  const [principleUrl, setPrincipleUrl] = useState<string>(insight.principle?.url ?? "")

  // Find knowledge entries in the same category as the current principle
  const matchedEntry = knowledgeEntries.find((e) => e.url === insight.principle?.url)
  const categoryEntries = matchedEntry
    ? knowledgeEntries.filter((e) => e.category === matchedEntry.category)
    : []

  const selectedEntry = categoryEntries.find((e) => e.url === principleUrl) ?? null

  function handleSave() {
    const principle: PrincipleRef | null = selectedEntry
      ? { title: selectedEntry.title, url: selectedEntry.url }
      : null
    onSave({
      headline: headline.trim() || insight.headline,
      text: text.trim() || insight.text,
      principle,
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <div className="space-y-1">
          <DialogTitle>Edit insight</DialogTitle>
        </div>
        <div className="space-y-4">
          <div className="space-y-2">
            <div className="text-sm font-medium text-foreground">Heading</div>
            <Input value={headline} onChange={(event) => setHeadline(event.target.value)} />
          </div>
          <div className="space-y-2">
            <div className="text-sm font-medium text-foreground">Description</div>
            <Textarea
              value={text}
              onChange={(event) => setText(event.target.value)}
              rows={7}
              className="min-h-[160px] resize-none text-sm leading-relaxed"
            />
          </div>
          {categoryEntries.length > 0 && (
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
                {categoryEntries.map((entry) => (
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
          )}
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
