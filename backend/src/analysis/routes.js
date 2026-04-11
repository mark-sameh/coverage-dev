/**
 * Route extraction — two strategies:
 *
 * 1. File-system (Next.js `pages/` or `app/` directory):
 *    Derives routes from file paths with zero additional API calls.
 *
 * 2. Inline (React Router / Express):
 *    Fetches content of likely route-definition files and parses them
 *    with regex. Capped at MAX_ROUTE_FILES to keep API calls low.
 */

const MAX_ROUTE_FILES = 12;

// Files whose content we're willing to fetch and scan for inline routes
const ROUTE_FILE_RE = /(?:routes?|router|app|server|navigation)\.(js|ts|mjs|cjs|jsx|tsx)$/i;
const ROUTE_DIR_RE  = /(?:^|\/)(?:routes?|router)\//i;
// Root-level entry points (app.js, server.js, index.js)
const ROOT_ENTRY_RE = /^(?:app|server|index)\.(js|ts|mjs|cjs)$/i;

// Inline route patterns (all capture the path string in group 2)
const INLINE_PATTERNS = [
  // Express:      app.get('/path', ...)  router.post('/path', ...)
  /(?:app|router)\.(?:get|post|put|patch|delete|use)\(\s*(['"])([^'"]+)\1/g,
  // React Router: <Route path="/path">  path="/path"  path='/path'
  /<Route[^>]+path=(['"])([^'"]+)\1/g,
  /\bpath:\s*(['"])([^'"]+)\1/g,
  // Hono / Fastify / similar: app.get('/path', ...)
  /\.(get|post|put|patch|delete|route)\(\s*(['"])([^'"]+)\2/g,
];

/**
 * @param {Array<{path:string}>} allFiles - full repo file listing
 * @param {function(string):Promise<string>} fetchContent - fetches a file by path
 * @returns {Promise<Array<{route:string, source:string, strategy:string}>>}
 */
export async function extractRoutes(allFiles, fetchContent) {
  const routes = [];

  // ── Strategy 1: file-system routing ──────────────────────────────────────
  for (const f of allFiles) {
    const fsRoute = filePathToRoute(f.path);
    if (fsRoute) {
      routes.push({ route: fsRoute, source: f.path, strategy: 'filesystem' });
    }
  }

  // ── Strategy 2: inline route definitions ─────────────────────────────────
  const routeFiles = pickRouteFiles(allFiles);

  await Promise.all(
    routeFiles.map(async (f) => {
      try {
        const content = await fetchContent(f.path);
        const found = extractInlineRoutes(content, f.path);
        routes.push(...found);
      } catch {
        // skip unreadable files silently
      }
    })
  );

  // Deduplicate by route + source combination
  const seen = new Set();
  return routes.filter(({ route, source }) => {
    const key = `${route}||${source}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ── helpers ──────────────────────────────────────────────────────────────────

/**
 * Converts a Next.js pages/ or app/ file path to a URL route.
 * Returns null for non-page files.
 */
function filePathToRoute(filePath) {
  const lower = filePath.toLowerCase();

  // Next.js pages/
  const pages = lower.match(/(?:^|\/)pages\/(.+)\.[jt]sx?$/);
  if (pages) {
    let route = '/' + pages[1]
      .replace(/\/index$/, '')            // pages/about/index → /about
      .replace(/\[\.\.\.([^\]]+)\]/g, '*')  // [...slug] → *
      .replace(/\[([^\]]+)\]/g, ':$1')    // [id] → :id
      .replace(/\/\([^)]+\)/g, '');       // (group) → strip
    return route || '/';
  }

  // Next.js 13 app/ directory (page.tsx / page.jsx / route.ts)
  const app = lower.match(/(?:^|\/)app\/(.+)\/(?:page|route)\.[jt]sx?$/);
  if (app) {
    let route = '/' + app[1]
      .replace(/\[\.\.\.([^\]]+)\]/g, '*')
      .replace(/\[([^\]]+)\]/g, ':$1')
      .replace(/\/\([^)]+\)/g, '');
    return route || '/';
  }

  return null;
}

/**
 * Selects up to MAX_ROUTE_FILES source files most likely to define routes.
 */
function pickRouteFiles(files) {
  const scored = files
    .filter((f) => /\.(js|ts|mjs|cjs|jsx|tsx)$/i.test(f.path))
    .map((f) => {
      const name = f.path.split('/').pop();
      let score = 0;
      if (ROUTE_FILE_RE.test(name))        score += 10;
      if (ROUTE_DIR_RE.test(f.path))       score += 8;
      if (ROOT_ENTRY_RE.test(name) && !f.path.includes('/')) score += 6;
      return { ...f, score };
    })
    .filter((f) => f.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_ROUTE_FILES);

  return scored;
}

/**
 * Extracts route path strings from file content using inline patterns.
 * Each result includes the 1-based lineNumber and the trimmed source lineText.
 */
function extractInlineRoutes(content, filePath) {
  const routes = [];
  const lines = content.split('\n');

  // Precompute the character offset at which each line starts (for O(log n) lookup)
  const lineOffsets = [0];
  for (let i = 0; i < lines.length - 1; i++) {
    lineOffsets.push(lineOffsets[i] + lines[i].length + 1); // +1 for '\n'
  }

  function lineNumberAt(charIndex) {
    let lo = 0, hi = lineOffsets.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (lineOffsets[mid] <= charIndex) lo = mid;
      else hi = mid - 1;
    }
    return lo + 1; // 1-based
  }

  for (const re of INLINE_PATTERNS) {
    re.lastIndex = 0;
    let match;
    while ((match = re.exec(content)) !== null) {
      // Group index depends on pattern — last capture group is the path
      const path = match[match.length - 1];
      if (path && path.startsWith('/') && path.length > 1) {
        // Filter out obviously non-route strings (file extensions, wildcards-only, etc.)
        if (!/\.(css|js|png|jpg|svg|ico|woff|json)$/.test(path)) {
          const lineNumber = lineNumberAt(match.index);
          const lineText = lines[lineNumber - 1].trim();
          routes.push({ route: path, source: filePath, strategy: 'inline', lineNumber, lineText });
        }
      }
    }
  }
  return routes;
}
