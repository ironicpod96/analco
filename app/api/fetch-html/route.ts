export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url).searchParams.get("url")
  if (!url) return Response.json({ error: "url required" }, { status: 400 })

  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      },
      signal: AbortSignal.timeout(10_000),
      redirect: "follow",
    } as RequestInit)
    if (!res.ok) return Response.json({ error: `HTTP ${res.status}` }, { status: 502 })
    const html = (await res.text()).slice(0, 500_000)
    return new Response(html, { headers: { "Content-Type": "text/plain; charset=utf-8" } })
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "fetch failed" },
      { status: 502 }
    )
  }
}
