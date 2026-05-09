import type { ConnectionTest } from "@/lib/types"

export async function testGoogleWorkspaceKeys({
  apiKey,
  clientId,
}: {
  apiKey: string
  clientId: string
}): Promise<ConnectionTest> {
  const key = apiKey.trim()
  const oauthClient = clientId.trim()
  if (!key) return { ok: false, error: "Add a Google API key." }
  if (!oauthClient) return { ok: false, error: "Add a Google OAuth client ID." }
  if (!/^[0-9]+-[a-z0-9_-]+\.apps\.googleusercontent\.com$/i.test(oauthClient)) {
    return { ok: false, error: "OAuth client ID should end with .apps.googleusercontent.com." }
  }

  const [drive, slides] = await Promise.all([
    probeGoogleApi(
      `https://www.googleapis.com/drive/v3/files?pageSize=1&key=${encodeURIComponent(key)}`,
      "Google Drive API"
    ),
    probeGoogleApi(
      `https://slides.googleapis.com/v1/presentations/test-presentation-id?key=${encodeURIComponent(key)}`,
      "Google Slides API"
    ),
  ])

  if (!drive.ok) return drive
  if (!slides.ok) return slides
  return { ok: true }
}

async function probeGoogleApi(url: string, label: string): Promise<ConnectionTest> {
  try {
    const response = await fetch(url)
    const body = (await response.json().catch(() => null)) as
      | { error?: { code?: number; message?: string; status?: string } }
      | null
    const message = body?.error?.message ?? ""
    const status = body?.error?.status ?? ""

    if (response.ok) return { ok: true }
    if (/API key not valid/i.test(message)) {
      return { ok: false, error: "Google API key is not valid." }
    }
    if (/has not been used|is disabled/i.test(message)) {
      return { ok: false, error: `${label} is not enabled for this Google Cloud project.` }
    }
    if (status === "UNAUTHENTICATED" || response.status === 401) return { ok: true }
    if (response.status === 403 && label === "Google Drive API") return { ok: true }
    if (/insufficient permissions|permission/i.test(message)) return { ok: true }
    if (response.status === 404 && label === "Google Slides API") return { ok: true }
    return {
      ok: false,
      error: message ? `${label}: ${message}` : `${label} test failed.`,
    }
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : `${label} test failed.`,
    }
  }
}
