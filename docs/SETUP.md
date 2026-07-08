# Setup Guide

## Prerequisites

- [Claude Code](https://claude.ai/code) installed and configured
- Node.js 18+ (for PDF generation and utility scripts)
- (Optional) Go 1.21+ (for the dashboard TUI)

## Quick Start (5 steps)

### 1. Clone and install

```bash
git clone https://github.com/Huyzus/job-hunt.git
cd job-hunt
npm install
npx playwright install chromium   # Required for PDF generation
```

### 2. Configure your profile

```bash
cp config/profile.example.yml config/profile.yml
```

Edit `config/profile.yml` with your personal details: name, email, target roles, narrative, proof points.

> **Note (canonical SoT):** This repo also uses a canonical single-source-of-truth layer — `data/canonical.yml` (facts) and `data/canonical-narrative.md` (prose) — from which `config/profile.yml` and the base CVs are generated via `node gen-derived.mjs`. A fresh clone doesn't include these personal files, so `gen-derived.mjs --check` fails and `test-all.mjs` skips that check with a warning until you create them. The Claude Code onboarding flow (just open the repo in Claude Code) walks you through it; see `docs/CANONICAL_SOT.md` for the architecture.

### 3. Add your CV

Create `cv.md` in the project root with your full CV in markdown format. This is the source of truth for all evaluations and PDFs.

(Optional) Create `article-digest.md` with proof points from your portfolio projects/articles.

### 4. Configure portals

```bash
cp templates/portals.example.yml portals.yml
```

Edit `portals.yml`:
- Update `title_filter.positive` with keywords matching your target roles
- Add companies you want to track in `tracked_companies`
- Customize `search_queries` for your preferred job boards

### 5. Start using

Open Claude Code in this directory:

```bash
claude
```

Then paste a job offer URL or description. Job-hunt will automatically evaluate it, generate a report, create a tailored PDF, and track it.

## Available Commands

| Action | How |
|--------|-----|
| Evaluate an offer | Paste a URL or JD text |
| Search for offers | `/job-hunt scan` |
| Process pending URLs | `/job-hunt pipeline` |
| Generate a PDF | `/job-hunt pdf` |
| Batch evaluate | `/job-hunt batch` |
| Check tracker status | `/job-hunt tracker` |
| Fill application form | `/job-hunt apply` |

## Verify Setup

```bash
node cv-sync-check.mjs      # Check configuration
node verify-pipeline.mjs     # Check pipeline integrity
```

## Build Dashboard (Optional)

```bash
cd dashboard
go build -o career-dashboard .
./career-dashboard --path ..  # Opens TUI pipeline viewer
```
