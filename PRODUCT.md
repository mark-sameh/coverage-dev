# Test Coverage Intelligence — Product Description

## One-Line Pitch

> **Know what's untested before production does.**

---

## The Problem

Engineering teams with Playwright or Cypress suites don't know which critical user flows are untested until a bug hits production. Coverage tools today show *line %*, not *risk %*.

- 80% line coverage sounds great — until a checkout flow breaks in production because it was never touched by a test.
- There is no map from "untested file" to "user impact."
- Even teams that audit coverage manually have no way to rank which gaps to close first.

---

## The Solution

A tool that analyzes a GitHub or Bitbucket repo, finds all spec files, and surfaces the highest-risk coverage gaps — ranked by test presence, change frequency, and page importance — with AI-suggested test cases to close them.

---

## Who It's For

| Role | Pain | Value |
|---|---|---|
| **QA Engineer** | Doesn't know which flows have zero tests | Instant gap map, no manual audit |
| **Team Lead** | Can't justify QA investment without data | Report they can show in sprint review |
| **Engineering Manager / CTO** | Production bugs caused by untested flows | Reduced incidents, visible risk coverage |

---

## Core User Journey

```
1. User visits landing page
2. Recognizes their pain — signs up or pastes repo URL directly
3. Tool analyzes the repo (ingestion + parsing, ~30 seconds)
4. Dashboard shows:
     ✅ Spec files and test cases found
     ⚠️  Files/routes with weak or zero coverage
     🔴 Risk score per module (no tests + high change frequency)
     💡 AI-suggested test cases for the highest-risk gaps
5. User exports the report or shares it with the team
6. User fixes coverage gaps → re-analyzes to watch score improve
7. (Paid) Repo connected for ongoing monitoring + alerts
```

---

## Three Modes of Use

### 1. One-Time Audit *(free, no account)*
Paste a public repo URL → get a report. The acquisition hook. Low friction, immediate value.

### 2. Project Dashboard *(registered user)*
Connect GitHub/Bitbucket account, select repos, see persistent coverage history.
- *"Since last sprint, 3 new flows were added but only 1 has tests."*

### 3. Team Monitoring *(paid tier)*
Slack/email alerts when coverage drops below a threshold. Weekly digest reports. Multiple repos.
This is where revenue comes from.

---

## Screen-by-Screen (MVP)

### Screen 1 — Landing Page *(built)*
Pitch + email capture + "Try it free" CTA with a repo URL input box.

### Screen 2 — Analysis Running
Progress indicator while backend fetches and parses the repo.
Shows what's happening: *"Fetching repo tree… Found 24 spec files… Parsing coverage…"*

### Screen 3 — Results Dashboard *(core product, built as v1)*
A risk-ranked table showing:
- Spec files found, test case count, locator count
- Risk level (HIGH / MEDIUM / LOW) per file
- Expandable row: URLs navigated, test names, detected locators
- Summary: total tests, high-risk files, unique URLs

### Screen 4 — Report Export *(future)*
Download as PDF or share a link with the team.

---

## Freemium Model (Planned)

| Tier | Price | Limits |
|---|---|---|
| Free | $0 | Public repos, one-time analysis, 5 reports/month |
| Pro | ~$29/mo | Private repos, unlimited analysis, history, exports |
| Team | ~$99/mo | Multiple repos, Slack alerts, weekly digest, team sharing |

---

## v1 Supported Stack

To ship fast and get it right before expanding:

- **Test framework:** Playwright (TypeScript or JavaScript)
- **Repo hosting:** GitHub (public) + Bitbucket Cloud (public)
- **Folder structure:** Standard (`tests/`, `e2e/`, `*.spec.ts`, `*.test.ts`)

Cypress and monorepo support are next after v1 is validated.

---

## Key Differentiators

1. **Risk % not line %** — coverage gaps are ranked by user impact and change frequency, not file count
2. **Zero-install** — connect a repo URL, get a report. No CI pipeline changes.
3. **Built by QA engineers** — the product reflects real QA team workflows, not a developer's guess at them
4. **AI suggestions** — highest-risk gaps come with suggested test titles and scenarios ready to use

---

## What Success Looks Like (3 Months)

- 50+ email signups from landing page
- 10 teams running the free analysis
- 2–3 paying Pro customers
- At least one user saying: *"I found a gap I didn't know existed and wrote a test for it"*
