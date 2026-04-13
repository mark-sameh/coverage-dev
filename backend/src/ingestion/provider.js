/**
 * Provider router — detects whether a URL/slug targets GitHub or Bitbucket
 * and delegates to the correct ingestion client.
 *
 * Supports three analysis modes via appRepos + testRepo:
 *   single  — appRepos = [repoUrl], testRepo = repoUrl
 *   split   — appRepos = [appRepo], testRepo = testRepo
 *   multi   — appRepos = [frontend, backend], testRepo = automationRepo
 */

import { createClient, listFiles as ghListFiles, parseRepoSlug } from './github.js';
import { parseRepoUrl as bbParseUrl, listFiles as bbListFiles, fetchFileContent as bbFetch } from './bitbucket.js';
import { parseSpec, isSpecFile } from './parser.js';
import { extractRoutes } from '../analysis/routes.js';
import { computeCoverage, riskLevel } from '../analysis/coverage.js';
import { generateSuggestions } from '../analysis/suggestions.js';
import { crawlSite } from './crawler.js';

const CONCURRENCY   = 5;    // files fetched in parallel per batch
const BATCH_DELAY   = 500;  // ms between spec-fetch batches
const RETRY_DELAY   = 2000; // ms to wait before a single 429 retry

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Fetches a spec file's content, retrying once on 429.
 */
async function fetchSpecContent(fetchFn, path) {
  try {
    return await fetchFn(path);
  } catch (err) {
    if (String(err?.message).includes('429')) {
      console.warn(`[provider] 429 on ${path} — retrying in ${RETRY_DELAY}ms`);
      await sleep(RETRY_DELAY);
      return await fetchFn(path); // one retry
    }
    throw err;
  }
}

// Keywords that mark a route as smoke-critical (website mode)
const SMOKE_KEYWORDS = [
  'login', 'signin', 'sign-in', 'signup', 'sign-up', 'register',
  'dashboard', 'home', 'main',
  'checkout', 'payment', 'pay', 'order',
];

/**
 * Returns true if a crawled page should be included in smoke coverage.
 * depth 0 = the start URL, depth 1 = pages linked from homepage.
 */
function isSmokeUrl(route, depth) {
  if (route === '/') return true;
  if (depth != null && depth <= 1) return true;
  const lower = route.toLowerCase();
  return SMOKE_KEYWORDS.some((k) => lower.includes(k));
}

/**
 * Detects which provider a repo string belongs to.
 * @param {string} input
 * @returns {'github' | 'bitbucket'}
 */
export function detectProvider(input) {
  if (/bitbucket\.org/i.test(input)) return 'bitbucket';
  if (/github\.com/i.test(input) || /^[^/]+\/[^/]+$/.test(input)) return 'github';
  throw new Error(
    `Cannot detect provider from "${input}". ` +
    `Use a full URL (https://github.com/... or https://bitbucket.org/...) or "owner/repo".`
  );
}

/**
 * Initialises a repo client: fetches file listing and returns a fetchContent function.
 *
 * @param {string} repoInput - full URL or owner/repo
 * @param {string} [token]   - GitHub token or Bitbucket app password
 * @returns {Promise<{ provider: string, repoLabel: string, allFiles: Array, fetchContent: function }>}
 */
async function initRepo(repoInput, token) {
  const provider = detectProvider(repoInput);

  let allFiles, fetchContent, repoLabel;

  if (provider === 'github') {
    const { owner, repo } = parseRepoSlug(
      repoInput.replace(/^https?:\/\/github\.com\//i, '')
    );
    const octokit = createClient(token);
    const { data: repoMeta } = await octokit.repos.get({ owner, repo });
    const branch = repoMeta.default_branch;
    allFiles = await ghListFiles(octokit, owner, repo, '');
    fetchContent = (path) =>
      fetch(`https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${path}`)
        .then((r) => {
          if (!r.ok) throw new Error(`raw.githubusercontent.com ${r.status}: ${path}`);
          return r.text();
        });
    repoLabel = `${owner}/${repo}`;
  } else {
    const { workspace, repo, branch } = bbParseUrl(repoInput);
    allFiles = await bbListFiles(workspace, repo, branch, '');
    fetchContent = (path) => bbFetch(workspace, repo, branch, path);
    repoLabel = `${workspace}/${repo}`;
  }

  return { provider, repoLabel, allFiles, fetchContent };
}

/**
 * Full analysis pipeline — supports single, split, and multi-repo modes.
 *
 * @param {object} opts
 * @param {string[]} opts.appRepos      - repos to extract routes from (1 or more)
 * @param {string}   opts.testRepo      - repo containing spec/test files
 * @param {string}  [opts.specPath]     - subdirectory filter for specs
 * @param {string}  [opts.token]        - GitHub token or Bitbucket app password
 * @param {string}  [opts.geminiKey]    - Gemini API key for AI suggestions
 * @returns {Promise<{
 *   provider: string,
 *   repo: string,
 *   specFilesFound: number,
 *   results: Array,
 *   coverage: object,
 *   suggestions: Array|null,
 * }>}
 */
export async function analyzeRepo({ appRepos, testRepo, specPath = '', token, geminiKey, coverageType = 'full' }) {
  console.log('[analyze] START  appRepos=%j  testRepo=%s  coverageType=%s', appRepos, testRepo, coverageType);

  // Deduplicate URLs so we don't fetch the same repo twice (single mode)
  const uniqueUrls = [...new Set([testRepo, ...appRepos])];

  // Initialise all unique repos in parallel
  console.log('[analyze] 1/5  Initializing repos:', uniqueUrls);
  const clientEntries = await Promise.all(
    uniqueUrls.map(async (url) => [url, await initRepo(url, token)])
  );
  const clientMap = Object.fromEntries(clientEntries);

  const testClient = clientMap[testRepo];
  const appClients = appRepos.map((url) => clientMap[url]);
  console.log('[analyze] 1/5  Done — testRepo files:', testClient.allFiles.length,
    '| appRepo file counts:', appClients.map(c => c.allFiles.length));

  // ── Spec parsing (from testRepo) ────────────────────────────────────────────
  const { allFiles: testFiles, fetchContent: fetchTest } = testClient;

  const specFiles = testFiles.filter((f) => {
    if (specPath && !f.path.startsWith(specPath.replace(/^\/|\/$/g, ''))) return false;
    return isSpecFile(f.path);
  });

  console.log('[analyze] 2/5  Spec files found:', specFiles.length);
  if (specFiles.length > 0) {
    console.log('[analyze] 2/5  First spec file:', specFiles[0].path);
  }

  const results = [];
  let fetchedOk = 0, fetchedSkipped = 0;
  for (let i = 0; i < specFiles.length; i += CONCURRENCY) {
    const batch = specFiles.slice(i, i + CONCURRENCY);
    const parsed = await Promise.all(
      batch.map(async (f) => {
        try {
          const content = await fetchSpecContent(fetchTest, f.path);
          fetchedOk++;
          return parseSpec(content, f.path);
        } catch (err) {
          fetchedSkipped++;
          console.warn(`[provider] skipped ${f.path}:`, err?.message ?? err);
          return null;
        }
      })
    );
    results.push(...parsed.filter(Boolean));
    if (i + CONCURRENCY < specFiles.length) await sleep(BATCH_DELAY);
  }
  console.log(`[analyze] 2/5  Spec files fetched: ${fetchedOk} ok, ${fetchedSkipped} skipped`);

  console.log('[analyze] 2/5  Spec files parsed:', results.length);

  const allTestedUrls = [...new Set(results.flatMap((r) => r.urls))];

  // ── Route extraction (from all appRepos, merged) ────────────────────────────
  console.log('[analyze] 3/5  Extracting routes from', appClients.length, 'app repo(s)');
  const routeArrays = await Promise.all(
    appClients.map(({ allFiles, fetchContent }) => extractRoutes(allFiles, fetchContent))
  );

  // Merge and deduplicate routes across all app repos
  const routeSeen = new Set();
  const extractedRoutes = routeArrays.flat().filter(({ route, source }) => {
    const key = `${route}||${source}`;
    if (routeSeen.has(key)) return false;
    routeSeen.add(key);
    return true;
  });

  console.log('[analyze] 3/5  Routes extracted:', extractedRoutes.length);

  // ── Coverage + suggestions ──────────────────────────────────────────────────
  const routesToAnalyze = coverageType === 'smoke'
    ? extractedRoutes.filter((r) => riskLevel(r.route) === 'high')
    : extractedRoutes;

  console.log('[analyze] 4/5  Computing coverage (mode=%s, routes=%d)', coverageType, routesToAnalyze.length);
  const coverage = computeCoverage(allTestedUrls, routesToAnalyze);
  console.log('[analyze] 4/5  Coverage score:', coverage.score, '| gaps:', coverage.gaps.length);

  const frameworkCounts = results.reduce((acc, r) => {
    acc[r.framework] = (acc[r.framework] ?? 0) + 1;
    return acc;
  }, {});
  const framework = Object.entries(frameworkCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'unknown';

  console.log('[analyze] 5/5  Generating AI suggestions (framework=%s)', framework);
  const suggestions = await generateSuggestions(coverage.gaps, framework, geminiKey);
  console.log('[analyze] 5/5  Suggestions:', suggestions === null ? 'disabled (no API key)' : suggestions.length);

  // Build combined labels for response metadata
  const allLabels    = [...new Set([testClient.repoLabel, ...appClients.map((c) => c.repoLabel)])];
  const allProviders = [...new Set([testClient.provider,  ...appClients.map((c) => c.provider)])];

  console.log('[analyze] DONE');
  return {
    provider: allProviders.join('+'),
    repo: allLabels.join(', '),
    specFilesFound: specFiles.length,
    results,
    coverage,
    suggestions,
  };
}

/**
 * Website crawl pipeline — crawls a live site to discover pages,
 * then compares against Cypress/Playwright specs in a test repo.
 *
 * @param {object} opts
 * @param {string}  opts.siteUrl       - base URL to crawl, e.g. "https://app.example.com"
 * @param {string}  opts.testRepo      - repo containing spec/test files
 * @param {string} [opts.specPath]     - subdirectory filter for specs
 * @param {string} [opts.token]        - GitHub/Bitbucket token
 * @param {string} [opts.geminiKey]    - Gemini API key
 */
export async function analyzeWebsite({ siteUrl, testRepo, specPath = '', token, geminiKey, coverageType = 'full' }) {
  console.log('[analyze] START (website mode)  siteUrl=%s  testRepo=%s  coverageType=%s', siteUrl, testRepo, coverageType);

  // ── Init test repo ──────────────────────────────────────────────────────────
  console.log('[analyze] 1/5  Initializing test repo:', testRepo);
  const testClient = await initRepo(testRepo, token);
  console.log('[analyze] 1/5  Done — testRepo files:', testClient.allFiles.length);

  // ── Parse spec files ────────────────────────────────────────────────────────
  const { allFiles: testFiles, fetchContent: fetchTest } = testClient;
  const specFiles = testFiles.filter((f) => {
    if (specPath && !f.path.startsWith(specPath.replace(/^\/|\/$/g, ''))) return false;
    return isSpecFile(f.path);
  });

  console.log('[analyze] 2/5  Spec files found:', specFiles.length);

  const results = [];
  for (let i = 0; i < specFiles.length; i += CONCURRENCY) {
    const batch = specFiles.slice(i, i + CONCURRENCY);
    const parsed = await Promise.all(
      batch.map(async (f) => {
        try {
          const content = await fetchTest(f.path);
          return parseSpec(content, f.path);
        } catch { return null; }
      })
    );
    results.push(...parsed.filter(Boolean));
  }

  console.log('[analyze] 2/5  Spec files parsed:', results.length);
  const allTestedUrls = [...new Set(results.flatMap((r) => r.urls))];

  // ── Crawl website ───────────────────────────────────────────────────────────
  console.log('[analyze] 3/5  Crawling site:', siteUrl);
  const extractedRoutes = await crawlSite(siteUrl);
  console.log('[analyze] 3/5  Pages discovered:', extractedRoutes.length);

  // ── Coverage ────────────────────────────────────────────────────────────────
  const routesToAnalyze = coverageType === 'smoke'
    ? extractedRoutes.filter((r) => isSmokeUrl(r.route, r.depth))
    : extractedRoutes;

  console.log('[analyze] 4/5  Computing coverage (mode=%s, routes=%d)', coverageType, routesToAnalyze.length);
  const coverage = computeCoverage(allTestedUrls, routesToAnalyze);
  console.log('[analyze] 4/5  Coverage score:', coverage.score, '| gaps:', coverage.gaps.length);

  // ── AI suggestions ──────────────────────────────────────────────────────────
  const frameworkCounts = results.reduce((acc, r) => {
    acc[r.framework] = (acc[r.framework] ?? 0) + 1;
    return acc;
  }, {});
  const framework = Object.entries(frameworkCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'unknown';

  console.log('[analyze] 5/5  Generating AI suggestions (framework=%s)', framework);
  const suggestions = await generateSuggestions(coverage.gaps, framework, geminiKey);
  console.log('[analyze] 5/5  Suggestions:', suggestions === null ? 'disabled' : suggestions.length);

  console.log('[analyze] DONE');
  return {
    provider: 'web',
    repo: siteUrl,
    specFilesFound: specFiles.length,
    results,
    coverage,
    suggestions,
  };
}
