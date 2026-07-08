#!/usr/bin/env node
/**
 * analyze-interview-patterns.mjs — Interview Pattern Detector for job-hunt
 *
 * Reads all debriefs + tracker + rejection-log, computes patterns + confidence
 * tiers, writes data/weakness-map.md, optionally returns JSON metadata.
 *
 * Run: node analyze-interview-patterns.mjs           (write file silently)
 *      node analyze-interview-patterns.mjs --json    (write + emit JSON)
 *      node analyze-interview-patterns.mjs --dry     (print would-be content)
 *      node analyze-interview-patterns.mjs --diff    (diff vs current file)
 */

import { readFileSync, writeFileSync, existsSync, readdirSync, renameSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createHash } from 'crypto';
import yaml from 'js-yaml';

const ROOT = dirname(fileURLToPath(import.meta.url));
const DEBRIEFS_DIR = join(ROOT, 'interview-prep/debriefs');
const TRACKER_PATH = join(ROOT, 'data/interview-tracker.md');
const REJECTION_LOG_PATH = join(ROOT, 'data/rejection-log.md');
const WEAKNESS_MAP_PATH = join(ROOT, 'data/weakness-map.md');
const PROFILE_PATH = join(ROOT, 'config/profile.yml');

// --- CLI args ---
const args = process.argv.slice(2);
const FLAGS = {
  json: args.includes('--json'),
  dry: args.includes('--dry'),
  diff: args.includes('--diff'),
};

// --- Config defaults (overridable in config/profile.yml) ---
const DEFAULT_CONFIG = {
  auto_trigger: true,
  min_debriefs_for_patterns: 3,
  high_confidence_min_occurrences: 3,
  high_confidence_max_age_days: 60,
  medium_confidence_min_occurrences: 2,
  medium_confidence_max_age_days: 90,
};

/**
 * Load config from config/profile.yml, merging the `weaknesses:` block over DEFAULT_CONFIG.
 * Returns DEFAULT_CONFIG if the file is missing or has no weaknesses block.
 */
function loadConfig() {
  if (!existsSync(PROFILE_PATH)) return { ...DEFAULT_CONFIG };
  try {
    const raw = readFileSync(PROFILE_PATH, 'utf-8');
    const parsed = yaml.load(raw) || {};
    const overrides = parsed.weaknesses || {};
    return { ...DEFAULT_CONFIG, ...overrides };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

// === Section 1: parseDebriefs ===

/**
 * Parse a single debrief markdown file. Returns a structured record.
 * Returns null if file is malformed (logs warning).
 */
export function parseDebriefFile(content, filename) {
  const lines = content.split('\n');

  // Title line: "# Debrief: {Company} — {Role} — {Round} — {YYYY-MM-DD}"
  const titleMatch = lines[0].match(/^#\s*Debrief:\s*(.+?)\s*[–—\-]\s*(.+?)\s*[–—\-]\s*(.+?)\s*[–—\-]\s*(\d{4}-\d{2}-\d{2})/);
  if (!titleMatch) {
    console.warn(`[skip] ${filename}: malformed title line`);
    return null;
  }
  const [, company, role, round, date] = titleMatch.map(s => s.trim());

  const sections = extractSections(content);

  return {
    file: filename,
    company,
    role,
    round,
    date,
    landed: parseBullets(sections['What Landed'] || ''),
    fumbles: parseFumbles(sections['What Fumbled'] || ''),
    interviewerSignals: parseInterviewerSignals(sections['Interviewer Signals'] || ''),
    gutFeel: parseGutFeel(sections['Gut-Feel Verdict'] || ''),
    tags: parseTags(sections['Pattern Tags'] || ''),
    verdict: (sections['Verdict (filled after rejection or advancement)'] || sections['Verdict'] || '').trim(),
  };
}

function extractSections(content) {
  const sections = {};
  const lines = content.split('\n');
  let currentSection = null;
  let buffer = [];
  for (const line of lines) {
    const headerMatch = line.match(/^##\s+(.+?)\s*$/);
    if (headerMatch) {
      if (currentSection) sections[currentSection] = buffer.join('\n').trim();
      currentSection = headerMatch[1].trim();
      buffer = [];
    } else if (currentSection) {
      buffer.push(line);
    }
  }
  if (currentSection) sections[currentSection] = buffer.join('\n').trim();
  return sections;
}

function parseBullets(text) {
  return text.split('\n')
    .filter(l => l.trim().startsWith('-'))
    .map(l => l.replace(/^-\s*/, '').trim())
    .filter(Boolean);
}

function parseFumbles(text) {
  // Lines like: "- **{Question}** — {Why it was hard}"
  return text.split('\n')
    .filter(l => l.trim().startsWith('-'))
    .map(l => {
      const stripped = l.replace(/^-\s*/, '').trim();
      const m = stripped.match(/^\*\*(.+?)\*\*\s*[–—\-]\s*(.+)$/);
      if (m) return { question: m[1].trim(), reason: m[2].trim(), raw: stripped };
      return { question: stripped, reason: '', raw: stripped };
    });
}

function parseInterviewerSignals(text) {
  // Lines like: "- **{Name}** ({Role}): {Sentiment} → {Specific signal}"
  return text.split('\n')
    .filter(l => l.trim().startsWith('-'))
    .map(l => {
      const stripped = l.replace(/^-\s*/, '').trim();
      const m = stripped.match(/^\*\*(.+?)\*\*\s*\((.+?)\):\s*(Positive|Neutral|Negative)\s*[→\-]\s*(.+)$/);
      if (m) return { name: m[1].trim(), role: m[2].trim(), sentiment: m[3], signal: m[4].trim() };
      return { raw: stripped };
    })
    .filter(s => s.name || s.raw);
}

function parseGutFeel(text) {
  const m = text.match(/(\d+)\s*\/\s*10/);
  return m ? parseInt(m[1], 10) : null;
}

function parseTags(text) {
  return (text.match(/#[\w-]+/g) || []).map(t => t.slice(1));
}

/**
 * Read all debriefs from a directory. Returns array of records.
 */
export function parseDebriefs(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter(f => f.endsWith('.md') && !f.startsWith('.'))
    .map(f => {
      const content = readFileSync(join(dir, f), 'utf-8');
      return parseDebriefFile(content, f);
    })
    .filter(Boolean);
}

// === Section 2: parseTracker ===

/**
 * Parse data/interview-tracker.md. Returns Map keyed by `${company}|${round}|${date}`.
 */
export function parseTracker(path) {
  const map = new Map();
  if (!existsSync(path)) return map;
  const content = readFileSync(path, 'utf-8');
  // Match table rows: | N | Company | Role | Round | Date | Outcome | Score | Debrief |
  const rows = content.split('\n').filter(l => l.match(/^\|\s*\d+\s*\|/));
  for (const row of rows) {
    const cells = row.split('|').slice(1, -1).map(c => c.trim());
    if (cells.length < 8) continue;
    const [, company, role, round, date, outcome, score, debriefLink] = cells;
    map.set(`${company}|${round}|${date}`, { company, role, round, date, outcome, score, debriefLink });
  }
  return map;
}

// === Section 3: parseRejectionLog ===

/**
 * Parse data/rejection-log.md table rows. Returns array of records.
 */
export function parseRejectionLog(path) {
  if (!existsSync(path)) return [];
  const content = readFileSync(path, 'utf-8');
  const rows = content.split('\n').filter(l => l.match(/^\|\s+\S/) && !l.includes('---') && !l.includes('Company'));
  return rows.map(row => {
    const cells = row.split('|').slice(1, -1).map(c => c.trim());
    if (cells.length < 7) return null;
    const [company, role, score, type, stage, daysToRejection, date] = cells;
    return { company, role, score, type, stage, daysToRejection, date };
  }).filter(Boolean);
}

// === Section 4: joinDebriefsWithOutcomes ===

/**
 * Join debriefs to outcomes from tracker. Older losses (without debrief) are
 * passed through from the rejection log as synthetic records so pattern aggregation
 * can include them.
 *
 * Returns array of EnrichedRecord:
 *   { ...debrief, outcome: 'Advanced'|'Lost (neck and neck)'|'Lost (clear gap)'|'Lost (fit)'|'Ghosted'|'Pending'|'Offer'|'unknown' }
 */
export function joinDebriefsWithOutcomes(debriefs, tracker, rejections) {
  const enriched = debriefs.map(d => {
    const trackerRow = tracker.get(`${d.company}|${d.round}|${d.date}`);
    const outcome = trackerRow?.outcome || (d.verdict.startsWith('Pending') || d.verdict === '' ? 'Pending' : extractOutcomeFromVerdict(d.verdict));
    return { ...d, outcome };
  });

  // Synthesize records for rejections without debriefs (older losses, pre-debrief-system)
  const debriefKeys = new Set(debriefs.map(d => `${d.company}|${d.role}`));
  const synthetic = rejections
    .filter(r => !debriefKeys.has(`${r.company}|${r.role}`))
    .map(r => ({
      file: `_synthetic_rejection_${r.company.toLowerCase().replace(/\s+/g, '-')}.md`,
      company: r.company,
      role: r.role,
      round: r.stage,
      date: r.date,
      landed: [],
      fumbles: [],
      interviewerSignals: [],
      gutFeel: null,
      tags: [],
      verdict: 'Rejected',
      outcome: r.type === 'automated' ? 'Rejected (automated)' : 'Rejected (human)',
      synthetic: true,
    }));

  return [...enriched, ...synthetic];
}

function extractOutcomeFromVerdict(verdict) {
  const v = verdict.toLowerCase();
  if (v.includes('offer')) return 'Offer';
  if (v.includes('advanced') || v.includes('passed')) return 'Advanced';
  if (v.includes('neck and neck') || v.includes('neck-and-neck') || v.includes('beat by a hair')) return 'Lost (neck and neck)';
  if (v.includes('split decision') || v.includes('split-decision')) return 'Lost (split decision)';
  if (v.includes('clear gap') || v.includes('skill gap')) return 'Lost (clear gap)';
  if (v.includes('ghosted')) return 'Ghosted';
  if (v.includes('lost') || v.includes('rejected')) return 'Lost (fit)';
  return 'unknown';
}

// === Section 5: Tag normalization (R2 mitigation) ===

const TAG_ALIASES = {
  '90-day-plan': 'first-90-days',
  'first-90-days': 'first-90-days',
  'first-90': 'first-90-days',
  'leadership-without-authority': 'leadership-without-authority',
  'lwoa': 'leadership-without-authority',
  'business-framing': 'business-framing',
  'business-impact': 'business-framing',
  'roi-framing': 'business-framing',
  'competitive-analysis': 'competitive-analysis',
  'competitor-analysis': 'competitive-analysis',
  'whiteboard': 'whiteboard',
  'system-design': 'system-design',
  'culture-fit': 'culture-fit',
  'comp-discussion': 'comp',
  'compensation': 'comp',
};

export function normalizeTag(tag) {
  return TAG_ALIASES[tag.toLowerCase()] || tag.toLowerCase();
}

// === Section 6: aggregatePatterns ===

/**
 * Aggregate enriched records into pattern groups.
 * Returns: { stagePatterns, interviewerRolePatterns, fumbleTopics, storyPerformance, winPatterns }
 */
export function aggregatePatterns(records) {
  const stagePatterns = {};      // round -> { total, lost, neck_and_neck, fumble_tags: {tag: count}, debriefs: [filename] }
  const interviewerRolePatterns = {}; // role -> { instances: [{company, sentiment, signal}], common_themes: [] }
  const fumbleTopics = {};       // tag -> { count, companies: Set, mostRecent: date }
  const storyPerformance = {};   // story -> { used, landed, fumbled, fumbledAt: [company] }
  const winPatterns = {};        // pattern -> { count, evidence: [string] }

  for (const r of records) {
    // Stage aggregation
    const stage = r.round || 'unknown';
    if (!stagePatterns[stage]) stagePatterns[stage] = { total: 0, lost: 0, neck_and_neck: 0, fumble_tags: {}, debriefs: [] };
    stagePatterns[stage].total++;
    stagePatterns[stage].debriefs.push(r.file);
    if (r.outcome.startsWith('Lost')) stagePatterns[stage].lost++;
    if (r.outcome === 'Lost (neck and neck)') stagePatterns[stage].neck_and_neck++;
    for (const tag of (r.tags || []).map(normalizeTag)) {
      stagePatterns[stage].fumble_tags[tag] = (stagePatterns[stage].fumble_tags[tag] || 0) + 1;
    }

    // Interviewer role aggregation
    for (const sig of r.interviewerSignals || []) {
      if (!sig.role) continue;
      const role = sig.role.trim();
      if (!interviewerRolePatterns[role]) interviewerRolePatterns[role] = { instances: [] };
      interviewerRolePatterns[role].instances.push({ company: r.company, sentiment: sig.sentiment, signal: sig.signal, date: r.date });
    }

    // Fumble topics aggregation
    for (const tag of (r.tags || []).map(normalizeTag)) {
      if (!fumbleTopics[tag]) fumbleTopics[tag] = { count: 0, companies: new Set(), mostRecent: r.date };
      fumbleTopics[tag].count++;
      fumbleTopics[tag].companies.add(r.company);
      if (r.date > fumbleTopics[tag].mostRecent) fumbleTopics[tag].mostRecent = r.date;
    }

    // Story performance — naive substring match against landed/fumbled
    // (Stories are detected as Title-Case multi-word phrases in landed bullets)
    for (const bullet of r.landed || []) {
      const stories = extractStoryMentions(bullet);
      for (const s of stories) {
        if (!storyPerformance[s]) storyPerformance[s] = { used: 0, landed: 0, fumbled: 0, fumbledAt: [] };
        storyPerformance[s].used++;
        storyPerformance[s].landed++;
      }
    }
    for (const f of r.fumbles || []) {
      const stories = extractStoryMentions(f.raw || f.question || '');
      for (const s of stories) {
        if (!storyPerformance[s]) storyPerformance[s] = { used: 0, landed: 0, fumbled: 0, fumbledAt: [] };
        storyPerformance[s].used++;
        storyPerformance[s].fumbled++;
        storyPerformance[s].fumbledAt.push(r.company);
      }
    }

    // Win patterns — bullets that include positive language
    for (const bullet of r.landed || []) {
      const wins = extractWinPatterns(bullet);
      for (const w of wins) {
        if (!winPatterns[w]) winPatterns[w] = { count: 0, evidence: [] };
        winPatterns[w].count++;
        winPatterns[w].evidence.push(`${r.company}: "${bullet.slice(0, 80)}..."`);
      }
    }
  }

  return { stagePatterns, interviewerRolePatterns, fumbleTopics, storyPerformance, winPatterns };
}

function extractStoryMentions(text) {
  // Detect known story names from story-bank if present, else fallback to capitalized phrases.
  // Use `\w+` (not `[a-z]+`) to capture acronyms like "VRA" and digits like "S3".
  // Captures runs of 2-4 capitalized tokens.
  const matches = text.match(/\b([A-Z]\w+(?:\s+[A-Z]\w+){1,3})\b/g) || [];
  // Filter common false positives (interview structural terms, not stories)
  const STOP = new Set(['Hiring Manager', 'Product Designer', 'Senior Designer', 'On Site', 'Final Round', 'Sr Design', 'VP Design', 'VP Eng', 'Staff PM', 'Lead PD']);
  return matches.filter(m => !STOP.has(m));
}

function extractWinPatterns(text) {
  // Detect named themes that landed positively
  const wins = [];
  const lower = text.toLowerCase();
  if (lower.includes('architecture') && lower.includes('cs')) wins.push('Architecture+CS framing');
  if (lower.includes('builder') || lower.includes('end-to-end')) wins.push('Builder track framing');
  if (lower.includes('award')) wins.push('Award pedigree framing');
  if (lower.includes('ai governance') || lower.includes('eu ai act')) wins.push('AI governance domain');
  return wins;
}

// === Section 7: computeConfidence ===

/**
 * Compute confidence tier for a pattern.
 * Inputs:
 *   - pattern: { count, mostRecent, ...other fields varies by pattern type }
 *   - context: { totalRelevant, today (YYYY-MM-DD) }
 *   - config: thresholds
 *
 * Returns: 'High' | 'Medium' | 'Low' | 'None'
 */
export function computeConfidence(pattern, context, config = DEFAULT_CONFIG) {
  const ageDays = daysBetween(pattern.mostRecent, context.today);
  const occurrences = pattern.count;
  const proportionRelevant = context.totalRelevant > 0 ? occurrences / context.totalRelevant : 0;

  if (occurrences >= config.high_confidence_min_occurrences
      && ageDays <= config.high_confidence_max_age_days
      && proportionRelevant > 0.5) {
    return 'High';
  }
  if (occurrences >= config.medium_confidence_min_occurrences
      && ageDays <= config.medium_confidence_max_age_days) {
    return 'Medium';
  }
  if (occurrences >= 1) return 'Low';
  return 'None';
}

function daysBetween(dateA, dateB) {
  const a = new Date(dateA).getTime();
  const b = new Date(dateB).getTime();
  return Math.abs(Math.round((b - a) / (1000 * 60 * 60 * 24)));
}

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// === Section 8: detectAutoFire ===

/**
 * Decide whether to auto-fire the weaknesses card.
 * Fires when:
 *   (a) any new "Lost (neck and neck)" debrief since last fired date, OR
 *   (b) ≥2 new High-confidence patterns since last fired date
 *
 * Inputs:
 *   - records: enriched records (sorted oldest→newest)
 *   - patterns: aggregated patterns with confidence assigned
 *   - lastRunMeta: { lastFired: 'YYYY-MM-DD' | null, lastFiredHighCount: number }
 *   - config: thresholds (auto_trigger flag respected)
 *
 * Returns: { fired: boolean, reason: string }
 */
export function detectAutoFire(records, highConfidencePatterns, lastRunMeta, config = DEFAULT_CONFIG) {
  if (config.auto_trigger === false) {
    return { fired: false, reason: 'auto_trigger disabled in profile.yml' };
  }
  if (records.length < config.min_debriefs_for_patterns) {
    return { fired: false, reason: `only ${records.length} debriefs; need ${config.min_debriefs_for_patterns}` };
  }

  const lastFired = lastRunMeta?.lastFired || '1970-01-01';

  // Trigger A: new neck-and-neck loss since last fired
  const newNeckAndNeck = records.find(r => r.outcome === 'Lost (neck and neck)' && r.date > lastFired);
  if (newNeckAndNeck) {
    return { fired: true, reason: `new neck-and-neck loss: ${newNeckAndNeck.company} (${newNeckAndNeck.date})` };
  }

  // Trigger B: ≥2 new high-confidence patterns since last fired
  const lastHighCount = lastRunMeta?.lastFiredHighCount || 0;
  const currentHighCount = highConfidencePatterns.length;
  if (currentHighCount - lastHighCount >= 2) {
    return { fired: true, reason: `${currentHighCount - lastHighCount} new high-confidence patterns since last fire` };
  }

  return { fired: false, reason: 'no trigger conditions met' };
}

// === Section 9: writeIfChanged ===

/**
 * Atomic write: writes content to a temp file, then renames into place.
 * Returns true if the file changed (different hash), false if no-op.
 */
export function writeIfChanged(content, path) {
  const newHash = createHash('sha256').update(content).digest('hex');
  if (existsSync(path)) {
    const oldHash = createHash('sha256').update(readFileSync(path, 'utf-8')).digest('hex');
    if (oldHash === newHash) return false;
  }
  const tmpPath = `${path}.tmp.${process.pid}`;
  writeFileSync(tmpPath, content, 'utf-8');
  renameSync(tmpPath, path);
  return true;
}

/**
 * Persistence: this metadata is read by `readLastRunMeta` via regex match.
 * Keep the format of the next line stable when changing the renderer.
 * (readLastRunMeta + Threshold Status block in renderWeaknessMap form an
 * implicit reader/writer pair coupled by the `_high_count_at_last_fire:` line.)
 *
 * Read previous fire metadata from existing weakness-map.md (parse the Threshold Status section).
 */
export function readLastRunMeta(path) {
  if (!existsSync(path)) return { lastFired: null, lastFiredHighCount: 0 };
  const content = readFileSync(path, 'utf-8');
  const fired = content.match(/Last fired:\s*(\d{4}-\d{2}-\d{2})/);
  const highCount = content.match(/_high_count_at_last_fire:\s*(\d+)/);
  return {
    lastFired: fired ? fired[1] : null,
    lastFiredHighCount: highCount ? parseInt(highCount[1], 10) : 0,
  };
}

// === Section 10: renderWeaknessMap ===

/**
 * Render the weakness-map.md content from aggregated patterns.
 * Schema matches docs/superpowers/specs/2026-04-30-final-round-conversion-system-design.md
 */
export function renderWeaknessMap(patterns, withConfidence, autoFireResult, metadata, config = DEFAULT_CONFIG) {
  const { totalDebriefs, totalRecords, today } = metadata;

  if (totalDebriefs === 0) {
    return `# Weakness Map\n\nNot yet seeded. Run \`/job-hunt debrief\` after rounds to begin pattern tracking.\n`;
  }

  const lines = [];
  lines.push(`# Weakness Map`);
  lines.push(`Auto-generated. Last updated: ${today}. Based on ${totalDebriefs} debriefs across ${totalRecords} interviews.\n`);

  // Top Patterns table — sorted by confidence (High > Medium), then by frequency
  const topPatterns = Object.values(withConfidence.fumbleTopicsWithConfidence || {})
    .filter(p => p.confidence === 'High' || p.confidence === 'Medium')
    .sort((a, b) => {
      if (a.confidence !== b.confidence) return a.confidence === 'High' ? -1 : 1;
      return b.count - a.count;
    })
    .slice(0, 10);

  lines.push(`## Top Patterns (sorted by confidence)`);
  lines.push(`| # | Pattern | Stage | Confidence | Frequency | Drill |`);
  lines.push(`|---|---------|-------|------------|-----------|-------|`);
  topPatterns.forEach((p, i) => {
    lines.push(`| ${i + 1} | ${p.tag} | ${p.stages.join(', ')} | ${p.confidence} | ${p.count}/${p.totalRelevant} | ${p.drill} |`);
  });
  if (topPatterns.length === 0) {
    lines.push(`| — | _no high/medium confidence patterns yet_ | | | | |`);
  }
  lines.push('');

  // Per-Stage Patterns
  lines.push(`## Per-Stage Patterns`);
  for (const [stage, sp] of Object.entries(patterns.stagePatterns).sort()) {
    lines.push(`### ${stage} (${sp.total} debriefs)`);
    if (sp.lost > 0) lines.push(`- Lost: ${sp.lost}/${sp.total}${sp.neck_and_neck > 0 ? ` (${sp.neck_and_neck} neck-and-neck)` : ''}`);
    const topTags = Object.entries(sp.fumble_tags).sort((a, b) => b[1] - a[1]).slice(0, 3);
    for (const [tag, count] of topTags) {
      lines.push(`- ${tag}: ${count} occurrence${count > 1 ? 's' : ''}`);
    }
  }
  lines.push('');

  // Per-Interviewer-Role Patterns
  lines.push(`## Per-Interviewer-Role Patterns`);
  for (const [role, data] of Object.entries(patterns.interviewerRolePatterns).sort()) {
    if (data.instances.length < 2) continue;
    lines.push(`### ${role} (${data.instances.length} instances: ${data.instances.map(i => i.company).join(', ')})`);
    const negCount = data.instances.filter(i => i.sentiment === 'Negative').length;
    const posCount = data.instances.filter(i => i.sentiment === 'Positive').length;
    lines.push(`- Sentiment: ${posCount} Positive, ${negCount} Negative`);
  }
  lines.push('');

  // Recurring Fumble Topics
  lines.push(`## Recurring Fumble Topics`);
  lines.push(`| Topic | Count | Companies | Most Recent |`);
  lines.push(`|-------|-------|-----------|-------------|`);
  const sortedTopics = Object.entries(patterns.fumbleTopics).sort((a, b) => b[1].count - a[1].count);
  for (const [tag, data] of sortedTopics) {
    lines.push(`| #${tag} | ${data.count} | ${[...data.companies].join(', ')} | ${data.mostRecent} |`);
  }
  lines.push('');

  // Story-Specific Performance
  lines.push(`## Story-Specific Performance`);
  lines.push(`| Story | Used | Landed | Fumbled |`);
  lines.push(`|-------|------|--------|---------|`);
  const sortedStories = Object.entries(patterns.storyPerformance).sort((a, b) => b[1].used - a[1].used);
  for (const [story, data] of sortedStories) {
    const fumbledNote = data.fumbled > 0 ? `${data.fumbled} (${data.fumbledAt.join(', ')})` : '0';
    lines.push(`| ${story} | ${data.used} | ${data.landed} | ${fumbledNote} |`);
  }
  lines.push('');

  // Win Patterns
  lines.push(`## Win Patterns (what works — leverage these)`);
  lines.push(`| Pattern | Evidence |`);
  lines.push(`|---------|----------|`);
  for (const [pattern, data] of Object.entries(patterns.winPatterns).sort((a, b) => b[1].count - a[1].count)) {
    lines.push(`| ${pattern} | ${data.count} positive mention${data.count > 1 ? 's' : ''} |`);
  }
  lines.push('');

  // Drill Recommendations
  lines.push(`## Drill Recommendations (top 3, ordered)`);
  topPatterns.slice(0, 3).forEach((p, i) => {
    lines.push(`${i + 1}. **${p.drillTitle}** — ${p.drill}`);
  });
  lines.push('');

  // Threshold Status
  // Persistence: this metadata is read by `readLastRunMeta` via regex match.
  // Keep the format of the next line stable when changing the renderer.
  // (readLastRunMeta + this block form an implicit reader/writer pair coupled by `_high_count_at_last_fire:`.)
  lines.push(`## Threshold Status`);
  lines.push(`- Auto-trigger fires when pattern confidence ≥ Medium AND frequency ≥ 3 AND recent (≤ 30 days)`);
  lines.push(`- Last fired: ${autoFireResult.fired ? today : (metadata.lastFired || 'never')} | Suppressed in profile.yml: ${config.auto_trigger === false}`);
  lines.push(`- _high_count_at_last_fire: ${autoFireResult.fired ? topPatterns.filter(p => p.confidence === 'High').length : (metadata.lastFiredHighCount || 0)}`);

  return lines.join('\n') + '\n';
}

/**
 * Annotate fumble topics with confidence + per-stage info + drill template.
 */
export function attachConfidenceToFumbleTopics(patterns, today, config = DEFAULT_CONFIG) {
  const fumbleTopicsWithConfidence = {};
  for (const [tag, data] of Object.entries(patterns.fumbleTopics)) {
    const stages = Object.entries(patterns.stagePatterns)
      .filter(([_, sp]) => sp.fumble_tags[tag])
      .map(([stage]) => stage);
    // Sum of debriefs across the stages where this tag appeared (spec: ">50% of relevant interviews of that stage")
    const stageDebriefCount = stages.reduce((sum, stage) => sum + (patterns.stagePatterns[stage]?.total || 0), 0);
    const conf = computeConfidence(
      { count: data.count, mostRecent: data.mostRecent },
      { totalRelevant: stageDebriefCount, today },
      config
    );
    fumbleTopicsWithConfidence[tag] = {
      tag,
      count: data.count,
      mostRecent: data.mostRecent,
      stages,
      totalRelevant: stageDebriefCount,
      confidence: conf,
      drill: drillTemplate(tag),
      drillTitle: humanizeTag(tag),
    };
  }
  return { fumbleTopicsWithConfidence };
}

function drillTemplate(tag) {
  const map = {
    'business-framing': '"Lead with business stakes in first 30s of every case study"',
    'first-90-days': '"Drill exec-level 90-day plan, three-act structure"',
    'competitive-analysis': '"Pre-research 3 most-likely comparable products before any final"',
    'leadership-without-authority': '"Prepare 2-3 stories of cross-team mobilization with no formal power"',
    'whiteboard': '"Practice live whiteboarding the design system primitive of the day"',
    'system-design': '"Run 1 system design drill per week (e.g., on excalidraw)"',
    'culture-fit': '"Tighten the why-this-company narrative; reference 2 specific recent moves"',
    'comp': '"Rehearse comp anchor script: walk-away floor, target, aspirational"',
  };
  return map[tag] || `"Drill: review ${tag} answers and rebuild from scratch"`;
}

function humanizeTag(tag) {
  return tag.split('-').map(w => w[0].toUpperCase() + w.slice(1)).join(' ');
}

// --- Main entry (CLI) ---
async function main() {
  const config = loadConfig();
  const debriefs = parseDebriefs(DEBRIEFS_DIR);
  const tracker = parseTracker(TRACKER_PATH);
  const rejections = parseRejectionLog(REJECTION_LOG_PATH);
  const enriched = joinDebriefsWithOutcomes(debriefs, tracker, rejections);
  const patterns = aggregatePatterns(enriched);
  const today = todayISO();
  const withConfidence = attachConfidenceToFumbleTopics(patterns, today, config);
  const lastRunMeta = readLastRunMeta(WEAKNESS_MAP_PATH);
  const highConfPatterns = Object.values(withConfidence.fumbleTopicsWithConfidence).filter(p => p.confidence === 'High');
  const mediumConfPatterns = Object.values(withConfidence.fumbleTopicsWithConfidence).filter(p => p.confidence === 'Medium');
  const autoFireResult = detectAutoFire(enriched, highConfPatterns, lastRunMeta, config);
  const content = renderWeaknessMap(patterns, withConfidence, autoFireResult, {
    totalDebriefs: debriefs.length,
    totalRecords: enriched.length,
    today,
    lastFired: lastRunMeta.lastFired,
    lastFiredHighCount: lastRunMeta.lastFiredHighCount,
  }, config);

  // --dry: print to stdout, no write
  if (FLAGS.dry) {
    console.log(content);
    return;
  }

  // --diff: show diff vs current file
  if (FLAGS.diff) {
    if (!existsSync(WEAKNESS_MAP_PATH)) {
      console.log('(no existing weakness-map.md — would be created)');
    } else {
      const old = readFileSync(WEAKNESS_MAP_PATH, 'utf-8');
      console.log(simpleDiff(old, content));
    }
    return;
  }

  // Default: write atomically
  const wrote = writeIfChanged(content, WEAKNESS_MAP_PATH);

  // --json: emit JSON metadata to stdout
  if (FLAGS.json) {
    const meta = {
      patterns_total: Object.keys(withConfidence.fumbleTopicsWithConfidence).length,
      high_confidence: highConfPatterns.length,
      medium_confidence: mediumConfPatterns.length,
      threshold_hit: autoFireResult.fired,
      fired_reason: autoFireResult.reason,
      since_last_run_days: lastRunMeta.lastFired ? daysBetween(lastRunMeta.lastFired, today) : null,
      file_changed: wrote,
    };
    console.log(JSON.stringify(meta, null, 2));
  }
}

// Position-based diff (not LCS). Adequate for inspection of small changes; insertions cascade.
function simpleDiff(oldStr, newStr) {
  const oldLines = oldStr.split('\n');
  const newLines = newStr.split('\n');
  const out = [];
  const max = Math.max(oldLines.length, newLines.length);
  for (let i = 0; i < max; i++) {
    if (oldLines[i] !== newLines[i]) {
      if (oldLines[i] !== undefined) out.push(`- ${oldLines[i]}`);
      if (newLines[i] !== undefined) out.push(`+ ${newLines[i]}`);
    }
  }
  return out.length === 0 ? '(no changes)' : out.join('\n');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(e => { console.error(e); process.exit(1); });
}
