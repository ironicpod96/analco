export const runtime = "nodejs"

const SCREENSHOTONE_ENDPOINT = "https://api.screenshotone.com/take"
const FALLBACK_ACCESS_KEY = "4IqFWHuzAJrSQQ"

type ScreenshotRequest = {
  url?: string
  mode?: "fullPage" | "navigationMobile" | "visualHierarchyDesktop" | "visualHierarchySectionDesktop"
  target?: string
  section?: "hero" | "about" | "relevant"
}

export async function POST(request: Request): Promise<Response> {
  const body = (await request.json().catch(() => null)) as ScreenshotRequest | null
  const url = body?.url?.trim()
  if (!url) return Response.json({ error: "url required" }, { status: 400 })

  const accessKey = process.env.SCREENSHOTONE_KEY ?? FALLBACK_ACCESS_KEY
  const mode = body?.mode ?? "fullPage"

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

  if (mode === "navigationMobile") {
    params.set("viewport_width", "390")
    params.set("viewport_height", "844")
    params.set("viewport_mobile", "true")
    params.set("viewport_has_touch", "true")
    params.set("device_scale_factor", "1")
    params.set("full_page", "false")
    params.delete("full_page_scroll")
    params.set("delay", "2")
    params.set("timeout", "25")
    params.set("block_ads", "false")
    params.set("block_trackers", "false")
    params.set("block_cookie_banners", "false")
    params.set("image_width", "390")
    params.set("scripts", navigationMobileScript())
  } else if (mode === "visualHierarchyDesktop") {
    params.set("viewport_width", "1440")
    params.set("viewport_height", "900")
    params.set("device_scale_factor", "1")
    params.set("full_page", "false")
    params.delete("full_page_scroll")
    params.set("delay", "2")
    params.set("timeout", "35")
    params.set("image_width", "1440")
    params.set("scripts", visualHierarchyDesktopScript(body?.target ?? ""))
  } else if (mode === "visualHierarchySectionDesktop") {
    params.set("viewport_width", "1440")
    params.set("viewport_height", "810")
    params.set("device_scale_factor", "1")
    params.set("full_page", "false")
    params.delete("full_page_scroll")
    params.set("delay", "2")
    params.set("timeout", "35")
    params.set("image_width", "1440")
    params.set("image_height", "810")
    params.set("scripts", visualHierarchySectionDesktopScript(body?.section ?? "relevant", body?.target ?? ""))
  }

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

function navigationMobileScript(): string {
  return `
(async () => {
  const sleep = (ms) => new Promise((resolve) => window.setTimeout(resolve, ms));
  const visible = (el) => {
    if (!el) return false;
    const rect = el.getBoundingClientRect();
    const style = window.getComputedStyle(el);
    return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
  };
  const reveal = (el) => {
    if (!el) return false;
    el.hidden = false;
    el.removeAttribute("hidden");
    el.removeAttribute("inert");
    el.setAttribute("aria-hidden", "false");
    el.classList.add("open", "opened", "active", "show", "is-open", "is-active");
    Object.assign(el.style, {
      display: "block",
      visibility: "visible",
      opacity: "1",
      transform: "none",
      maxHeight: "none",
      height: "auto",
      overflow: "visible",
      pointerEvents: "auto"
    });
    return true;
  };
  const revealControlled = (el) => {
    const id = el && el.getAttribute && el.getAttribute("aria-controls");
    if (!id) return false;
    const target = document.getElementById(id);
    if (!target) return false;
    el.setAttribute("aria-expanded", "true");
    return reveal(target);
  };
  const click = (el) => {
    if (!el) return false;
    el.scrollIntoView({ block: "center", inline: "center" });
    try {
      el.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, cancelable: true, pointerType: "touch" }));
      el.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, cancelable: true, pointerType: "touch" }));
    } catch {}
    ["mousedown", "mouseup", "click"].forEach((type) => {
      el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: window }));
    });
    if (typeof el.click === "function") el.click();
    return true;
  };
  const text = (el) => (el.textContent || el.getAttribute("aria-label") || "").trim();
  const isLikelyHamburger = (el) => {
    const label = [
      el.getAttribute("aria-label"),
      el.getAttribute("title"),
      el.getAttribute("class"),
      el.id,
      text(el)
    ].filter(Boolean).join(" ").toLowerCase();
    const rect = el.getBoundingClientRect();
    return (
      /menu|nav|hamburger|toggle|drawer|offcanvas/.test(label) ||
      (rect.width <= 72 && rect.height <= 72 && /button|a/i.test(el.tagName))
    );
  };
  const openedContainers = () => Array.from(document.querySelectorAll(
    'nav, [role="navigation"], [role="dialog"], [aria-modal="true"], [class*="menu" i], [class*="drawer" i], [class*="offcanvas" i], [class*="mobile" i]'
  )).filter((el) => {
    if (!visible(el)) return false;
    const rect = el.getBoundingClientRect();
    return rect.width >= 180 && rect.height >= 180;
  });
  const hamburgerSelectors = [
    'button[aria-label*="menu" i]',
    'button[aria-label*="open" i]',
    'button[aria-label*="navigation" i]',
    'button[aria-expanded="false"]',
    'button[aria-controls]',
    '[role="button"][aria-label*="menu" i]',
    '[role="button"][aria-expanded="false"]',
    '.hamburger',
    '.menu-toggle',
    '.navbar-toggler',
    '.mobile-menu-button',
    '[class*="hamburger" i]',
    '[class*="menu" i] button',
    '[class*="nav" i] button',
    '[data-testid*="menu" i]',
    '[data-testid*="nav" i]'
  ];
  const hamburgers = hamburgerSelectors
    .flatMap((selector) => Array.from(document.querySelectorAll(selector)))
    .filter((el, index, all) => all.indexOf(el) === index)
    .filter((el) => visible(el) && isLikelyHamburger(el))
    .sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top);

  for (const candidate of hamburgers.slice(0, 8)) {
    if (openedContainers().length > 0) break;
    click(candidate);
    await sleep(450);
    if (openedContainers().length === 0) {
      revealControlled(candidate);
      await sleep(200);
    }
  }

  if (openedContainers().length === 0) {
    Array.from(document.querySelectorAll(
      'nav, [role="navigation"], [id*="menu" i], [id*="nav" i], [class*="menu" i], [class*="nav" i], [class*="drawer" i], [class*="offcanvas" i]'
    )).forEach((el) => {
      const rect = el.getBoundingClientRect();
      if (rect.width >= 160 || /menu|nav|drawer|offcanvas/i.test(el.id + " " + el.className)) reveal(el);
    });
    await sleep(250);
  }

  const scope = openedContainers()[0] || document;
  const candidates = Array.from(scope.querySelectorAll(
    'button[aria-expanded], [role="button"][aria-expanded], a[aria-expanded], summary, [aria-haspopup="true"], [aria-controls], button, a'
  )).filter((el) => visible(el) && text(el).length > 1 && text(el).length < 80);
  const expandable = candidates.find((el) => {
    const expanded = el.getAttribute("aria-expanded");
    const hasChildrenHint = Boolean(el.getAttribute("aria-controls") || el.getAttribute("aria-haspopup")) ||
      /\\+|›|▾|⌄|chevron|arrow|submenu|dropdown/i.test(el.innerHTML) ||
      Boolean(el.parentElement && el.parentElement.querySelector("ul, [role='menu'], [class*='submenu' i], [class*='dropdown' i]"));
    return expanded !== "true" && hasChildrenHint;
  }) || candidates[0];
  if (expandable) {
    click(expandable);
    revealControlled(expandable);
    const nested = expandable.parentElement && expandable.parentElement.querySelector("ul, [role='menu'], [class*='submenu' i], [class*='dropdown' i]");
    if (nested) reveal(nested);
    await sleep(500);
  }
})();
`.trim()
}

function visualHierarchyDesktopScript(target: string): string {
  const encodedTarget = JSON.stringify(target.slice(0, 1200))
  return `
(async () => {
  const sleep = (ms) => new Promise((resolve) => window.setTimeout(resolve, ms));
  const target = ${encodedTarget}.toLowerCase();
  const targetWords = Array.from(new Set(target.split(/[^a-z0-9]+/).filter((word) => word.length > 2)));
  const visible = (el) => {
    const rect = el.getBoundingClientRect();
    const style = window.getComputedStyle(el);
    return rect.width > 240 && rect.height > 140 && style.visibility !== "hidden" && style.display !== "none";
  };
  const normalize = (value) => (value || "").replace(/\\s+/g, " ").trim().toLowerCase();
  const candidates = Array.from(document.querySelectorAll([
    "main section",
    "main article",
    "main > div",
    "section",
    "article",
    "[class*='product' i]",
    "[class*='solution' i]",
    "[class*='service' i]",
    "[class*='offering' i]",
    "[class*='feature' i]"
  ].join(","))).filter(visible);
  const scored = candidates.map((el) => {
    const text = normalize(el.textContent).slice(0, 5000);
    const rect = el.getBoundingClientRect();
    const exact = target && text.includes(target) ? 80 : 0;
    const wordHits = targetWords.reduce((sum, word) => sum + (text.includes(word) ? 1 : 0), 0);
    const commercial = /product|solution|platform|service|offering|what we do|technology|features|capabilities|for businesses|shop|buy|pricing|request|demo|learn more/.test(text) ? 10 : 0;
    const heading = normalize(Array.from(el.querySelectorAll("h1,h2,h3")).map((h) => h.textContent).join(" "));
    const headingHits = targetWords.reduce((sum, word) => sum + (heading.includes(word) ? 2 : 0), 0);
    const depthPenalty = Math.max(0, rect.top + window.scrollY) / 2200;
    return { el, score: exact + wordHits * 6 + headingHits * 8 + commercial - depthPenalty };
  }).sort((a, b) => b.score - a.score);
  const winner = scored[0]?.score > 0 ? scored[0].el : candidates.find((el) => {
    const text = normalize(el.textContent);
    return /product|solution|platform|service|offering|what we do|technology|features|capabilities/.test(text);
  });
  if (winner) {
    const rect = winner.getBoundingClientRect();
    const top = Math.max(0, rect.top + window.scrollY - 96);
    window.scrollTo({ top, left: 0, behavior: "instant" });
    await sleep(900);
  }
})();
`.trim()
}

function visualHierarchySectionDesktopScript(section: "hero" | "about" | "relevant", target: string): string {
  const encodedSection = JSON.stringify(section)
  const encodedTarget = JSON.stringify(target.slice(0, 1200))
  return `
(async () => {
  const sleep = (ms) => new Promise((resolve) => window.setTimeout(resolve, ms));
  const section = ${encodedSection};
  const target = ${encodedTarget}.toLowerCase();
  const targetWords = Array.from(new Set(target.split(/[^a-z0-9]+/).filter((word) => word.length > 2)));
  const visible = (el) => {
    const rect = el.getBoundingClientRect();
    const style = window.getComputedStyle(el);
    return rect.width > 320 && rect.height > 160 && style.visibility !== "hidden" && style.display !== "none";
  };
  const normalize = (value) => (value || "").replace(/\\s+/g, " ").trim().toLowerCase();
  const candidates = Array.from(document.querySelectorAll([
    "main section",
    "main article",
    "main > div",
    "section",
    "article",
    "[class*='hero' i]",
    "[class*='about' i]",
    "[class*='company' i]",
    "[class*='product' i]",
    "[class*='solution' i]",
    "[class*='service' i]",
    "[class*='offering' i]",
    "[class*='feature' i]"
  ].join(","))).filter(visible);
  const score = (el) => {
    const text = normalize(el.textContent).slice(0, 5000);
    const classHints = normalize([el.id, el.className, el.getAttribute("aria-label")].join(" "));
    const heading = normalize(Array.from(el.querySelectorAll("h1,h2,h3")).map((h) => h.textContent).join(" "));
    const rect = el.getBoundingClientRect();
    const top = Math.max(0, rect.top + window.scrollY);
    if (section === "hero") {
      return (top < 900 ? 80 : 0) + (/hero|masthead|banner|intro/.test(classHints) ? 30 : 0) + (heading ? 8 : 0) - top / 1600;
    }
    if (section === "about") {
      const about = /about|company|who\s+we\s+are|our\s+story|mission|team|why\s+us|overview/i.test(classHints + " " + heading + " " + text) ? 80 : 0;
      return about + (heading ? 8 : 0) - Math.abs(top - 1100) / 2200;
    }
    const exact = target && text.includes(target) ? 90 : 0;
    const wordHits = targetWords.reduce((sum, word) => sum + (text.includes(word) ? 1 : 0), 0);
    const headingHits = targetWords.reduce((sum, word) => sum + (heading.includes(word) ? 2 : 0), 0);
    const commercial = /product|solution|platform|service|offering|what we do|technology|features|capabilities|pricing|request|demo|learn more/.test(text) ? 16 : 0;
    return exact + wordHits * 7 + headingHits * 8 + commercial - top / 2600;
  };
  const winner = section === "hero" ? null : candidates.map((el) => ({ el, score: score(el) })).sort((a, b) => b.score - a.score)[0]?.el;
  if (winner) {
    const rect = winner.getBoundingClientRect();
    const top = Math.max(0, rect.top + window.scrollY - 88);
    window.scrollTo({ top, left: 0, behavior: "instant" });
  } else if (section === "about") {
    window.scrollTo({ top: Math.round(Math.max(window.innerHeight * 0.9, document.documentElement.scrollHeight * 0.22)), left: 0, behavior: "instant" });
  } else {
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  }
  await sleep(900);
})();
`.trim()
}
