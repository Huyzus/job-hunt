# Job-Hunt -- AI Job Search Pipeline

**This system is designed to be made yours.** If the archetypes don't match your career, the modes are in the wrong language, or the scoring doesn't fit your priorities -- just ask. You (AI Agent) can edit the user's files. The user says "change the archetypes to data engineering roles" and you do it. That's the whole point.

## Data Contract (CRITICAL)

There are two layers. Read `DATA_CONTRACT.md` for the full list.

**User Layer (NEVER auto-updated, personalization goes HERE):**
- `cv.md`, `portals.yml`
- `data/*` (canonical files + tracker + rejection log), `reports/*`, `output/*`, `interview-prep/*`

**Generated Layer (DO NOT hand-edit — owned by SoT pipeline):**
- `config/profile.yml`, `modes/_profile.md`, `article-digest.md`, `cv-builder.md`, `cv-pd.md`
- Edit canonical and run `node gen-derived.mjs` to regenerate these files.

**System Layer (DON'T put user data here):**
- `modes/_shared.md`, `modes/evaluate.md`, all other modes
- `CLAUDE.md`, `*.mjs` scripts, `career-dashboard/*`, `templates/*`, `batch/*`

**THE RULE: When the user asks to customize anything (archetypes, narrative, negotiation scripts, proof points, location policy, comp targets), ALWAYS write to `modes/_profile.md` or `config/profile.yml`. NEVER edit `modes/_shared.md` for user-specific content.**

**CANONICAL SOT RULE: When the user asks to update profile, archetypes, narrative, or any project metric: ALWAYS edit `data/canonical.yml` (for facts: comp, location, URLs, project metrics) or `data/canonical-narrative.md` (for prose: exit story, project descriptions, negotiation scripts, archetype framing) and run `node gen-derived.mjs`. NEVER hand-edit `modes/_profile.md`, `config/profile.yml`, or `article-digest.md` — those are generated artifacts.**

## Canonical SoT (Single Source of Truth)

Three files in `data/` hold all facts, narrative, and lint rules. Edit canonical, run `node gen-derived.mjs`, drift-alert checks the rest.

| File | Holds |
|---|---|
| `data/canonical.yml` | Structured facts: identity, comp, URLs, project metrics, awards, project specs, ban-lists |
| `data/canonical-narrative.md` | Prose chunks (section-IDed): profile openers, exit story, project descriptions, negotiation scripts |
| `data/canonical-rules.yml` | Drift/lint rules — drift-alert.mjs auto-loads. Adding a memory rule = one YAML row. |

**Generated** (run `node gen-derived.mjs` after canonical edits):
`cv-builder.md`, `cv-pd.md`, `article-digest.md`, `modes/_profile.md`, `config/profile.yml`.

**Linted** (drift-alert.mjs flags violations; you fix manually):
`cv.md` (per-JD tailored). The global `~/.claude/CLAUDE.md` is intentionally excluded — it's version-controlled separately.

### How to edit

- **Edit a fact** (URL, metric, year, name) → edit `data/canonical.yml`, run `node gen-derived.mjs`, run `node drift-alert.mjs` (verify clean), commit.
- **Edit narrative** (project description, profile opener, negotiation script) → edit `data/canonical-narrative.md`, run `node gen-derived.mjs`, run `node drift-alert.mjs` (verify clean), commit.
- **Add a drift rule** → edit `data/canonical-rules.yml` (one row: id, description, pattern_violation, optional canonical_field/suggest/advisory). No JS edits.
- **Edit a memory rule** → edit `~/.claude/projects/.../memory/feedback_*.md` for human-readable doc, then update the corresponding row in `data/canonical-rules.yml` if needed.

### Tooling

- `node gen-derived.mjs` — render all derived files from canonical.
- `node gen-derived.mjs --check` — dry-run; exits 1 if any derivation is stale (use in CI).
- `node drift-alert.mjs` — scan linted files + check stale derivations. Loads rules from `data/canonical-rules.yml`.

## Session Start

On the first message of each session, run these silently in parallel:

```bash
node aging-alert.mjs
node drift-alert.mjs
```

**Aging alert** — parse JSON output:
- If `alerts.length > 0`, surface before any other response:
  > **Aging Alerts — {N} unapplied offer(s) past 3-day threshold:**
  > - {Company}, {Role} ({Score}) — {days_old} day(s) old
  > *(list all alerts, sorted by days_old descending)*
  >
  > These are aging. Generate PDFs and apply, or mark Discarded to clear.
- If `alerts` is empty, say nothing.

**Drift alert** — parse JSON output:
- If `alerts.length > 0`, surface before any other response:
  > **Canonical drift detected — {N} rule violation(s):**
  > - `{file}:{line}` — `{match}` ({rule}, {memory})
  > *(list all alerts)*
  >
  > Reconcile against canonical files before any CV/PDF generation. Add a new rule by editing `RULES` in `data/canonical-rules.yml`.
- If `alerts` is empty, say nothing.

## What is job-hunt

AI-powered job search automation built on Claude Code: pipeline tracking, offer evaluation, CV generation, portal scanning, batch processing.

### Main Files

| File | Function |
|------|----------|
| `data/canonical.yml` | Single source of truth for facts (identity, comp, URLs, metrics, awards) |
| `data/canonical-narrative.md` | Single source of truth for prose chunks (project descriptions, profile openers, negotiation scripts) |
| `data/canonical-rules.yml` | Drift/lint rules loaded by drift-alert.mjs                            |
| `gen-derived.mjs` | Render all derived files from canonical; use `--check` for CI dry-run |
| `data/applications.md` | Application tracker |
| `data/pipeline.md` | Inbox of pending URLs |
| `data/scan-history.tsv` | Scanner dedup history |
| `portals.yml` | Query and company config |
| `templates/cv-template.html` | HTML template for CVs |
| `templates/cv-template.tex` | LaTeX/Overleaf template for CVs |
| `generate-pdf.mjs` | Playwright: HTML to PDF |
| `generate-latex.mjs` | LaTeX CV validator + pdflatex compiler |
| `article-digest.md` | Compact proof points from portfolio — generated artifact; edit `data/canonical-narrative.md` instead |
| `interview-prep/story-bank.md` | Accumulated STAR+R stories across evaluations |
| `interview-prep/{company}-{role}.md` | Company-specific interview intel reports |
| `analyze-patterns.mjs` | Pattern analysis script (JSON output) |
| `analyze-interview-patterns.mjs` | Interview pattern detector — reads debriefs+tracker+rejections, writes data/weakness-map.md, returns JSON metadata for the auto-trigger weaknesses card |
| `followup-cadence.mjs` | Follow-up cadence calculator (JSON output) |
| `data/follow-ups.md` | Follow-up history tracker |
| `data/interview-tracker.md` | Master log of interviews per round |
| `data/weakness-map.md` | Auto-generated pattern map (gitignored) |
| `interview-prep/debriefs/*.md` | Per-interview structured debriefs |
| `scan.mjs` | Zero-token portal scanner — hits Greenhouse/Ashby/Lever APIs directly, zero LLM cost |
| `check-liveness.mjs` | Job posting liveness checker |
| `liveness-core.mjs` | Shared liveness logic (expired signals win over generic Apply text) |
| `reports/` | Evaluation reports (format: `{###}-{company-slug}-{YYYY-MM-DD}.md`). Blocks A-F + G (Posting Legitimacy). Header includes `**Legitimacy:** {tier}`. |

### OpenCode Commands

When using [OpenCode](https://opencode.ai), the following slash commands are available (defined in `.opencode/commands/`):

| Command | Claude Code Equivalent | Description |
|---------|------------------------|-------------|
| `/job-hunt` | `/job-hunt` | Show menu or evaluate JD with args |
| `/job-hunt-pipeline` | `/job-hunt pipeline` | Process pending URLs from inbox |
| `/job-hunt-evaluate` | `/job-hunt evaluate` | Evaluate job offer (A-F scoring) |
| `/job-hunt-compare` | `/job-hunt compare` | Compare and rank multiple offers |
| `/job-hunt-contact` | `/job-hunt outreach` | LinkedIn outreach (find contacts + draft) |
| `/job-hunt-deep` | `/job-hunt deep` | Deep company research |
| `/job-hunt-pdf` | `/job-hunt pdf` | Generate ATS-optimized CV |
| `/job-hunt-training` | `/job-hunt training` | Evaluate course/cert against goals |
| `/job-hunt-project` | `/job-hunt project` | Evaluate portfolio project idea |
| `/job-hunt-tracker` | `/job-hunt tracker` | Application status overview |
| `/job-hunt-apply` | `/job-hunt apply` | Live application assistant |
| `/job-hunt-scan` | `/job-hunt scan` | Scan portals for new offers |
| `/job-hunt-batch` | `/job-hunt batch` | Batch processing with parallel workers |
| `/job-hunt-closing` | `/job-hunt closing` | Final-round prep: stakeholder map + business framing + closing moves |
| `/job-hunt-weaknesses` | `/job-hunt weaknesses` | Pattern analysis from debriefs (card + appendix) |

**Note:** OpenCode commands invoke the same `.claude/skills/job-hunt/SKILL.md` skill used by Claude Code. The `modes/*` files are shared between both platforms. `/job-hunt-latex`, `/job-hunt-followup`, and `/job-hunt-patterns` are not yet wired into OpenCode — invoke them through the base `/job-hunt` command.

### Gemini CLI Commands

The Gemini CLI mirrors the OpenCode command set (plus `/job-hunt-followup` and `/job-hunt-patterns`, which are wired in Gemini but not OpenCode). Commands are defined as `.toml` files in `.gemini/commands/`; project context auto-loads from `GEMINI.md`. All `modes/*` files are shared across Claude Code, OpenCode, and Gemini CLI. To inspect the full command list, see `.gemini/commands/`.

### First Run — Onboarding (IMPORTANT)

**Before doing ANYTHING else, check if the system is set up.** Run these checks silently every time a session starts:

1. Does `cv.md` exist?
2. Does `config/profile.yml` exist (not just profile.example.yml)?
3. Does `modes/_profile.md` exist (not just _profile.template.md)?
4. Does `portals.yml` exist (not just templates/portals.example.yml)?

If `modes/_profile.md` is missing and `data/canonical.yml` also does not exist (genuine first run), copy from `modes/_profile.template.md` silently as a bootstrap placeholder. If `data/canonical.yml` exists, run `node gen-derived.mjs` to regenerate `modes/_profile.md` from canonical instead.

> **Note:** This bootstrap is a one-time setup. After initial onboarding, all profile, archetype, and narrative updates must go through `data/canonical.yml` and `data/canonical-narrative.md` — see the "Canonical SoT" section above.

**If ANY of these is missing, enter onboarding mode.** Do NOT proceed with evaluations, scans, or any other mode until the basics are in place. Guide the user step by step:

#### Step 1: CV (required)
If `cv.md` is missing, ask:
> "I don't have your CV yet. You can either:
> 1. Paste your CV here and I'll convert it to markdown
> 2. Paste your LinkedIn URL and I'll extract the key info
> 3. Tell me about your experience and I'll draft a CV for you
>
> Which do you prefer?"

Create `cv.md` from whatever they provide. Make it clean markdown with standard sections (Summary, Experience, Projects, Education, Skills).

#### Step 2: Profile (required)
If `data/canonical.yml` exists, run `node gen-derived.mjs` to generate `config/profile.yml` from canonical — skip manual setup.

If `data/canonical.yml` does NOT exist (genuine first run), copy from `config/profile.example.yml` as a bootstrap and then ask:
> "I need a few details to personalize the system:
> - Your full name and email
> - Your location and timezone
> - What roles are you targeting? (e.g., 'Senior Backend Engineer', 'AI Product Manager')
> - Your salary target range
>
> I'll set everything up for you."

Fill in the bootstrap `config/profile.yml` with their answers. Do not put user-specific archetypes or framing into `modes/_shared.md`.

> **Note:** This bootstrap is a one-time setup. After initial onboarding, all profile and archetype updates must go through `data/canonical.yml` — see the "Canonical SoT" section above.

#### Step 3: Portals (recommended)
If `portals.yml` is missing:
> "I'll set up the job scanner with the pre-configured company list from `templates/portals.example.yml`. Want me to customize the search keywords for your target roles?"

Copy `templates/portals.example.yml` → `portals.yml`. If they gave target roles in Step 2, update `title_filter.positive` to match.

#### Step 4: Tracker
If `data/applications.md` doesn't exist, create it:
```markdown
# Applications Tracker

| # | Date | Company | Role | Score | Status | PDF | Report | Notes |
|---|------|---------|------|-------|--------|-----|--------|-------|
```

#### Step 5: Get to know the user (important for quality)

After the basics are set up, proactively ask for more context. The more you know, the better your evaluations will be:

> "The basics are ready. But the system works much better when it knows you well. Can you tell me more about:
> - What makes you unique? What's your 'superpower' that other candidates don't have?
> - What kind of work excites you? What drains you?
> - Any deal-breakers? (e.g., no on-site, no startups under 20 people, no Java shops)
> - Your best professional achievement — the one you'd lead with in an interview
> - Any projects, articles, or case studies you've published?
>
> The more context you give me, the better I filter. Think of it as onboarding a recruiter — the first week I need to learn about you, then I become invaluable."

Store any insights the user shares in `data/canonical-narrative.md` (prose: exit story, project descriptions, negotiation scripts) or `data/canonical.yml` (facts: comp, location, project metrics), then run `node gen-derived.mjs`. Do not put user-specific archetypes or framing into `modes/_shared.md`.

**After every evaluation, learn.** If the user says "this score is too high, I wouldn't apply here" or "you missed that I have experience in X", update `data/canonical-narrative.md` (for prose insights) or `data/canonical.yml` (for factual corrections), then run `node gen-derived.mjs`. The system should get smarter with every interaction without putting personalization into system-layer files or generated artifacts.

#### Step 6: Ready
Once all files exist, confirm:
> "You're all set! You can now:
> - Paste a job URL to evaluate it
> - Run `/job-hunt scan` (or `/job-hunt-scan` if using OpenCode) to search portals
> - Run `/job-hunt` to see all commands
>
> Everything is customizable — just ask me to change anything.
>
> Tip: Having a personal portfolio dramatically improves your job search. Build one and link it in your CV — it's a strong signal for design and builder roles."

Then suggest automation:
> "Want me to scan for new offers automatically? I can set up a recurring scan every few days so you don't miss anything. Just say 'scan every 3 days' and I'll configure it."

If the user accepts, use the `/loop` or `/schedule` skill (if available) to set up a recurring `/job-hunt scan` (or `/job-hunt-scan` if using OpenCode). If those aren't available, suggest adding a cron job or remind them to run `/job-hunt scan` (or `/job-hunt-scan` if using OpenCode) periodically.

### Personalization

This system is designed to be customized by YOU (AI Agent). When the user asks you to change archetypes, translate modes, adjust scoring, add companies, or modify negotiation scripts -- do it directly. You read the same files you use, so you know exactly what to edit.

**Common customization requests:**
- "Change the archetypes to [backend/frontend/data/devops] roles" → edit `data/canonical.yml` (under `target_roles` or `narrative`) and `data/canonical-narrative.md` (for archetype framing prose), then run `node gen-derived.mjs`
- "Translate the modes to English" → edit all files in `modes/`
- "Add these companies to my portals" → edit `portals.yml`
- "Update my profile" → edit `data/canonical.yml`, then run `node gen-derived.mjs`
- "Change the CV template design" → edit `templates/cv-template.html`
- "Adjust the scoring weights" → edit `data/canonical.yml` (for user-specific weighting), or edit `modes/_shared.md` and `batch/batch-prompt.md` only when changing the shared system defaults for everyone

### Language Modes

Default modes are in `modes/` (English). Additional language-specific modes are available:

- **German (DACH market):** `modes/de/` — native German translations with DACH-specific vocabulary (13. Monatsgehalt, Probezeit, Kündigungsfrist, AGG, Tarifvertrag, etc.). Includes `_shared.md`, `angebot.md` (evaluation), `bewerben.md` (apply), `pipeline.md`.
- **French (Francophone market):** `modes/fr/` — native French translations with France/Belgium/Switzerland/Luxembourg-specific vocabulary (CDI/CDD, convention collective SYNTEC, RTT, mutuelle, prévoyance, 13e mois, intéressement/participation, titres-restaurant, CSE, portage salarial, etc.). Includes `_shared.md`, `offre.md` (evaluation), `postuler.md` (apply), `pipeline.md`.
- **Japanese (Japan market):** `modes/ja/` — native Japanese translations with Japan-specific vocabulary (正社員, 業務委託, 賞与, 退職金, みなし残業, 年俸制, 36協定, 通勤手当, 住宅手当, etc.). Includes `_shared.md`, `kyujin.md` (evaluation), `oubo.md` (apply), `pipeline.md`.

**When to use German modes:** If the user is targeting German-language job postings, lives in DACH, or asks for German output. Either:
1. User says "use German modes" → read from `modes/de/` instead of `modes/`
2. User sets `language.modes_dir: modes/de` in `config/profile.yml` → always use German modes
3. You detect a German JD → suggest switching to German modes

**When to use French modes:** If the user is targeting French-language job postings, lives in France/Belgium/Switzerland/Luxembourg/Quebec, or asks for French output. Either:
1. User says "use French modes" → read from `modes/fr/` instead of `modes/`
2. User sets `language.modes_dir: modes/fr` in `config/profile.yml` → always use French modes
3. You detect a French JD → suggest switching to French modes

**When to use Japanese modes:** If the user is targeting Japanese-language job postings, lives in Japan, or asks for Japanese output. Either:
1. User says "use Japanese modes" → read from `modes/ja/` instead of `modes/`
2. User sets `language.modes_dir: modes/ja` in `config/profile.yml` → always use Japanese modes
3. You detect a Japanese JD → suggest switching to Japanese modes

**When NOT to:** If the user applies to English-language roles, even at French, German, or Japanese companies, use the default English modes.

### Skill Modes

| If the user... | Mode |
|----------------|------|
| Pastes JD or URL | auto-pipeline (evaluate + report + PDF + tracker) |
| Asks to evaluate offer | `evaluate` |
| Asks to compare offers | `compare` |
| Wants LinkedIn outreach | `outreach` |
| Asks for company research | `deep` |
| Preps for interview at specific company | `combat` |
| Just finished an interview / wants to debrief | `debrief` |
| Wants to generate CV/PDF | `pdf` |
| Evaluates a course/cert | `training` |
| Evaluates portfolio project | `project` |
| Asks about application status | `tracker` |
| Fills out application form | `apply` |
| Searches for new offers | `scan` |
| Processes pending URLs | `pipeline` |
| Batch processes offers | `batch` |
| Asks about rejection patterns or wants to improve targeting | `patterns` |
| Asks about follow-ups or application cadence | `followup` |
| Wants final-round prep | `closing` |
| Asks about interview patterns / "where am I losing" | `weaknesses` |
| Reports a rejection or updates status to Rejected | `rejection` |

### Auto-pattern loop

After every debrief, `modes/debrief.md` Step 9.5 invokes `analyze-interview-patterns.mjs` which refreshes `data/weakness-map.md`. If the analyzer detects a "Lost (neck and neck)" outcome OR ≥2 new high-confidence patterns since the last fire, the weaknesses prescription card auto-surfaces — making invisible patterns visible at the highest-signal moment. Combat and closing modes both consume `data/weakness-map.md` automatically, so prep gets sharper as you debrief more rounds.

To opt out, set `weaknesses.auto_trigger: false` in `config/profile.yml`.

### CV Source of Truth

- `cv.md` in project root is the per-JD tailored CV (linted by drift-alert.mjs)
- `cv-builder.md` and `cv-pd.md` are generated base CVs — run `node gen-derived.mjs` to regenerate from canonical
- `article-digest.md` has detailed proof points — generated artifact; edit `data/canonical-narrative.md` instead
- **NEVER hardcode metrics** -- read them from `data/canonical.yml` and generated files at evaluation time

---

## Ethical Use -- CRITICAL

**This system is designed for quality, not quantity.** The goal is to help the user find and apply to roles where there is a genuine match -- not to spam companies with mass applications.

- **NEVER submit an application without the user reviewing it first.** Fill forms, draft answers, generate PDFs -- but always STOP before clicking Submit/Send/Apply. The user makes the final call.
- **Strongly discourage low-fit applications.** If a score is below 4.0/5, explicitly recommend against applying. The user's time and the recruiter's time are both valuable. Only proceed if the user has a specific reason to override the score.
- **Quality over speed.** A well-targeted application to 5 companies beats a generic blast to 50. Guide the user toward fewer, better applications.
- **Respect recruiters' time.** Every application a human reads costs someone's attention. Only send what's worth reading.

---

## Offer Verification -- MANDATORY

**NEVER trust WebSearch/WebFetch to verify if an offer is still active.** ALWAYS use Playwright:
1. `browser_navigate` to the URL
2. `browser_snapshot` to read content
3. Only footer/navbar without JD = closed. Title + description + Apply = active.

**Exception for batch workers (`claude -p`):** Playwright is not available in headless pipe mode. Use WebFetch as fallback and mark the report header with `**Verification:** unconfirmed (batch mode)`. The user can verify manually later.

---

## CI/CD and Quality

- **GitHub Actions** run on every PR: `test-all.mjs` (80+ checks), auto-labeler (risk-based: 🔴 core-architecture, ⚠️ agent-behavior, 📄 docs), welcome bot for first-time contributors
- **Branch protection** on `main`: status checks must pass before merge. No direct pushes to main (except admin bypass).
- **Dependabot** monitors npm, Go modules, and GitHub Actions for security updates
- **Contributing process**: issue first → discussion → PR with linked issue → CI passes → maintainer review → merge

## Community and Governance

- **Code of Conduct**: Contributor Covenant 2.1 with enforcement actions (see `CODE_OF_CONDUCT.md`)
- **Governance**: BDFL model with contributor ladder — Participant → Contributor → Triager → Reviewer → Maintainer (see `GOVERNANCE.md`)
- **Security**: private vulnerability reporting via email (see `SECURITY.md`)
- **Support**: help questions go to Discord/Discussions, not issues (see `SUPPORT.md`)
- **Discord**: https://discord.gg/8pRpHETxa4

## Stack and Conventions

- Node.js (mjs modules), Playwright (PDF + scraping), YAML (config), HTML/CSS (template), Markdown (data), Canva MCP (optional visual CV)
- Scripts in `.mjs`, configuration in YAML
- Derived files (`cv-builder.md`, `cv-pd.md`, `article-digest.md`, `modes/_profile.md`, `config/profile.yml`) are managed via `node gen-derived.mjs` — do not hand-edit; edit canonical and regenerate
- Output in `output/` (gitignored), Reports in `reports/`
- JDs in `jds/` (referenced as `local:jds/{file}` in pipeline.md)
- Batch in `batch/` (gitignored except scripts and prompt)
- Report numbering: sequential 3-digit zero-padded, max existing + 1. The intent is for the tracker row number and the linked report file number to match, but the data has historical drift (early evaluations dropped from the tracker but kept as report files left an off-by-N gap that cascades — e.g., tracker `#49` references `reports/050-...md`). For new evaluations, keep them aligned by using `max(report_num, tracker_num) + 1` for both. Do not attempt to re-sync historical entries — the tracker links to the correct report files by filename, so the misalignment is cosmetic.
- **RULE: After each batch of evaluations, run `node merge-tracker.mjs`** to merge tracker additions and avoid duplications.
- **RULE: NEVER create new entries in applications.md if company+role already exists.** Update the existing entry. Before generating any apply packet or new evaluation, dedupe by company across ALL statuses with `grep -i {company} data/applications.md` — a prior `Applied` row means in-flight; do not re-apply.

### TSV Format for Tracker Additions

Write one TSV file per evaluation to `batch/tracker-additions/{num}-{company-slug}.tsv`. Single line, 9 tab-separated columns:

```
{num}\t{date}\t{company}\t{role}\t{status}\t{score}/5\t{pdf_emoji}\t[{num}](reports/{num}-{slug}-{date}.md)\t{note}
```

**Column order (IMPORTANT -- status BEFORE score):**
1. `num` -- sequential number (integer)
2. `date` -- YYYY-MM-DD
3. `company` -- short company name
4. `role` -- job title
5. `status` -- canonical status (e.g., `Evaluated`)
6. `score` -- format `X.X/5` (e.g., `4.2/5`)
7. `pdf` -- `✅` or `❌`
8. `report` -- markdown link `[num](reports/...)`
9. `notes` -- one-line summary

**Note:** In applications.md, score comes BEFORE status. The merge script handles this column swap automatically.

### Pipeline Integrity

1. **NEVER edit applications.md to ADD new entries** -- Write TSV in `batch/tracker-additions/` and `merge-tracker.mjs` handles the merge.
2. **YES you can edit applications.md to UPDATE status/notes of existing entries.**
3. All reports MUST include `**URL:**` in the header (between Score and PDF). Include `**Legitimacy:** {tier}` (see Block G in `modes/evaluate.md`).
4. All statuses MUST be canonical (see `templates/states.yml`).
5. Health check: `node verify-pipeline.mjs`
6. Normalize statuses: `node normalize-statuses.mjs`
7. Dedup: `node dedup-tracker.mjs`

### Canonical States (applications.md)

**Source of truth:** `templates/states.yml`

| State | When to use |
|-------|-------------|
| `Evaluated` | Report completed, pending decision |
| `Applied` | Application sent |
| `Responded` | Company responded |
| `Interview` | In interview process |
| `Offer` | Offer received |
| `Rejected` | Rejected by company |
| `Discarded` | Discarded by candidate or offer closed |
| `SKIP` | Doesn't fit, don't apply |

**RULES:**
- No markdown bold (`**`) in status field
- No dates in status field (use the date column)
- No extra text (use the notes column)
