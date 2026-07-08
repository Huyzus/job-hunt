#!/usr/bin/env node
/**
 * test-analyze-interview-patterns.mjs — snapshot + unit tests for the analyzer
 *
 * Run: node test/test-analyze-interview-patterns.mjs
 * Exits 0 on pass, 1 on fail.
 */

import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import {
  parseDebriefFile, parseDebriefs, parseTracker, parseRejectionLog,
  joinDebriefsWithOutcomes, aggregatePatterns,
  attachConfidenceToFumbleTopics, detectAutoFire,
  computeConfidence, renderWeaknessMap,
} from '../analyze-interview-patterns.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES = join(__dirname, 'fixtures');
const EXPECTED = join(FIXTURES, 'expected-weakness-map.md');

let passed = 0;
let failed = 0;

function assert(cond, msg) {
  if (cond) { console.log(`  ✅ ${msg}`); passed++; }
  else { console.log(`  ❌ ${msg}`); failed++; }
}

console.log('Test: parseDebriefs');
const debriefs = parseDebriefs(join(FIXTURES, 'debriefs'));
assert(debriefs.length === 8, `parsed 8 debriefs (got ${debriefs.length})`);
assert(debriefs[0].company.length > 0, 'first debrief has company name');

console.log('\nTest: parseTracker');
const tracker = parseTracker(join(FIXTURES, 'interview-tracker.md'));
assert(tracker.size === 8, `parsed 8 tracker rows (got ${tracker.size})`);

console.log('\nTest: parseRejectionLog');
const rejections = parseRejectionLog(join(FIXTURES, 'rejection-log.md'));
assert(rejections.length === 2, `parsed 2 rejection rows (got ${rejections.length})`);

console.log('\nTest: joinDebriefsWithOutcomes');
const enriched = joinDebriefsWithOutcomes(debriefs, tracker, rejections);
assert(enriched.length === 10, `enriched = 8 debriefs + 2 synthetic = 10 (got ${enriched.length})`);
const beta = enriched.find(r => r.company === 'BetaHealth');
assert(beta && beta.outcome === 'Lost (neck and neck)', 'BetaHealth outcome correctly joined from tracker');

console.log('\nTest: computeConfidence boundaries');
const today = '2026-04-30';
assert(computeConfidence({ count: 3, mostRecent: today }, { totalRelevant: 5, today }) === 'High', '3-of-5, today: High');
assert(computeConfidence({ count: 2, mostRecent: today }, { totalRelevant: 5, today }) === 'Medium', '2-of-5, today: Medium');
assert(computeConfidence({ count: 1, mostRecent: today }, { totalRelevant: 5, today }) === 'Low', '1-of-5, today: Low');
assert(computeConfidence({ count: 3, mostRecent: '2025-01-01' }, { totalRelevant: 5, today }) === 'Low', '3 occurrences but 1+ year old → Low (age fail)');
assert(computeConfidence({ count: 0, mostRecent: today }, { totalRelevant: 5, today }) === 'None', '0 occurrences: None');
assert(
  computeConfidence({ count: 3, mostRecent: today }, { totalRelevant: 6, today }) === 'Medium',
  '3-of-6 (proportion exactly 0.5, not >0.5) → Medium not High (proportion guard works)'
);
assert(
  computeConfidence({ count: 3, mostRecent: today }, { totalRelevant: 4, today }) === 'High',
  '3-of-4 (proportion 0.75, age 0) → High (denominator fix path)'
);

console.log('\nTest: detectAutoFire (silent before threshold)');
assert(
  detectAutoFire([], [], { lastFired: null, lastFiredHighCount: 0 }).fired === false,
  'fires false when 0 debriefs'
);

console.log('\nTest: detectAutoFire (fires on neck-and-neck)');
const nnFire = detectAutoFire(enriched, [], { lastFired: '2026-04-01', lastFiredHighCount: 0 });
assert(nnFire.fired === true, 'fires on new neck-and-neck loss');

console.log('\nTest: detectAutoFire (skipped when auto_trigger=false)');
const noFire = detectAutoFire(enriched, [], { lastFired: '2026-04-01' }, {
  auto_trigger: false, min_debriefs_for_patterns: 3,
  high_confidence_min_occurrences: 3, high_confidence_max_age_days: 60,
  medium_confidence_min_occurrences: 2, medium_confidence_max_age_days: 90,
});
assert(noFire.fired === false, 'respects auto_trigger=false');

console.log('\nTest: detectAutoFire (fires on trigger B — high-confidence pattern delta)');
const tbRecords = Array(5).fill().map((_, i) => ({ outcome: 'Advanced', date: `2026-04-${String(15 + i).padStart(2, '0')}`, company: `Co${i}` }));
const tbHighPatterns = [{ tag: 'pattern1' }, { tag: 'pattern2' }];
const tbFire = detectAutoFire(tbRecords, tbHighPatterns, { lastFired: '2026-03-15', lastFiredHighCount: 0 }, {
  auto_trigger: true, min_debriefs_for_patterns: 3,
  high_confidence_min_occurrences: 3, high_confidence_max_age_days: 60,
  medium_confidence_min_occurrences: 2, medium_confidence_max_age_days: 90,
});
assert(tbFire.fired === true, 'fires when ≥2 new high-confidence patterns since last fire (trigger B)');

console.log('\nTest: detectAutoFire (does NOT fire when high-confidence count unchanged)');
const tbNoFire = detectAutoFire(tbRecords, tbHighPatterns, { lastFired: '2026-03-15', lastFiredHighCount: 2 }, {
  auto_trigger: true, min_debriefs_for_patterns: 3,
  high_confidence_min_occurrences: 3, high_confidence_max_age_days: 60,
  medium_confidence_min_occurrences: 2, medium_confidence_max_age_days: 90,
});
assert(tbNoFire.fired === false, 'does not fire when high-confidence count unchanged since last fire');

console.log('\nTest: parseDebriefFile (null on malformed title)');
const malformed = parseDebriefFile('# not a debrief title\n\nsome content', 'malformed.md');
assert(malformed === null, 'parseDebriefFile returns null for malformed title');

const wellFormed = parseDebriefFile('# Debrief: TestCo — TestRole — TestRound — 2026-01-01\n\n## What Landed\n- something\n', 'good.md');
assert(wellFormed !== null && wellFormed.company === 'TestCo', 'parseDebriefFile returns object for well-formed title');

console.log('\nTest: snapshot match');
const patterns = aggregatePatterns(enriched);
const withConfidence = attachConfidenceToFumbleTopics(patterns, today);
const highConf = Object.values(withConfidence.fumbleTopicsWithConfidence).filter(p => p.confidence === 'High');
const autoFire = detectAutoFire(enriched, highConf, { lastFired: null, lastFiredHighCount: 0 });
const actual = renderWeaknessMap(patterns, withConfidence, autoFire, {
  totalDebriefs: debriefs.length, totalRecords: enriched.length, today,
  lastFired: null, lastFiredHighCount: 0,
});
const expected = readFileSync(EXPECTED, 'utf-8');
assert(actual === expected, `snapshot match (to update: regenerate using fixture paths and today=${today}; do NOT use the production --dry flag because it uses real debriefs and the current system date)`);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
