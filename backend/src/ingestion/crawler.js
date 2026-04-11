/**
 * Website link spider.
 *
 * Crawls a live website by following <a href> links, up to MAX_DEPTH levels
 * deep from the starting URL, collecting at most MAX_PAGES unique pages.
 * Only follows internal links (same hostname). Skips non-HTML assets.
 */

const MAX_PAGES  = 50;
const MAX_DEPTH  = 2;
const TIMEOUT_MS = 10_000;

const SKIP_EXT = /\.(js|css|png|jpg|jpeg|gif|svg|ico|woff|woff2|ttf|pdf|zip|json|xml|txt|map|webp|mp4|mp3|wav)$/i;

/**
 * @param {string} baseUrl  e.g. "https://app.biblebooster.com"
 * @returns {Promise<Array<{route:string, source:string, strategy:'crawl'}>>}
 */
export async function crawlSite(baseUrl) {
  const base    = new URL(baseUrl);
  const visited = new Set();
  const queue   = [{ url: base.href, depth: 0 }];
  const discovered = [];

  while (queue.length > 0 && discovered.length < MAX_PAGES) {
    const { url, depth } = queue.shift();

    const key = normalizeKey(url);
    if (visited.has(key)) continue;
    visited.add(key);

    try {
      if (SKIP_EXT.test(new URL(url).pathname)) continue;
    } catch { continue; }

    let html;
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
      const res = await fetch(url, {
        headers: { 'User-Agent': 'TCI-Crawler/1.0 (coverage-analysis)' },
        signal: controller.signal,
        redirect: 'follow',
      });
      clearTimeout(timer);
      if (!res.ok) continue;
      const ct = res.headers.get('content-type') ?? '';
      if (!ct.includes('text/html')) continue;
      html = await res.text();
    } catch {
      continue; // timeout, ECONNREFUSED, DNS failure, etc.
    }

    const route = new URL(url).pathname.replace(/\/$/, '') || '/';
    discovered.push({ route, source: `crawl:${base.hostname}`, strategy: 'crawl', depth });

    if (depth < MAX_DEPTH) {
      for (const link of extractLinks(html, base)) {
        if (!visited.has(normalizeKey(link))) {
          queue.push({ url: link, depth: depth + 1 });
        }
      }
    }
  }

  return discovered;
}

function extractLinks(html, base) {
  const links = new Set();
  const re = /href=["']([^"'#?\s]+)["']/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    try {
      const u = new URL(m[1], base);
      if (u.hostname === base.hostname && !SKIP_EXT.test(u.pathname)) {
        links.add(u.origin + u.pathname); // strip query string + hash
      }
    } catch { /* ignore malformed hrefs */ }
  }
  return [...links];
}

function normalizeKey(url) {
  try {
    const u = new URL(url);
    return u.hostname + u.pathname.replace(/\/$/, '');
  } catch {
    return url;
  }
}
