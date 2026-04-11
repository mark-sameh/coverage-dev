/**
 * Spec file parser — supports Playwright, Cypress, and Cucumber (.feature).
 *
 * Extracts from a spec file:
 *   - navigated URLs   (page.goto / cy.visit / Gherkin navigation steps)
 *   - locator strings  (Playwright getBy* / locator, Cypress cy.get, Gherkin interaction steps)
 *   - test/describe block names (it/test/describe blocks, or Gherkin Scenario lines)
 *
 * All extraction is regex-based (no AST dependency).
 */

// ── URLs ─────────────────────────────────────────────────────────────────────

// Playwright: page.goto('url')
const PW_GOTO_RE = /page\.goto\(\s*(['"`])([^'"`]+)\1/g;

// Cypress: cy.visit('url')
const CY_VISIT_RE = /cy\.visit\(\s*(['"`])([^'"`]+)\1/g;

// ── Locators ─────────────────────────────────────────────────────────────────

// Playwright: .locator(), .getByRole(), .getByText(), etc.
const PW_LOCATOR_RE =
  /\.(?:locator|getByRole|getByText|getByLabel|getByPlaceholder|getByTestId|getByAltText|getByTitle)\(\s*(['"`])([^'"`]+)\1/g;

// Cypress: cy.get('selector'), cy.contains('text'), cy.find('selector')
const CY_GET_RE =
  /cy\.(?:get|contains|find)\(\s*(['"`])([^'"`]+)\1/g;

// ── Test / describe blocks ────────────────────────────────────────────────────

// test('name') or it('name')
const TEST_RE = /(?:^|\s)(?:test|it)\(\s*(['"`])([^'"`]+)\1/gm;

// describe('name')
const DESCRIBE_RE = /(?:^|\s)describe\(\s*(['"`])([^'"`]+)\1/gm;

// ── Gherkin (.feature) patterns ───────────────────────────────────────────────

// Scenario: Login successfully  /  Scenario Outline: Login with <role>
const GH_SCENARIO_RE  = /^\s*Scenario(?:\s+Outline)?:\s*(.+)$/gm;

// Feature: Authentication  (used as describe-equivalent)
const GH_FEATURE_RE   = /^\s*Feature:\s*(.+)$/gm;

// Navigation steps — covers Given/When/And/But, with or without "I", common verbs
// Examples matched:
//   Given I visit "/login"
//   When I navigate to "/bijbel"
//   And I am on "/dashboard"
//   Given the user is on "/home"
//   When I open "https://example.com/page"
const GH_URL_RE =
  /^\s*(?:Given|When|And|But)\s+(?:I\s+|the\s+user\s+(?:is\s+)?)?(?:visit|navigate\s+to|open|am\s+on|is\s+on|go\s+to|access|browse\s+to)\s+["']([^"']+)["']/gim;

// Interaction steps: When/Then/And/But I click|type|select|fill|press "selector"
const GH_LOCATOR_RE =
  /^\s*(?:When|Then|And|But)\s+I\s+(?:click(?:\s+on)?|type|select|fill(?:\s+in)?|press)\s+["']([^"']+)["']/gim;

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * @param {string} content  - raw text of a spec file
 * @param {string} filePath - repo-relative path (for reference in output)
 * @returns {{
 *   filePath: string,
 *   framework: 'playwright' | 'cypress' | 'cypress-cucumber' | 'unknown',
 *   urls: string[],
 *   locators: string[],
 *   testNames: string[],
 *   describeBlocks: string[],
 * }}
 */
export function parseSpec(content, filePath) {
  // Delegate Gherkin files to their own parser
  if (filePath.toLowerCase().endsWith('.feature')) {
    return parseFeature(content, filePath);
  }

  const isCypress = /cy\.(?:visit|get|contains|intercept|fixture)\(/.test(content);
  const isPlaywright = /page\.(?:goto|locator|getBy)/.test(content);

  const framework = isCypress ? 'cypress' : isPlaywright ? 'playwright' : 'unknown';

  const urls = [
    ...extractAll(PW_GOTO_RE, content, 2),
    ...extractAll(CY_VISIT_RE, content, 2),
  ];

  const locators = [
    ...extractAll(PW_LOCATOR_RE, content, 2),
    ...extractAll(CY_GET_RE, content, 2),
  ];

  return {
    filePath,
    framework,
    urls: [...new Set(urls)],
    locators: [...new Set(locators)],
    testNames: extractAll(TEST_RE, content, 2),
    describeBlocks: extractAll(DESCRIBE_RE, content, 2),
  };
}

/**
 * Parses a Gherkin `.feature` file.
 */
function parseFeature(content, filePath) {
  const urls      = [...new Set(extractAll(GH_URL_RE,      content, 1))];
  const testNames = extractAll(GH_SCENARIO_RE, content, 1);

  // Debug: show the first 3 non-blank lines and what we extracted
  const preview = content.split('\n').filter(l => l.trim()).slice(0, 3).join(' | ');
  console.log(`[parser] ${filePath}  scenarios=${testNames.length}  urls=${urls.length}  preview: ${preview}`);

  return {
    filePath,
    framework: 'cypress-cucumber',
    urls,
    locators:       [...new Set(extractAll(GH_LOCATOR_RE,  content, 1))],
    testNames,
    describeBlocks: extractAll(GH_FEATURE_RE,  content, 1),
  };
}

/**
 * Runs a global regex against text and collects unique group[index] matches.
 * Resets lastIndex before each call so the regex is safely reused.
 */
function extractAll(re, text, groupIndex) {
  re.lastIndex = 0;
  const results = new Set();
  let match;
  while ((match = re.exec(text)) !== null) {
    results.add(match[groupIndex]);
  }
  return [...results];
}

/**
 * Decides whether a file looks like a Playwright or Cypress spec.
 *
 * @param {string} filePath
 * @returns {boolean}
 */
export function isSpecFile(filePath) {
  const lower = filePath.toLowerCase();
  const isSpecOrTest = /\.(spec|test|cy)\.(ts|js|tsx|jsx)$/.test(lower);
  const isFeature    = lower.endsWith('.feature');
  const isInE2EDir   = /\/(e2e|tests?|__tests?__|cypress|playwright)\//i.test(lower);
  return isSpecOrTest || isFeature || isInE2EDir;
}
