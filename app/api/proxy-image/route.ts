export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url).searchParams.get("url")
  if (!url) return Response.json({ error: "url required" }, { status: 400 })

  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
      },
      signal: AbortSignal.timeout(10_000),
      redirect: "follow",
    } as RequestInit)

    const buf = await res.arrayBuffer()
    const contentType = res.headers.get("content-type") ?? "image/png"
    if (!contentType.startsWith("image/") || buf.byteLength === 0) {
      return Response.json({ error: "not an image" }, { status: 502 })
    }
    return new Response(buf, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=86400",
        "Access-Control-Allow-Origin": "*",
      },
    })
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "fetch failed" },
      { status: 502 }
    )
  }
}
