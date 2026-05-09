"use client"

import { Download, FileImage, FolderOpen, Image as ImageIcon, Presentation } from "lucide-react"
import { useMemo, useState } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  buildOverviewRubricSlide,
  type PresentationElement,
  type PresentationSlide,
} from "@/lib/presentation"
import { downloadPng, downloadSvg } from "@/lib/presentation-export"
import {
  exportSlideToNewPresentation,
  exportSlideToPickedPresentation,
} from "@/lib/google-slides"
import { getGoogleWorkspaceKeys } from "@/lib/storage"
import type { SiteAudit } from "@/lib/types"
import { cn } from "@/lib/utils"

export function OverviewRubricFrame({ audits }: { audits: SiteAudit[] }) {
  const slide = useMemo(() => buildOverviewRubricSlide(audits), [audits])
  const [exporting, setExporting] = useState<"png" | "svg" | "new" | "append" | null>(null)

  async function runExport(kind: "png" | "svg" | "new" | "append") {
    setExporting(kind)
    try {
      if (kind === "svg") {
        downloadSvg(slide)
        toast.success("SVG exported")
      } else if (kind === "png") {
        await downloadPng(slide)
        toast.success("PNG exported")
      } else if (kind === "new") {
        const id = await exportSlideToNewPresentation(slide, getGoogleWorkspaceKeys())
        toast.success("Google Slides deck created", {
          action: {
            label: "Open",
            onClick: () => window.open(`https://docs.google.com/presentation/d/${id}/edit`, "_blank"),
          },
        })
      } else {
        const id = await exportSlideToPickedPresentation(slide, getGoogleWorkspaceKeys())
        toast.success("Slide added to Google Slides", {
          action: {
            label: "Open",
            onClick: () => window.open(`https://docs.google.com/presentation/d/${id}/edit`, "_blank"),
          },
        })
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Export failed")
    } finally {
      setExporting(null)
    }
  }

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">Overview Rubric</h2>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button variant="outline" size="sm" disabled={exporting != null}>
                <Download className="h-3.5 w-3.5" />
                {exporting ? "Exporting" : "Export"}
              </Button>
            }
          />
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuItem onClick={() => runExport("new")}>
              <Presentation className="h-3.5 w-3.5" />
              New Google Slides deck
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => runExport("append")}>
              <FolderOpen className="h-3.5 w-3.5" />
              Add to existing deck
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => runExport("svg")}>
              <FileImage className="h-3.5 w-3.5" />
              SVG
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => runExport("png")}>
              <ImageIcon className="h-3.5 w-3.5" />
              PNG
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <SlidePreview slide={slide} />
    </section>
  )
}

function SlidePreview({ slide }: { slide: PresentationSlide }) {
  return (
    <div className="w-full overflow-auto rounded-lg border bg-muted/30 p-4">
      <div
        className="relative mx-auto max-h-[66vh] min-h-[480px] max-w-full overflow-hidden bg-white shadow-sm"
        style={{
          aspectRatio: `${slide.width} / ${slide.height}`,
          height: "min(66vh, calc((100vw - 5rem) * 0.5625))",
          fontFamily: "var(--font-montserrat), Montserrat, Arial, sans-serif",
          containerType: "inline-size",
        }}
      >
        {slide.elements.map((element) => (
          <SlideElement key={element.id} element={element} slide={slide} />
        ))}
      </div>
    </div>
  )
}

function SlideElement({
  element,
  slide,
}: {
  element: PresentationElement
  slide: PresentationSlide
}) {
  if (element.type === "line") {
    const horizontal = element.y1 === element.y2
    return (
      <div
        className="absolute"
        style={{
          left: pct(Math.min(element.x1, element.x2), slide.width),
          top: pct(Math.min(element.y1, element.y2), slide.height),
          width: horizontal ? pct(Math.abs(element.x2 - element.x1), slide.width) : `${element.strokeWidth}px`,
          height: horizontal ? `${element.strokeWidth}px` : pct(Math.abs(element.y2 - element.y1), slide.height),
          borderTop: horizontal
            ? `${element.strokeWidth}px ${element.dash ? "dashed" : "solid"} ${element.stroke}`
            : undefined,
          borderLeft: horizontal
            ? undefined
            : `${element.strokeWidth}px ${element.dash ? "dashed" : "solid"} ${element.stroke}`,
        }}
      />
    )
  }

  const style = {
    left: pct(element.x, slide.width),
    top: pct(element.y, slide.height),
    width: pct(element.width, slide.width),
    height: pct(element.height, slide.height),
  }

  if (element.type === "rect") {
    return (
      <div
        className="absolute"
        style={{
          ...style,
          backgroundColor: element.fill,
          borderColor: element.stroke,
          borderStyle: element.dash ? "dashed" : "solid",
          borderWidth: element.stroke ? `${element.strokeWidth ?? 1}px` : 0,
        }}
      />
    )
  }

  if (element.type === "image") {
    return (
      <img
        alt=""
        src={element.url}
        className="absolute object-contain"
        style={style}
        draggable={false}
      />
    )
  }

  return (
    <div
      className={cn(
        "absolute flex overflow-hidden leading-tight",
        element.align === "center" && "justify-center text-center",
        element.align === "right" && "justify-end text-right",
        element.valign === "middle" && "items-center",
        element.valign === "bottom" && "items-end"
      )}
      style={{
        ...style,
        color: element.fill,
        fontSize: `${(element.fontSize / slide.width) * 100}cqw`,
        fontWeight: element.weight ?? 400,
      }}
    >
      {element.text}
    </div>
  )
}

function pct(value: number, max: number): string {
  return `${(value / max) * 100}%`
}
