export type ApiKeys = {
  pagespeed: string
  anthropic: string
}

export type ConnectionTest =
  | { ok: true }
  | { ok: false; error: string }
