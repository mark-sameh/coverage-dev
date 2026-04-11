import { useState, useEffect } from 'react';

// ── shared helpers ────────────────────────────────────────────────────────────

const RISK = {
  high:   { bg: '#3d1a1a', color: '#f85149', label: 'HIGH',   icon: '🔴' },
  medium: { bg: '#3d2e0e', color: '#d29922', label: 'MEDIUM', icon: '🟡' },
  low:    { bg: '#1c3320', color: '#3fb950', label: 'LOW',    icon: '🟢' },
};

function Pill({ level }) {
  const r = RISK[level] ?? RISK.low;
  return (
    <span style={{
      background: r.bg, color: r.color,
      padding: '0.15rem 0.5rem', borderRadius: 4,
      fontSize: '0.7rem', fontWeight: 700,
    }}>
      {r.label}
    </span>
  );
}

function SectionHeader({ title, count, countColor }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      padding: '0.6rem 1.25rem', borderBottom: '1px solid var(--border)',
      fontSize: '0.75rem', color: 'var(--text-muted)', letterSpacing: '0.04em',
    }}>
      <span>{title}</span>
      {count != null && (
        <span style={{ color: countColor ?? 'var(--text-muted)', fontWeight: 700 }}>{count}</span>
      )}
    </div>
  );
}

function Card({ children, style }) {
  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border)',
      borderRadius: 'var(--radius)', overflow: 'hidden',
      marginBottom: '1.5rem', ...style,
    }}>
      {children}
    </div>
  );
}

// ── Section 1: Spec file table ────────────────────────────────────────────────

function specRiskLevel(testCount, locatorCount) {
  if (testCount === 0) return 'high';
  if (testCount <= 1 && locatorCount < 3) return 'medium';
  return 'low';
}

function SpecRow({ result }) {
  const [open, setOpen] = useState(false);
  const level = specRiskLevel(result.testNames.length, result.locators.length);
  return (
    <div style={{ borderBottom: '1px solid var(--border)' }}>
      <div
        onClick={() => setOpen(!open)}
        style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '0.85rem 1.25rem', cursor: 'pointer',
          background: open ? '#0d1117' : 'transparent',
        }}
      >
        <span style={{ fontFamily: 'monospace', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
          {result.filePath}
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            {result.testNames.length} tests · {result.locators.length} locators
          </span>
          <Pill level={level} />
          <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>{open ? '▲' : '▼'}</span>
        </span>
      </div>
      {open && (
        <div style={{ background: '#010409', padding: '1rem 1.25rem', fontSize: '0.82rem' }}>
          {result.urls.length > 0 && (
            <div style={{ marginBottom: '0.75rem' }}>
              <div style={{ color: 'var(--accent)', marginBottom: '0.3rem' }}>URLs navigated</div>
              {result.urls.map((u) => (
                <div key={u} style={{ color: 'var(--text-muted)', paddingLeft: '1rem' }}>→ {u}</div>
              ))}
            </div>
          )}
          {result.testNames.length > 0 && (
            <div>
              <div style={{ color: 'var(--accent)', marginBottom: '0.3rem' }}>Test cases</div>
              {result.testNames.map((n) => (
                <div key={n} style={{ color: 'var(--text-muted)', paddingLeft: '1rem' }}>• {n}</div>
              ))}
            </div>
          )}
          {result.testNames.length === 0 && (
            <div style={{ color: 'var(--red)' }}>No test cases detected in this file.</div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Section 2: Coverage Gaps ──────────────────────────────────────────────────

function CoverageGaps({ coverage, smoke }) {
  const sectionTitle = smoke ? 'SMOKE COVERAGE GAPS' : 'COVERAGE GAPS';

  if (!coverage || coverage.totalRoutes === 0) {
    return (
      <Card>
        <SectionHeader title={sectionTitle} />
        <div style={{ padding: '1.25rem', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
          {smoke
            ? 'No smoke-critical routes detected. Try Full Coverage mode to see all routes.'
            : 'No app routes detected. Routes are extracted from pages/ directories and Express/React Router definitions.'}
        </div>
      </Card>
    );
  }

  const pct = coverage.score ?? 0;
  const barColor = pct >= 70 ? 'var(--green)' : pct >= 40 ? 'var(--yellow)' : 'var(--red)';
  const gapsLabel = smoke ? 'untested critical paths' : 'untested routes';
  const scoreLabel = smoke ? 'Smoke Coverage' : 'Route coverage';
  const coveredLabel = smoke ? 'critical paths tested' : 'routes covered';

  return (
    <Card>
      <SectionHeader
        title={sectionTitle}
        count={coverage.gaps.length > 0 ? `${coverage.gaps.length} ${gapsLabel}` : null}
        countColor="var(--red)"
      />

      {/* All-clear banner (smoke mode, 100%) */}
      {smoke && pct === 100 && (
        <div style={{
          margin: '1rem 1.25rem', padding: '0.75rem 1rem',
          background: '#1c3320', border: '1px solid var(--green)',
          borderRadius: 'var(--radius)', color: 'var(--green)',
          fontSize: '0.9rem', fontWeight: 600,
        }}>
          ✅ All critical paths covered
        </div>
      )}

      {/* Score bar */}
      <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem', fontSize: '0.82rem' }}>
          <span style={{ color: 'var(--text-muted)' }}>{scoreLabel}</span>
          <span style={{ color: barColor, fontWeight: 700 }}>
            {pct}% — {coverage.coveredCount} / {coverage.totalRoutes} {coveredLabel}
          </span>
        </div>
        <div style={{ height: 6, background: 'var(--border)', borderRadius: 3, overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${pct}%`, background: barColor, borderRadius: 3, transition: 'width 0.4s' }} />
        </div>
      </div>

      {/* Gaps table */}
      {coverage.gaps.map((gap) => (
        <div key={gap.route} style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '0.7rem 1.25rem', borderBottom: '1px solid var(--border)',
        }}>
          <div>
            <span style={{ fontFamily: 'monospace', fontSize: '0.85rem' }}>
              {RISK[gap.risk]?.icon} {gap.route}
            </span>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>
              {gap.source}
            </div>
          </div>
          <Pill level={gap.risk} />
        </div>
      ))}

      {coverage.covered.length > 0 && (
        <div style={{ padding: '0.75rem 1.25rem' }}>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.4rem' }}>COVERED</div>
          {coverage.covered.map((r) => (
            <div key={r.route} style={{ fontSize: '0.82rem', color: 'var(--green)', fontFamily: 'monospace' }}>
              ✓ {r.route}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

// ── Section 3: AI Suggested Tests ────────────────────────────────────────────

function SuggestionCard({ s }) {
  const [open, setOpen] = useState(false);
  const r = RISK[s.risk] ?? RISK.medium;
  return (
    <div style={{ borderBottom: '1px solid var(--border)' }}>
      <div
        onClick={() => setOpen(!open)}
        style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '0.85rem 1.25rem', cursor: 'pointer',
          background: open ? '#0d1117' : 'transparent',
        }}
      >
        <span>
          <span style={{ marginRight: '0.5rem' }}>{r.icon}</span>
          <span style={{ fontFamily: 'monospace', fontSize: '0.85rem' }}>{s.route}</span>
          {s.description && (
            <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginLeft: '0.75rem' }}>
              {s.description}
            </span>
          )}
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <Pill level={s.risk} />
          <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>{open ? '▲' : '▼'}</span>
        </span>
      </div>
      {open && (
        <div style={{ background: '#010409', padding: '1rem 1.25rem' }}>
          <pre style={{
            margin: 0, fontFamily: '"SF Mono", "Fira Code", monospace',
            fontSize: '0.8rem', color: '#a5d6ff', lineHeight: 1.6,
            whiteSpace: 'pre-wrap', wordBreak: 'break-word',
          }}>
            {s.testCode}
          </pre>
          <button
            onClick={(e) => { e.stopPropagation(); navigator.clipboard?.writeText(s.testCode); }}
            style={{
              marginTop: '0.75rem', background: 'var(--border)', color: 'var(--text-muted)',
              border: 'none', padding: '0.3rem 0.75rem', borderRadius: 4,
              fontSize: '0.75rem', cursor: 'pointer',
            }}
          >
            Copy
          </button>
        </div>
      )}
    </div>
  );
}

function AISuggestions({ suggestions }) {
  if (suggestions === null || suggestions === undefined) {
    return (
      <Card>
        <SectionHeader title="AI SUGGESTED TESTS" />
        <div style={{ padding: '1.25rem', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
          Add <code>ANTHROPIC_API_KEY</code> to <code>backend/.env</code> to enable AI-generated test suggestions.
        </div>
      </Card>
    );
  }
  if (suggestions.length === 0) {
    return null;
  }
  return (
    <Card>
      <SectionHeader
        title="AI SUGGESTED TESTS"
        count={`${suggestions.length} suggestion${suggestions.length !== 1 ? 's' : ''}`}
        countColor="var(--accent)"
      />
      {suggestions.map((s, i) => <SuggestionCard key={i} s={s} />)}
    </Card>
  );
}

// ── Loading / progress UI ─────────────────────────────────────────────────────

const REPO_STEPS = [
  'Fetching repo structure...',
  'Parsing spec files...',
  'Calculating coverage gaps...',
  'Generating AI suggestions...',
];

const WEBSITE_STEPS = [
  'Crawling website pages...',
  'Parsing spec files...',
  'Calculating coverage gaps...',
  'Generating AI suggestions...',
];

function AnalysisProgress({ visible, steps = REPO_STEPS }) {
  const [stepIdx, setStepIdx] = useState(0);

  useEffect(() => {
    if (!visible) { setStepIdx(0); return; }
    const id = setInterval(() => setStepIdx((i) => (i + 1) % steps.length), 8000);
    return () => clearInterval(id);
  }, [visible]);

  if (!visible) return null;

  return (
    <div style={{ marginTop: '1rem', animation: 'fade-in 0.2s ease' }}>
      {/* Indeterminate progress bar */}
      <div style={{
        height: 3, background: 'var(--border)', borderRadius: 2,
        overflow: 'hidden', marginBottom: '0.75rem',
      }}>
        <div style={{
          height: '100%', width: '25%',
          background: 'var(--accent)',
          borderRadius: 2,
          animation: 'progress-slide 1.6s ease-in-out infinite',
        }} />
      </div>

      {/* Cycling status message */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: '0.5rem',
        fontSize: '0.82rem', color: 'var(--text-muted)',
      }}>
        <span style={{
          display: 'inline-block', width: 12, height: 12,
          border: '2px solid var(--border)',
          borderTopColor: 'var(--accent)',
          borderRadius: '50%',
          animation: 'spin 0.8s linear infinite',
          flexShrink: 0,
        }} />
        <span key={stepIdx} style={{ animation: 'fade-in 0.3s ease' }}>
          {steps[stepIdx]}
        </span>
        <span style={{ marginLeft: 'auto', color: 'var(--border)', fontSize: '0.72rem' }}>
          {stepIdx + 1} / {steps.length}
        </span>
      </div>
    </div>
  );
}

// ── Coverage type toggle ──────────────────────────────────────────────────────

const COVERAGE_TYPES = [
  { id: 'full',  icon: '🔵', label: 'Full Coverage',  hint: '' },
  { id: 'smoke', icon: '🟡', label: 'Smoke Coverage', hint: 'Checks if your most critical user journeys are tested — login, main flows, key pages' },
];

function CoverageTypeToggle({ value, onChange }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginRight: '0.1rem' }}>Type:</span>
      {COVERAGE_TYPES.map((opt) => {
        const active = value === opt.id;
        const activeColor = opt.id === 'smoke' ? 'var(--yellow)' : 'var(--accent)';
        const activeBg    = opt.id === 'smoke' ? 'rgba(210,153,34,0.1)' : 'rgba(88,166,255,0.1)';
        return (
          <button
            key={opt.id}
            type="button"
            onClick={() => onChange(opt.id)}
            style={{
              display: 'flex', alignItems: 'center', gap: '0.3rem',
              padding: '0.3rem 0.75rem', borderRadius: 'var(--radius)',
              border: active ? `1px solid ${activeColor}` : '1px solid var(--border)',
              background: active ? activeBg : 'transparent',
              color: active ? activeColor : 'var(--text-muted)',
              fontSize: '0.78rem', fontWeight: active ? 600 : 400,
              cursor: 'pointer',
            }}
          >
            <span>{opt.icon}</span>
            <span>{opt.label}</span>
            {opt.hint && (
              <span title={opt.hint} style={{ fontSize: '0.68rem', opacity: 0.6, cursor: 'help' }}>ⓘ</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

// ── Mode selector ─────────────────────────────────────────────────────────────

const MODES = [
  { id: 'single',  label: 'Single Repo',     hint: 'App code and tests in one repo' },
  { id: 'split',   label: 'Split Repos',     hint: 'App code and tests in separate repos' },
  { id: 'multi',   label: 'Multi-Repo',      hint: 'Frontend, backend, and automation repos' },
  { id: 'website', label: 'Website + Tests', hint: 'Crawl a live site and compare against your test repo' },
];

function ModeSelector({ mode, onChange }) {
  return (
    <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.25rem' }}>
      {MODES.map((m) => (
        <button
          key={m.id}
          type="button"
          onClick={() => onChange(m.id)}
          title={m.hint}
          style={{
            padding: '0.4rem 0.9rem',
            borderRadius: 'var(--radius)',
            border: mode === m.id ? '1px solid var(--accent)' : '1px solid var(--border)',
            background: mode === m.id ? 'rgba(88,166,255,0.1)' : 'transparent',
            color: mode === m.id ? 'var(--accent)' : 'var(--text-muted)',
            fontSize: '0.82rem', fontWeight: mode === m.id ? 600 : 400,
            cursor: 'pointer',
          }}
        >
          {m.label}
        </button>
      ))}
    </div>
  );
}

// ── Shared input component ────────────────────────────────────────────────────

function RepoInput({ label, value, onChange, placeholder, required }) {
  return (
    <div>
      <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.35rem' }}>
        {label} {required && <span style={{ color: 'var(--red)' }}>*</span>}
      </label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
        style={{
          width: '100%', background: 'var(--bg)', border: '1px solid var(--border)',
          color: 'var(--text)', padding: '0.6rem 0.85rem', borderRadius: 'var(--radius)',
          fontSize: '0.9rem', outline: 'none', boxSizing: 'border-box',
        }}
      />
    </div>
  );
}

// ── Main App ──────────────────────────────────────────────────────────────────

export default function App() {
  const [mode, setMode]               = useState('single');

  // single mode
  const [repoUrl, setRepoUrl]         = useState('');

  // split mode
  const [appRepo, setAppRepo]         = useState('');
  const [testRepo, setTestRepo]       = useState('');

  // multi mode
  const [frontendRepo, setFrontendRepo] = useState('');
  const [backendRepo, setBackendRepo]   = useState('');
  const [autoRepo, setAutoRepo]         = useState('');

  // website mode
  const [siteUrl, setSiteUrl]               = useState('');
  const [websiteTestRepo, setWebsiteTestRepo] = useState('');

  // shared
  const [coverageType, setCoverageType] = useState('full');
  const [specPath, setSpecPath]         = useState('');
  const [loading, setLoading]         = useState(false);
  const [data, setData]               = useState(null);
  const [error, setError]             = useState(null);

  function buildPayload() {
    const base = { coverageType };
    if (mode === 'single') {
      return { ...base, mode: 'single', repoUrl, specPath };
    }
    if (mode === 'split') {
      return { ...base, mode: 'split', appRepo, testRepo, specPath };
    }
    if (mode === 'multi') {
      return {
        ...base, mode: 'multi',
        appRepos: [frontendRepo, backendRepo].filter(Boolean),
        testRepo: autoRepo,
        specPath,
      };
    }
    // website
    return { ...base, mode: 'website', siteUrl, testRepo: websiteTestRepo, specPath };
  }

  async function analyze(e) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setData(null);
    const API_URL = import.meta.env.VITE_API_URL || '';
    try {
      const res = await fetch(`${API_URL}/api/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildPayload()),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Request failed');
      setData(json);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  const sorted = data?.results?.slice().sort((a, b) => {
    const order = { high: 0, medium: 1, low: 2 };
    return order[specRiskLevel(a.testNames.length, a.locators.length)] -
           order[specRiskLevel(b.testNames.length, b.locators.length)];
  });

  const ghPlaceholder = 'https://github.com/owner/repo';
  const specHint      = 'e2e  or  cypress/integration';

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '2rem 1.5rem' }}>

      {/* Header */}
      <div style={{ marginBottom: '2.5rem' }}>
        <h1 style={{ fontSize: '1.4rem', fontWeight: 700, letterSpacing: '-0.02em' }}>
          coverage<span style={{ color: 'var(--accent)' }}>.</span>dev
        </h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginTop: '0.25rem' }}>
          Test Coverage Intelligence — find gaps before production does
        </p>
      </div>

      {/* Form */}
      <div style={{
        background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: 'var(--radius)', padding: '1.5rem', marginBottom: '2rem',
      }}>
        <form onSubmit={analyze}>
          <ModeSelector mode={mode} onChange={(m) => { setMode(m); setData(null); setError(null); }} />
          <CoverageTypeToggle value={coverageType} onChange={setCoverageType} />

          {/* ── Single Repo ── */}
          {mode === 'single' && (
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '0.75rem', marginBottom: '1rem' }}>
              <RepoInput
                label="Repo URL"
                value={repoUrl}
                onChange={setRepoUrl}
                placeholder={`${ghPlaceholder}  or  https://bitbucket.org/workspace/repo`}
                required
              />
              <RepoInput
                label="Spec Path (optional)"
                value={specPath}
                onChange={setSpecPath}
                placeholder={specHint}
              />
            </div>
          )}

          {/* ── Split Repos ── */}
          {mode === 'split' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '1rem' }}>
              <RepoInput
                label="App Repo"
                value={appRepo}
                onChange={setAppRepo}
                placeholder={ghPlaceholder}
                required
              />
              <RepoInput
                label="Test Repo"
                value={testRepo}
                onChange={setTestRepo}
                placeholder={ghPlaceholder}
                required
              />
              <RepoInput
                label="Spec Path (optional)"
                value={specPath}
                onChange={setSpecPath}
                placeholder={specHint}
              />
            </div>
          )}

          {/* ── Multi-Repo ── */}
          {mode === 'multi' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1rem' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <RepoInput
                  label="Frontend Repo"
                  value={frontendRepo}
                  onChange={setFrontendRepo}
                  placeholder={ghPlaceholder}
                  required
                />
                <RepoInput
                  label="Backend Repo"
                  value={backendRepo}
                  onChange={setBackendRepo}
                  placeholder={ghPlaceholder}
                />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <RepoInput
                  label="Automation Repo"
                  value={autoRepo}
                  onChange={setAutoRepo}
                  placeholder={ghPlaceholder}
                  required
                />
                <RepoInput
                  label="Spec Path (optional)"
                  value={specPath}
                  onChange={setSpecPath}
                  placeholder={specHint}
                />
              </div>
            </div>
          )}

          {/* ── Website + Tests ── */}
          {mode === 'website' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1rem' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <RepoInput
                  label="Website URL"
                  value={siteUrl}
                  onChange={setSiteUrl}
                  placeholder="https://app.yoursite.com"
                  required
                />
                <RepoInput
                  label="Test Repo"
                  value={websiteTestRepo}
                  onChange={setWebsiteTestRepo}
                  placeholder="https://github.com/owner/automation"
                  required
                />
              </div>
              <RepoInput
                label="Spec Path (optional)"
                value={specPath}
                onChange={setSpecPath}
                placeholder="cypress/e2e"
              />
              <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', display: 'flex', gap: '0.4rem', alignItems: 'flex-start' }}>
                <span style={{ color: 'var(--yellow)', flexShrink: 0 }}>⚠</span>
                Crawls public pages only (up to 50). Pages behind login won't be discovered.
              </div>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              background: loading ? 'var(--border)' : 'var(--accent)', color: loading ? 'var(--text-muted)' : '#000',
              border: 'none', padding: '0.6rem 1.5rem', borderRadius: 'var(--radius)',
              fontWeight: 600, fontSize: '0.9rem', cursor: loading ? 'not-allowed' : 'pointer',
            }}
          >
            {loading ? 'Analyzing…' : 'Analyze'}
          </button>

          <AnalysisProgress visible={loading} steps={mode === 'website' ? WEBSITE_STEPS : REPO_STEPS} />
        </form>
      </div>

      {/* Error */}
      {error && (
        <div style={{
          background: '#3d1a1a', border: '1px solid #f8514940', borderRadius: 'var(--radius)',
          padding: '1rem 1.25rem', color: 'var(--red)', marginBottom: '1.5rem', fontSize: '0.9rem',
        }}>
          {error}
        </div>
      )}

      {/* Results */}
      {data && sorted && (
        <>
          {/* Summary bar */}
          <div style={{
            display: 'flex', gap: '1.5rem', marginBottom: '1rem',
            fontSize: '0.85rem', color: 'var(--text-muted)', flexWrap: 'wrap',
          }}>
            <span style={{ textTransform: 'capitalize', color: 'var(--accent)' }}>
              {data.provider} · {data.repo}
            </span>
            <span><strong style={{ color: 'var(--text)' }}>{data.specFilesFound}</strong> spec files</span>
            <span><strong style={{ color: 'var(--text)' }}>{sorted.reduce((s, r) => s + r.testNames.length, 0)}</strong> tests</span>
            <span>
              <strong style={{ color: 'var(--red)' }}>
                {sorted.filter((r) => specRiskLevel(r.testNames.length, r.locators.length) === 'high').length}
              </strong> high-risk files
            </span>
            <span><strong style={{ color: 'var(--text)' }}>{sorted.reduce((s, r) => s + r.urls.length, 0)}</strong> unique URLs</span>
          </div>

          {/* Section 1 — Spec files */}
          <Card>
            <SectionHeader title="SPEC FILES" count={`${sorted.length} parsed`} />
            {sorted.map((r) => <SpecRow key={r.filePath} result={r} />)}
          </Card>

          {/* Section 2 — Coverage gaps */}
          <CoverageGaps coverage={data.coverage} smoke={coverageType === 'smoke'} />

          {/* Section 3 — AI suggested tests */}
          <AISuggestions suggestions={data.suggestions} />
        </>
      )}
    </div>
  );
}
