# Data Contract

This document defines which files belong to the **system** (auto-updatable), which belong to the **user** (never touched by updates), and which are **generated artifacts** (derived from canonical sources — do not hand-edit).

## Generated Layer (DO NOT hand-edit)

**Generated Layer files MUST NOT be hand-edited.** Edit `data/canonical.yml` or `data/canonical-narrative.md`, then run `node gen-derived.mjs`. `drift-alert.mjs` flags hand-edits via the `stale-derivation` check.

| File | Generated from |
|------|---------------|
| `config/profile.yml` | `data/canonical.yml` + `data/canonical-narrative.md` via `gen-derived.mjs` |
| `modes/_profile.md` | `data/canonical.yml` + `data/canonical-narrative.md` via `gen-derived.mjs` |
| `article-digest.md` | `data/canonical.yml` + `data/canonical-narrative.md` via `gen-derived.mjs` |
| `cv-builder.md` | `data/canonical.yml` + `data/canonical-narrative.md` via `gen-derived.mjs` |
| `cv-pd.md` | `data/canonical.yml` + `data/canonical-narrative.md` via `gen-derived.mjs` |

## User Layer (NEVER auto-updated)

These files contain your personal data, customizations, and work product. Updates will NEVER modify them.

| File | Purpose |
|------|---------|
| `cv.md` | Your CV in markdown |
| `data/canonical.yml` | Canonical source of truth: identity, targets, comp, project metrics |
| `data/canonical-narrative.md` | Canonical prose chunks (opener, exit story, project bullets) |
| `data/canonical-rules.yml` | Drift-alert rules — which patterns flag hand-edits to generated files |
| `interview-prep/story-bank.md` | Your accumulated STAR+R stories |
| `portals.yml` | Your customized company list |
| `data/applications.md` | Your application tracker |
| `data/pipeline.md` | Your URL inbox |
| `data/scan-history.tsv` | Your scan history |
| `data/follow-ups.md` | Your follow-up history |
| `data/interview-tracker.md` | Master log of all interviews per round (Phase 1) |
| `data/weakness-map.md` | Auto-generated pattern detector output, gitignored (Phase 2) |
| `interview-prep/debriefs/*.md` | Per-interview structured debrief files (Phase 1) |
| `reports/*` | Your evaluation reports |
| `output/*` | Your generated PDFs |
| `jds/*` | Your saved job descriptions |

## System Layer (safe to auto-update)

These files contain system logic, scripts, templates, and instructions that improve with each release.

| File | Purpose |
|------|---------|
| `modes/_shared.md` | Scoring system, global rules, tools |
| `modes/evaluate.md` | Evaluation mode instructions |
| `modes/pdf.md` | PDF generation instructions |
| `modes/scan.md` | Portal scanner instructions |
| `modes/batch.md` | Batch processing instructions |
| `modes/apply.md` | Application assistant instructions |
| `modes/auto-pipeline.md` | Auto-pipeline instructions |
| `modes/outreach.md` | LinkedIn outreach instructions |
| `modes/deep.md` | Research prompt instructions |
| `modes/compare.md` | Comparison instructions |
| `modes/pipeline.md` | Pipeline processing instructions |
| `modes/project.md` | Project evaluation instructions |
| `modes/tracker.md` | Tracker instructions |
| `modes/training.md` | Training evaluation instructions |
| `modes/patterns.md` | Pattern analysis instructions |
| `modes/followup.md` | Follow-up cadence instructions |
| `modes/de/*` | German language modes |
| `CLAUDE.md` | Agent instructions |
| `AGENTS.md` | Codex instructions |
| `*.mjs` | Utility scripts |
| `batch/batch-prompt.md` | Batch worker prompt |
| `batch/batch-runner.sh` | Batch orchestrator |
| `dashboard/*` | Go TUI dashboard |
| `templates/*` | Base templates |
| `fonts/*` | Self-hosted fonts |
| `.claude/skills/*` | Skill definitions |
| `docs/*` | Documentation |
| `VERSION` | Current version number |
| `DATA_CONTRACT.md` | This file |

## The Rule

**If a file is in the User Layer, no update process may read, modify, or delete it.**

**If a file is in the System Layer, it can be safely replaced with the latest version from the upstream repo.**

**If a file is in the Generated Layer, do not hand-edit it.** Edit the canonical source (`data/canonical.yml` or `data/canonical-narrative.md`) and regenerate with `node gen-derived.mjs`.
