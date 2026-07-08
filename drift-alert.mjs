#!/usr/bin/env node
/**
 * drift-alert.mjs — Loads rules from data/canonical-rules.yml,
 * scans linted files (cv.md, article-digest.md, ~/.claude/CLAUDE.md),
 * checks generated-file freshness vs canonical mtimes.
 *
 * Output: JSON { alerts: [...] }
 */

import { readFileSync, existsSync, statSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { homedir } from 'os';
import yaml from 'js-yaml';

const ROOT = dirname(fileURLToPath(import.meta.url));

// ── Linted files ────────────────────────────────────────────────
// Only project-local artifacts. Global CLAUDE.md is excluded (it's version-controlled separately).
const LINTED = [
  join(ROOT, 'cv.md'),
  join(ROOT, 'article-digest.md'),
];

// ── Generated files (for stale-derivation check) ────────────────
const GENERATED = [
  'cv-builder.md',
  'cv-pd.md',
  'article-digest.md',
  'modes/_profile.md',
  'config/profile.yml',
].map(p => join(ROOT, p));

const CANONICAL_INPUTS = [
  join(ROOT, 'data/canonical.yml'),
  join(ROOT, 'data/canonical-narrative.md'),
].filter(existsSync);

// ── Prep docs (combat manuals + debriefs) ───────────────────────
// JD-tailored interview prep — the docs with the strongest pull toward
// borrowing the target company's vocabulary. Scanned for factual drift so a
// fabricated/pre-tenure metric can't reach what the candidate says live.
function collectPrep() {
  const dir = join(ROOT, 'interview-prep');
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { recursive: true })
    .filter(f => typeof f === 'string' && f.endsWith('.md'))
    .map(f => join(dir, f));
}

const META_LINE = /\b(?:do not claim|don['']t claim|never claim|per memory|memory rule|drifted)/i;

// Prep docs intentionally QUOTE banned patterns as "DON'T" instructions.
// Skip prohibition/instruction lines so the manuals' own warning sections
// don't flood the output. Applied to prep files only — CV scanning is unchanged.
const PREP_SKIP = /\b(?:do not|don['']t|never|avoid|banned|kill the tagline|drop the|remove the|reframe|use the canonical|do NOT)\b/i;

// ── Rule loader ─────────────────────────────────────────────────
function getDotted(obj, path) {
  return path.split('.').reduce((acc, k) => (acc == null ? acc : acc[k]), obj);
}

export function loadRules(rulesPath, canonicalPath) {
  const rulesRaw = yaml.load(readFileSync(rulesPath, 'utf-8'));
  const canonical = canonicalPath && existsSync(canonicalPath)
    ? yaml.load(readFileSync(canonicalPath, 'utf-8'))
    : {};
  return ((rulesRaw?.rules) || []).map(r => {
    const compiled = { ...r, regex: new RegExp(r.pattern_violation) };
    if (r.canonical_field) {
      compiled.canonical_value = getDotted(canonical, r.canonical_field);
    }
    if (r.suggest && compiled.canonical_value !== undefined) {
      compiled.suggest = r.suggest.replace('{canonical_field}', compiled.canonical_value);
    }
    return compiled;
  });
}

// ── Scanner ─────────────────────────────────────────────────────
export function scanFile(path, rules, extraSkip = null) {
  if (!existsSync(path)) return [];
  const content = readFileSync(path, 'utf-8');
  const lines = content.split('\n');
  const alerts = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (META_LINE.test(line)) continue;
    if (extraSkip && extraSkip.test(line)) continue;
    for (const r of rules) {
      const m = line.match(r.regex);
      if (!m) continue;
      alerts.push({
        rule: r.id,
        memory: r.memory,
        description: r.description,
        file: path,
        line: i + 1,
        match: m[0],
        ...(r.canonical_value !== undefined ? { canonical_value: r.canonical_value } : {}),
        ...(r.suggest ? { suggest: r.suggest } : {}),
        context: line.trim().slice(0, 200),
        advisory: !!r.advisory,
      });
    }
  }
  return alerts;
}

// ── Stale-derivation check ──────────────────────────────────────
function checkStaleDerivations() {
  if (CANONICAL_INPUTS.length === 0) return [];
  const canonicalMtime = Math.max(...CANONICAL_INPUTS.map(p => statSync(p).mtimeMs));
  const alerts = [];
  for (const out of GENERATED) {
    if (!existsSync(out)) continue;
    if (statSync(out).mtimeMs < canonicalMtime) {
      alerts.push({
        rule: 'stale-derivation',
        memory: null,
        description: `${out.replace(ROOT + '/', '')} is older than canonical — run \`node gen-derived.mjs\``,
        file: out,
        line: null,
        match: null,
        context: null,
        advisory: false,
      });
    }
  }
  return alerts;
}

// ── Main ────────────────────────────────────────────────────────
function main() {
  const rulesPath = join(ROOT, 'data/canonical-rules.yml');
  const canonicalPath = join(ROOT, 'data/canonical.yml');
  if (!existsSync(rulesPath)) {
    console.log(JSON.stringify({ alerts: [] }, null, 2));
    return;
  }
  let rules;
  try {
    rules = loadRules(rulesPath, canonicalPath);
  } catch (e) {
    console.log(JSON.stringify({
      alerts: [{
        rule: 'rules-load-error',
        file: rulesPath,
        description: `Failed to load canonical-rules.yml: ${e.message}`,
      }],
    }, null, 2));
    return;
  }
  // `alerts` = high-stakes submitted materials (cv.md, article-digest) + stale
  // derivations. This is the SESSION-START gate — keep it focused so it stays
  // signal, not noise.
  const allAlerts = [];
  for (const f of LINTED) allAlerts.push(...scanFile(f, rules));
  allAlerts.push(...checkStaleDerivations());

  // `prep_alerts` = interview-prep docs (combat manuals, debriefs). Surfaced
  // when prepping for an interview, NOT on every session start — avoids
  // 40+ alerts blaring on unrelated sessions and causing alert fatigue.
  const prepAlerts = [];
  for (const f of collectPrep()) prepAlerts.push(...scanFile(f, rules, PREP_SKIP));

  console.log(JSON.stringify({ alerts: allAlerts, prep_alerts: prepAlerts }, null, 2));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
