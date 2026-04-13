import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { analyzeRepo } from './ingestion/provider.js';

// Explicitly load backend/.env regardless of where `node` is invoked from.
// Must run before analyzeRepo() is called (token is read at call-time, not import-time).
const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '../.env') });

const tokenLoaded = !!process.env.GITHUB_TOKEN;
console.log(`GitHub token  : ${tokenLoaded ? 'YES' : 'NO — create backend/.env from .env.example'}`);
if (!tokenLoaded) console.warn('Warning: unauthenticated GitHub API = 60 req/hr limit');

const geminiLoaded = !!process.env.GEMINI_API_KEY;
console.log(`Gemini key    : ${geminiLoaded ? 'YES (AI suggestions enabled)' : 'NO  (add GEMINI_API_KEY to .env to enable AI suggestions)'}\n`);

// Accept a repo URL as a CLI argument, or fall back to the env var
const repoInput = process.argv[2] || process.env.REPO || '';
const specPath  = process.argv[3] || process.env.SPEC_PATH || '';

if (!repoInput) {
  console.error('Usage: node src/index.js <repo-url-or-owner/repo> [spec-path]');
  console.error('  e.g. node src/index.js https://bitbucket.org/workspace/repo');
  console.error('  e.g. node src/index.js owner/repo tests');
  process.exit(1);
}

async function run() {
  console.log(`\nAnalyzing: ${repoInput}`);
  if (specPath) console.log(`Spec path: ${specPath}`);
  console.log();

  const { provider, repo, specFilesFound, results, coverage, suggestions } = await analyzeRepo({
    repoInput,
    specPath,
    token: process.env.GITHUB_TOKEN,
    geminiKey: process.env.GEMINI_API_KEY,
  });

  console.log(`Provider : ${provider}`);
  console.log(`Repo     : ${repo}`);
  console.log(`Spec files found: ${specFilesFound}`);
  console.log(`Parsed   : ${results.length}\n`);

  if (results.length === 0) {
    console.log('No spec files parsed. Try adjusting the spec path.');
    return;
  }

  printSummary(results, coverage);
  printRoutesDebug(coverage);
  printSuggestions(suggestions);
}

function printRoutesDebug(coverage) {
  console.log('\n' + '='.repeat(60));
  console.log('ROUTES DEBUG');
  console.log('='.repeat(60));

  const allRoutes = [
    ...coverage.covered.map((r) => ({ ...r, _covered: true })),
    ...coverage.gaps.map((r)    => ({ ...r, _covered: false })),
  ].sort((a, b) => a.route.localeCompare(b.route));

  if (allRoutes.length === 0) {
    console.log('No routes extracted.');
    return;
  }

  console.log(`${allRoutes.length} route(s) extracted:\n`);
  for (const r of allRoutes) {
    const status = r._covered ? '✓' : '✗';
    console.log(`  ${status} ${r.route}`);
    console.log(`       source   : ${r.source}`);
    if (r.strategy === 'filesystem') {
      console.log(`       strategy : filesystem  (route derived from file path)`);
    } else {
      console.log(`       strategy : inline`);
      if (r.lineNumber) {
        console.log(`       line ${String(r.lineNumber).padStart(4)} : ${r.lineText}`);
      }
    }
  }
}

function printSuggestions(suggestions) {
  console.log('\n' + '='.repeat(60));
  console.log('AI SUGGESTED TESTS');
  console.log('='.repeat(60));

  if (suggestions === null) {
    console.log('Add GEMINI_API_KEY to backend/.env to enable AI-generated test suggestions.');
    return;
  }
  if (suggestions.length === 0) {
    console.log('No high/medium risk gaps to suggest tests for.');
    return;
  }

  for (const s of suggestions) {
    const icon = s.risk === 'high' ? '🔴' : '🟡';
    console.log(`\n${icon} ${s.route}`);
    console.log(`   ${s.description}`);
    console.log('\n' + s.testCode.split('\n').map(l => '   ' + l).join('\n'));
    console.log('   ' + '─'.repeat(50));
  }
}

function printCoverage(coverage) {
  console.log('\n' + '='.repeat(60));
  console.log('COVERAGE GAPS');
  console.log('='.repeat(60));

  if (coverage.totalRoutes === 0) {
    console.log('No app routes detected. (Add a pages/ directory or Express/React Router route definitions.)');
    return;
  }

  const scoreBar = coverage.score !== null
    ? `${coverage.score}% (${coverage.coveredCount}/${coverage.totalRoutes} routes covered)`
    : 'n/a';

  console.log(`Coverage score : ${scoreBar}`);
  console.log(`Untested routes: ${coverage.gaps.length}`);

  if (coverage.gaps.length === 0) {
    console.log('\nAll detected routes have test coverage. ✓');
    return;
  }

  const ICONS = { high: '🔴', medium: '🟡', low: '🟢' };

  console.log('\nUntested routes (by risk):');
  for (const gap of coverage.gaps) {
    const icon = ICONS[gap.risk] || '•';
    console.log(`  ${icon} ${gap.risk.toUpperCase().padEnd(6)}  ${gap.route}`);
    console.log(`           source: ${gap.source}`);
  }

  if (coverage.covered.length > 0) {
    console.log('\nCovered routes:');
    coverage.covered.forEach((r) => console.log(`  ✓  ${r.route}`));
  }
}

function printSummary(results, coverage) {
  const allUrls = new Set();
  const allLocators = new Set();
  let totalTests = 0;

  for (const r of results) {
    r.urls.forEach((u) => allUrls.add(u));
    r.locators.forEach((l) => allLocators.add(l));
    totalTests += r.testNames.length;
  }

  console.log('='.repeat(60));
  console.log('INGESTION SUMMARY');
  console.log('='.repeat(60));
  console.log(`Spec files parsed : ${results.length}`);
  console.log(`Total test cases  : ${totalTests}`);
  console.log(`Unique URLs hit   : ${allUrls.size}`);
  console.log(`Unique locators   : ${allLocators.size}`);

  if (allUrls.size > 0) {
    console.log('\nURLs navigated to:');
    [...allUrls].sort().forEach((u) => console.log(`  ${u}`));
  }

  console.log('\nPer-file breakdown:');
  for (const r of results) {
    console.log(`\n  ${r.filePath}`);
    console.log(`    tests     : ${r.testNames.length}`);
    console.log(`    describes : ${r.describeBlocks.length}`);
    console.log(`    urls      : ${r.urls.length}`);
    console.log(`    locators  : ${r.locators.length}`);
    if (r.testNames.length > 0) {
      console.log(`    test names:`);
      r.testNames.forEach((n) => console.log(`      - ${n}`));
    }
  }

  printCoverage(coverage);
}

run().catch((err) => {
  console.error('\nFatal:', err.message);
  process.exit(1);
});
