"use client"

import { Check, Copy, Loader2, Pencil, RefreshCw, X } from "lucide-react"
import { Fragment, useEffect, useRef, useState, type ComponentProps, type ReactNode } from "react"
import { toast } from "sonner"

import { ReanalyseMotion } from "@/components/reanalyse-motion"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"
import type { PrincipleRef } from "@/lib/types"

export function EditableInsight({
  value,
  placeholder,
  onSave,
  onEditingChange,
  onReanalyse,
  reanalysing,
  copyLabel,
  className,
  principles,
}: {
  value: string
  placeholder?: string
  onSave: (next: string) => void
  onEditingChange?: (editing: boolean) => void
  onReanalyse?: () => void
  reanalysing?: boolean
  copyLabel?: string
  className?: string
  principles?: PrincipleRef[]
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const ref = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (!editing) queueMicrotask(() => setDraft(value))
  }, [value, editing])

  useEffect(() => {
    if (editing) {
      ref.current?.focus()
      ref.current?.select()
    }
  }, [editing])

  useEffect(() => {
    onEditingChange?.(editing)
  }, [editing, onEditingChange])

  function commit() {
    const trimmed = draft.trim()
    if (trimmed && trimmed !== value.trim()) onSave(trimmed)
    setEditing(false)
  }

  function cancel() {
    setDraft(value)
    setEditing(false)
  }

  async function copyText() {
    const text = formatCopyText(copyLabel, value || placeholder || "")
    if (!text.trim()) return
    try {
      await navigator.clipboard.writeText(text)
      toast.success("Copied")
    } catch {
      toast.error("Copy failed")
    }
  }

  if (editing) {
    return (
      <div className={cn("space-y-2.5", className)}>
        <Textarea
          ref={ref}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault()
              commit()
            }
            if (e.key === "Escape") {
              e.preventDefault()
              cancel()
            }
          }}
          rows={3}
          className="min-h-[60px] resize-none text-xs leading-snug"
          placeholder={placeholder}
        />
        <div className="flex gap-1.5">
          <Button size="sm" variant="default" className="h-6 px-2 text-xs" onClick={commit}>
            <Check className="h-3 w-3" />
            OK
          </Button>
          <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={cancel}>
            <X className="h-3 w-3" />
            Cancel
          </Button>
        </div>
      </div>
    )
  }

  const isUnparseable = value.trim() === "Unable to assess. Page cannot be parsed."

  return (
    <div
      className={cn(
        "group/insight relative w-full rounded py-1 text-left text-xs leading-snug text-muted-foreground",
        !value && "italic",
        isUnparseable &&
          "rounded-md bg-orange-500/20 px-2 py-1.5 font-medium text-orange-700 dark:text-orange-300",
        className
      )}
    >
      <ReanalyseMotion active={reanalysing}>
        <div>
          {value ? <MarkdownText text={value} /> : (placeholder || "Click to add note")}
        </div>
        {value && principles && principles.length > 0 && (
          <PrincipleBadges principles={principles} />
        )}
      </ReanalyseMotion>
      <div className="absolute -top-7 right-0 flex items-center gap-1 opacity-0 transition-opacity group-hover/row:opacity-100 group-focus-within/row:opacity-100 group-hover/insight:opacity-100 group-focus-within/insight:opacity-100">
        <IconAction
          type="button"
          aria-label={copyLabel ? `Copy ${copyLabel}` : "Copy text"}
          title="Copy"
          onClick={copyText}
        >
          <Copy className="h-3 w-3" />
        </IconAction>
        <IconAction
          type="button"
          aria-label={copyLabel ? `Edit ${copyLabel}` : "Edit text"}
          title="Edit"
          onClick={() => setEditing(true)}
        >
          <Pencil className="h-3 w-3" />
        </IconAction>
        {onReanalyse && (
          <IconAction
            type="button"
            aria-label={copyLabel ? `Reanalyse ${copyLabel}` : "Reanalyse"}
            title="Reanalyse"
            onClick={onReanalyse}
            disabled={reanalysing}
          >
            {reanalysing ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <RefreshCw className="h-3 w-3" />
            )}
          </IconAction>
        )}
      </div>
    </div>
  )
}

export function PrincipleBadges({ principles }: { principles: PrincipleRef[] }) {
  if (principles.length === 0) return null
  return (
    <div className="mt-1.5 flex flex-wrap justify-end gap-1">
      {principles.map((p) => (
        <a
          key={`${p.title}-${p.url}`}
          href={p.url}
          target="_blank"
          rel="noreferrer"
          className="inline-flex h-5 items-center rounded-full border border-foreground/15 bg-foreground/5 px-2 text-[11px] font-medium text-foreground/80 transition hover:border-foreground/40 hover:bg-foreground/10 hover:text-foreground"
          title={`${p.title} — open reference`}
        >
          {p.title}
        </a>
      ))}
    </div>
  )
}

function IconAction(props: ComponentProps<"button">) {
  return (
    <button
      {...props}
      className={cn(
        "inline-flex size-5 items-center justify-center rounded text-muted-foreground transition hover:text-foreground active:scale-95 disabled:pointer-events-none disabled:opacity-45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/45",
        props.className
      )}
    />
  )
}

function formatCopyText(label: string | undefined, text: string): string {
  const cleaned = text.trim()
  if (!label) return cleaned
  return cleaned ? `${label}: ${cleaned}` : label
}

function MarkdownText({ text }: { text: string }) {
  const blocks = text.split(/\n{2,}/).map((b) => b.trim()).filter(Boolean)
  return (
    <div className="space-y-2.5">
      {blocks.map((block, i) => renderBlock(block, i))}
    </div>
  )
}

function renderBlock(block: string, key: number): ReactNode {
  const lines = block.split("\n")
  const isList = lines.every((l) => /^\s*[-•*]\s+/.test(l))
  if (isList) {
    return (
      <ul key={key} className="space-y-1">
        {lines.map((l, i) => {
          let text = l.replace(/^\s*[-•*]\s+/, "").trim()
          let icon = <div className="mt-[0.4rem] h-1 w-1 shrink-0 rounded-full bg-muted-foreground/60" />
          
          if (text.startsWith("😍")) {
            text = text.replace(/^😍\s*/, "")
            icon = <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          } else if (text.startsWith("🤔")) {
            text = text.replace(/^🤔\s*/, "")
            icon = <X className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          }

          return (
            <li key={i} className="flex items-start gap-1.5">
              {icon}
              <div className="flex-1 leading-snug">{renderInline(text)}</div>
            </li>
          )
        })}
      </ul>
    )
  }
  return (
    <p key={key} className="leading-snug">
      {lines.map((l, i) => (
        <Fragment key={i}>
          {i > 0 && <br />}
          {renderInline(l)}
        </Fragment>
      ))}
    </p>
  )
}

const INLINE_RE = /(\*\*[^*\n]+\*\*|__[^_\n]+__|\*[^*\n]+\*|_[^_\n]+_|`[^`\n]+`)/g

function renderInline(text: string): ReactNode {
  const parts: ReactNode[] = []
  let lastIndex = 0
  let match: RegExpExecArray | null
  let i = 0
  while ((match = INLINE_RE.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index))
    }
    const token = match[0]
    if (token.startsWith("**") || token.startsWith("__")) {
      parts.push(
        <strong key={i++} className="font-semibold text-foreground">
          {token.slice(2, -2)}
        </strong>
      )
    } else if (token.startsWith("`")) {
      parts.push(
        <code key={i++} className="rounded bg-muted px-1 py-0.5 font-mono text-[0.95em]">
          {token.slice(1, -1)}
        </code>
      )
    } else {
      parts.push(
        <em key={i++} className="italic">
          {token.slice(1, -1)}
        </em>
      )
    }
    lastIndex = match.index + token.length
  }
  if (lastIndex < text.length) parts.push(text.slice(lastIndex))
  return parts
}
