"use client"

import { AlertTriangle, Check, Eye, EyeOff, Loader2, X } from "lucide-react"
import { useEffect, useState } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"

import { testAnthropicKey } from "@/lib/anthropic"
import { testPageSpeedKey } from "@/lib/pagespeed"
import { getKeys, resetAll, setKeys } from "@/lib/storage"
import type { ConnectionTest } from "@/lib/types"

type TestState = { status: "idle" | "testing"; result: ConnectionTest | null }
const initialTest: TestState = { status: "idle", result: null }

export default function SettingsPage() {
  const [pagespeed, setPagespeed] = useState("")
  const [anthropic, setAnthropic] = useState("")
  const [psTest, setPsTest] = useState<TestState>(initialTest)
  const [anTest, setAnTest] = useState<TestState>(initialTest)
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    const k = getKeys()
    setPagespeed(k.pagespeed)
    setAnthropic(k.anthropic)
    setHydrated(true)
  }, [])

  function persist(next: { pagespeed?: string; anthropic?: string }) {
    setKeys({
      pagespeed: (next.pagespeed ?? pagespeed).trim(),
      anthropic: (next.anthropic ?? anthropic).trim(),
    })
  }

  async function runPsTest() {
    persist({})
    setPsTest({ status: "testing", result: null })
    const result = await testPageSpeedKey(pagespeed.trim())
    setPsTest({ status: "idle", result })
  }

  async function runAnTest() {
    persist({})
    setAnTest({ status: "testing", result: null })
    const result = await testAnthropicKey(anthropic.trim())
    setAnTest({ status: "idle", result })
  }

  function handleReset() {
    const ok = window.confirm(
      "Clear stored keys and the most recent analysis from this browser? This cannot be undone."
    )
    if (!ok) return
    resetAll()
    setPagespeed("")
    setAnthropic("")
    setPsTest(initialTest)
    setAnTest(initialTest)
    toast.success("All local data cleared")
  }

  return (
    <div className="mx-auto w-full max-w-2xl space-y-6 px-6 py-12">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Bring your own keys. Everything runs in your browser — nothing leaves this device
          except direct calls to Google PageSpeed and Anthropic.
        </p>
      </div>

      <div className="flex items-start gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-900 dark:text-amber-200">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        <div className="space-y-1">
          <p className="font-medium">Keys are stored in this browser&apos;s localStorage.</p>
          <p className="text-xs opacity-80">
            Anyone with access to this device or browser profile can read them. Don&apos;t use
            AnalCo on shared computers.
          </p>
        </div>
      </div>

      <KeyField
        id="pagespeed"
        label="Google PageSpeed Insights"
        description="Used to fetch Lighthouse audits for each competitor URL."
        helpHref="https://developers.google.com/speed/docs/insights/v5/get-started"
        helpLabel="Get a key"
        value={pagespeed}
        onChange={(v) => setPagespeed(v)}
        onBlur={() => persist({ pagespeed })}
        onTest={runPsTest}
        state={psTest}
        placeholder="AIza..."
        disabled={!hydrated}
      />

      <KeyField
        id="anthropic"
        label="Anthropic"
        description="Used for hybrid rubric scoring (vision + DOM) and cross-site synthesis."
        helpHref="https://console.anthropic.com/settings/keys"
        helpLabel="Get a key"
        value={anthropic}
        onChange={(v) => setAnthropic(v)}
        onBlur={() => persist({ anthropic })}
        onTest={runAnTest}
        state={anTest}
        placeholder="sk-ant-..."
        disabled={!hydrated}
      />

      <Separator />

      <Card>
        <CardHeader>
          <CardTitle>Reset</CardTitle>
          <CardDescription>
            Clear stored keys and the most recent analysis from this browser. This cannot be
            undone.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="destructive" onClick={handleReset}>
            Reset all data
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}

function KeyField({
  id,
  label,
  description,
  helpHref,
  helpLabel,
  value,
  onChange,
  onBlur,
  onTest,
  state,
  placeholder,
  disabled,
}: {
  id: string
  label: string
  description: string
  helpHref: string
  helpLabel: string
  value: string
  onChange: (v: string) => void
  onBlur: () => void
  onTest: () => void
  state: TestState
  placeholder: string
  disabled?: boolean
}) {
  const [show, setShow] = useState(false)

  return (
    <Card>
      <CardHeader>
        <CardTitle>{label}</CardTitle>
        <CardDescription>
          {description}{" "}
          <a
            className="underline underline-offset-2 hover:no-underline"
            href={helpHref}
            target="_blank"
            rel="noreferrer"
          >
            {helpLabel}
          </a>
          .
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <Label htmlFor={id} className="sr-only">
          {label}
        </Label>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Input
              id={id}
              type={show ? "text" : "password"}
              autoComplete="off"
              spellCheck={false}
              placeholder={placeholder}
              value={value}
              onChange={(e) => onChange(e.target.value)}
              onBlur={onBlur}
              disabled={disabled}
              className="pr-10 font-mono text-sm"
            />
            <button
              type="button"
              onClick={() => setShow((s) => !s)}
              className="absolute right-1 top-1/2 -translate-y-1/2 rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label={show ? "Hide key" : "Show key"}
              tabIndex={-1}
            >
              {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          <Button
            onClick={onTest}
            disabled={!value.trim() || state.status === "testing" || disabled}
          >
            {state.status === "testing" ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Testing
              </>
            ) : (
              "Test connection"
            )}
          </Button>
        </div>
        <TestStatus state={state} />
      </CardContent>
    </Card>
  )
}

function TestStatus({ state }: { state: TestState }) {
  if (state.status === "testing") {
    return <p className="text-xs text-muted-foreground">Testing…</p>
  }
  if (!state.result) {
    return <p className="text-xs text-muted-foreground">Not tested yet.</p>
  }
  if (state.result.ok) {
    return (
      <p className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400">
        <Check className="h-3.5 w-3.5" /> Connected
      </p>
    )
  }
  return (
    <p className="flex items-center gap-1.5 text-xs text-destructive">
      <X className="h-3.5 w-3.5" /> {state.result.error}
    </p>
  )
}
