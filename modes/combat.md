# Mode: combat — Combat Manual Generator

## Purpose

Generate a tactical interview combat manual for a specific company + role + interviewer. Modeled on the "Islands strategy" — not generic interview prep, but a battle-ready playbook with story selection, transition pivots, anticipated questions with prepared angles, and questions to ask back.

## When to Invoke

- User says "prep me for {company}" or "combat manual for {company}"
- User has an interview scheduled and wants tactical prep
- After updating an application's status to "Interview" in the tracker

## Inputs

1. **Required:** Company name (resolves to existing report in `data/reports/`)
2. **Optional:** Interviewer name + LinkedIn URL
3. **Optional:** Round name (e.g., "HM screen", "Portfolio review", "Final on-site")
4. **Optional:** Specific date of interview (for the manual header)

## Step 1 — Resolve Inputs

Find the matching report in `data/reports/{N}-{company-slug}-{date}.md`. If not found, ask the user to either run `/job-hunt evaluate` first OR paste the JD URL/text now.

If multiple reports for the same company exist (multiple roles), ask which role this interview is for.

Extract from the report:
- Archetype framing
- CV variant used (Builder, PD, etc.)
- Key proof points matched to JD
- Comp band
- Identified gaps

## Step 2 — Read Source Material

Read these files (silent reads, surface only what's needed):
- `cv.md` — current CV content
- `interview-prep/story-bank.md` — story bank (may be a symlink to Obsidian vault)
- `data/weakness-map.md` (if exists) — recurring fumble patterns to defend against:
  - Parse the `## Top Patterns` and `## Per-Stage Patterns` tables
  - Filter to patterns relevant to THIS round type (combat handles any round, not just finals)
  - Parse `## Story-Specific Performance` table — use it to bias story selection in Master Layout (prefer stories with high land-rate; demote stories that have fumbled ≥2 times)
- `article-digest.md` (if exists) — detailed proof point metrics
- `modes/_profile.md` — user narrative and archetypes

## Step 3 — Deep Company Research

Reuse the deep research approach from `modes/deep.md`. Run focused WebSearch queries:

| Query | Extract |
|-------|---------|
| `"{company}" engineering blog OR design blog` | Tech stack, design culture, what they publish |
| `"{company} {role} interview" site:glassdoor.com` | Process, difficulty, sample questions |
| `"{company} {role} interview" site:teamblind.com` | Candid process descriptions, hiring bar |
| `"{company}" recent news 2026` | Funding, leadership changes, product launches |
| `"{company}" {team-name} OR {product-name}` | Team-specific context |

Cite sources for each substantive claim. Mark `[inferred]` for inferred questions.

## Step 4 — Interviewer Intel (if URL provided)

If interviewer LinkedIn URL provided, use Playwright to navigate and extract:
- Background (current role, prior companies, tenure)
- Recent activity (posts, articles, comments) — last 6 months
- Education / domain expertise signals
- Connection-tier signals (do they know mutual contacts?)
- Communication style (formal/casual, deep/surface)

If no LinkedIn URL provided, skip this section. Note in the manual: `Interviewer Intel: Not provided.`

## Step 5 — Build the Combat Manual

Write to `interview-prep/{company-slug}-{role-slug}.md`. Overwrite if exists (with confirmation prompt to user before overwriting).

Use this exact structure:

```markdown
# {Company} Combat Manual: {Round Name} ({Interviewer Name if known})

**Interviewer:** {Name}, {Title}
**Format:** {Round type, duration}
**Core Mandate:** {3 keywords from research that define what they value}

---

## 🎨 The Master Layout

{Recommendation: e.g., "One Figma canvas with 3 Islands + Center HUD"}

### 📍 Center HUD (Your Home Base)

- **Narrative:** "{One sentence positioning, tailored to this company}"
- **Pivot Map:** Links to the three project islands
- **Key Metrics (Cheat Sheet):**
  - {Metric 1 from CV/article-digest}
  - {Metric 2}
  - {Metric 3}
  - {Metric 4}

### 🏝 Island 1: {Story Title} (Story #{N from story-bank})

- **Visuals:** {What to put on the canvas}
- **Angle:** "{The frame — e.g., 'The Founding Designer'}"
- **The Logic:** {One sentence on the technical insight}
- **The Agency:** {One sentence on what made this YOUR contribution}
- **The Sad Path:** {One sentence on what could have gone wrong}

### 🏝 Island 2: {Story Title}
{Same structure}

### 🏝 Island 3: {Story Title}
{Same structure}

---

## 🎭 Transition Playbook

| From | To | Pivot Script |
|------|----|---|
| {Story A} | {Story B} | "{Verbatim script connecting them}" |
| {Story B} | {Story C} | "{Verbatim script}" |
| Any | {Company-specific tie-in} | "{Verbatim script bridging to this company}" |

---

## 🥊 Question Bank: Stress-Test Prep

### Likely Questions from {Interviewer / This Role} (and your angles)

1. **"{Likely question 1, sourced from research}"** [source: Glassdoor / Blind / inferred]
   ➔ "{Your prepared angle in your own voice}"

2. **"{Likely question 2}"** [source]
   ➔ "{Your angle}"

{Continue with 5-8 questions total}

### Pre-Built Weak-Spot Defenses (auto-populated from data/weakness-map.md)

For each pattern relevant to {round}, generate a defense block:

**{Pattern name}** — Confidence: {High/Medium}
- Why it matters here: {LLM synthesis — connects pattern to THIS company/role/interviewer context}
- Verbatim defense: "{Generated drill, specific to this company's likely question framing}"
- Story to lean on: {Pick from story-bank using Story-Specific Performance — prefer high land-rate, avoid repeated fumblers}

(If `data/weakness-map.md` does not exist or is "Not yet seeded", omit this entire section silently and add the following to the top of the generated combat manual: `> "Weakness map not seeded yet. Run /job-hunt debrief after rounds to compound this."`).

---

## 💡 Questions to Ask {Interviewer}

1. **{Topic relevant to interviewer's background or company strategy}:** "{Sharp specific question}"
2. **{Topic 2}:** "{Sharp specific question}"
3. **The "{Interviewer name}" Question:** "{Personal/connection question that shows research}"

---

## ✅ Action Items (pre-interview checklist)

- [ ] **Figma Board:** Lay out the 3 Islands with {specific visuals to prep}
- [ ] **Figma HUD:** Pin the {key constructs/frameworks} definitions
- [ ] **Script Practice:** Rehearse the {key transition} pivot
- [ ] **Research Final:** Read {1-2 specific company links from research}
- [ ] **Outfit/Setup:** {Format-specific reminder, e.g., "Test camera + share-screen for Zoom"}
```

## Step 6 — Promote to Vault

After saving the combat manual, create a symlink into the Second Brain vault so the manual appears in Obsidian alongside existing interview prep notes:

```bash
# Set JOB_HUNT_VAULT in your shell to your Obsidian vault's job-hunt folder.
# (e.g., export JOB_HUNT_VAULT="$HOME/MyVault/Job Hunt")
VAULT="${JOB_HUNT_VAULT:?Set JOB_HUNT_VAULT to your vault path}"
SOURCE="$(pwd)/interview-prep/{company-slug}-{role-slug}.md"
TARGET="$VAULT/{Company} Interview Prep.md"

ln -sf "$SOURCE" "$TARGET"
```

Use the full company name (not slug) for the vault filename to match the existing naming convention (e.g., "Acme Interview Prep.md").

If the symlink already exists, overwrite silently (`ln -sf` handles this).

## Step 7 — Surface Output

Tell the user:

> "Combat manual generated at `interview-prep/{company-slug}-{role-slug}.md`. {N} stories selected from your bank, {N} questions in the bank, {N} questions to ask. {If weak spots flagged: 'Flagged {N} weak spots from your weakness map to defend against — review the defenses section before the interview.'}"
> "→ Promoted to vault: `Job Hunt/{Company} Interview Prep.md` — visible in Obsidian."

**Additional output if round is "Final" or "On-site":**
Append this line to the user-facing message:
> "→ This is a final/on-site round. Want closing prep too? Run `/job-hunt closing {company}` for stakeholder map + business framing + closing moves."

## Edge Cases

- **No company report exists:** Prompt the user: "I don't have an evaluation report for {company}. Want me to run `/job-hunt evaluate` first, or paste the JD URL now?"
- **No interviewer LinkedIn URL:** Skip Step 4 entirely. Manual still useful, just less personalized.
- **No weakness-map yet (cold start):** Skip the "Pre-Built Weak-Spot Defenses" section silently. Add the cold-start banner at top of generated manual (see section above).
- **Story bank is empty or symlink broken:** Fall back to extracting stories from `cv.md` proof points + recent project descriptions. Flag in output: "Story bank unavailable, using CV proof points as fallback."
- **Manual file already exists:** Ask user: "Combat manual for {company}-{role} exists. Overwrite, or append a new round? (overwrite/append/cancel)"
