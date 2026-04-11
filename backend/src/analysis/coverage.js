/**
 * Coverage computation.
 *
 * Compares the URLs visited by tests against the routes defined in source,
 * producing a coverage score and a risk-ranked gap report.
 */

// Keywords in a route that indicate high user/business impact
const HIGH_RISK_KEYWORDS = [
  'checkout', 'payment', 'pay', 'order', 'cart',
  'login', 'signin', 'sign-in', 'logout', 'register', 'signup', 'sign-up',
  'auth', 'oauth', 'password', 'reset', 'verify', 'confirm',
  'admin', 'dashboard', 'billing', 'subscription', 'account', 'profile',
  'api', 'webhook',
];

const LOW_RISK_KEYWORDS = [
  'about', 'faq', 'help', 'docs', 'documentation', 'terms', 'privacy',
  'contact', 'blog', 'news', 'press', 'legal', 'cookie',
];

/**
 * @param {string[]} testedUrls - raw URL/path strings from cy.visit()/page.goto()
 * @param {Array<{route:string, source:string, strategy:string}>} extractedRoutes
 * @returns {{
 *   score: number|null,
 *   totalRoutes: number,
 *   coveredCount: number,
 *   gaps: Array<{route,source,strategy,risk}>,
 *   covered: Array<{route,source,strategy}>,
 * }}
 */
export function computeCoverage(testedUrls, extractedRoutes) {
  if (extractedRoutes.length === 0) {
    return { score: null, totalRoutes: 0, coveredCount: 0, gaps: [], covered: [] };
  }

  const normalizedTested = testedUrls.map(normalizePath);

  const results = extractedRoutes.map((r) => {
    const normalRoute = normalizePath(r.route);
    const pattern = routeToRegex(normalRoute);
    const covered = normalizedTested.some(
      (u) => u === normalRoute || pattern.test(u)
    );
    return { ...r, route: normalRoute, covered };
  });

  const covered  = results.filter((r) => r.covered);
  const gaps     = results
    .filter((r) => !r.covered)
    .map((r) => ({ ...r, risk: riskLevel(r.route) }))
    .sort(byRisk);

  const score = Math.round((covered.length / results.length) * 100);

  return {
    score,
    totalRoutes: results.length,
    coveredCount: covered.length,
    gaps,
    covered,
  };
}

// ── helpers ──────────────────────────────────────────────────────────────────

/**
 * Strips scheme, host, query string, and trailing slash from a URL/path.
 * "/about/" → "/about"
 * "https://example.com/about?ref=1" → "/about"
 */
function normalizePath(raw) {
  try {
    return new URL(raw).pathname.replace(/\/$/, '') || '/';
  } catch {
    return ('/' + raw).replace(/\/+/g, '/').replace(/\/$/, '') || '/';
  }
}

/**
 * Converts a route with :param or * wildcards to a RegExp.
 * "/users/:id/posts" → /^\/users\/[^/]+\/posts$/i
 */
function routeToRegex(route) {
  const pattern = route
    .replace(/[.+?^${}()|[\]\\]/g, '\\$&') // escape special chars
    .replace(/:([^/]+)/g, '[^/]+')           // :param
    .replace(/\*/g, '.*');                   // wildcard
  return new RegExp('^' + pattern + '$', 'i');
}

export function riskLevel(route) {
  const lower = route.toLowerCase();
  if (HIGH_RISK_KEYWORDS.some((kw) => lower.includes(kw))) return 'high';
  if (LOW_RISK_KEYWORDS.some((kw) => lower.includes(kw)))  return 'low';
  return 'medium';
}

function byRisk(a, b) {
  const order = { high: 0, medium: 1, low: 2 };
  return order[a.risk] - order[b.risk];
}
