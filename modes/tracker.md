# Mode: tracker — Application Tracker

## Aging Alerts

Before displaying the tracker table, run:

```bash
node aging-alert.mjs
```

If `alerts.length > 0`, display an **Alerts** section at the very top:

> **Aging Alerts — {N} unapplied offer(s) past 3-day threshold:**
> - {Company}, {Role} ({Score}) — {days_old} day(s) old
> *(all alerts, sorted by days_old descending)*
>
> These are aging. Generate PDFs and apply, or mark Discarded to clear.

If `alerts` is empty, skip this section entirely and go straight to the tracker table.

---

Read and display `data/applications.md`.

**Tracker format:**
```markdown
| # | Date | Company | Role | Score | Status | PDF | Report |
```

Possible statuses: `Evaluated` → `Applied` → `Responded` → `Contact` → `Interview` → `Offer` / `Rejected` / `Discarded` / `DO NOT APPLY`

- `Applied` = the candidate submitted their application
- `Responded` = A recruiter/company contacted and the candidate responded (inbound)
- `Contact` = The candidate proactively contacted someone at the company (outbound, e.g., LinkedIn power move)

If the user asks to update a status, edit the corresponding row.

Also show statistics:
- Total applications
- By status
- Average score
- % with PDF generated
- % with report generated
