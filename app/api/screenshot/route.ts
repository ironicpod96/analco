export const runtime = "nodejs"

const SCREENSHOTONE_ENDPOINT = "https://api.screenshotone.com/take"
const FALLBACK_ACCESS_KEY = "4IqFWHuzAJrSQQ"

type ScreenshotRequest = {
  url?: string
}

export async function POST(request: Request): Promise<Response> {
  const body = (await request.json().catch(() => null)) as ScreenshotRequest | null
  const url = body?.url?.trim()
  if (!url) return Response.json({ error: "url required" }, { status: 400 })

  const accessKey = process.env.SCREENSHOTONE_KEY ?? FALLBACK_ACCESS_KEY

  const params = new URLSearchParams({
    access_key: accessKey,
    url,
    format: "jpg",
    block_ads: "true",
    block_cookie_banners: "true",
    block_banners_by_heuristics: "false",
    block_trackers: "true",
    cache: "true",
    cache_ttl: "14400",
    delay: "2",
    timeout: "60",
    response_type: "by_format",
    full_page: "true",
    full_page_scroll: "true",
    image_quality: "80",
  })

  try {
    const res = await fetch(`${SCREENSHOTONE_ENDPOINT}?${params.toString()}`, {
      method: "GET",
    })
    if (!res.ok) {
      const text = await res.text().catch(() => "")
      return Response.json(
        { error: `ScreenshotOne HTTP ${res.status}${text ? `: ${text.slice(0, 200)}` : ""}` },
        { status: 502 }
      )
    }
    const buffer = await res.arrayBuffer()
    const base64 = Buffer.from(buffer).toString("base64")
    const dataUrl = `data:image/jpeg;base64,${base64}`
    return Response.json({ dataUrl })
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "ScreenshotOne request failed" },
      { status: 502 }
    )
  }
}
