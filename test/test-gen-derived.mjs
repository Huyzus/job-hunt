#!/usr/bin/env node
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { renderTemplate, loadCanonical } from '../gen-derived.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIX = join(__dirname, 'fixtures/canonical-mini');

let passed = 0, failed = 0;
function assert(cond, msg) {
  if (cond) { console.log(`  ✅ ${msg}`); passed++; }
  else { console.log(`  ❌ ${msg}`); failed++; }
}

console.log('Test: renderTemplate end-to-end');
const canonical = loadCanonical(FIX);
const tpl = readFileSync(join(FIX, 'template.md'), 'utf-8');
const expected = readFileSync(join(FIX, 'expected.md'), 'utf-8');
const rendered = renderTemplate(tpl, canonical);
assert(rendered === expected,
  `rendered output matches expected (got ${rendered.length} chars vs expected ${expected.length})`);

console.log('\nTest: missing yaml key throws');
try {
  renderTemplate('{{ identity.missing }}', canonical);
  assert(false, 'should have thrown for missing key');
} catch (e) {
  assert(e.message.includes('identity.missing'), `threw with key in message: ${e.message}`);
}

console.log('\nTest: missing narrative section throws');
try {
  renderTemplate('{{ narrative:nonexistent }}', canonical);
  assert(false, 'should have thrown for missing section');
} catch (e) {
  assert(e.message.includes('nonexistent'), `threw with section in message: ${e.message}`);
}

console.log('\nTest: non-scalar yaml value throws');
try {
  renderTemplate('{{ projects.example }}', canonical);
  assert(false, 'should have thrown for non-scalar object value');
} catch (e) {
  assert(e.message.includes('Non-scalar') && e.message.includes('projects.example'),
    `threw on object value: ${e.message}`);
}

console.log('\nTest: array value throws');
try {
  // canonical-mini fixture doesn't have arrays — inject a synthetic canonical
  const synthetic = { yml: { items: [1, 2, 3] }, narrative: {} };
  renderTemplate('{{ items }}', synthetic);
  assert(false, 'should have thrown for array value');
} catch (e) {
  assert(e.message.includes('Non-scalar') && e.message.includes('array'),
    `threw on array value: ${e.message}`);
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
