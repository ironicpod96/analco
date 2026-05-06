"use client"

import { Button } from "@/components/ui/button"

export default function AnalysisError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col items-start gap-4 px-6 py-12">
      <h2 className="text-lg font-semibold tracking-tight">Something went wrong</h2>
      <p className="text-sm text-muted-foreground">{error.message}</p>
      <Button onClick={reset}>Try again</Button>
    </div>
  )
}
