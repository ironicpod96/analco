"use client"

import { AlertTriangle, ChevronDown, Eye, EyeOff, Loader2, Plus, RotateCcw, X } from "lucide-react"
import { useRouter } from "next/navigation"
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
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { Textarea } from "@/components/ui/textarea"

import { DEFAULT_PROMPTS } from "@/lib/ai-scoring"
import { testAnthropicKey } from "@/lib/anthropic"
import { testGoogleWorkspaceKeys } from "@/lib/google-workspace"
import { testPageSpeedKey } from "@/lib/pagespeed"
import {
  getKeys,
  forgetConnection,
  getGoogleWorkspaceKeys,
  getKnowledge,
  getActiveRunId,
  getLastRun,
  getPendingUrls,
  getPromptOverrides,
  getRememberedConnection,
  rememberConnection,
  resetAll,
  resetAllPrompts,
  resetPromptOverride,
  setKeys,
  setGoogleWorkspaceKeys,
  setKnowledge,
  setPromptOverrides,
} from "@/lib/storage"
import {
  KNOWLEDGE_CATEGORIES,
  type ConnectionTest,
  type KnowledgeCategory,
  type KnowledgeEntry,
  type PromptKey,
  type PromptOverrides,
} from "@/lib/types"
import { cn } from "@/lib/utils"

const PROMPT_LABELS: Record<PromptKey, string> = {
  firstImpression: "First Impression",
  navigation: "Navigation",
  visualHierarchy: "Visual Hierarchy",
  helpSupport: "Help & Support",
}

const PROMPT_ORDER: PromptKey[] = [
  "firstImpression",
  "navigation",
  "visualHierarchy",
  "helpSupport",
]

type TestState = { status: "idle" | "testing"; result: ConnectionTest | null }
const initialTest: TestState = { status: "idle", result: null }
const connectedTest: TestState = { status: "idle", result: { ok: true } }

export default function SettingsPage() {
  const router = useRouter()
  const [pagespeed, setPagespeed] = useState("")
  const [anthropic, setAnthropic] = useState("")
  const [googleApiKey, setGoogleApiKey] = useState("")
  const [googleClientId, setGoogleClientId] = useState("")
  const [psTest, setPsTest] = useState<TestState>(initialTest)
  const [anTest, setAnTest] = useState<TestState>(initialTest)
  const [googleTest, setGoogleTest] = useState<TestState>(initialTest)
  const [knowledge, setKnowledgeState] = useState<KnowledgeEntry[]>([])
  const [knowledgeFilter, setKnowledgeFilter] = useState<KnowledgeCategory | "All">("All")
  const [prompts, setPromptsState] = useState<PromptOverrides>({})
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    queueMicrotask(() => {
      const k = getKeys()
      const google = getGoogleWorkspaceKeys()
      setPagespeed(k.pagespeed)
      setAnthropic(k.anthropic)
      setGoogleApiKey(google.apiKey)
      setGoogleClientId(google.clientId)
      setPsTest(rememberedState("pagespeed", pagespeedSignature(k.pagespeed)))
      setAnTest(rememberedState("anthropic", anthropicSignature(k.anthropic)))
      setGoogleTest(
        rememberedState("googleWorkspace", googleWorkspaceSignature(google.apiKey, google.clientId))
      )
      setKnowledgeState(getKnowledge())
      setPromptsState(getPromptOverrides())
      setHydrated(true)
    })
  }, [])



  function persist(next: { pagespeed?: string; anthropic?: string }) {
    setKeys({
      pagespeed: (next.pagespeed ?? pagespeed).trim(),
      anthropic: (next.anthropic ?? anthropic).trim(),
    })
  }

  function persistGoogle(next: { apiKey?: string; clientId?: string }) {
    setGoogleWorkspaceKeys({
      apiKey: (next.apiKey ?? googleApiKey).trim(),
      clientId: (next.clientId ?? googleClientId).trim(),
    })
  }

  async function runPsTest() {
    persist({})
    setPsTest({ status: "testing", result: null })
    const result = await testPageSpeedKey(pagespeed.trim())
    rememberTestResult("pagespeed", pagespeedSignature(pagespeed), result)
    setPsTest({ status: "idle", result })
  }

  async function runAnTest() {
    persist({})
    setAnTest({ status: "testing", result: null })
    const result = await testAnthropicKey(anthropic.trim())
    rememberTestResult("anthropic", anthropicSignature(anthropic), result)
    setAnTest({ status: "idle", result })
  }

  async function runGoogleTest() {
    persistGoogle({})
    setGoogleTest({ status: "testing", result: null })
    const result = await testGoogleWorkspaceKeys({
      apiKey: googleApiKey.trim(),
      clientId: googleClientId.trim(),
    })
    rememberTestResult(
      "googleWorkspace",
      googleWorkspaceSignature(googleApiKey, googleClientId),
      result
    )
    setGoogleTest({ status: "idle", result })
  }

  function handleReset() {
    const ok = window.confirm(
      "Clear stored keys and the most recent analysis from this browser? This cannot be undone."
    )
    if (!ok) return
    resetAll()
    setPagespeed("")
    setAnthropic("")
    setKnowledgeState(getKnowledge())
    setPromptsState({})
    setPsTest(initialTest)
    setAnTest(initialTest)
    setGoogleTest(initialTest)
    toast.success("All local data cleared")
  }

  function persistPromptDraft(key: PromptKey, value: string) {
    const trimmed = value.trim()
    const next: PromptOverrides = { ...prompts }
    if (trimmed.length === 0 || trimmed === DEFAULT_PROMPTS[key].trim()) {
      delete next[key]
    } else {
      next[key] = value
    }
    setPromptsState(next)
    setPromptOverrides(next)
  }

  function handleResetPrompt(key: PromptKey) {
    resetPromptOverride(key)
    const next = { ...prompts }
    delete next[key]
    setPromptsState(next)
    toast.success(`${PROMPT_LABELS[key]} prompt reset`)
  }

  function handleResetAllPrompts() {
    if (!window.confirm("Reset all prompt templates to defaults?")) return
    resetAllPrompts()
    setPromptsState({})
    toast.success("All prompts reset")
  }

  function updateKnowledge(next: KnowledgeEntry[]) {
    setKnowledgeState(next)
    setKnowledge(next)
  }

  function updateEntry(id: string, patch: Partial<KnowledgeEntry>) {
    updateKnowledge(knowledge.map((k) => (k.id === id ? { ...k, ...patch } : k)))
  }

  function addEntry() {
    updateKnowledge([
      ...knowledge,
      {
        id: crypto.randomUUID(),
        category: "Custom",
        title: "New principle",
        url: "",
        blurb: "",
      },
    ])
  }

  function removeEntry(id: string) {
    updateKnowledge(knowledge.filter((k) => k.id !== id))
  }

  function returnFromSettings() {
    const hasPendingAnalysis = getPendingUrls().length > 0
    const current = getLastRun()
    const hasCurrentAnalysis = Boolean(current?.sites.length && getActiveRunId() === current.runId)
    router.push(hasPendingAnalysis || hasCurrentAnalysis ? "/analysis" : "/")
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-2xl space-y-6 px-6 py-12">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={returnFromSettings}>
              Back
            </Button>
          </div>
        </div>

        <div className="flex items-start gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-500">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div className="space-y-2.5">
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
          onChange={(v) => {
            setPagespeed(v)
            setPsTest(rememberedState("pagespeed", pagespeedSignature(v)))
          }}
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
        onChange={(v) => {
          setAnthropic(v)
          setAnTest(rememberedState("anthropic", anthropicSignature(v)))
        }}
        onBlur={() => persist({ anthropic })}
        onTest={runAnTest}
        state={anTest}
        placeholder="sk-ant-..."
        disabled={!hydrated}
      />

      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle>Google Workspace export</CardTitle>
              <CardDescription>
                Used by the Comparison tab to create editable Google Slides and open Drive Picker.
              </CardDescription>
            </div>
            <TestStatus state={googleTest} />
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <SecretInput
            id="google-api-key"
            label="Google API key"
            value={googleApiKey}
            onChange={(v) => {
              setGoogleApiKey(v)
              setGoogleTest(rememberedState("googleWorkspace", googleWorkspaceSignature(v, googleClientId)))
            }}
            onBlur={() => persistGoogle({ apiKey: googleApiKey })}
            placeholder="AIza..."
            disabled={!hydrated}
          />
          <SecretInput
            id="google-client-id"
            label="OAuth client ID"
            value={googleClientId}
            onChange={(v) => {
              setGoogleClientId(v)
              setGoogleTest(rememberedState("googleWorkspace", googleWorkspaceSignature(googleApiKey, v)))
            }}
            onBlur={() => persistGoogle({ clientId: googleClientId })}
            placeholder="1234567890-abc.apps.googleusercontent.com"
            disabled={!hydrated}
          />
          <div className="flex justify-end">
            <Button
              onClick={runGoogleTest}
              disabled={
                !googleApiKey.trim() ||
                !googleClientId.trim() ||
                googleTest.status === "testing" ||
                !hydrated
              }
            >
              {googleTest.status === "testing" ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Testing
                </>
              ) : (
                "Test connection"
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Separator />

        <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle>Knowledge Library</CardTitle>
            </div>
            <div className="flex shrink-0 gap-2">
              <Button size="sm" onClick={addEntry} disabled={!hydrated}>
                <Plus className="h-3.5 w-3.5" />
                Add
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">
              {knowledge.length} principle{knowledge.length === 1 ? "" : "s"} available to prompts.
            </p>
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!hydrated}
                    className="h-7 justify-between text-xs font-normal"
                  >
                    <span className="truncate">{knowledgeFilter}</span>
                    <ChevronDown className="h-3.5 w-3.5 opacity-60" />
                  </Button>
                }
              />
              <DropdownMenuContent align="end" className="min-w-[12rem]">
                <DropdownMenuItem onClick={() => setKnowledgeFilter("All")}>
                  All
                </DropdownMenuItem>
                {KNOWLEDGE_CATEGORIES.map((c) => (
                  <DropdownMenuItem key={c} onClick={() => setKnowledgeFilter(c)}>
                    {c}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          <div className="grid items-start gap-2 sm:grid-cols-2">
            {knowledge
              .filter((e) => knowledgeFilter === "All" || e.category === knowledgeFilter)
              .map((entry) => (
                <KnowledgeEntryRow
                  key={entry.id}
                  entry={entry}
                  disabled={!hydrated}
                  onChange={(patch) => updateEntry(entry.id, patch)}
                  onRemove={() => removeEntry(entry.id)}
                />
              ))}
          </div>
        </CardContent>
      </Card>

      <Separator />

      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle>Prompt templates</CardTitle>
              <CardDescription>
                Edit the system prompt sent to the AI for each scoring category. The
                &ldquo;Unable to assess&rdquo; safeguard is auto-appended and stays locked.
              </CardDescription>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={handleResetAllPrompts}
              disabled={!hydrated || Object.keys(prompts).length === 0}
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Reset all
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {PROMPT_ORDER.map((key) => (
            <PromptEditor
              key={key}
              promptKey={key}
              label={PROMPT_LABELS[key]}
              value={prompts[key] ?? ""}
              modified={typeof prompts[key] === "string"}
              onSave={(v) => persistPromptDraft(key, v)}
              onReset={() => handleResetPrompt(key)}
              disabled={!hydrated}
            />
          ))}
        </CardContent>
      </Card>

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
    </div>
  )
}

function KnowledgeEntryRow({
  entry,
  disabled,
  onChange,
  onRemove,
}: {
  entry: KnowledgeEntry
  disabled?: boolean
  onChange: (patch: Partial<KnowledgeEntry>) => void
  onRemove: () => void
}) {
  return (
    <Collapsible className="rounded-lg border">
      <CollapsibleTrigger className="flex w-full min-w-0 items-center gap-2 px-3 py-2 text-left hover:bg-muted/40">
        <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform data-[panel-open]:rotate-180" />
        <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
          {entry.category || "Uncategorized"}
        </span>
        <span className="min-w-0 flex-1 truncate text-sm font-medium">
          {entry.title || "Untitled principle"}
        </span>
      </CollapsibleTrigger>
      <CollapsibleContent className="space-y-2 border-t px-3 py-2">
        <div className="flex items-center gap-2">
          <CategorySelect
            value={entry.category}
            onChange={(next) => onChange({ category: next })}
            disabled={disabled}
          />
          <Button
            size="icon-sm"
            variant="ghost"
            onClick={onRemove}
            disabled={disabled}
            aria-label="Remove principle"
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
        <Input
          value={entry.title}
          onChange={(e) => onChange({ title: e.target.value })}
          placeholder="Principle title (e.g. Hick's Law)"
          disabled={disabled}
          className="text-xs"
        />
        <Input
          value={entry.url}
          onChange={(e) => onChange({ url: e.target.value })}
          placeholder="https://…  (badge link target)"
          disabled={disabled}
          className="text-xs font-mono"
        />
        <Textarea
          value={entry.blurb ?? ""}
          onChange={(e) => onChange({ blurb: e.target.value })}
          placeholder="Optional one-line gloss to help the AI judge when this principle applies"
          disabled={disabled}
          rows={2}
          className="min-h-[56px] resize-none text-xs leading-snug"
        />
      </CollapsibleContent>
    </Collapsible>
  )
}

function CategorySelect({
  value,
  onChange,
  disabled,
}: {
  value: string
  onChange: (next: KnowledgeCategory) => void
  disabled?: boolean
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            size="sm"
            variant="outline"
            disabled={disabled}
            className="h-8 flex-1 justify-between text-xs font-normal"
          >
            <span className="truncate">{value || "Category"}</span>
            <ChevronDown className="h-3.5 w-3.5 opacity-60" />
          </Button>
        }
      />
      <DropdownMenuContent align="start" className="min-w-[12rem]">
        {KNOWLEDGE_CATEGORIES.map((c) => (
          <DropdownMenuItem key={c} onClick={() => onChange(c)}>
            {c}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function PromptEditor({
  promptKey,
  label,
  value,
  modified,
  onSave,
  onReset,
  disabled,
}: {
  promptKey: PromptKey
  label: string
  value: string
  modified: boolean
  onSave: (next: string) => void
  onReset: () => void
  disabled?: boolean
}) {
  const defaultValue = DEFAULT_PROMPTS[promptKey]
  const [draft, setDraft] = useState(value || defaultValue)

  useEffect(() => {
    queueMicrotask(() => setDraft(value || defaultValue))
  }, [value, defaultValue])

  return (
    <Collapsible className="rounded-lg border">
      <CollapsibleTrigger
        className={cn(
          "flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm font-medium",
          "hover:bg-muted/40"
        )}
      >
        <span className="flex items-center gap-2">
          {label}
          {modified && (
            <span className="rounded-full bg-amber-500/15 px-1.5 py-0.5 text-xs font-medium text-amber-500">
              Modified
            </span>
          )}
        </span>
        <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform data-[panel-open]:rotate-180" />
      </CollapsibleTrigger>
      <CollapsibleContent className="space-y-2 border-t px-3 py-2">
        <Textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => onSave(draft)}
          rows={14}
          disabled={disabled}
          className="min-h-[280px] resize-y font-mono text-xs leading-relaxed"
          spellCheck={false}
        />
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground">
            Saves on blur. The unparseable safeguard is auto-appended at scoring time.
          </p>
          <Button
            size="sm"
            variant="outline"
            onClick={onReset}
            disabled={disabled || !modified}
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Reset to default
          </Button>
        </div>
      </CollapsibleContent>
    </Collapsible>
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
        <div className="flex items-start justify-between gap-3">
          <div>
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
          </div>
          <TestStatus state={state} />
        </div>
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
      </CardContent>
    </Card>
  )
}

function SecretInput({
  id,
  label,
  value,
  onChange,
  onBlur,
  placeholder,
  disabled,
}: {
  id: string
  label: string
  value: string
  onChange: (v: string) => void
  onBlur: () => void
  placeholder: string
  disabled?: boolean
}) {
  const [show, setShow] = useState(false)

  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
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
          aria-label={show ? "Hide value" : "Show value"}
          tabIndex={-1}
        >
          {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
    </div>
  )
}

function TestStatus({ state }: { state: TestState }) {
  if (state.status === "testing") {
    return (
      <p className="flex shrink-0 items-center gap-1.5 rounded-full border px-2 py-1 text-xs text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Testing
      </p>
    )
  }
  if (!state.result) {
    return (
      <p className="shrink-0 rounded-full border px-2 py-1 text-xs text-muted-foreground">
        Not tested
      </p>
    )
  }
  if (state.result.ok) {
    return (
      <p className="flex shrink-0 items-center gap-1.5 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2 py-1 text-xs text-emerald-600 dark:text-emerald-400">
        Connected
      </p>
    )
  }
  return (
    <p className="flex max-w-56 shrink-0 items-center gap-1.5 rounded-full border border-destructive/25 bg-destructive/10 px-2 py-1 text-xs text-destructive">
      <X className="h-3.5 w-3.5" /> {state.result.error}
    </p>
  )
}

function rememberedState(id: string, signature: string): TestState {
  return signature && getRememberedConnection(id) === signature ? connectedTest : initialTest
}

function rememberTestResult(id: string, signature: string, result: ConnectionTest): void {
  if (result.ok) rememberConnection(id, signature)
  else forgetConnection(id)
}

function pagespeedSignature(value: string): string {
  return value.trim()
}

function anthropicSignature(value: string): string {
  return value.trim()
}

function googleWorkspaceSignature(apiKey: string, clientId: string): string {
  return `${apiKey.trim()}::${clientId.trim()}`
}
