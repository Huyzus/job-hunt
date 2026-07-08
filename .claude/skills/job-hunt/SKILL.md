---
name: job-hunt
description: AI job search command center -- evaluate offers, generate CVs, scan portals, track applications
user_invocable: true
args: mode
argument-hint: "[scan | deep | pdf | evaluate | compare | apply | batch | tracker | pipeline | outreach | training | project | combat | debrief | patterns | followup | rejection | closing | weaknesses | update]"
---

# job-hunt -- Router

## Mode Routing

Determine the mode from `{{mode}}`:

| Input | Mode |
|-------|------|
| (empty / no args) | `discovery` -- Show command menu |
| JD text or URL (no sub-command) | **`auto-pipeline`** |
| `evaluate` | `evaluate` |
| `compare` | `compare` |
| `outreach` | `outreach` |
| `deep` | `deep` |
| `pdf` | `pdf` |
| `training` | `training` |
| `project` | `project` |
| `tracker` | `tracker` |
| `closing` | `closing` |
| `weaknesses` | `weaknesses` |
| `pipeline` | `pipeline` |
| `apply` | `apply` |
| `scan` | `scan` |
| `batch` | `batch` |
| `patterns` | `patterns` |
| `followup` | `followup` |
| `combat` | `combat` |
| `debrief` | `debrief` |

**Auto-pipeline detection:** If `{{mode}}` is not a known sub-command AND contains JD text (keywords: "responsibilities", "requirements", "qualifications", "about the role", "we're looking for", company name + role) or a URL to a JD, execute `auto-pipeline`.

If `{{mode}}` is not a sub-command AND doesn't look like a JD, show discovery.

---

## Discovery Mode (no arguments)

Show this menu:

```
job-hunt -- Command Center

Available commands:
  /job-hunt {JD}      → AUTO-PIPELINE: evaluate + report + PDF + tracker (paste text or URL)
  /job-hunt pipeline  → Process pending URLs from inbox (data/pipeline.md)
  /job-hunt evaluate  → Evaluation only A-F (no auto PDF)
  /job-hunt compare   → Compare and rank multiple offers
  /job-hunt outreach  → LinkedIn power move: find contacts + draft message
  /job-hunt deep      → Deep research prompt about company
  /job-hunt pdf       → PDF only, ATS-optimized CV
  /job-hunt training  → Evaluate course/cert against North Star
  /job-hunt project   → Evaluate portfolio project idea
  /job-hunt tracker      → Application status overview
  /job-hunt closing {company}  → Final-round prep: stakeholder map + business framing + closing moves
  /job-hunt weaknesses   → Pattern analysis from debriefs (card by default, --full for evidence)
  /job-hunt apply     → Live application assistant (reads form + generates answers)
  /job-hunt scan      → Scan portals and discover new offers
  /job-hunt batch     → Batch processing with parallel workers
  /job-hunt patterns  → Analyze rejection patterns and improve targeting
  /job-hunt followup  → Follow-up cadence tracker: flag overdue, generate drafts
  /job-hunt combat    → Generate combat manual (tactical interview prep) for a specific company + interviewer
  /job-hunt debrief   → Capture structured post-interview intelligence

Inbox: add URLs to data/pipeline.md → /job-hunt pipeline
Or paste a JD directly to run the full pipeline.
```

---

## Context Loading by Mode

After determining the mode, load the necessary files before executing:

### Modes that require `_shared.md` + their mode file:
Read `modes/_shared.md` + `modes/{mode}.md`

Applies to: `auto-pipeline`, `evaluate`, `compare`, `pdf`, `outreach`, `apply`, `pipeline`, `scan`, `batch`

### Standalone modes (only their mode file):
Read `modes/{mode}.md`

Applies to: `tracker`, `deep`, `training`, `project`, `patterns`, `followup`, `weaknesses`, `closing`, `combat`, `debrief`

### Modes delegated to subagent:
For `scan`, `apply` (with Playwright), and `pipeline` (3+ URLs): launch as Agent with the content of `_shared.md` + `modes/{mode}.md` injected into the subagent prompt.

```
Agent(
  subagent_type="general-purpose",
  prompt="[content of modes/_shared.md]\n\n[content of modes/{mode}.md]\n\n[invocation-specific data]",
  description="job-hunt {mode}"
)
```

Execute the instructions from the loaded mode file.
