"use client"

import { useEffect, useState } from "react"

const PENDING_KEY = "analco:pendingUrls"

export default function AnalysisPage() {
  const [urls, setUrls] = useState<string[]>([])

  useEffect(() => {
    try {
      const raw = window.sessionStorage.getItem(PENDING_KEY)
      if (raw) setUrls(JSON.parse(raw) as string[])
    } catch {
      setUrls([])
    }
  }, [])

  return (
    <div className="mx-auto w-full max-w-7xl px-6 py-12">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Analysis</h1>
        <p className="text-sm text-muted-foreground">
          Card grid + comparison tab arrive in the next steps. Pending URLs from landing:
        </p>
      </div>
      <ul className="mt-6 space-y-1 font-mono text-sm">
        {urls.length === 0 ? (
          <li className="text-muted-foreground">(none)</li>
        ) : (
          urls.map((u) => <li key={u}>{u}</li>)
        )}
      </ul>
    </div>
  )
}
