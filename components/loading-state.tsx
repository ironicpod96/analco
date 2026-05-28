import { XCircle } from "lucide-react"

import { cn } from "@/lib/utils"

export type CardStatus = "queued" | "fetching" | "scoring" | "done" | "error"

const LABELS: Record<CardStatus, string> = {
  queued: "Queued",
  fetching: "Fetching PageSpeed…",
  scoring: "Scoring rubric…",
  done: "Done",
  error: "Error",
}

export function LoadingState({
  status,
  message,
}: {
  status: CardStatus
  message?: string
}) {
  if (status === "done") return null

  return (
    <div className="flex items-center gap-2 text-xs">
      {status === "error" ? (
        <XCircle className="h-3.5 w-3.5 text-destructive" />
      ) : (
        <Pulse status={status} />
      )}
      <span
        className={cn(
          status === "error" && "text-destructive",
          status !== "error" && "text-muted-foreground"
        )}
      >
        {message ?? LABELS[status]}
      </span>
    </div>
  )
}

function Pulse({ status }: { status: CardStatus }) {
  const tone =
    status === "queued"
      ? "bg-muted-foreground/40"
      : status === "fetching"
        ? "bg-sky-500/70"
        : "bg-violet-500/70"
  return (
    <span className="relative inline-flex h-2 w-2">
      <span className={cn("absolute inset-0 animate-ping rounded-full opacity-60", tone)} />
      <span className={cn("relative inline-flex h-2 w-2 rounded-full", tone)} />
    </span>
  )
}
