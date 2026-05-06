"use client"

import { ArrowRight } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useMemo, useState } from "react"

import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { hasKeys } from "@/lib/storage"
import { MAX_URLS, parseUrlInput } from "@/lib/url"

const PENDING_KEY = "analco:pendingUrls"

const SAMPLE = `apple.com
nytimes.com
notion.so`

export default function Landing() {
  const router = useRouter()
  const [raw, setRaw] = useState("")
  const [hydrated, setHydrated] = useState(false)
  const [keysReady, setKeysReady] = useState(false)

  useEffect(() => {
    setKeysReady(hasKeys())
    setHydrated(true)
  }, [])

  const { valid, invalid, overflow } = useMemo(() => parseUrlInput(raw), [raw])
  const canSubmit = hydrated && keysReady && valid.length > 0 && invalid.length === 0 && overflow === 0

  function handleSubmit() {
    if (!canSubmit) return
    window.sessionStorage.setItem(PENDING_KEY, JSON.stringify(valid))
    router.push("/analysis")
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-8 px-6 py-16">
      <div className="space-y-3">
        <h1 className="text-3xl font-semibold tracking-tight">Score up to 10 competitors</h1>
        <p className="text-balance text-base text-muted-foreground">
          Paste competitor URLs below. AnalCo runs each through PageSpeed and a 9-row UX
          rubric — auto where it can, AI-suggested where it helps, manual where it has to be.
        </p>
      </div>

      <div className="space-y-2">
        <Textarea
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          placeholder={SAMPLE}
          className="min-h-48 font-mono text-sm"
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          aria-label="Competitor URLs"
        />
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <UrlSummary valid={valid.length} invalid={invalid.length} overflow={overflow} />
          <span>
            {valid.length} / {MAX_URLS} URLs
          </span>
        </div>
        {invalid.length > 0 && (
          <ul className="space-y-1 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">
            {invalid.slice(0, 5).map((line, i) => (
              <li key={i} className="font-mono">
                <span className="opacity-70">{line.line}</span> — {line.reason}
              </li>
            ))}
            {invalid.length > 5 && <li>…and {invalid.length - 5} more</li>}
          </ul>
        )}
        {overflow > 0 && (
          <p className="text-xs text-amber-600 dark:text-amber-400">
            Only the first {MAX_URLS} URLs will be analyzed; {overflow} extra will be ignored.
          </p>
        )}
      </div>

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
            Mobile/desktop strategy: <span className="text-foreground">Desktop</span>
          </span>
        )}
        <Button size="lg" onClick={handleSubmit} disabled={!canSubmit}>
          Analyze
          <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
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
