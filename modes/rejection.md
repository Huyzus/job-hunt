# Mode: rejection — Rejection Learning Loop

## Trigger

Invoke when the user says they were rejected by a company, or when they update an entry's status to `Rejected`.

## Step 1 — Locate the entry

Find the matching row in `data/applications.md` by company name and/or role.

Extract:
- `company`, `role`, `score`, `date` (tracker date — used as application date proxy)
- `stage` — the status value **before** it is changed to `Rejected` (Applied, Interview, Responded, etc.). If the tracker row already shows `Rejected`, ask: "What stage had you reached before the rejection? (Applied / Recruiter screen / Interview)"
- `report_path` — extract path from the report markdown link `[N](path)` using the pattern `\]\(([^)]+)\)`

Update the tracker entry status to `Rejected` in `data/applications.md`.

## Step 2 — Read the report

Read the file at `report_path`. Extract:
- **Archetype framing** — which archetype was used (Design Engineer / Staff PD / Senior PD / Design Technologist)
- **Comp alignment** — whether comp was aligned or a gap was flagged, and the size of gap if noted
- **Blocker flags** — any hard blockers mentioned in the report

## Step 3 — Classify the rejection

Ask:
> "Was there any human contact before this rejection, or was it an automated email?"

**If automated:**
- Set `rejection_type: automated`
- Compute `days_to_rejection`: days from `date` (tracker date) to today
- Skip Step 3b — go directly to Step 4

**If human contact:**
- Set `rejection_type: human`
- Proceed to Step 3b

**Step 3b (human rejections only):**

Ask:
> "What signal did you get? (e.g., wrong archetype, portfolio gap, comp mismatch, timing, ghosted after interview)"

Capture the answer as `user_reflection`.

## Step 4 — Append to `data/rejection-log.md`

If `data/rejection-log.md` does not exist, create it with this header first:

```markdown
# Rejection Log

Structured log of all rejections. Used by patterns analysis to distinguish screening failures from fit failures.

| Company | Role | Score | Type | Stage | Days to Rejection | Date |
|---------|------|-------|------|-------|-------------------|------|
```

**Auto-analysis rules:**

| Condition | Auto-analysis text |
|-----------|-------------------|
| automated + days_to_rejection ≤ 3 | Auto-rejected before human review — likely ATS/volume filter |
| automated + days_to_rejection 4–14 | Automated rejection after brief hold — possible recruiter pre-screen, no callback |
| automated + days_to_rejection > 14 | Late automated rejection — likely pipeline closure, not fit-based |
| human | Use user_reflection as primary signal |

Append to the summary table (replace `—` with actual values):

```
| {company} | {role} | {score} | {rejection_type} | {stage} | {days_to_rejection} | {YYYY-MM-DD} |
```

Then append the full detail block below the table:

```markdown
## {Company} — {Role} — {YYYY-MM-DD}
- **Score:** {score} | **Archetype:** {archetype} | **Stage:** {stage}
- **Comp alignment:** {aligned/gap — include gap size if known} | **Days to rejection:** {days_to_rejection} (approx from evaluation date)
- **Rejection type:** {automated/human}
- **Auto-analysis:** {auto_analysis}
- **User reflection:** {user_reflection or —}
```

## Step 5 — Flag high-score auto-rejections

If `score >= 4.5` and `rejection_type = automated`, add this note after logging:

> "High-score auto-reject logged ({score}). If this pattern repeats on 4.5+ roles, run `/job-hunt patterns` — repeated high-score auto-rejections point to an ATS or portfolio screening gap, not a fit problem."
