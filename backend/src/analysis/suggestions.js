/**
 * AI-powered test suggestions.
 *
 * For HIGH and MEDIUM risk untested routes, calls Gemini Flash to generate
 * ready-to-use test snippets in the correct framework syntax.
 * Returns null if no API key is set.
 */

const MAX_SUGGESTIONS = 5;
const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-04-17:generateContent';

// ── Framework-specific prompt instructions ────────────────────────────────────

const FRAMEWORK_INSTRUCTIONS = {
  'cypress-cucumber': {
    label: 'Cypress-Cucumber (Gherkin .feature file syntax)',
    codeInstruction: `Write a complete Gherkin .feature file using Cucumber syntax.
Use Given/When/Then/And/But steps. Navigation steps must use: Given I visit "URL" or Given I am on "URL".
Interaction steps: When I click "element", When I type "value" in "field", etc.
Assertion steps: Then I should see "text", Then the page title should contain "text", etc.
Example:
Feature: Login
  Scenario: User logs in successfully
    Given I visit "/login"
    When I type "user@example.com" in the email field
    And I type "password123" in the password field
    And I click "Sign in"
    Then I should see the dashboard`,
  },
  'cypress': {
    label: 'Cypress (cy.visit, cy.get, cy.contains, cy.should)',
    codeInstruction: `Write a complete Cypress spec using describe/it blocks.
Use cy.visit() for navigation, cy.get() or cy.contains() for element selection, cy.should() for assertions.
Example:
describe('Login', () => {
  it('logs in successfully', () => {
    cy.visit('/login')
    cy.get('[data-cy=email]').type('user@example.com')
    cy.get('[data-cy=password]').type('password123')
    cy.contains('Sign in').click()
    cy.url().should('include', '/dashboard')
  })
})`,
  },
  'playwright': {
    label: 'Playwright (page.goto, page.locator, expect)',
    codeInstruction: `Write a complete Playwright test using test/expect blocks.
Use page.goto() for navigation, page.locator() or page.getByRole() for element selection, expect() for assertions.
Example:
test('logs in successfully', async ({ page }) => {
  await page.goto('/login')
  await page.locator('[data-test=email]').fill('user@example.com')
  await page.locator('[data-test=password]').fill('password123')
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page).toHaveURL(/dashboard/)
})`,
  },
};

const DEFAULT_FRAMEWORK_KEY = 'cypress';

/**
 * @param {Array<{route:string, source:string, risk:string}>} gaps
 * @param {'cypress'|'cypress-cucumber'|'playwright'|'unknown'} framework
 * @param {string|undefined} apiKey - GEMINI_API_KEY
 * @returns {Promise<Array<{route:string,risk:string,description:string,testCode:string}>|null>}
 */
export async function generateSuggestions(gaps, framework, apiKey) {
  if (!apiKey) return null;

  const priorityGaps = gaps
    .filter((g) => g.risk === 'high' || g.risk === 'medium')
    .slice(0, MAX_SUGGESTIONS);

  if (priorityGaps.length === 0) return [];

  const fwKey = FRAMEWORK_INSTRUCTIONS[framework] ? framework : DEFAULT_FRAMEWORK_KEY;
  const { label, codeInstruction } = FRAMEWORK_INSTRUCTIONS[fwKey];

  const gapList = priorityGaps
    .map((g, i) => `${i + 1}. Route: ${g.route} | Risk: ${g.risk.toUpperCase()} | Source: ${g.source}`)
    .join('\n');

  const prompt = `You are a senior QA engineer. The following routes in a web app have zero test coverage.
Framework: ${label}

UNTESTED ROUTES:
${gapList}

Return a JSON array — no markdown fences, no explanation, just the array. Each object must have exactly these keys:
- "route": the route path (string)
- "risk": "high" or "medium" (string)
- "description": one sentence describing what the test verifies (string)
- "testCode": a complete, runnable test snippet (string, 8–20 lines)

${codeInstruction}

Focus on the most critical happy-path scenario for each route. Use realistic but generic test data.`;

  const res = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { maxOutputTokens: 8192 },
    }),
  });

  if (!res.ok) throw new Error(`Gemini API error: ${res.status} ${await res.text()}`);

  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';

  try {
    // Strip any accidental markdown fences before parsing
    const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
    const parsed = JSON.parse(cleaned);
    return Array.isArray(parsed) ? parsed : parsed.suggestions ?? [];
  } catch {
    // Return raw text as a single suggestion if JSON parsing fails
    return [{ route: '(multiple)', risk: 'high', description: 'AI suggestions', testCode: text }];
  }
}
