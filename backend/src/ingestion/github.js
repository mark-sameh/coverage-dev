import { Octokit } from '@octokit/rest';

/**
 * Creates an authenticated GitHub client.
 * Falls back to unauthenticated (60 req/hr limit) if no token is set.
 */
export function createClient(token) {
  return new Octokit({ auth: token || undefined });
}

/**
 * Recursively lists all files in a repo path using the Git Trees API.
 * Much faster than walking the directory tree file-by-file.
 *
 * @param {Octokit} octokit
 * @param {string} owner
 * @param {string} repo
 * @param {string} [path=''] - subdirectory to restrict results to
 * @returns {Promise<Array<{path: string, sha: string, size: number}>>}
 */
export async function listFiles(octokit, owner, repo, path = '') {
  // Get the default branch's HEAD commit SHA
  const { data: repoData } = await octokit.repos.get({ owner, repo });
  const defaultBranch = repoData.default_branch;

  const { data: branchData } = await octokit.repos.getBranch({
    owner,
    repo,
    branch: defaultBranch,
  });
  const treeSha = branchData.commit.commit.tree.sha;

  // Fetch the full recursive tree in one API call
  const { data: treeData } = await octokit.git.getTree({
    owner,
    repo,
    tree_sha: treeSha,
    recursive: '1',
  });

  if (treeData.truncated) {
    console.warn(
      `[github] Warning: repository tree was truncated. Results may be incomplete.`
    );
  }

  const files = treeData.tree.filter((item) => item.type === 'blob');

  if (!path) return files;

  const normalizedPath = path.replace(/^\/|\/$/g, '');
  return files.filter((f) => f.path.startsWith(normalizedPath + '/') || f.path.startsWith(normalizedPath));
}

/**
 * Fetches the decoded text content of a single file.
 *
 * @param {Octokit} octokit
 * @param {string} owner
 * @param {string} repo
 * @param {string} filePath
 * @returns {Promise<string>}
 */
export async function fetchFileContent(octokit, owner, repo, filePath) {
  const { data } = await octokit.repos.getContent({
    owner,
    repo,
    path: filePath,
  });

  if (data.encoding !== 'base64') {
    throw new Error(`Unexpected encoding: ${data.encoding}`);
  }

  return Buffer.from(data.content, 'base64').toString('utf-8');
}

/**
 * Parses "owner/repo" string into { owner, repo }.
 */
export function parseRepoSlug(slug) {
  const parts = slug.split('/');
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    throw new Error(`Invalid repo format "${slug}". Expected "owner/repo".`);
  }
  return { owner: parts[0], repo: parts[1] };
}
