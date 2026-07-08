#!/usr/bin/env node
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { loadRules, scanFile } from '../drift-alert.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIX = join(__dirname, 'fixtures/drift-mini');

let passed = 0, failed = 0;
function assert(cond, msg) {
  if (cond) { console.log(`  ✅ ${msg}`); passed++; }
  else { console.log(`  ❌ ${msg}`); failed++; }
}

const rules = loadRules(join(FIX, 'canonical-rules.yml'), join(FIX, 'canonical.yml'));
assert(rules.length === 2, `loaded 2 rules (got ${rules.length})`);

const cleanAlerts = scanFile(join(FIX, 'clean.md'), rules);
assert(cleanAlerts.length === 0, `clean.md → 0 alerts (got ${cleanAlerts.length})`);

const dirtyAlerts = scanFile(join(FIX, 'dirty.md'), rules);
assert(dirtyAlerts.length === 2, `dirty.md → 2 alerts (got ${dirtyAlerts.length})`);

const urlAlert = dirtyAlerts.find(a => a.rule === 'live_url_vibe');
assert(urlAlert && urlAlert.canonical_value === 'https://exampleapp.live',
  `URL alert includes canonical value (got ${urlAlert?.canonical_value})`);
assert(urlAlert && urlAlert.suggest === 'use https://exampleapp.live',
  `URL alert suggest interpolates {canonical_field} (got ${urlAlert?.suggest})`);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
