import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import express from 'express';
import cors from 'cors';
import { analyzeRepo, analyzeWebsite } from './ingestion/provider.js';

// Same explicit dotenv loading as index.js so the server finds .env
// regardless of which directory it's started from.
const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '../.env') });

// ── Crash safety nets ─────────────────────────────────────────────────────────
process.on('uncaughtException',   (err) => console.error('[UNCAUGHT EXCEPTION]', err));
process.on('unhandledRejection',  (err) => console.error('[UNHANDLED REJECTION]', err));

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({
  origin: [
    /\.vercel\.app$/,
    /\.railway\.app$/,
    /\.onrender\.com$/,
    /\.fly\.dev$/,
    /\.koyeb\.app$/,
    'http://localhost:3000',
    'http://localhost:5173',
  ],
  credentials: true,
}));
app.use(express.json());

/**
 * POST /api/analyze
 *
 * Mode 1 — Single Repo (default):
 *   { mode: 'single', repoUrl: string, specPath?: string }
 *
 * Mode 2 — Split Repos (app code + tests in separate repos):
 *   { mode: 'split', appRepo: string, testRepo: string, specPath?: string }
 *
 * Mode 3 — Multi-Repo (frontend + backend + automation):
 *   { mode: 'multi', appRepos: string[], testRepo: string, specPath?: string }
 *
 * Returns: { provider, repo, specFilesFound, results, coverage, suggestions }
 */
app.post('/api/analyze', async (req, res) => {
  const { mode = 'single', repoUrl, appRepo, appRepos, testRepo, siteUrl, specPath = '', coverageType = 'full' } = req.body;

  try {
    let result;

    if (mode === 'website') {
      if (!siteUrl)  return res.status(400).json({ error: 'siteUrl is required' });
      if (!testRepo) return res.status(400).json({ error: 'testRepo is required' });
      result = await analyzeWebsite({
        siteUrl,
        testRepo,
        specPath,
        coverageType,
        token: process.env.GITHUB_TOKEN,
        geminiKey: process.env.GEMINI_API_KEY,
      });
    } else {
      let normalizedAppRepos, normalizedTestRepo;

      if (mode === 'single') {
        if (!repoUrl) return res.status(400).json({ error: 'repoUrl is required' });
        normalizedAppRepos = [repoUrl];
        normalizedTestRepo = repoUrl;
      } else if (mode === 'split') {
        if (!appRepo)  return res.status(400).json({ error: 'appRepo is required' });
        if (!testRepo) return res.status(400).json({ error: 'testRepo is required' });
        normalizedAppRepos = [appRepo];
        normalizedTestRepo = testRepo;
      } else if (mode === 'multi') {
        if (!appRepos?.length) return res.status(400).json({ error: 'appRepos is required' });
        if (!testRepo)         return res.status(400).json({ error: 'testRepo is required' });
        normalizedAppRepos = appRepos;
        normalizedTestRepo = testRepo;
      } else {
        return res.status(400).json({ error: `Unknown mode: ${mode}` });
      }

      result = await analyzeRepo({
        appRepos: normalizedAppRepos,
        testRepo: normalizedTestRepo,
        specPath,
        coverageType,
        token: process.env.GITHUB_TOKEN,
        geminiKey: process.env.GEMINI_API_KEY,
      });
    }

    return res.json(result);
  } catch (err) {
    const message = err?.message ?? String(err);
    console.error('[/api/analyze] Error:', message);
    console.error(err?.stack ?? '');
    const status = message.includes('401') ? 401
      : message.includes('404') ? 404
      : 500;
    if (!res.headersSent) {
      return res.status(status).json({ error: message });
    }
  }
});

app.get('/api/health', (_req, res) => res.json({ ok: true }));

app.listen(PORT, () => {
  console.log(`TCI backend  : http://localhost:${PORT}`);
  console.log(`GitHub token : ${process.env.GITHUB_TOKEN ? 'YES' : 'NO'}`);
  console.log(`Gemini key   : ${process.env.GEMINI_API_KEY ? 'YES (AI suggestions enabled)' : 'NO'}`);
});
