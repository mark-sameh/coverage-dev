/**
 * Bitbucket Cloud ingestion client.
 * Uses the Bitbucket REST API v2 — no auth required for public repos.
 */

const BB_API = 'https://api.bitbucket.org/2.0';

/**
 * Parses a Bitbucket URL or "workspace/repo" slug into parts.
 *
 * Handles:
 *   https://bitbucket.org/workspace/repo
 *   https://bitbucket.org/workspace/repo/src/main/
 *   workspace/repo
 *
 * @param {string} input
 * @returns {{ workspace: string, repo: string, branch: string }}
 */
export function parseRepoUrl(input) {
  // Full URL
  const urlMatch = input.match(
    /bitbucket\.org\/([^/]+)\/([^/?\s]+)(?:\/src\/([^/?\s]+))?/i
  );
  if (urlMatch) {
    return {
      workspace: urlMatch[1],
      repo: urlMatch[2],
      branch: urlMatch[3] || 'main',
    };
  }

  // Shorthand workspace/repo
  const slugMatch = input.match(/^([^/]+)\/([^/]+)$/);
  if (slugMatch) {
    return { workspace: slugMatch[1], repo: slugMatch[2], branch: 'main' };
  }

  throw new Error(`Cannot parse Bitbucket repo from: "${input}"`);
}

// Directories that are never source code — always skip, at any depth.
const SKIP_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', 'out', 'coverage',
  '.nyc_output', 'vendor', '.cache', '.next', '.nuxt', '__pycache__',
  'fixtures', 'snapshots', 'screenshots', 'videos', 'downloads',
]);

// When walking from the repo root (no specPath given), ONLY enter directories
// whose top-level name is in this set. Keeps API calls low in fallback walk mode.
const ROOT_ALLOWLIST = new Set([
  'cypress', 'tests', 'test', 'e2e', 'playwright', 'specs', 'spec',
  '__tests__', 'integration', 'functional', 'automation', 'qa',
  'src', 'app', 'lib', 'packages', 'components', 'pages', 'features',
]);

function containsSkippedSegment(filePath) {
  return filePath.split('/').some((seg) => SKIP_DIRS.has(seg));
}

function rootSegment(dirPath) {
  return dirPath.split('/').filter(Boolean)[0] ?? '';
}

// ── In-memory file-listing cache (10 min TTL) ─────────────────────────────────

const CACHE_TTL_MS = 10 * 60 * 1000;
const _listCache = new Map(); // cacheKey → { files, expiry }

function getCached(key) {
  const entry = _listCache.get(key);
  if (!entry || Date.now() > entry.expiry) { _listCache.delete(key); return null; }
  return entry.files;
}

function setCached(key, files) {
  _listCache.set(key, { files, expiry: Date.now() + CACHE_TTL_MS });
}

/**
 * Lists all files in a Bitbucket repo.
 *
 * Strategy:
 *   1. Return cached result if available (10 min TTL)
 *   2. Try the recursive flat-tree endpoint — 1-2 API calls for the whole repo
 *   3. Fall back to directory walking with 800ms delay if recursive fails
 *
 * Auth: reads BITBUCKET_TOKEN from the environment (format: "username:app_password").
 * Public repos work with no token at all.
 *
 * @param {string} workspace
 * @param {string} repo
 * @param {string} branch
 * @param {string} [path=''] - subdirectory to start from
 * @returns {Promise<Array<{ path: string }>>}
 */
export async function listFiles(workspace, repo, branch, path = '') {
  const headers  = buildHeaders();
  const cacheKey = `${workspace}/${repo}/${branch}/${path}`;

  const cached = getCached(cacheKey);
  if (cached) {
    console.log(`[bitbucket] cache hit: ${cacheKey} (${cached.length} files)`);
    return cached;
  }

  const files = await listFilesWalk(workspace, repo, branch, path, headers);
  console.log(`[bitbucket] walk complete: ${files.length} files`);

  setCached(cacheKey, files);
  return files;
}

const BATCH_SIZE  = 2;    // concurrent directory fetches per batch (lower = fewer 429s)
const BATCH_DELAY = 1500; // ms between batches

/**
 * Walks the directory tree in parallel batches of BATCH_SIZE.
 * Fetches up to 3 directories concurrently, then waits BATCH_DELAY ms before
 * the next batch — fast enough to avoid timeouts, slow enough to avoid 429s.
 */
async function listFilesWalk(workspace, repo, branch, path, headers) {
  const startPath     = normPath(path);
  const hasCustomPath = !!startPath;
  const queue         = [startPath];   // dirs still to fetch
  const queued        = new Set([startPath]);
  const files         = [];

  while (queue.length > 0) {
    const batch = queue.splice(0, BATCH_SIZE);

    const batchResults = await Promise.all(
      batch.map((dir) => fetchDir(workspace, repo, branch, dir, headers, hasCustomPath))
    );

    for (const { files: bFiles, subdirs } of batchResults) {
      files.push(...bFiles);
      for (const sub of subdirs) {
        if (!queued.has(sub)) {
          queued.add(sub);
          queue.push(sub);
        }
      }
    }

    if (queue.length > 0) await sleep(BATCH_DELAY);
  }

  return files;
}

/**
 * Fetches one directory page-by-page and returns its files + immediate subdirs.
 * Applies SKIP_DIRS and ROOT_ALLOWLIST filtering before making any API call.
 */
async function fetchDir(workspace, repo, branch, dir, headers, hasCustomPath) {
  // Skip known noise directories
  if (dir && containsSkippedSegment(dir)) return { files: [], subdirs: [] };

  // When walking from root: only enter whitelisted top-level directories
  if (!hasCustomPath && dir) {
    const root = rootSegment(dir);
    if (!ROOT_ALLOWLIST.has(root.toLowerCase())) return { files: [], subdirs: [] };
  }

  const files   = [];
  const subdirs = [];
  let url = `${BB_API}/repositories/${workspace}/${repo}/src/${branch}/${dir}?pagelen=100`;

  while (url) {
    const res  = await apiFetchWithRetry(url, headers);
    const data = await res.json();

    if (!data.values) {
      throw new Error(
        `Unexpected Bitbucket API response — check workspace/repo/branch. ` +
        (data.error?.message || JSON.stringify(data))
      );
    }

    for (const item of data.values) {
      if (item.type === 'commit_file') {
        if (!containsSkippedSegment(item.path)) files.push({ path: item.path });
      } else if (item.type === 'commit_directory') {
        subdirs.push(item.path + '/');
      }
    }

    url = data.next || null;
  }

  console.log(`[bitbucket] fetched ${dir || '(root)'}: ${files.length} files, ${subdirs.length} subdirs`);
  return { files, subdirs };
}

/**
 * Fetches the text content of a single file.
 *
 * @param {string} workspace
 * @param {string} repo
 * @param {string} branch
 * @param {string} filePath
 * @returns {Promise<string>}
 */
let _firstContentFetch = true; // log the URL once to aid debugging

export async function fetchFileContent(workspace, repo, branch, filePath) {
  const headers = buildHeaders();
  const url = `${BB_API}/repositories/${workspace}/${repo}/src/${branch}/${filePath}`;
  if (_firstContentFetch) {
    console.log('[bitbucket] fetchFileContent first URL:', url);
    _firstContentFetch = false;
  }
  const res = await apiFetchWithRetry(url, headers);
  return res.text();
}

// ── helpers ──────────────────────────────────────────────────────────────────

function normPath(p) {
  return p.replace(/^\/|\/$/g, '');
}

function buildHeaders() {
  const h = { 'Accept': 'application/json' };
  const bbToken = process.env.BITBUCKET_TOKEN; // format: "username:app_password"
  if (bbToken) h['Authorization'] = `Basic ${Buffer.from(bbToken).toString('base64')}`;
  return h;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function apiFetch(url, headers) {
  const res = await fetch(url, { headers });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Bitbucket API ${res.status}: ${url}\n${body}`);
  }
  return res;
}

/**
 * apiFetch with two automatic retries on 429 (rate-limit) responses.
 * Waits 3 s before the first retry, then 5 s before the second.
 */
async function apiFetchWithRetry(url, headers) {
  const delays = [3000, 5000];
  let lastErr;
  for (let attempt = 0; attempt <= delays.length; attempt++) {
    try {
      return await apiFetch(url, headers);
    } catch (err) {
      lastErr = err;
      if (!String(err?.message).includes('429') || attempt === delays.length) break;
      const wait = delays[attempt];
      console.warn(`[bitbucket] 429 on ${url} — waiting ${wait}ms (attempt ${attempt + 1}/${delays.length})`);
      await sleep(wait);
    }
  }
  throw lastErr;
}
