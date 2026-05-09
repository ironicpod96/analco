"use client"

import { useEffect, useRef, useState, type ReactNode } from "react"

import { cn } from "@/lib/utils"

export function ReanalyseMotion({
  active,
  className,
  children,
}: {
  active?: boolean
  className?: string
  children: ReactNode
}) {
  const wasActive = useRef(false)
  const [settling, setSettling] = useState(false)

  useEffect(() => {
    if (active) {
      wasActive.current = true
      queueMicrotask(() => setSettling(false))
      return
    }
    if (!wasActive.current) return
    wasActive.current = false
    queueMicrotask(() => setSettling(true))
    const timeout = window.setTimeout(() => setSettling(false), 280)
    return () => window.clearTimeout(timeout)
  }, [active])

  return (
    <div
      className={cn(
        "reanalyse-target",
        active && "reanalyse-pending",
        settling && "reanalyse-settling",
        className
      )}
    >
      {children}
    </div>
  )
}
