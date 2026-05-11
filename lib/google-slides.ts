"use client"

import type { PresentationElement, PresentationSlide } from "@/lib/presentation"
import { plainTextFromRichText, richTextStyleRanges } from "@/lib/rich-text"

export type GoogleSlidesConfig = {
  apiKey: string
  clientId: string
}

type TokenClient = {
  requestAccessToken: (options?: { prompt?: string }) => void
}

declare global {
  interface Window {
    gapi?: {
      load: (api: string, callback: { callback: () => void; onerror: () => void }) => void
    }
    google?: {
      accounts?: {
        oauth2?: {
          initTokenClient: (config: {
            client_id: string
            scope: string
            callback: (response: { access_token?: string; error?: string }) => void
          }) => TokenClient
        }
      }
      picker?: {
        Action: { PICKED: string }
        DocsView: new (viewId?: string) => PickerDocsView
        DocsViewMode: { LIST: string }
        Feature: { NAV_HIDDEN: string }
        PickerBuilder: new () => PickerBuilder
        Response: { ACTION: string; DOCUMENTS: string }
        ViewId: { PRESENTATIONS: string }
      }
    }
  }
}

type PickerDocsView = {
  setIncludeFolders: (includeFolders: boolean) => PickerDocsView
  setMimeTypes: (mimeTypes: string) => PickerDocsView
  setMode: (mode: string) => PickerDocsView
}

type PickerBuilder = {
  addView: (view: PickerDocsView) => PickerBuilder
  enableFeature: (feature: string) => PickerBuilder
  setOAuthToken: (token: string) => PickerBuilder
  setDeveloperKey: (key: string) => PickerBuilder
  setCallback: (callback: (data: Record<string, unknown>) => void) => PickerBuilder
  build: () => { setVisible: (visible: boolean) => void }
}

const SCOPES = [
  "https://www.googleapis.com/auth/presentations",
  "https://www.googleapis.com/auth/drive.file",
  "https://www.googleapis.com/auth/drive.metadata.readonly",
].join(" ")

type SlidesRequest = Record<string, unknown>
type DeckMeta = {
  pageWidthPt: number
  pageHeightPt: number
}

type ScaleContext = {
  scale: number
  offsetX: number
  offsetY: number
}

export async function exportSlideToNewPresentation(
  slide: PresentationSlide,
  config: GoogleSlidesConfig
): Promise<string> {
  validateConfig(config)
  const token = await requestGoogleToken(config.clientId)
  const presentation = await createPresentation(slide.title, token)
  await appendSlideToPresentation(presentation.presentationId, slide, token)
  return presentation.presentationId
}

export async function exportSlideToPickedPresentation(
  slide: PresentationSlide,
  config: GoogleSlidesConfig
): Promise<string> {
  validateConfig(config)
  const token = await requestGoogleToken(config.clientId)
  const presentationId = await pickPresentation(config.apiKey, token)
  await appendSlideToPresentation(presentationId, slide, token)
  return presentationId
}

async function appendSlideToPresentation(
  presentationId: string,
  slide: PresentationSlide,
  token: string
): Promise<void> {
  const deck = await getDeckMeta(presentationId, token)
  const scale = scaleFor(slide, deck)
  const exportId = Date.now().toString(36)
  const response = await sendBatchUpdate(
    presentationId,
    buildSlideRequests(slide, scale, exportId, true),
    token
  )
  if (response.ok) return

  const message = await googleError(response, "Could not export to Google Slides")
  if (!/provided image was not found|createImage/i.test(message)) throw new Error(message)

  const fallbackResponse = await sendBatchUpdate(
    presentationId,
    buildSlideRequests(slide, scale, `${exportId}-noimg`, false),
    token
  )
  if (!fallbackResponse.ok) {
    throw new Error(await googleError(fallbackResponse, "Could not export to Google Slides"))
  }
}

function buildSlideRequests(
  slide: PresentationSlide,
  scale: ScaleContext,
  exportId: string,
  includeImages: boolean
): SlidesRequest[] {
  const slideObjectId = objectId(`${slide.id}-slide-${exportId}`)
  return [
    {
      createSlide: {
        objectId: slideObjectId,
      },
    },
    ...rectRequests(
      {
        type: "rect",
        id: "page-bg",
        x: 0,
        y: 0,
        width: slide.width,
        height: slide.height,
        fill: slide.background,
      },
      slideObjectId,
      exportId,
      scale
    ),
    ...slide.elements.flatMap((element) =>
      elementRequests(element, slideObjectId, slide, exportId, scale, includeImages)
    ),
  ]
}

async function sendBatchUpdate(
  presentationId: string,
  requests: SlidesRequest[],
  token: string
): Promise<Response> {
  return fetch(
    `https://slides.googleapis.com/v1/presentations/${presentationId}:batchUpdate`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ requests }),
    }
  )
}

async function createPresentation(title: string, token: string): Promise<{ presentationId: string }> {
  const response = await fetch("https://slides.googleapis.com/v1/presentations", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ title }),
  })
  if (!response.ok) throw new Error(await googleError(response, "Could not create presentation"))
  return (await response.json()) as { presentationId: string }
}

async function getDeckMeta(presentationId: string, token: string): Promise<DeckMeta> {
  const response = await fetch(
    `https://slides.googleapis.com/v1/presentations/${presentationId}?fields=pageSize`,
    { headers: { Authorization: `Bearer ${token}` } }
  )
  if (!response.ok) throw new Error(await googleError(response, "Could not inspect presentation"))
  const body = (await response.json()) as {
    pageSize?: {
      width?: { magnitude?: number; unit?: string }
      height?: { magnitude?: number; unit?: string }
    }
  }

  return {
    pageWidthPt: dimensionToPt(body.pageSize?.width, 720),
    pageHeightPt: dimensionToPt(body.pageSize?.height, 405),
  }
}

function elementRequests(
  element: PresentationElement,
  pageObjectId: string,
  slide: PresentationSlide,
  exportId: string,
  scale: ScaleContext,
  includeImages: boolean
) : SlidesRequest[] {
  if (element.type === "rect") return rectRequests(element, pageObjectId, exportId, scale)
  if (element.type === "image") {
    return includeImages ? imageRequests(element, pageObjectId, exportId, scale) : []
  }
  if (element.type === "line") return lineRequests(element, pageObjectId, exportId, scale)
  if (element.type === "mosaic") return mosaicRequests(element, pageObjectId, exportId, scale)
  if (element.type === "radialChart") return radialChartRequests(element, pageObjectId, slide, exportId, scale)
  return textRequests(element, pageObjectId, slide, exportId, scale)
}

function rectRequests(
  element: Extract<PresentationElement, { type: "rect" }>,
  pageObjectId: string,
  exportId: string,
  scale: ScaleContext
) : SlidesRequest[] {
  const id = objectId(`${exportId}-${element.id}`)
  const shapeType = element.borderRadius && element.borderRadius > 0 ? "ROUND_RECTANGLE" : "RECTANGLE"
  return [
    {
      createShape: {
        objectId: id,
        shapeType,
        elementProperties: {
          pageObjectId,
          size: size(element.width, element.height, scale),
          transform: transform(element.x, element.y, scale),
        },
      },
    },
    {
      updateShapeProperties: {
        objectId: id,
        shapeProperties: {
          shapeBackgroundFill: { solidFill: { color: rgb(element.fill) } },
          outline: { propertyState: "NOT_RENDERED" },
        },
        fields: "shapeBackgroundFill,outline",
      },
    },
  ]
}

function imageRequests(
  element: Extract<PresentationElement, { type: "image" }>,
  pageObjectId: string,
  exportId: string,
  scale: ScaleContext
) : SlidesRequest[] {
  return [
    {
      createImage: {
        objectId: objectId(`${exportId}-${element.id}`),
        url: element.url,
        elementProperties: {
          pageObjectId,
          size: size(element.width, element.height, scale),
          transform: transform(element.x, element.y, scale),
        },
      },
    },
  ]
}

function lineRequests(
  element: Extract<PresentationElement, { type: "line" }>,
  pageObjectId: string,
  exportId: string,
  scale: ScaleContext
): SlidesRequest[] {
  const horizontal = element.y1 === element.y2
  const x = Math.min(element.x1, element.x2)
  const y = Math.min(element.y1, element.y2)
  const width = horizontal ? Math.abs(element.x2 - element.x1) : element.strokeWidth
  const height = horizontal ? element.strokeWidth : Math.abs(element.y2 - element.y1)
  return rectRequests(
    {
      type: "rect",
      id: element.id,
      x,
      y,
      width,
      height,
      fill: element.stroke,
    },
    pageObjectId,
    exportId,
    scale
  )
}

function mosaicRequests(
  element: Extract<PresentationElement, { type: "mosaic" }>,
  pageObjectId: string,
  exportId: string,
  scale: ScaleContext
): SlidesRequest[] {
  const colors = ["#111111", "#FE0022", "#D9D9D9", "#F6F6F6"]
  const gap = 8
  const col = (element.width - gap * 3) / 4
  const row = (element.height - gap * 2) / 3
  const requests: SlidesRequest[] = []
  for (let i = 0; i < 12; i += 1) {
    const c = i % 4
    const r = Math.floor(i / 4)
    const spanC = i === 0 || i === 7 ? 2 : 1
    const spanR = i === 0 ? 2 : 1
    requests.push(
      ...rectRequests(
        {
          type: "rect",
          id: `${element.id}-${i}`,
          x: element.x + c * (col + gap),
          y: element.y + r * (row + gap),
          width: col * spanC + gap * (spanC - 1),
          height: row * spanR + gap * (spanR - 1),
          fill: colors[i % colors.length],
        },
        pageObjectId,
        exportId,
        scale
      )
    )
  }
  return requests
}

function radialChartRequests(
  element: Extract<PresentationElement, { type: "radialChart" }>,
  pageObjectId: string,
  slide: PresentationSlide,
  exportId: string,
  scale: ScaleContext
): SlidesRequest[] {
  const outerSize = Math.min(element.width, element.height)
  const x = element.x + (element.width - outerSize) / 2
  const y = element.y + (element.height - outerSize) / 2
  return [
    ...ellipseRequests(`${element.id}-track`, x, y, outerSize, outerSize, "#FFFFFF", "#EEEEEE", outerSize * 0.055, pageObjectId, exportId, scale),
    ...ellipseRequests(`${element.id}-value`, x + outerSize * 0.08, y + outerSize * 0.08, outerSize * 0.84, outerSize * 0.84, "#FFFFFF", element.color, outerSize * 0.05, pageObjectId, exportId, scale),
    ...textRequests(
      {
        type: "text",
        id: `${element.id}-center`,
        x: element.x,
        y: element.y + element.height * 0.36,
        width: element.width,
        height: element.height * 0.18,
        text: element.centerLabel,
        fill: "#111111",
        fontSize: element.width * 0.16,
        weight: 800,
        align: "center",
      },
      pageObjectId,
      slide,
      exportId,
      scale
    ),
    ...(element.subLabel
      ? textRequests(
          {
            type: "text",
            id: `${element.id}-sub`,
            x: element.x,
            y: element.y + element.height * 0.52,
            width: element.width,
            height: element.height * 0.13,
            text: element.subLabel,
            fill: "#666666",
            fontSize: element.width * 0.04,
            weight: 600,
            align: "center",
          },
          pageObjectId,
          slide,
          exportId,
          scale
        )
      : []),
    ...(element.footerLabel
      ? textRequests(
          {
            type: "text",
            id: `${element.id}-footer`,
            x: element.x,
            y: element.y + element.height * 0.64,
            width: element.width,
            height: element.height * 0.08,
            text: element.footerLabel,
            fill: "#8B8B8B",
            fontSize: element.width * 0.038,
            weight: 500,
            align: "center",
          },
          pageObjectId,
          slide,
          exportId,
          scale
        )
      : []),
  ]
}

function ellipseRequests(
  idValue: string,
  x: number,
  y: number,
  width: number,
  height: number,
  fill: string,
  stroke: string,
  strokeWidth: number,
  pageObjectId: string,
  exportId: string,
  scale: ScaleContext
): SlidesRequest[] {
  const id = objectId(`${exportId}-${idValue}`)
  return [
    {
      createShape: {
        objectId: id,
        shapeType: "ELLIPSE",
        elementProperties: {
          pageObjectId,
          size: size(width, height, scale),
          transform: transform(x, y, scale),
        },
      },
    },
    {
      updateShapeProperties: {
        objectId: id,
        shapeProperties: {
          shapeBackgroundFill: { solidFill: { color: rgb(fill) } },
          outline: {
            outlineFill: { solidFill: { color: rgb(stroke) } },
            weight: { magnitude: strokeWidth * scale.scale, unit: "PT" },
          },
        },
        fields: "shapeBackgroundFill,outline",
      },
    },
  ]
}

function textRequests(
  element: Extract<PresentationElement, { type: "text" }>,
  pageObjectId: string,
  slide: PresentationSlide,
  exportId: string,
  scale: ScaleContext
) : SlidesRequest[] {
  const id = objectId(`${exportId}-${element.id}`)
  const box = textBox(element)
  return [
    {
      createShape: {
        objectId: id,
        shapeType: "TEXT_BOX",
        elementProperties: {
          pageObjectId,
          size: size(box.width, box.height, scale),
          transform: transform(box.x, box.y, scale),
        },
      },
    },
    {
      insertText: {
        objectId: id,
        insertionIndex: 0,
        text: element.richText ? plainTextFromRichText(element.richText) : element.text,
      },
    },
    {
      updateTextStyle: {
        objectId: id,
        style: {
          fontFamily: slide.fontFamily,
          fontSize: { magnitude: element.fontSize * scale.scale, unit: "PT" },
          foregroundColor: { opaqueColor: rgb(element.fill) },
          bold: (element.weight ?? 400) >= 700,
          link: element.href ? { url: element.href } : undefined,
        },
        fields: element.href ? "fontFamily,fontSize,foregroundColor,bold,link" : "fontFamily,fontSize,foregroundColor,bold",
      },
    },
    {
      updateParagraphStyle: {
        objectId: id,
        style: {
          alignment:
            element.align === "center" ? "CENTER" : element.align === "right" ? "END" : "START",
        },
        fields: "alignment",
      },
    },
    {
      updateShapeProperties: {
        objectId: id,
        shapeProperties: {
          shapeBackgroundFill: { propertyState: "NOT_RENDERED" },
          outline: { propertyState: "NOT_RENDERED" },
          contentAlignment:
            element.valign === "middle"
              ? "MIDDLE"
              : element.valign === "bottom"
                ? "BOTTOM"
                : "TOP",
        },
        fields: "shapeBackgroundFill,outline,contentAlignment",
      },
    },
    ...richTextStyleRequests(id, element),
  ]
}

function textBox(element: Extract<PresentationElement, { type: "text" }>) {
  const inset = 4
  return {
    x: element.x + inset,
    y: element.y + inset,
    width: Math.max(1, element.width - inset * 2),
    height: Math.max(1, element.height - inset * 2),
  }
}

function richTextStyleRequests(
  objectId: string,
  element: Extract<PresentationElement, { type: "text" }>
): SlidesRequest[] {
  const ranges = richTextStyleRanges(element.richText)
  if (ranges.length === 0) return []
  return ranges.map((range) => ({
    updateTextStyle: {
      objectId,
      textRange: {
        type: "FIXED_RANGE",
        startIndex: range.start,
        endIndex: range.end,
      },
      style: {
        bold: range.bold ?? false,
        italic: range.italic ?? false,
      },
      fields: "bold,italic",
    },
  }))
}

async function requestGoogleToken(clientId: string): Promise<string> {
  await loadScript("https://accounts.google.com/gsi/client", "google-identity-services")
  return new Promise((resolve, reject) => {
    const oauth = window.google?.accounts?.oauth2
    if (!oauth) {
      reject(new Error("Google Identity Services did not load"))
      return
    }
    const client = oauth.initTokenClient({
      client_id: clientId,
      scope: SCOPES,
      callback: (response) => {
        if (response.error) reject(new Error(response.error))
        else if (response.access_token) resolve(response.access_token)
        else reject(new Error("Google did not return an access token"))
      },
    })
    client.requestAccessToken({ prompt: "" })
  })
}

async function pickPresentation(apiKey: string, token: string): Promise<string> {
  await loadScript("https://apis.google.com/js/api.js", "google-api-js")
  await loadPickerApi()

  return new Promise((resolve, reject) => {
    const picker = window.google?.picker
    if (!picker) {
      reject(new Error("Google Picker did not load"))
      return
    }
    const view = new picker.DocsView(picker.ViewId.PRESENTATIONS)
      .setIncludeFolders(false)
      .setMimeTypes("application/vnd.google-apps.presentation")
      .setMode(picker.DocsViewMode.LIST)

    pickerBuilder(picker)
      .addView(view)
      .enableFeature(picker.Feature.NAV_HIDDEN)
      .setOAuthToken(token)
      .setDeveloperKey(apiKey)
      .setCallback((data) => {
        if (data[picker.Response.ACTION] !== picker.Action.PICKED) return
        const docs = data[picker.Response.DOCUMENTS] as Array<{ id?: string }> | undefined
        const id = docs?.[0]?.id
        if (id) resolve(id)
        else reject(new Error("No presentation was selected"))
      })
      .build()
      .setVisible(true)
  })
}

function loadPickerApi(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.google?.picker) {
      resolve()
      return
    }
    if (!window.gapi) {
      reject(new Error("Google API loader did not load"))
      return
    }
    window.gapi.load("picker", {
      callback: () => resolve(),
      onerror: () => reject(new Error("Google Picker did not load")),
    })
  })
}

function pickerBuilder(picker: NonNullable<Window["google"]>["picker"]): PickerBuilder {
  if (!picker) throw new Error("Google Picker did not load")
  return new picker.PickerBuilder()
}

function loadScript(src: string, id: string): Promise<void> {
  const existing = document.getElementById(id)
  if (existing) return Promise.resolve()
  return new Promise((resolve, reject) => {
    const script = document.createElement("script")
    script.id = id
    script.src = src
    script.async = true
    script.defer = true
    script.onload = () => resolve()
    script.onerror = () => reject(new Error(`Could not load ${src}`))
    document.head.appendChild(script)
  })
}

function validateConfig(config: GoogleSlidesConfig): void {
  if (!config.apiKey.trim()) throw new Error("Add a Google API key in Settings")
  if (!config.clientId.trim()) throw new Error("Add a Google OAuth client ID in Settings")
}

function size(width: number, height: number, scale: ScaleContext) {
  return {
    width: { magnitude: width * scale.scale, unit: "PT" },
    height: { magnitude: height * scale.scale, unit: "PT" },
  }
}

function transform(x: number, y: number, scale: ScaleContext) {
  return {
    scaleX: 1,
    scaleY: 1,
    translateX: scale.offsetX + x * scale.scale,
    translateY: scale.offsetY + y * scale.scale,
    unit: "PT",
  }
}

function scaleFor(slide: PresentationSlide, deck: DeckMeta): ScaleContext {
  const scale = Math.min(deck.pageWidthPt / slide.width, deck.pageHeightPt / slide.height)
  return {
    scale,
    offsetX: (deck.pageWidthPt - slide.width * scale) / 2,
    offsetY: (deck.pageHeightPt - slide.height * scale) / 2,
  }
}

function dimensionToPt(
  dimension: { magnitude?: number; unit?: string } | undefined,
  fallback: number
): number {
  const value = dimension?.magnitude
  if (!value || !Number.isFinite(value)) return fallback
  if (dimension?.unit === "EMU") return value / 12700
  return value
}

function rgb(hex: string) {
  const clean = hex.replace("#", "")
  const value = Number.parseInt(clean, 16)
  return {
    rgbColor: {
      red: ((value >> 16) & 255) / 255,
      green: ((value >> 8) & 255) / 255,
      blue: (value & 255) / 255,
    },
  }
}

function objectId(value: string): string {
  return value.replace(/[^A-Za-z0-9_]/g, "_").slice(0, 48)
}

async function googleError(response: Response, fallback: string): Promise<string> {
  try {
    const body = (await response.json()) as { error?: { message?: string } }
    return body.error?.message ?? fallback
  } catch {
    return fallback
  }
}
