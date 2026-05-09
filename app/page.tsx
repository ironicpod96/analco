"use client"

import { ArrowRight, ChevronDown, History, Loader2, Trash2 } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useMemo, useRef, useState } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { classifyIndustry } from "@/lib/ai-scoring"
import {
  clearLastRun,
  deleteSavedRun,
  getKeys,
  getSavedRuns,
  hasKeys,
  loadSavedRun,
  savedRunSubtag,
  setPendingClassification,
  setPendingClientUrl,
  setPendingUrls,
} from "@/lib/storage"
import type {
  ImpostorReason,
  IndustryClassification,
  SavedRun,
  SiteClassification,
} from "@/lib/types"
import { MAX_URLS, normalizeUrl, parseUrlInput } from "@/lib/url"
import { cn } from "@/lib/utils"

const SAMPLE = `apple.com
nytimes.com
notion.so`

type ClassifyState = {
  status: "idle" | "loading" | "ready" | "error"
  industry: string
  impostors: string[]
  error?: string
  urlsKey: string
}

const EMPTY_CLASSIFY: ClassifyState = {
  status: "idle",
  industry: "",
  impostors: [],
  urlsKey: "",
}

const REASON_LABELS: Record<ImpostorReason, string> = {
  similar_ux: "Similar UX approach / inspiration",
  industry_reference: "Industry standard reference",
  user_disputes: "U wrong la the fuck, this is same industry la lolol",
}

export default function Landing() {
  const router = useRouter()
  const [clientRaw, setClientRaw] = useState("")
  const [raw, setRaw] = useState("")
  const [hydrated, setHydrated] = useState(false)
  const [keysReady, setKeysReady] = useState(false)
  const [savedRuns, setSavedRuns] = useState<SavedRun[]>([])
  const [classify, setClassify] = useState<ClassifyState>(EMPTY_CLASSIFY)
  const [reasons, setReasons] = useState<Record<string, ImpostorReason>>({})
  const lastClassifyKeyRef = useRef<string>("")

  useEffect(() => {
    queueMicrotask(() => {
      setKeysReady(hasKeys())
      setSavedRuns(getSavedRuns())
      setHydrated(true)
    })
  }, [])

  async function handleLoadSaved(id: string) {
    const run = await loadSavedRun(id)
    if (!run) {
      toast.error("Saved run not found")
      return
    }
    router.push("/analysis")
  }

  function handleDeleteSaved(id: string, name: string) {
    if (!window.confirm(`Delete "${name}"?`)) return
    deleteSavedRun(id)
    setSavedRuns(getSavedRuns())
  }

  const clientUrl = useMemo(() => normalizeUrl(clientRaw), [clientRaw])
  const clientInvalid = clientRaw.trim().length > 0 && !clientUrl
  const { valid: competitorValid, invalid, overflow } = useMemo(
    () => parseUrlInput(raw),
    [raw]
  )
  const valid = useMemo(() => {
    const dedup = competitorValid.filter((u) => u !== clientUrl)
    return clientUrl ? [clientUrl, ...dedup] : dedup
  }, [competitorValid, clientUrl])
  const urlsKey = valid.join("\n")

  useEffect(() => {
    if (!hydrated) return
    const { anthropic } = getKeys()
    if (valid.length < 2 || !anthropic) {
      queueMicrotask(() => {
        setClassify(EMPTY_CLASSIFY)
        setReasons({})
      })
      lastClassifyKeyRef.current = ""
      return
    }
    if (lastClassifyKeyRef.current === urlsKey) return

    const handle = window.setTimeout(async () => {
      lastClassifyKeyRef.current = urlsKey
      setClassify((prev) => ({
        ...prev,
        status: "loading",
        urlsKey,
        error: undefined,
      }))
      try {
        const result = await classifyIndustry(valid, anthropic)
        if (lastClassifyKeyRef.current !== urlsKey) return
        setClassify({
          status: "ready",
          industry: result.industry,
          impostors: result.impostors,
          urlsKey,
        })
        setReasons((prev) => {
          const next: Record<string, ImpostorReason> = {}
          for (const u of result.impostors) {
            if (prev[u]) next[u] = prev[u]
          }
          return next
        })
      } catch (err) {
        if (lastClassifyKeyRef.current !== urlsKey) return
        setClassify({
          status: "error",
          industry: "",
          impostors: [],
          urlsKey,
          error: err instanceof Error ? err.message : "Classification failed",
        })
      }
    }, 800)

    return () => window.clearTimeout(handle)
  }, [hydrated, urlsKey, valid])

  const activeImpostors = useMemo(
    () => classify.impostors.filter((u) => reasons[u] !== "user_disputes"),
    [classify.impostors, reasons]
  )

  const allImpostorsAnswered = classify.impostors.every((u) => Boolean(reasons[u]))

  const canSubmit =
    hydrated &&
    keysReady &&
    valid.length > 0 &&
    !clientInvalid &&
    invalid.length === 0 &&
    overflow === 0 &&
    classify.status !== "loading" &&
    allImpostorsAnswered

  function handleSubmit() {
    if (!canSubmit) return
    clearLastRun()
    setPendingUrls(valid)
    setPendingClientUrl(clientUrl ?? "")
    if (classify.status === "ready" && classify.industry) {
      const sites: SiteClassification[] = valid.map((url) => {
        const reason = reasons[url]
        if (classify.impostors.includes(url) && reason && reason !== "user_disputes") {
          return { url, role: "reference", reason }
        }
        return {
          url,
          role: "primary",
          reason: reason === "user_disputes" ? "user_disputes" : undefined,
        }
      })
      const payload: IndustryClassification = {
        industry: classify.industry,
        classifiedAt: new Date().toISOString(),
        sites,
      }
      setPendingClassification(payload)
    }
    router.push("/analysis")
  }

  function setReason(url: string, reason: ImpostorReason) {
    setReasons((prev) => ({ ...prev, [url]: reason }))
  }

  const lines = useMemo(() => raw.split(/\r?\n/), [raw])
  const impostorLines = useMemo(() => {
    const lookup = new Set(
      classify.impostors
        .filter((u) => reasons[u] !== "user_disputes")
        .map((u) => u)
    )
    return lines.map((line) => {
      const trimmed = line.trim()
      if (!trimmed) return false
      const normalized = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
      try {
        const u = new URL(normalized).toString().replace(/\/$/, "")
        return lookup.has(u)
      } catch {
        return false
      }
    })
  }, [lines, classify.impostors, reasons])

  const hasPurple = impostorLines.some(Boolean)

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-8 overflow-y-auto px-6 py-16">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h1 className="text-3xl font-semibold tracking-tight">
          Competitors Beware
        </h1>
        <IndustryHeader classify={classify} activeImpostorCount={activeImpostors.length} />
      </div>

      <div className="space-y-2">
        <label className="text-xs font-medium text-muted-foreground">Client website</label>
        <Input
          value={clientRaw}
          onChange={(e) => setClientRaw(e.target.value)}
          placeholder="https://yourclient.com"
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          aria-label="Client website"
          aria-invalid={clientInvalid || undefined}
          className="font-mono text-sm"
        />
        {clientInvalid && (
          <p className="text-xs text-destructive">Not a valid URL.</p>
        )}
      </div>

      <div className="space-y-2">
        <label className="text-xs font-medium text-muted-foreground">Competitor websites</label>
        <div className="relative">
          {hasPurple && (
            <pre
              aria-hidden
              className="pointer-events-none absolute inset-0 m-0 overflow-hidden whitespace-pre-wrap break-all rounded-lg border border-transparent px-2.5 py-2 font-mono text-sm leading-[1.5] text-foreground"
            >
              {lines.map((line, i) => (
                <span
                  key={i}
                  className={cn(
                    impostorLines[i] && "text-purple-600 dark:text-purple-400"
                  )}
                >
                  {line || " "}
                  {"\n"}
                </span>
              ))}
            </pre>
          )}
          <Textarea
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
            placeholder={SAMPLE}
            className={cn(
              "min-h-48 font-mono text-sm leading-[1.5]",
              hasPurple && "relative bg-transparent text-transparent caret-foreground selection:bg-foreground/15 selection:text-foreground placeholder:text-muted-foreground"
            )}
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
            aria-label="Competitor URLs"
          />
        </div>
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <UrlSummary valid={valid.length} invalid={invalid.length} overflow={overflow} />
          <span>
            {valid.length} / {MAX_URLS} URLs
          </span>
        </div>
        {invalid.length > 0 && (
          <ul className="space-y-2.5 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">
            {invalid.slice(0, 5).map((line, i) => (
              <li key={i} className="font-mono">
                <span className="opacity-70">{line.line}</span> — {line.reason}
              </li>
            ))}
            {invalid.length > 5 && <li>…and {invalid.length - 5} more</li>}
          </ul>
        )}
        {overflow > 0 && (
          <p className="text-xs text-amber-500">
            Only the first {MAX_URLS} URLs will be analyzed; {overflow} extra will be ignored.
          </p>
        )}
        {classify.status === "error" && (
          <p className="text-xs text-amber-500">
            Couldn&apos;t classify industry: {classify.error}. You can still run the analysis.
          </p>
        )}
      </div>

      {classify.impostors.length > 0 && (
        <div className="space-y-3 rounded-lg border border-purple-500/30 bg-purple-500/5 p-4">
          <p className="text-sm font-medium">
            {classify.impostors.length === 1
              ? "One site looks off-industry."
              : `${classify.impostors.length} sites look off-industry.`}
          </p>
          {classify.impostors.map((url) => (
            <ImpostorReasonRow
              key={url}
              url={url}
              reason={reasons[url]}
              onChange={(r) => setReason(url, r)}
            />
          ))}
        </div>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {hydrated && !keysReady ? (
          <p className="text-sm text-muted-foreground">
            Add your{" "}
            <Link href="/settings" className="underline underline-offset-2 hover:no-underline">
              API keys in Settings
            </Link>{" "}
            to start.
          </p>
        ) : (
          <span className="text-sm text-muted-foreground">
            Breakpoint strategy: <span className="text-foreground">Desktop Only</span>
          </span>
        )}
        <div className="flex items-center gap-2">
          {hydrated && savedRuns.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button variant="outline" size="lg">
                    <History className="h-4 w-4" />
                    Open
                    <ChevronDown className="h-3.5 w-3.5 opacity-60" />
                  </Button>
                }
              />
              <DropdownMenuContent align="end" className="w-72">
                {savedRuns.map((sr) => (
                  <DropdownMenuItem
                    key={sr.id}
                    closeOnClick={false}
                    onClick={() => handleLoadSaved(sr.id)}
                    className="flex items-center justify-between gap-2"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm">{sr.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {savedRunSubtag(sr.savedAt)}
                      </div>
                    </div>
                    <button
                      type="button"
                      aria-label={`Delete ${sr.name}`}
                      onClick={(e) => {
                        e.stopPropagation()
                        handleDeleteSaved(sr.id, sr.name)
                      }}
                      className="shrink-0 rounded-md p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          <Button size="lg" onClick={handleSubmit} disabled={!canSubmit}>
            Analyze
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  )
}

function IndustryHeader({
  classify,
  activeImpostorCount,
}: {
  classify: ClassifyState
  activeImpostorCount: number
}) {
  if (classify.status === "loading") {
    return (
      <div className="flex w-fit items-center gap-1.5 rounded-full border bg-background px-3 py-1 text-xs text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" />
        Detecting industry…
      </div>
    )
  }
  if (classify.status !== "ready" || !classify.industry) return null
  return (
    <div className="flex flex-col items-end gap-1 text-right">
      <div className="text-xs text-muted-foreground">Industry</div>
      <div className="flex flex-wrap items-center justify-end gap-1.5">
        <span className="inline-flex h-6 items-center rounded-full border bg-background px-2.5 text-xs font-medium">
          {classify.industry}
        </span>
        {activeImpostorCount > 0 && (
          <span className="inline-flex h-6 items-center rounded-full border border-purple-500/50 bg-purple-500/10 px-2.5 text-xs font-medium text-purple-700 dark:text-purple-300">
            {activeImpostorCount} impostor{activeImpostorCount === 1 ? "" : "s"}
          </span>
        )}
      </div>
    </div>
  )
}

function ImpostorReasonRow({
  url,
  reason,
  onChange,
}: {
  url: string
  reason?: ImpostorReason
  onChange: (next: ImpostorReason) => void
}) {
  const display = friendlyDisplay(url)
  return (
    <div className="space-y-2.5">
      <p className="text-xs leading-snug">
        Why{" "}
        <span className="font-medium text-purple-700 dark:text-purple-300">{display}</span>?
      </p>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="outline"
              size="sm"
              className={cn(
                "w-full justify-between text-left font-normal",
                !reason && "text-muted-foreground"
              )}
            >
              <span className="truncate">
                {reason ? REASON_LABELS[reason] : "Select a reason…"}
              </span>
              <ChevronDown className="h-3.5 w-3.5 opacity-60" />
            </Button>
          }
        />
        <DropdownMenuContent align="start" className="w-[--radix-dropdown-menu-trigger-width] min-w-72">
          {(Object.entries(REASON_LABELS) as [ImpostorReason, string][]).map(
            ([key, label]) => (
              <DropdownMenuItem key={key} onClick={() => onChange(key)}>
                {label}
              </DropdownMenuItem>
            )
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}

function friendlyDisplay(url: string): string {
  try {
    const u = new URL(url)
    return u.hostname.replace(/^www\./i, "")
  } catch {
    return url
  }
}

function UrlSummary({
  valid,
  invalid,
  overflow,
}: {
  valid: number
  invalid: number
  overflow: number
}) {
  if (valid === 0 && invalid === 0) {
    return <span>One URL per line.</span>
  }
  const parts: string[] = []
  if (valid > 0) parts.push(`${valid} valid`)
  if (invalid > 0) parts.push(`${invalid} invalid`)
  if (overflow > 0) parts.push(`${overflow} over limit`)
  return <span>{parts.join(" · ")}</span>
}
