# Mode: debrief — Post-Interview Intelligence Capture

## Purpose

Capture structured intelligence from a just-completed interview. Output feeds the weakness-map (Phase 2) which surfaces recurring patterns invisible from any single interview. Designed to be fast — ideally completed within 30 minutes of the interview ending while details are fresh.

## When to Invoke

- User says "I just finished my {company} interview" or "debrief {company}"
- After any interview round, regardless of outcome
- Even if the user doesn't know the outcome yet (mark "Pending" in tracker)

## Inputs

1. **Optional argument:** Company name (skips the "which interview" question)
2. **All other data is captured conversationally** — do not ask the user to fill out a form, prompt one question at a time

## Step 1 — Identify the Interview

If company name not provided as argument, ask:
> "Which interview did you just finish? (List your most recent 'Interview' status entries from data/applications.md)"

Read `data/applications.md` and surface the most recent 5 entries with status "Interview" or "Applied" (an "Applied" entry might be where the interview just happened and tracker isn't updated yet).

Once company is identified, also ask:
- "Which round was this? (e.g., recruiter screen, hiring manager, portfolio review, on-site, final)"
- "Date of the interview? (default: today)"

## Step 2 — What Landed

Ask:
> "What stories or answers got the strongest positive reaction? Bullet list — what you said, who reacted, what their reaction was."

Capture verbatim. If user struggles to remember, prompt with examples from their story-bank (e.g., "Did you bring up your hero-project story? How did that land?").

## Step 3 — What Fumbled

Ask:
> "What questions did you struggle with, fumble, or feel you didn't answer well? Bullet list."

For each fumble, ask a follow-up:
> "What was the question, and what made it hard? (Knowledge gap, story didn't fit, didn't understand the question, ran out of time, etc.)"

## Step 4 — Interviewer Signals

Ask:
> "For each interviewer (name + role): warm/positive, neutral, or cold/negative? Any specific signal — body language, follow-up questions, anything?"

Capture per-interviewer:
- Name + Role
- Sentiment: Positive / Neutral / Negative
- Specific signal (1-2 sentences)

## Step 5 — Comp / Timeline / Process Signals

Ask:
> "Any signal on comp, level, hiring timeline, or process next steps?"

Examples to prompt:
- Did they mention salary band or level?
- Did they say "we'll be in touch by X"?
- Did they hint at how many candidates are still in process?

## Step 6 — Gut-Feel Verdict

Ask:
> "On a 1-10 scale, how confident are you that you'll advance from this round?"

Capture the number plus any context the user volunteers.

## Step 7 — Pattern Tags

Suggest tags based on what was captured:
- Look at fumbles — auto-suggest tags like #first-90-days, #leadership-without-authority, #domain-{company-vertical}
- Look at interviewer signals — auto-suggest tags like #vp-skeptical, #ic-warm

Show suggested tags and ask:
> "Tags I'd attach: {list}. Add or remove any?"

## Step 8 — Write the Debrief File

Create `interview-prep/debriefs/{company-slug}-{round-slug}-{YYYY-MM-DD}.md`:

```markdown
# Debrief: {Company} — {Role} — {Round} — {YYYY-MM-DD}

## What Landed
- {Bullet 1}
- {Bullet 2}

## What Fumbled
- **{Question 1}** — {Why it was hard}
- **{Question 2}** — {Why it was hard}

## Interviewer Signals
- **{Name}** ({Role}): {Sentiment} → {Specific signal}
- **{Name}** ({Role}): {Sentiment} → {Specific signal}

## Comp / Timeline / Process
- {Signals captured}

## Gut-Feel Verdict
{N}/10 — {Context}

## Verdict (filled after rejection or advancement)
{Pending — fill this in when you hear back}

## Pattern Tags
{tags space-separated}
```

## Step 9 — Update interview-tracker.md

Append a row to `data/interview-tracker.md`:

```
| {N} | {Company} | {Role} | {Round} | {YYYY-MM-DD} | Pending | {gut-feel}/10 | [debrief]({path-to-debrief}) |
```

If the file doesn't exist yet, create it with this header (handled by Task 11):

```markdown
# Interview Tracker

| # | Company | Role | Round | Date | Outcome | Score | Debrief |
|---|---------|------|-------|------|---------|-------|---------|
```

## Step 9.5 — Run Pattern Analysis (auto-trigger hook)

After tracker is updated, run the deterministic pattern analyzer to refresh `data/weakness-map.md`:

Invoke: `node analyze-interview-patterns.mjs --json`

Parse the JSON returned to stdout:

```json
{
  "patterns_total": 8,
  "high_confidence": 2,
  "medium_confidence": 3,
  "threshold_hit": true,
  "fired_reason": "new neck-and-neck loss: BetaHealth (2026-04-20)",
  "since_last_run_days": 4,
  "file_changed": true
}
```

### If `threshold_hit: true`

Render the weaknesses prescription card directly here, EXACTLY in this order:

1. First, output this banner verbatim (using the actual `fired_reason` from the JSON):

   > 🚨 **Pattern threshold crossed:** {fired_reason}. Surfacing while details are fresh.

2. Then read `modes/weaknesses.md` Step 3 and produce the prescription card output following its template — substituting the values from the just-generated `data/weakness-map.md`.

This way the auto-trigger framing ("you just had a hair-loss; here's the pattern") is always visible to the user when the analyzer fires, NOT only when invoked via `--auto`.

### If `threshold_hit: false`

Append one line to the existing Step 10 summary:
> "Weakness map updated ({patterns_total} patterns tracked, {high_confidence} high-confidence)."

### Failure handling

If the analyzer fails or doesn't return parseable JSON, log the error and continue to Step 10 normally — don't block the debrief flow on analyzer failure. Print:
> "⚠️ Pattern analyzer failed (debrief still saved). Run `node analyze-interview-patterns.mjs --dry` to debug."

## Step 10 — Surface Summary

Tell the user:

> "Debrief saved to `interview-prep/debriefs/{filename}`. Tracker updated. {If 3+ debriefs exist: 'You now have {N} debriefs — run `/job-hunt weaknesses` to find recurring patterns.'} {If outcome is unknown: 'When you hear back from {company}, run `/job-hunt debrief {company}` again with `--update-verdict` to capture the result.'}"

## Edge Cases

- **Can't recall details:** Allow skipping any question with "skip" or "don't remember". Capture as `_uncertain_` in the debrief.
- **Outcome already known (rejected on the spot or got verbal offer):** Capture in the Verdict field directly during this debrief flow.
- **First debrief ever:** Create `data/interview-tracker.md` and `interview-prep/debriefs/` if they don't exist before writing.
- **Updating an existing debrief (e.g., adding the verdict after rejection):** Detect existing file and prompt: "Existing debrief found. Update verdict only, or full re-debrief?"
