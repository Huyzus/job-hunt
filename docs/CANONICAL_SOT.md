# Canonical SoT — Operations Manual

**Purpose of this doc:** when something goes wrong with CVs, profile, drift-alert, or any "why did the wrong number show up in my application packet" question — start here.

---

## TL;DR

```bash
# Edit a fact (URL, comp, metric, year, name)
$EDITOR data/canonical.yml
node gen-derived.mjs       # regenerate cv-builder.md, cv-pd.md, article-digest.md, modes/_profile.md, config/profile.yml
node drift-alert.mjs       # verify clean
git commit -am "..."

# Edit prose (project description, exit story, negotiation script)
$EDITOR data/canonical-narrative.md
node gen-derived.mjs
node drift-alert.mjs
git commit -am "..."

# Add a new drift rule
$EDITOR data/canonical-rules.yml   # one row: id, description, pattern_violation, optional canonical_field/suggest/advisory
node drift-alert.mjs               # immediately enforced; no JS edit

# Run all sanity checks at once
node test-all.mjs --quick          # 81 checks; should be 0 failed
```

If `node drift-alert.mjs` reports a `stale-derivation` alert, run `node gen-derived.mjs` and the alert will clear.

---

## Architecture

```
 ┌─ data/canonical.yml          ─┐
 │   data/canonical-narrative.md │── single source of truth
 │   data/canonical-rules.yml   ─┤
 └────────────────────────────────┘
                │
                │  node gen-derived.mjs
                ▼
   ┌─ cv-builder.md              ─┐
   │  cv-pd.md                    │
   │  article-digest.md           ├── 5 GENERATED files (DO NOT hand-edit)
   │  modes/_profile.md           │
   │  config/profile.yml         ─┘
                │
                │  node drift-alert.mjs
                ▼
        ┌─ cv.md                  ─┐
        │  ~/.claude/CLAUDE.md     ├── 2 LINTED files (hand-edited; drift-alert flags violations)
        └────────────────────────────┘
```

Three layers, three responsibilities. Edit canonical → regenerate derived → drift-alert checks both linted files and freshness of derived files.

---

## The Three Canonical Files

### `data/canonical.yml` — facts

Structured YAML. Holds:
- `identity` — name, email, location, LinkedIn, portfolio
- `career.{current_employer, previous_employer, ...}` — title, tenure, do_claim / do_not_claim ban-lists
- `awards` — array (name, year, project, note)
- `projects.{hero_project, side_project_one, ...}` — each with name, years, metrics, URLs, ban-lists
- `compensation` — walk_away, target_range, aspirational_anchor, currency, date_set
- `location` — preferred, hard_gate

**Edit pattern:** open in editor, change a value, run `gen-derived.mjs`. Templates pull values via `{{ projects.side_project_one.live_url }}` etc.

**Validation:** `node -e "require('js-yaml').load(require('fs').readFileSync('data/canonical.yml','utf-8'))"` — should not throw.

### `data/canonical-narrative.md` — prose chunks

Markdown with section IDs. Typical section set:

```markdown
## profile_opener.builder
{prose}

## profile_opener.pd
{prose}

## exit_story
{prose}

## superpower_pillars
- bullet 1
...

## project.hero_project.builder
## project.hero_project.pd
## project.second_project.builder
## project.second_project.pd
## project.previous_employer_work.summary
## project.side_project_one
## project.side_project_two
## project.side_project_one.alt        ← a project can have multiple framings for different org types

## negotiation.salary_mid_band
## negotiation.salary_low_band
## negotiation.geo_pushback
## negotiation.below_target
```

Templates reference these via `{{ narrative:project.side_project_one }}` etc.

**Format rules** (also at the top of the file):
- Section content is substituted **verbatim** into templates.
- Do **not** wrap values in surrounding `"..."` quotes — they break YAML substitution when chunks are inserted into quoted scalar fields.
- Sections referenced from YAML block scalars (e.g., `exit_story` in `profile.template.yml`) must be **single-paragraph** — verbatim substitution preserves leading whitespace, multi-paragraph chunks would break YAML indent.

### `data/canonical-rules.yml` — drift/lint rules

Each rule is a YAML row with these fields:

| Field | Required? | Purpose |
|---|---|---|
| `id` | yes | Stable short key for the alert output |
| `pattern_violation` | yes | Regex that, if matched, indicates a violation |
| `description` | recommended | One-line why |
| `memory` | optional | Path to feedback file in `~/.claude/projects/.../memory/` |
| `canonical_field` | optional | Dotted path into `canonical.yml`; alert message includes the live value, and `{canonical_field}` in `suggest` interpolates to it |
| `suggest` | optional | Replacement hint string surfaced in the alert |
| `advisory` | optional, default false | Advisory rules report as warnings, do not change exit code |

See `data/canonical-rules.yml` for your rule list. Adding a memory rule = one YAML row, no JS edit.

Some memory rules are intentionally NOT translated to lint rules (workflow/judgment rules without text-pattern equivalents) — document those in the header comment of `canonical-rules.yml`.

---

## The Five Generated Files

| Output | Template | Used for |
|---|---|---|
| `cv-builder.md` | `templates/cv-builder.template.md` | Builder-track CV variant |
| `cv-pd.md` | `templates/cv-pd.template.md` | PD-track CV variant |
| `article-digest.md` | `templates/article-digest.template.md` | Compact proof-points doc for evaluations |
| `modes/_profile.md` | `templates/_profile.template.md` | User-profile context for job-hunt modes |
| `config/profile.yml` | `templates/profile.template.yml` | Machine-readable profile config |

**Rule:** never hand-edit these. They're overwritten on every `gen-derived.mjs` run. Edit canonical → regenerate.

If you find yourself wanting to edit one of these, that means either:
- The fact/prose isn't yet in canonical → add it there + add a `{{ }}` reference in the template.
- The template is missing the rendering — fix the template under `templates/`.

---

## The Two Linted Files

`drift-alert.mjs` scans these against `canonical-rules.yml`. It does NOT modify them.

| File | Why linted (not generated) |
|---|---|
| `cv.md` | Hand-tailored per JD for one-page density. Templating fights this. |
| `~/.claude/CLAUDE.md` | Edited for many topics (homelab, preferences, etc.); only the "About Me" section needs fact-checking. |

When drift-alert fires on these, the fix is manual — read the alert's `suggest` field for guidance.

---

## Daily Workflows

### "I want to update my comp range"

```bash
$EDITOR data/canonical.yml             # change compensation.target_range
node gen-derived.mjs                   # propagates to modes/_profile.md, config/profile.yml
node drift-alert.mjs                   # should be clean
git add data/canonical.yml modes/_profile.md config/profile.yml
git commit -m "data(job-hunt): bump target range to ..."
```

### "I want to add a new project to my CV"

1. Add facts to `data/canonical.yml`:
   ```yaml
   projects:
     new_project:
       name: "New Project"
       live_url: "https://example.com"
       metrics: { foo: "bar" }
   ```
2. Add prose to `data/canonical-narrative.md`:
   ```markdown
   ## project.new_project
   {description}
   ```
3. Reference it in the appropriate template(s):
   ```markdown
   {{ narrative:project.new_project }}
   ```
4. Run `gen-derived.mjs`, then `drift-alert.mjs`, then commit.

### "I want to update a project URL"

```bash
$EDITOR data/canonical.yml             # change projects.X.live_url
$EDITOR data/canonical-narrative.md    # ALSO check ## project.X — if URL is inline as plaintext, update it there too
node gen-derived.mjs
node drift-alert.mjs
```

⚠️ **Known issue:** if a `canonical-narrative.md` chunk has a URL inline as plaintext (e.g., `Live at https://example.com.`), any CV built from that chunk won't pick up canonical.yml URL changes alone. See "Known limitations" below.

### "I want to update a CV bullet without editing canonical"

You can't, by design. Edits go through canonical. If the bullet is one-off / per-application, edit `cv.md` (the linted, gitignored, per-JD file) — that's its purpose.

### "I want to disable a drift rule temporarily"

Mark it `advisory: true` in `canonical-rules.yml` — it'll still report but won't be a blocker.

### "I want to add a new memory rule"

1. Write the human-readable note in `~/.claude/projects/<your-project-slug>/memory/feedback_<topic>.md` (this is Claude's auto-memory for the project).
2. Add a row to `data/canonical-rules.yml` with the regex pattern and `memory: feedback_<topic>.md`.
3. `node drift-alert.mjs` to verify.

No code edits.

---

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| Session-start drift alerts mention `stale-derivation` | Canonical was edited; `gen-derived.mjs` wasn't run after | `node gen-derived.mjs` |
| Drift alert mentions a stale URL in cv-builder.md | URL is inline plaintext in `canonical-narrative.md` chunk | Edit the `## project.X` chunk in `data/canonical-narrative.md`, replace stale URL, run `gen-derived.mjs` |
| Drift alert on cv.md after a JD-specific tailoring | cv.md is linted — alert is real (rule pattern matched) | Read the alert's `suggest` field; fix manually in cv.md |
| `gen-derived.mjs` throws `Missing canonical key: X.Y.Z` | Template references a YAML path that doesn't exist | Either fix the template (typo) or add the missing field to `data/canonical.yml` |
| `gen-derived.mjs` throws `Missing narrative section: X` | Template references a section that doesn't exist in `canonical-narrative.md` | Either fix the template typo or add `## X\n{prose}` to `canonical-narrative.md` |
| `gen-derived.mjs` throws `Non-scalar value at canonical key: X (object/array)` | Template referenced a YAML object/array via `{{ }}` (only scalars allowed) | Use a deeper path that lands on a scalar (e.g., `projects.side_project_one.live_url` not `projects.side_project_one`) |
| `gen-derived.mjs` says `Template not found: ...` | Template file deleted or renamed without updating `TARGETS` map | Restore the template, or update `TARGETS` map in `gen-derived.mjs` |
| `drift-alert.mjs` outputs `rules-load-error` alert | `canonical-rules.yml` is malformed or has an invalid regex | The error message names the failing rule; fix the YAML / regex |
| Rendered YAML in `config/profile.yml` is invalid | A narrative chunk substituted into a YAML scalar contains characters that break YAML (quotes, multi-line indent) | Either single-quote the substitution in the template, or use `\|` block scalar, or strip the offending characters from the chunk |
| `test-all.mjs` reports `User file IS tracked (should be gitignored)` | A file that's both in `.gitignore` AND tracked | Either remove from `.gitignore` (if intentionally tracked, like the SoT-generated files) or `git rm --cached` (if shouldn't be tracked) |
| Generated CV doesn't have a fact you remember adding to canonical | Template doesn't reference that path, OR you forgot `gen-derived.mjs` | `grep -F '<the-fact>' templates/` to find references; if no match, add `{{ X.Y.Z }}` to the relevant template |
| All alerts say `advisory: true` | Only advisory rules fired (context-dependent vocabulary rules) | Expected — advisory rules warn without blocking. Act on them when the context applies. |
| Drift-alert reports a violation in `~/.claude/CLAUDE.md` | Your global profile section drifted from canonical (e.g., a stale award year) | Manually fix the profile section in `~/.claude/CLAUDE.md` |

---

## File Map

```
job-hunt/
├── data/
│   ├── canonical.yml                    # ★ SoT facts
│   ├── canonical-narrative.md           # ★ SoT prose chunks
│   ├── canonical-rules.yml              # ★ SoT drift rules
│   ├── applications.md                  # tracker (unrelated to SoT)
│   ├── pipeline.md                      # inbox
│   ├── rejection-log.md                 # rejection history
│   ├── interview-tracker.md             # interview log
│   └── follow-ups.md                    # follow-up tracker
│
├── templates/
│   ├── cv-builder.template.md           # ★ template for cv-builder.md
│   ├── cv-pd.template.md                # ★ template for cv-pd.md
│   ├── article-digest.template.md       # ★ template for article-digest.md
│   ├── _profile.template.md             # ★ template for modes/_profile.md
│   ├── profile.template.yml             # ★ template for config/profile.yml
│   ├── cv-template.html                 # PDF generation HTML (unrelated to SoT)
│   ├── cv-template.tex                  # LaTeX template (unrelated to SoT)
│   ├── states.yml                       # canonical application states
│   └── portals.example.yml              # scanner config example
│
├── cv-builder.md                        # ☆ generated — Builder CV
├── cv-pd.md                             # ☆ generated — PD CV
├── article-digest.md                    # ☆ generated — proof-points compact
├── modes/_profile.md                    # ☆ generated — profile context
├── config/profile.yml                   # ☆ generated — machine-readable profile
│
├── cv.md                                # ✎ linted (gitignored, per-JD)
│
├── gen-derived.mjs                      # ★ renderer
├── drift-alert.mjs                      # ★ drift checker
├── aging-alert.mjs                      # session-start aging alert (separate concern)
│
├── test/
│   ├── test-gen-derived.mjs             # 5 tests for gen-derived
│   ├── test-drift-alert.mjs             # 5 tests for drift-alert
│   └── fixtures/
│       ├── canonical-mini/              # gen-derived test fixtures
│       └── drift-mini/                  # drift-alert test fixtures
│
├── test-all.mjs                         # full test suite (81 checks)
│
├── CLAUDE.md                            # project instructions (Canonical SoT section + how-to)
├── DATA_CONTRACT.md                     # User Layer / Generated Layer / System Layer
├── README.md                            # public-facing docs (mentions SoT)
│
└── docs/
    ├── CANONICAL_SOT.md                 # this file
    ├── ARCHITECTURE.md
    ├── SCRIPTS.md
    └── SETUP.md
```

`★` = SoT pipeline file (you'll touch these)
`☆` = generated artifact (do NOT hand-edit)
`✎` = linted (hand-editable, drift-alert checks it)

---

## Known Limitations / Follow-ups

These are documented for future-you. Not blockers.

### 1. URL duplication in narrative chunks

If both `data/canonical.yml` (`projects.X.live_url`) and a `data/canonical-narrative.md` chunk (`## project.X`) contain the same URL as plaintext, a template that uses the narrative chunk won't pick up canonical.yml URL changes alone — it reads the chunk, which still has the old URL.

**Until fixed,** when changing a project URL, edit BOTH `canonical.yml` AND the corresponding `## project.X` section in `canonical-narrative.md`.

**Proper fix (when you're ready):** strip the URL from the narrative chunks; add a `Live at {{ projects.X.live_url }}` line to the template instead.

### 2. Interview talk-tracks live outside canonical

When a legacy ground-truth file is consolidated into canonical, interview-only material (named client examples, feature-level breakdowns, process details) may not transfer. These are interview-prep talk tracks, not CV claims — they belong in `interview-prep/` or a dedicated `data/interview-talk-tracks.md`, not in canonical.

### 3. Advisory rules are advisory by design

A rule with `advisory: true` fires as a warning without changing the exit code. Use this for context-dependent vocabulary (e.g., domain terms that are only a problem for certain org types). When applying to those orgs, manually swap to the alternate framing chunk.

### 4. `awards.0.year` and similar array-index access

`getDotted` (used by both `gen-derived.mjs` and `drift-alert.mjs`) handles `awards.0.year` because JS arrays support string-indexed access (`arr['0']`). This is non-obvious. If a future maintainer finds this pattern and tries to "fix" it to `awards[0].year`, it'll break. Don't.

### 5. `~/.claude/CLAUDE.md` profile section can drift independently

Drift-alert scans the global CLAUDE.md, but the global file isn't generated from canonical. If you edit the "About Me" section in global CLAUDE.md by hand, drift-alert will catch known patterns but won't catch novel drift. Best practice: keep global CLAUDE.md profile section minimal and reference job-hunt canonical for details.

### 6. `cv.md` is gitignored and per-application

Not a limitation, just worth knowing: `cv.md` doesn't exist in fresh clones / worktrees. It's the per-JD tailored copy you create from `cv-builder.md` or `cv-pd.md` for each application. Gitignored intentionally (don't want application-specific tailorings polluting history).

### 7. `gen-derived.mjs` substitution is verbatim — no escaping

If a canonical value contains characters that break the surrounding context (e.g., a YAML-special char inside a YAML scalar field), the rendered output will be invalid. Today, no such cases exist. The format-rule note in `canonical-narrative.md` warns about this. If you ever add an exit story with embedded double-quotes, the substitution into `profile.template.yml` will break (it's a `|` block scalar today, which handles most cases).

---

## Common Errors & Their Recovery

### "I edited a derived file by hand and now they don't match canonical"

```bash
node gen-derived.mjs           # overwrites your hand-edits with canonical-derived content
git diff cv-builder.md         # see what your edits were
```
If your edits are real and should propagate everywhere, port them into canonical (`canonical.yml` for a fact, `canonical-narrative.md` for prose) and regenerate. If they were a one-off for a specific application, put them in `cv.md` instead.

### "I added a memory rule and drift-alert isn't catching it"

```bash
node -e "const y=require('js-yaml');const fs=require('fs');const r=y.load(fs.readFileSync('data/canonical-rules.yml','utf-8')).rules;const re=new RegExp(r.find(x=>x.id==='YOUR_RULE_ID').pattern_violation);console.log(re.test('YOUR_TEST_STRING'))"
```
This tests whether the regex actually matches a sample violation. Iterate the regex until it matches the violations and doesn't false-positive on innocuous text.

### "drift-alert says canonical-rules.yml has a bad regex"

The `rules-load-error` alert names the failing rule and the regex error. Open `canonical-rules.yml`, find that rule, and fix the regex syntax. Common issues: unescaped special characters (`.`, `+`, `(`, etc.), unclosed character classes, unbalanced parens.

### "I want to confirm the pipeline still works end-to-end"

```bash
node test-all.mjs --quick                         # full test suite
node test/test-gen-derived.mjs                    # gen-derived unit tests
node test/test-drift-alert.mjs                    # drift-alert unit tests
node gen-derived.mjs --check                      # all 5 derived files match canonical
node drift-alert.mjs                              # no non-advisory alerts
```

If all 5 pass cleanly, the pipeline is healthy.

---

## What Triggered This Architecture

For context: a session audit found drift in 6+ files — an award year off by one in the global profile, a user-count metric stale by 3x, a banned legacy metric still being claimed, and freshly generated artifacts using deprecated URLs a lint rule had already banned. The lint script enforced only 5 of 17 memory rules.

Root cause: same facts replicated across 6+ files, no propagation, manual reconciliation only. Drift recurs every session because the system was structurally drift-prone.

The SoT migration eliminates that class of bug. Drift becomes structurally impossible on derived files (regenerate from canonical → drift cannot exist) and loud on linted files (one canonical regex set checks every linted file every session-start). Adding a memory rule = adding a YAML row.

If something feels off in the future, **start at this doc, then check `data/canonical.{yml,md,rules.yml}` and run `gen-derived.mjs --check + drift-alert.mjs`.** Most issues come from forgetting to regenerate after a canonical edit.
