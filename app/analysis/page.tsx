"use client"

import { Plus } from "lucide-react"
import { useRouter } from "next/navigation"
import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"

import { SiteCard, type SiteCardState } from "@/components/site-card"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { runPool } from "@/lib/concurrency"
import { extractMetrics, fetchPageSpeed, PageSpeedError } from "@/lib/pagespeed"
import { getKeys } from "@/lib/storage"

const PENDING_KEY = "analco:pendingUrls"

export default function AnalysisPage() {
  const router = useRouter()
  const [states, setStates] = useState<SiteCardState[]>([])
  const startedRef = useRef(false)

  useEffect(() => {
    if (startedRef.current) return
    startedRef.current = true

    let urls: string[] = []
    try {
      const raw = window.sessionStorage.getItem(PENDING_KEY)
      if (raw) urls = JSON.parse(raw) as string[]
    } catch {
      urls = []
    }
    if (urls.length === 0) {
      router.replace("/")
      return
    }

    const { pagespeed: psKey } = getKeys()
    if (!psKey) {
      toast.error("Add your PageSpeed key in Settings to start.")
      router.replace("/settings")
      return
    }

    setStates(
      urls.map((url) => ({ url, status: "queued", metrics: null }))
    )

    runPool(urls, 5, async (url, i) => {
      setStates((prev) => updateAt(prev, i, { status: "fetching" }))
      try {
        const raw = await fetchPageSpeed(url, psKey)
        const metrics = extractMetrics(url, raw)
        setStates((prev) => updateAt(prev, i, { status: "done", metrics }))
      } catch (err) {
        const message = err instanceof PageSpeedError ? err.message : err instanceof Error ? err.message : "Unknown error"
        setStates((prev) => updateAt(prev, i, { status: "error", error: message }))
      }
    }).catch(() => {
      /* per-item errors already captured above */
    })
  }, [router])

  function newAnalysis() {
    window.sessionStorage.removeItem(PENDING_KEY)
    router.push("/")
  }

  const allSettled = states.length > 0 && states.every((s) => s.status === "done" || s.status === "error")
  const anyDone = states.some((s) => s.status === "done")

  return (
    <div className="flex flex-1 flex-col">
      <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-4 px-6 pt-6">
        <div className="space-y-0.5">
          <h1 className="text-lg font-semibold tracking-tight">Analysis</h1>
          <p className="text-xs text-muted-foreground">
            {states.length} site{states.length === 1 ? "" : "s"} ·{" "}
            {states.filter((s) => s.status === "done").length} ready
            {allSettled && " · complete"}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={newAnalysis}>
          <Plus className="h-4 w-4" />
          New analysis
        </Button>
      </div>

      <Tabs defaultValue="cards" className="mx-auto mt-4 flex w-full max-w-7xl flex-1 flex-col px-6">
        <TabsList className="self-start">
          <TabsTrigger value="cards">Cards</TabsTrigger>
          <TabsTrigger value="comparison" disabled={!anyDone}>Comparison</TabsTrigger>
        </TabsList>
        <TabsContent value="cards" className="mt-4 flex-1">
          <div className="-mx-6 flex gap-4 overflow-x-auto px-6 pb-6">
            {states.map((state) => (
              <SiteCard key={state.url} state={state} />
            ))}
          </div>
        </TabsContent>
        <TabsContent value="comparison" className="mt-4 flex-1">
          <p className="text-sm text-muted-foreground">
            Comparison tab arrives in step 12.
          </p>
        </TabsContent>
      </Tabs>
    </div>
  )
}

function updateAt(arr: SiteCardState[], i: number, patch: Partial<SiteCardState>): SiteCardState[] {
  const next = arr.slice()
  next[i] = { ...next[i], ...patch }
  return next
}
