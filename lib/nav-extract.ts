import type { Cheerio, CheerioAPI } from "cheerio"
import type { Element } from "domhandler"

import type { NavData, NavItem } from "@/lib/types"

const UTILITY_RE =
  /^((?:[\w&+-]+\s+){0,3}(?:login|log in|sign in)|register|cart|bag|account|profile|language|my account|log out|logout|sign out|search|wishlist|favorites|favourites|orders|store locator|find a store|locations|help|support|contact|contact us)$/i

const CTA_RE =
  /^(apply|apply now|get started|sign up|start free|free trial|start for free|book demo|book a demo|request demo|request a demo|contact sales|talk to sales|join|join now|subscribe|buy|buy now|order now|donate|register now|enroll|get a quote|request quote|schedule|reserve)$/i

const UTILITY_HREF_RE =
  /^(?:tel:|mailto:|sms:)|^(?:https?:\/\/[^/]+)?\/(?:login|signin|sign-in|signup|sign-up|register|account|profile|cart|bag|checkout|wishlist|orders|search|help|support|contact)(?:\/|$|\?|#)/i

const CTA_CLASS_RE = /(?:^|\s)(?:btn|button|cta|primary|action)(?:[-_\s]|$)/i
const UTILITY_NAV_RE = /\b(util|utility|secondary|user|account)\b/i
const SIDEBAR_RE = /(?:^|[-_\s])(?:side|sidebar|side-nav)(?:[-_\s]|$)/i

const MAX_LABEL = 80

export async function fetchNavData(url: string): Promise<NavData | null> {
  try {
    const res = await fetch(`/api/extract-nav?${new URLSearchParams({ url })}`)
    if (!res.ok) return null
    return (await res.json()) as NavData
  } catch {
    return null
  }
}

export function parseNavFromHtml($: CheerioAPI): NavData {
  $("script, style, noscript, template").remove()

  const notes: string[] = []
  const brand = extractBrand($)
  const $main = pickMainNav($)
  if (!$main) notes.push("no <nav> element with substantial links found")

  const primary = $main ? extractPrimary($, $main) : []
  const utilities = extractUtilities($, primary, brand)
  const ctas = extractCtas($, primary, utilities)
  const breadcrumbs = extractBreadcrumbs($)
  const sidebar = extractSidebar($)

  // Cross-section dedupe by href, priority: brand > primary > utilities > ctas
  const used = new Set<string>()
  if (brand?.href) used.add(brand.href)
  collectHrefs(primary).forEach((h) => used.add(h))
  const utilitiesDeduped = utilities.filter((u) => !u.href || !used.has(u.href))
  utilitiesDeduped.forEach((u) => u.href && used.add(u.href))
  const ctasDeduped = ctas.filter((c) => !c.href || !used.has(c.href))

  const totalL1 = primary.length
  const hasDepth = primary.some((p) => p.children && p.children.length > 0)
  const confidence: NavData["meta"]["confidence"] =
    totalL1 >= 3 && (hasDepth || utilitiesDeduped.length > 0 || ctasDeduped.length > 0)
      ? "high"
      : totalL1 >= 1
        ? "medium"
        : "low"

  if (confidence === "low" && primary.length === 0) {
    notes.push("nav has no extractable links — JS rendering likely")
  } else if (!hasDepth && totalL1 > 0) {
    notes.push("no L2 detected in static HTML — dropdowns may be JS-rendered")
  }

  return {
    brand,
    primary,
    utilities: utilitiesDeduped,
    ctas: ctasDeduped,
    ...(breadcrumbs && breadcrumbs.length ? { breadcrumbs } : {}),
    ...(sidebar && sidebar.length >= 3 ? { sidebar } : {}),
    meta: { confidence, notes },
  }
}

// ─── Brand ────────────────────────────────────────────────────────────────────

function extractBrand($: CheerioAPI): NavItem | undefined {
  const tries: Array<() => NavItem | undefined> = [
    () => pickBrand($, $("header a:has(img)").first()),
    () => pickBrand($, $('header a[class*="logo" i]').first()),
    () => pickBrand($, $('header a[class*="brand" i]').first()),
    () => pickBrand($, $('a[class*="logo" i]:has(img)').first()),
    () => pickBrand($, $('header a[href="/"]').first()),
    () => pickBrand($, $('a[aria-label*="home" i]:has(img)').first()),
  ]
  for (const t of tries) {
    const b = t()
    if (b) return b
  }
  // Fallback: <title>
  const title = cleanText($("title").first().text())
  if (title) {
    const trimmed = title.split(/[|–—•·:]/)[0].trim()
    if (trimmed && trimmed.length <= 40) return { label: trimmed }
  }
  return undefined
}

function pickBrand($: CheerioAPI, $el: Cheerio<Element>): NavItem | undefined {
  if (!$el.length) return undefined
  const href = ($el.attr("href") || "").trim() || undefined
  const $img = $el.find("img").first()
  const alt = $img.attr("alt")?.trim()
  const aria = $el.attr("aria-label")?.trim()
  const text = cleanText($el.text())
  const label = normalizeBrandLabel(alt || aria || text || "")
  if (!label || label.length > 60) return undefined
  return { label, href }
}

function normalizeBrandLabel(label: string): string {
  return cleanText(label)
    .replace(/\s+(?:home\s?page|homepage|home)\s+(?:link|button|navigation|nav)?$/i, "")
    .replace(/\s+(?:link|button)$/i, "")
    .trim()
}

// ─── Primary nav (L1 → L2 → L3) ───────────────────────────────────────────────

function pickMainNav($: CheerioAPI): Cheerio<Element> | null {
  const candidates = $(
    'nav:not([aria-label*="util" i]):not([aria-label*="secondary" i]):not([aria-label*="breadcrumb" i]):not([aria-label*="footer" i]):not([class*="footer" i]):not([class*="util" i]):not([class*="breadcrumb" i]), [role="navigation"]:not([aria-label*="util" i]):not([aria-label*="breadcrumb" i])'
  ).toArray()
  if (candidates.length === 0) return null
  let best: Element | null = null
  let bestCount = -1
  for (const el of candidates) {
    const count = $(el).find("a, button").length
    if (count > bestCount) {
      best = el
      bestCount = count
    }
  }
  if (!best || bestCount < 2) return null
  return $(best)
}

function extractPrimary($: CheerioAPI, $nav: Cheerio<Element>): NavItem[] {
  // Try semantic-list layouts first
  let topItems = walkTopItems($, $nav)
  if (topItems.length === 0) {
    // Flat link layout fallback
    topItems = walkFlatLinks($, $nav)
  }
  return topItems.filter((item) => !isStandaloneHeaderAction(item))
}

function isStandaloneHeaderAction(item: NavItem): boolean {
  if (item.children && item.children.length > 0) return false
  return isUtilityLike(item) || isCtaLike(item)
}

function isUtilityLike(item: NavItem): boolean {
  return UTILITY_RE.test(item.label) || Boolean(item.href && UTILITY_HREF_RE.test(item.href))
}

function isCtaLike(item: NavItem): boolean {
  return CTA_RE.test(item.label)
}

function walkTopItems($: CheerioAPI, $scope: Cheerio<Element>): NavItem[] {
  const items: NavItem[] = []
  const lis = scopedFind($, $scope, "ul > li, ol > li").toArray()
  // Filter to "top-level" lis: not inside another li within the same scope
  const topLis = lis.filter((li) => {
    const $li = $(li)
    const parents = $li.parentsUntil($scope.get(0)!).filter("li")
    return parents.length === 0
  })
  for (const li of topLis) {
    const $li = $(li)
    const item = parseListItem($, $li, 1)
    if (item) items.push(item)
  }
  return items
}

function walkFlatLinks($: CheerioAPI, $scope: Cheerio<Element>): NavItem[] {
  const items: NavItem[] = []
  const $links = $scope.find("> a, > div > a, > span > a, > div > div > a")
  $links.each((_, a) => {
    const item = anchorToItem($, $(a))
    if (item) items.push(item)
  })
  if (items.length > 0) return items
  // Even broader: every direct descendant anchor up to depth 3
  $scope.find("a").each((_, a) => {
    const $a = $(a)
    const depth = $a.parentsUntil($scope.get(0)!).length
    if (depth <= 3) {
      const item = anchorToItem($, $a)
      if (item) items.push(item)
    }
  })
  return dedupeItems(items)
}

function parseListItem($: CheerioAPI, $li: Cheerio<Element>, level: number): NavItem | null {
  const $first = pickListItemControl($, $li)
  const item = anchorToItem($, $first)
  if (!item) return null

  if (level >= 3) return item // cap recursion at L3

  // L2/L3 children: nested ul/ol, or dropdown-class divs, or [role="menu"]
  const $childLists = $li
    .children('ul, ol, [role="menu"], [class*="dropdown" i], [class*="megamenu" i], [class*="mega-menu" i], [class*="flyout" i], [class*="submenu" i], [class*="sub-menu" i], [class*="menu" i]')
    .filter((_, el) => $(el).find("a").length > 0)

  if ($childLists.length === 0) return item

  const children: NavItem[] = []
  $childLists.each((_, el) => {
    const $c = $(el)
    // If the child is a list, walk its items recursively
    if ($c.is("ul, ol")) {
      $c.children("li").each((_, childLi) => {
        const sub = parseListItem($, $(childLi), level + 1)
        if (sub) children.push(sub)
      })
    } else {
      // For divs/menus: collect anchors directly
      const $sublists = $c.find("ul, ol")
      if ($sublists.length > 0) {
        $sublists.each((_, ul) => {
          $(ul).children("li").each((_, childLi) => {
            const sub = parseListItem($, $(childLi), level + 1)
            if (sub) children.push(sub)
          })
        })
      } else {
        $c.find("a").each((_, a) => {
          const sub = anchorToItem($, $(a))
          if (sub) children.push(sub)
        })
      }
    }
  })

  const deduped = dedupeItems(children)
  if (deduped.length > 0) item.children = deduped
  return item
}

function pickListItemControl($: CheerioAPI, $li: Cheerio<Element>): Cheerio<Element> {
  const $directInteractive = $li.children("a, button, [role='button']").first()
  if ($directInteractive.length) return $directInteractive

  const $dropdownToggle = $li
    .children()
    .find(
      [
        ".w-dropdown-toggle",
        '[class*="dropdown-toggle" i]',
        '[class*="dropdown__toggle" i]',
        '[class*="dropdown_toggle" i]',
        '[class*="nav_links_link" i]',
        '[aria-haspopup="true"]',
        '[aria-expanded]',
      ].join(", ")
    )
    .first()
  if ($dropdownToggle.length) return $dropdownToggle

  const $firstChildWithLabel = $li.children().filter((_, el) => {
    const $el = $(el)
    if ($el.is("ul, ol, nav") || /dropdown-list|mega|menu/i.test($el.attr("class") || "")) {
      return false
    }
    return Boolean(extractPrimaryLabel($, $el))
  }).first()
  if ($firstChildWithLabel.length) return $firstChildWithLabel

  return $li.find("a, button, [role='button']").first()
}

const SR_ONLY_RE =
  /\b(opens?\s+in\s+(?:a\s+)?new\s+(?:tab|window)|external\s+link|opens?\s+in\s+[a-z\s]+|new\s+window|new\s+tab)\b/gi
const HEADING_SELECTOR =
  'h1, h2, h3, h4, h5, h6, strong, b, [data-title], [class*="title" i]:not([class*="subtitle" i]):not([class*="undertitle" i])'
const DESCRIPTION_SELECTOR =
  'p, small, [class*="desc" i], [class*="subtitle" i], [class*="caption" i], [class*="tagline" i], [class*="byline" i]'
const SR_ONLY_SELECTOR =
  '[class*="sr-only" i], [class*="visually-hidden" i], [class*="visuallyhidden" i], [class*="screen-reader" i], [class*="screenreader" i], [aria-hidden="true"]'

function extractPrimaryLabel($: CheerioAPI, $el: Cheerio<Element>): string {
  const $clone = $el.clone()
  // Strip sr-only and description elements before extracting text
  $clone.find(SR_ONLY_SELECTOR).remove()
  // Prefer an explicit heading/title element if present
  const $heading = $clone.find(HEADING_SELECTOR).first()
  if ($heading.length) return cleanLabel($heading.text())
  // Drop description-flavoured children
  $clone.find(DESCRIPTION_SELECTOR).remove()
  // Megamenu pattern: anchor wraps a title element + a description element with no
  // semantic markers. If there are 2+ direct element children, the first non-empty
  // one is almost always the title.
  const $children = $clone.children()
  if ($children.length >= 2) {
    for (const child of $children.toArray()) {
      const text = cleanLabel($(child).text())
      if (text) return text
    }
  }
  return cleanLabel($clone.text())
}

function cleanLabel(text: string): string {
  return text
    .replace(SR_ONLY_RE, "")
    .replace(/\s+/g, " ")
    .trim()
}

function anchorToItem($: CheerioAPI, $a: Cheerio<Element>): NavItem | null {
  if (!$a.length) return null
  const primary = extractPrimaryLabel($, $a)
  const aria = cleanLabel($a.attr("aria-label") || "")
  const hidden = extractHiddenLabel($, $a)
  const label = (primary || aria || hidden).trim()
  if (!label || label.length > MAX_LABEL) return null
  if (/^[\s•·›▾▼▽⌄⌃▲▴◆◇◀▶◁]+$/.test(label)) return null // skip pure-symbol labels
  const href = ($a.attr("href") || "").trim() || undefined
  return { label, href }
}

function extractHiddenLabel($: CheerioAPI, $el: Cheerio<Element>): string {
  const local = cleanLabel($el.find(SR_ONLY_SELECTOR).text())
  if (local) return local

  const $buttonLike = $el.closest('[data-button], [class*="button" i]').first()
  if ($buttonLike.length) {
    const visible = cleanLabel(
      $buttonLike
        .find('[aria-hidden="true"], [class*="button_main_text" i], [class*="button_text" i]')
        .first()
        .text()
    )
    if (visible) return visible
  }

  return ""
}

// ─── Utilities ────────────────────────────────────────────────────────────────

function extractUtilities($: CheerioAPI, primary: NavItem[], brand?: NavItem): NavItem[] {
  const usedHrefs = new Set<string>()
  if (brand?.href) usedHrefs.add(brand.href)
  collectHrefs(primary).forEach((h) => usedHrefs.add(h))

  const items: NavItem[] = []

  // Utility-flavoured nav containers
  $(
    'nav[aria-label*="util" i], nav[aria-label*="user" i], nav[aria-label*="secondary" i], nav[aria-label*="account" i], nav[class*="util" i], nav[class*="secondary" i], nav[class*="user" i]'
  ).each((_, n) => {
    $(n)
      .find("a, button")
      .each((_, a) => {
        const item = anchorToItem($, $(a))
        if (item && (!item.href || !usedHrefs.has(item.href))) items.push(item)
      })
  })

  // Header anchors / buttons matching utility patterns
  $("header a, header button").each((_, a) => {
    const $a = $(a)
    const item = anchorToItem($, $a)
    if (!item) return
    if (item.href && usedHrefs.has(item.href)) return
    const isUtility =
      UTILITY_RE.test(item.label) ||
      (item.href && UTILITY_HREF_RE.test(item.href)) ||
      isIconOnly($a) && (UTILITY_RE.test($a.attr("aria-label") || "") || (item.href && UTILITY_HREF_RE.test(item.href)))
    if (isUtility) items.push(item)
  })

  return dedupeItems(items)
}

function isIconOnly($a: Cheerio<Element>): boolean {
  const text = cleanText($a.text())
  if (text) return false
  return $a.find("svg, img").length > 0
}

// ─── CTAs ────────────────────────────────────────────────────────────────────

function extractCtas(
  $: CheerioAPI,
  primary: NavItem[],
  utilities: NavItem[]
): NavItem[] {
  const usedHrefs = new Set<string>()
  collectHrefs(primary).forEach((h) => usedHrefs.add(h))
  utilities.forEach((u) => u.href && usedHrefs.add(u.href))

  const items: NavItem[] = []

  // Buttons and CTA-classed anchors in header/nav
  $("header button, nav button, header a, nav a").each((_, el) => {
    const $el = $(el)
    const item = anchorToItem($, $el)
    if (!item) return
    if (item.href && usedHrefs.has(item.href)) return
    const cls = $el.attr("class") || ""
    const matchesClass = CTA_CLASS_RE.test(cls)
    const matchesText = CTA_RE.test(item.label)
    const isButton = $el.is("button") && !!item.label
    if (matchesText || (matchesClass && item.label.length <= 40) || (isButton && matchesText)) {
      items.push(item)
    }
  })

  return dedupeItems(items).slice(0, 8)
}

// ─── Breadcrumbs ──────────────────────────────────────────────────────────────

function extractBreadcrumbs($: CheerioAPI): NavItem[] | undefined {
  const $bc = $(
    '[aria-label*="breadcrumb" i], nav.breadcrumb, ol.breadcrumb, ul.breadcrumb, [itemtype*="BreadcrumbList" i]'
  ).first()
  if (!$bc.length) return undefined

  const items: NavItem[] = []
  // Prefer ordered list of items
  const $items = $bc.find("li").length ? $bc.find("li") : $bc.find("a, span")
  $items.each((_, el) => {
    const $el = $(el)
    const $a = $el.is("a") ? $el : $el.find("a").first()
    if ($a.length) {
      const item = anchorToItem($, $a)
      if (item) items.push(item)
    } else {
      const label = cleanText($el.text())
      if (label && label.length <= MAX_LABEL) items.push({ label })
    }
  })
  const deduped = dedupeItems(items)
  return deduped.length > 0 ? deduped : undefined
}

// ─── Sidebar ──────────────────────────────────────────────────────────────────

function extractSidebar($: CheerioAPI): NavItem[] | undefined {
  const candidates = $(
    'aside nav, aside ul, aside ol, nav[class*="side" i], [class*="sidebar" i] nav, [class*="sidebar" i] > ul, [class*="sidebar" i] > ol, [class*="side-nav" i]'
  ).toArray()
  if (candidates.length === 0) return undefined

  // Pick the one with most anchors
  let best: Element | null = null
  let bestCount = 0
  for (const el of candidates) {
    const cnt = $(el).find("a").length
    if (cnt > bestCount) {
      best = el
      bestCount = cnt
    }
  }
  if (!best || bestCount < 3) return undefined

  const items: NavItem[] = []
  $(best)
    .find("a")
    .each((_, a) => {
      const item = anchorToItem($, $(a))
      if (item) items.push(item)
    })
  const deduped = dedupeItems(items)
  return deduped.length >= 3 ? deduped.slice(0, 30) : undefined
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function cleanText(text: string): string {
  return text.replace(/\s+/g, " ").trim()
}

function collectHrefs(items: NavItem[]): string[] {
  const out: string[] = []
  for (const i of items) {
    if (i.href) out.push(i.href)
    if (i.children) out.push(...collectHrefs(i.children))
  }
  return out
}

function dedupeItems(items: NavItem[]): NavItem[] {
  const seen = new Set<string>()
  const labelIndex = new Map<string, number>()
  const out: NavItem[] = []
  for (const item of items) {
    const labelKey = item.label.toLowerCase()
    const key = (item.href || "").toLowerCase() + "|" + item.label.toLowerCase()
    if (seen.has(key)) continue
    const existingLabelIndex = labelIndex.get(labelKey)
    if (existingLabelIndex != null) {
      const existing = out[existingLabelIndex]
      if (!existing.href && item.href) {
        out[existingLabelIndex] = item
        seen.add(key)
      }
      continue
    }
    seen.add(key)
    labelIndex.set(labelKey, out.length)
    out.push(item)
  }
  return out
}

function scopedFind($: CheerioAPI, $scope: Cheerio<Element>, selector: string): Cheerio<Element> {
  return $scope.find(selector)
}
