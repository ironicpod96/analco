"use client"

import { Pencil, X } from "lucide-react"
import { useState, type ReactNode } from "react"

import { ScoreDots } from "@/components/score-dots"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"
import type { AutoScore, HybridScore, ManualScore, RubricScale } from "@/lib/types"

const UNPARSEABLE_TEXT = "Unable to assess. Page cannot be parsed."

function isUnparseable(row: AutoScore | HybridScore | ManualScore): boolean {
  if ("aiReasoning" in row && row.aiReasoning?.trim() === UNPARSEABLE_TEXT) return true
  if ("userNote" in row && row.userNote?.trim() === UNPARSEABLE_TEXT) return true
  return false
}

export function RubricRow({
  label,
  row,
  evidence,
  controls,
  headerMeta,
  onScoreChange,
  onStartEdit,
  onManualAssess,
}: {
  label: string
  row: AutoScore | HybridScore | ManualScore
  evidence?: ReactNode | ((props: { setEditing: (editing: boolean) => void }) => ReactNode)
  controls?: ReactNode
  headerMeta?: ReactNode
  onScoreChange?: (score: RubricScale | null) => void
  onStartEdit?: () => void
  onManualAssess?: (score: RubricScale, note: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const unparseable = isUnparseable(row)
  const isHybrid = row.source !== "auto" && row.source !== "manual"
  const ghost =
    !unparseable && isHybrid && row.source !== "manual_override" && row.score == null
      ? (row as HybridScore).aiSuggested
      : null
  const score = unparseable ? null : (row.score as RubricScale | null)

  return (
    <div className="group/row relative space-y-2.5 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-sm font-medium leading-tight">
            {editing && onScoreChange ? (
              <ScoreDropdown
                label={label}
                score={score}
                ghost={ghost as RubricScale | null}
                onChange={onScoreChange}
              />
            ) : (
              <ScoreDots
                score={score}
                ghost={ghost as RubricScale | null}
                ariaLabel={`${label} score`}
              />
            )}
            <span>{label}</span>
            {headerMeta}
          </div>
        </div>
      </div>
      {evidence != null && (
        <div className="text-xs leading-snug text-muted-foreground">
          {typeof evidence === "function" ? evidence({ setEditing }) : evidence}
        </div>
      )}
      {evidence == null && onStartEdit && (
        <div className="absolute right-0 top-3 flex items-center gap-1 opacity-0 transition-opacity group-hover/row:opacity-100 group-focus-within/row:opacity-100">
          <button
            type="button"
            aria-label={`Edit ${label}`}
            title="Edit"
            onClick={onStartEdit}
            className="inline-flex size-5 items-center justify-center rounded text-muted-foreground transition hover:text-foreground active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/45"
          >
            <Pencil className="h-3 w-3" />
          </button>
        </div>
      )}
      {unparseable && onManualAssess && (
        <ManualAssessPanel onSave={onManualAssess} />
      )}
      {controls != null && <div>{controls}</div>}
    </div>
  )
}

function ScoreDropdown({
  label,
  score,
  ghost,
  onChange,
}: {
  label: string
  score: RubricScale | null
  ghost: RubricScale | null
  onChange: (score: RubricScale | null) => void
}) {
  const value = score == null ? "na" : String(semanticScore(score))

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button
            type="button"
            aria-label={`Set ${label} score`}
            title={`Set ${label} score`}
            className="inline-flex size-5 items-center justify-center rounded transition active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/45"
          >
            <ScoreDots score={score} ghost={ghost} ariaLabel={`${label} score`} />
          </button>
        }
      />
      <DropdownMenuContent align="start" className="w-36">
        <DropdownMenuRadioGroup
          value={value}
          onValueChange={(next) =>
            onChange(next === "na" ? null : (Number(next) as RubricScale))
          }
        >
          {RATING_CHOICES.map((choice) => {
            return (
              <DropdownMenuRadioItem
                key={choice.label}
                value={choice.score == null ? "na" : String(choice.score)}
              >
                <span className={cn("h-2.5 w-2.5 rounded-full", choice.tone)} />
                <span>{choice.label}</span>
              </DropdownMenuRadioItem>
            )
          })}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

const RATING_CHOICES: Array<{
  label: string
  score: RubricScale | null
  tone: string
}> = [
  { label: "N/A", score: null, tone: "bg-muted-foreground/40" },
  { label: "No", score: 1, tone: "bg-red-500" },
  { label: "Somewhat", score: 3, tone: "bg-amber-500" },
  { label: "Yes", score: 5, tone: "bg-green-500" },
]

function semanticScore(score: RubricScale): RubricScale {
  if (score >= 4) return 5
  if (score >= 3) return 3
  return 1
}

function ManualAssessPanel({
  onSave,
}: {
  onSave: (score: RubricScale, note: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [picked, setPicked] = useState<RubricScale | null>(null)
  const [note, setNote] = useState("")

  if (!open) {
    return (
      <Button
        size="sm"
        variant="outline"
        className="h-7 px-2 text-xs"
        onClick={() => setOpen(true)}
        title="Score and note this row yourself"
      >
        <Pencil className="h-3 w-3" />
        Assess manually
      </Button>
    )
  }

  function commit() {
    if (picked == null) return
    onSave(picked, note.trim())
    setOpen(false)
    setPicked(null)
    setNote("")
  }

  function cancel() {
    setOpen(false)
    setPicked(null)
    setNote("")
  }

  return (
    <div className="space-y-2 rounded-md border bg-muted/30 p-2">
      <div className="flex items-center gap-1.5">
        <span className="text-xs font-medium text-muted-foreground">Score</span>
        {[1, 2, 3, 4, 5].map((n) => {
          const value = n as RubricScale
          const tone = scoreTone(value)
          const active = picked === value
          return (
            <button
              key={n}
              type="button"
              onClick={() => setPicked(value)}
              aria-label={`Set score to ${n}`}
              className={cn(
                "h-6 w-6 shrink-0 rounded-full border text-xs font-medium tabular-nums transition-colors",
                tone,
                active
                  ? "ring-2 ring-foreground/40 ring-offset-1 ring-offset-background"
                  : "opacity-60 hover:opacity-100"
              )}
            >
              {n}
            </button>
          )
        })}
      </div>
      <Textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Why this score? (optional)"
        rows={2}
        className="min-h-[56px] resize-none text-xs leading-snug"
      />
      <div className="flex gap-1.5">
        <Button
          size="sm"
          className="h-6 px-2 text-xs"
          onClick={commit}
          disabled={picked == null}
        >
          Save
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="h-6 px-2 text-xs"
          onClick={cancel}
        >
          <X className="h-3 w-3" />
          Cancel
        </Button>
      </div>
    </div>
  )
}

function scoreTone(score: RubricScale): string {
  if (score >= 4) return "bg-green-500 text-white border-transparent"
  if (score >= 3) return "bg-amber-500 text-white border-transparent"
  return "bg-red-500 text-white border-transparent"
}
