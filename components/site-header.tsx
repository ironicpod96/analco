"use client"

import Link from "next/link"
import Image from "next/image"
import { useRouter } from "next/navigation"
import { useTheme } from "next-themes"

import analcoLogo from "@/analco.svg"
import { useNavbarSlots } from "@/components/navbar-slots"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu"
import { MoreVertical, Copy, Plus, Settings, Sun, Moon, Monitor } from "lucide-react"
import { toast } from "sonner"
import { getPendingUrls, getLastRun, clearLastRun, clearPendingUrls } from "@/lib/storage"

export function SiteHeader() {
  const { setLeftEl, setRightEl } = useNavbarSlots()
  const router = useRouter()
  const { theme, setTheme } = useTheme()

  function copyAllLinks() {
    const pending = getPendingUrls()
    const last = getLastRun()
    let urls: string[] = []
    if (pending.length > 0) urls = pending
    else if (last && Array.isArray(last.urls) && last.urls.length > 0) urls = last.urls
    else if (last && Array.isArray(last.sites) && last.sites.length > 0)
      urls = last.sites.map((s) => s.url)

    if (!urls || urls.length === 0) {
      toast.error("No URLs found to copy")
      return
    }

    const text = urls.join("\n")
    if (typeof navigator !== "undefined" && navigator.clipboard && navigator.clipboard.writeText) {
      void navigator.clipboard.writeText(text).then(
        () => toast.success(`Copied ${urls.length} links`),
        () => toast.error("Could not copy links")
      )
    } else {
      const ta = document.createElement("textarea")
      ta.value = text
      ta.style.position = "fixed"
      ta.style.opacity = "0"
      document.body.appendChild(ta)
      ta.select()
      try {
        document.execCommand("copy")
        toast.success(`Copied ${urls.length} links`)
      } catch {
        toast.error("Could not copy links")
      } finally {
        document.body.removeChild(ta)
      }
    }
  }

  function newAnalysis() {
    clearLastRun()
    clearPendingUrls()
    router.push("/")
  }

  return (
    <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="mx-auto grid h-14 max-w-7xl grid-cols-[1fr_auto_1fr] items-center gap-4 px-6">
        <div ref={setLeftEl} className="flex items-center justify-start" />
        <Link
          href="/"
          className="flex items-center"
          aria-label="AnalCo home"
        >
          <Image
            src={analcoLogo}
            alt="AnalCo"
            width={79}
            height={22}
            priority
            className="h-[22px] w-auto invert dark:invert-0"
          />
        </Link>
        <div className="flex items-center justify-end gap-1 text-sm">
          <div ref={setRightEl} className="flex items-center gap-2" />

          <DropdownMenu>
            <DropdownMenuTrigger
              render={<Button variant="ghost" size="icon" aria-label="Open menu" />}
            >
              <MoreVertical className="h-4 w-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem onClick={newAnalysis}>
                <div className="flex items-center gap-2">
                  <Plus className="h-3.5 w-3.5" />
                  New analysis
                </div>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={copyAllLinks}>
                <div className="flex items-center gap-2">
                  <Copy className="h-3.5 w-3.5" />
                  Copy all links
                </div>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => router.push("/settings")}>
                <div className="flex items-center gap-2">
                  <Settings className="h-3.5 w-3.5" />
                  Settings
                </div>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <div className="px-2 py-2">
                <div className="mb-2 text-xs text-muted-foreground">Theme</div>
                <div className="relative w-full">
                  <div className="relative flex items-center rounded-full bg-muted/10 p-1">
                    <div
                      className="pointer-events-none absolute top-1 bottom-1 w-1/3 rounded-full bg-accent"
                      style={{
                        left:
                          ((theme as string) === "light"
                            ? 0
                            : (theme as string) === "dark"
                            ? 33.333333
                            : 66.666666) + "%",
                        transition: "left 160ms ease",
                      }}
                    />
                    <button
                      aria-label="Light theme"
                      onClick={() => setTheme("light")}
                      className={"relative z-10 flex-1 p-2 text-sm text-muted-foreground flex items-center justify-center" +
                        (((theme as string) ?? "system") === "light" ? " text-accent-foreground" : "")}
                    >
                      <Sun className="h-4 w-4" />
                    </button>
                    <button
                      aria-label="Dark theme"
                      onClick={() => setTheme("dark")}
                      className={"relative z-10 flex-1 p-2 text-sm text-muted-foreground flex items-center justify-center" +
                        (((theme as string) ?? "system") === "dark" ? " text-accent-foreground" : "")}
                    >
                      <Moon className="h-4 w-4" />
                    </button>
                    <button
                      aria-label="System theme"
                      onClick={() => setTheme("system")}
                      className={"relative z-10 flex-1 p-2 text-sm text-muted-foreground flex items-center justify-center" +
                        (((theme as string) ?? "system") === "system" ? " text-accent-foreground" : "")}
                    >
                      <Monitor className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  )
}
