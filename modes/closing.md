# Mode: closing — Final-Round Conversion Manual

## Purpose

Generate a final-round prep manual that addresses the documented "beat by a hair" pattern. Different gear from `combat`: closing shapes what you leave the panel with — stakeholder map, business framing, decision-pushing close — instead of rehearsing narrative flow.

## When to Invoke

- User says `/job-hunt closing {company}` before a final round
- `combat` detects round=Final and offers `→ Want closing prep too? /job-hunt closing {company}`

## Required Inputs

1. **Company name** — must have an existing evaluation report in `reports/`
2. **At least one prior round in `data/interview-tracker.md`** for this company (closing builds on what came before)
3. **Panel composition** — names + roles + LinkedIn URLs (will prompt user for these if missing)
4. **Round date** — defaults to next "Interview" status entry in tracker

## Step 1 — Resolve Inputs

Find the matching report in `reports/{N}-{company-slug}-{date}.md`. If multiple roles exist for the same company, ask which.

Find prior debriefs at `interview-prep/debriefs/{company-slug}-*.md`. Surface count + most recent.

If panel info not provided, ask:
> "Who's on the panel? Provide each as: Name, Role, LinkedIn URL. Comma-separated, one per line. (Skip with 'no panel info' to generate everything except the stakeholder map.)"

## Step 2 — Read All Source Material

Silent reads:
- `cv.md`
- `interview-prep/story-bank.md` (may be a symlink to user's vault)
- `reports/{N}-{company-slug}-{date}.md`
- `modes/_profile.md`
- `article-digest.md` (if exists)
- `data/weakness-map.md` (filter to Final-round patterns)
- All prior debriefs for this company

## Step 3 — Stakeholder Deep-Dive

For each panel member with LinkedIn URL provided, run in parallel:

**Playwright** (use the `chromium` instance):
- Navigate to LinkedIn URL
- Snapshot: tenure, prior companies, recent posts (last 6 months), public talks

**WebSearch:**
- `"{Name}" "{Company}"` — find published articles, conference talks
- `"{Name}" GitHub OR Medium OR personal blog` — find their public craft

**Inferred (LLM synthesis):**
- What they likely decide / veto, given their role
- What they likely care about, given their role + recent activity signals
- Mutual connections / warm signals if visible

## Step 4 — Competitive Landscape Research

WebSearch queries:
- `"{Company}" news OR launch OR announcement 2026` — last 30 days only (for "I saw your launch" moments)
- `"{Company}" hiring "{Role}" OR "design team"` — what their hiring narrative looks like
- `"{Company}" "{competing product}" OR "{adjacent space}"` — their positioning vs market

LLM synthesis:
- Likely 2-4 finalists at this stage. What archetypes do companies hiring this role typically shortlist?
- User's wedge against each likely competitor archetype: synthesize from CV strengths + JD signals

## Step 5 — Pull Final-Round Weak Spots

From `data/weakness-map.md`, scan all `### ` subsections under `## Per-Stage Patterns` and identify any whose name matches "final" or "on-site" (case-insensitive). Common variants: `### Final on-site`, `### Final round`, `### Final`, `### On-site`, `### final`. Aggregate the bullet points from all matching subsections.

Also scan `## Top Patterns` for any row whose Stage column includes "final" or "on-site".

These combined inputs become the "Weak Spots to Defend" section of the closing manual.

If no final-stage subsections are found, omit the Weak Spots section silently — the Edge Cases section below covers this.

## Step 6 — Generate Closing Manual

Write to `interview-prep/{company-slug}-{role-slug}-closing.md` (separate file from any combat manual — closing supplements, doesn't replace).

Use this exact structure:

```markdown
# {Company} Closing Manual: {Round Name}
**Date:** {date} · **Format:** {format} · **Panel:** {names}

---

## Pre-Round Intelligence

### Where we are in the funnel
- Rounds completed: {summary from tracker + prior debriefs}
- Strong signals so far: {bullet list from prior debriefs "what landed"}
- Open concerns: {bullet list from prior debriefs "what fumbled" + final-round weak spots from weakness-map}

### Competitive position
- Likely 2-4 finalists; companies at this stage typically shortlist {archetype assumption}
- Your wedge against likely competitors: {3-bullet synthesis from CV vs typical profile}

---

## 🗺 Stakeholder Map

| Person | Role | What they care about | What worries them about you | Your wedge | Decision weight |
|--------|------|----------------------|----------------------------|-----------|-----------------|
| {Name} | {Role} | {From LinkedIn + research} | {Inferred from gaps} | {Specific story/proof} | High/Med/Low |

(One row per panel member. If no LinkedIn URL provided, omit this entire section and print: "Stakeholder map skipped — provide LinkedIn URLs for the panel and re-run.")

---

## 🎯 Lead-with-Business Framing

For each of 2-3 case studies you're likely to use, restructure the opening to lead with business stakes in the first 30 seconds.

### Case study A: {story name from story-bank}
- ❌ Old opening (craft-led): "{lifted from story-bank or from prior debriefs}"
- ✅ New opening (business-led): "{generated, specific to {company}'s domain — references their product/users/business model}"
- Bridge to craft: "{verbatim transition script (1 sentence)}"

(Repeat for Case study B, Case study C)

---

## 📅 First-90-Days Plan

Specific to {company}'s {team/product surface area}. Three-act structure:

**Days 1-30 — Listen + map:**
- {Specific people to shadow / artifacts to read / metrics to establish}

**Days 30-60 — Ship one targeted improvement:**
- {Specific opportunity grounded in their recent product surface area}

**Days 60-90 — Set up the next quarter:**
- {Strategic positioning, design system contribution, etc.}

---

## 🎬 Closing Moves

### "Why me, why now" pitch (60 seconds, verbatim)
"{Generated from CV + JD + company moment — first-person, conversational, ends with a forward-looking commitment}"

### "Why this company specifically" pitch (45 seconds)
"{Generated, references their recent moves; ends with an unforced reason that's specific to them, not generic}"

### The decision-pushing question
"{One sharp question to ask at the end that surfaces remaining concerns and signals decisiveness}"

Examples by panel size:
- **Small panel (1-2):** "{specific phrasing — can read the room}"
- **Large panel (3+):** "{specific phrasing — different because reading the room is harder}"

---

## ⚠️ Weak Spots to Defend (from weakness-map)

Filtered to final-round patterns:
- **{Pattern 1}** — Defense: "{generated drill response specific to this company's likely framing}"
- **{Pattern 2}** — Defense: "{generated drill}"

(If no weakness-map exists or no final-round patterns yet, omit this section silently.)

---

## ✅ Pre-Round Action Items

- [ ] Drill the business-framing opening for case studies {A, B, C}
- [ ] Drill verbatim "why me, why now" pitch (target: <60s)
- [ ] Drill the decision-pushing question
- [ ] Read {1-2 specific recent links from research}
- [ ] Review {names} LinkedIn one more time, day-of
- [ ] Day-of: {format-specific reminder, e.g., "Test camera + share-screen for Zoom panel"}
```

## Step 7 — Surface Output

Tell the user:

> "Closing manual at `interview-prep/{slug}-closing.md`. {N} stakeholders mapped, {N} weak spots flagged. Drill the verbatim pitches before the round — they're the highest-leverage prep."

If weakness-map was missing, also say:
> "No weakness map yet — run `/job-hunt debrief` after each round to compound this for future closings."

## Edge Cases

- **No prior round in tracker for this company** → print: "No prior interviews logged for {company}. Closing manual works best after at least one round (uses prior debriefs to identify what already landed/fumbled). Continue anyway? (y/n)"
- **No panel info provided** → generate everything except stakeholder map. Print: "Stakeholder map skipped — provide LinkedIn URLs for the panel and re-run for the most leveraged section."
- **No prior debriefs** → "Prior round signals: none captured (run `/job-hunt debrief` after each round to compound this)"
- **No weakness-map or weakness-map shows 'Not yet seeded'** → omit Weak Spots to Defend section silently (Phase 2 cold start; system gets smarter over time)
- **Existing closing manual** → ask: "Existing closing manual for {company}-{role}. Overwrite, or save with timestamp suffix?"
- **Weakness-map > 30 days old** → prepend warning: "⚠️ Pre-round signals based on weakness-map from {date}. Consider running a debrief on your most recent round first."

## What This Mode Does NOT Do

- Does not replace `combat` mode — closing supplements combat for late-stage rounds. Combat handles narrative flow / story rehearsal; closing handles stakeholder mapping / business framing / closing moves.
- Does not submit anything. The closing manual is for prep only — the candidate reviews and uses it manually.
- Does not generate the same output twice in one round. If a closing manual exists for the round, prompts before overwriting (see Edge Cases).
- Does not invent stakeholder details if no LinkedIn URLs are provided. Skips the Stakeholder Map section silently rather than guess.
