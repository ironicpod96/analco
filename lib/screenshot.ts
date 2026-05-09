const SCREENSHOT_BATCH_SIZE = 1

type ScreenshotResponse =
  | { dataUrl: string; error?: never }
  | { dataUrl?: never; error: string }

let activeCaptures = 0
const captureQueue: Array<() => void> = []

export async function captureFullPageScreenshot(url: string): Promise<string> {
  return enqueueScreenshotCapture(() => requestFullPageScreenshot(url))
}

async function requestFullPageScreenshot(url: string): Promise<string> {
  const res = await fetch("/api/screenshot", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
  })
  const data = (await res.json().catch(() => null)) as ScreenshotResponse | null
  if (!res.ok || !data?.dataUrl) {
    throw new Error(data?.error || `Screenshot API HTTP ${res.status}`)
  }
  return normalizeScreenshotForAI(data.dataUrl)
}

async function enqueueScreenshotCapture<T>(task: () => Promise<T>): Promise<T> {
  if (activeCaptures >= SCREENSHOT_BATCH_SIZE) {
    await new Promise<void>((resolve) => captureQueue.push(resolve))
  }
  activeCaptures += 1
  try {
    return await task()
  } finally {
    activeCaptures -= 1
    captureQueue.shift()?.()
  }
}

async function normalizeScreenshotForAI(dataUrl: string): Promise<string> {
  const img = await loadImage(dataUrl)
  const maxDimension = 7800
  const maxShortSide = 1800
  const scale = Math.min(
    1,
    maxDimension / img.width,
    maxDimension / img.height,
    maxShortSide / Math.min(img.width, img.height)
  )
  if (scale >= 1) return dataUrl

  const canvas = document.createElement("canvas")
  canvas.width = Math.max(1, Math.round(img.width * scale))
  canvas.height = Math.max(1, Math.round(img.height * scale))
  const ctx = canvas.getContext("2d")
  if (!ctx) throw new Error("Could not prepare screenshot image")
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
  return canvas.toDataURL("image/jpeg", 0.88)
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error("Could not decode screenshot image"))
    img.src = src
  })
}
