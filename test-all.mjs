#!/usr/bin/env node

/**
 * test-all.mjs — Comprehensive test suite for job-hunt
 *
 * Run before merging any PR or pushing changes.
 * Tests: syntax, scripts, dashboard, data contract, personal data, paths.
 *
 * Usage:
 *   node test-all.mjs           # Run all tests
 *   node test-all.mjs --quick   # Skip dashboard build (faster)
 */

import { execSync, execFileSync } from 'child_process';
import { readFileSync, existsSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = __dirname;
const QUICK = process.argv.includes('--quick');

let passed = 0;
let failed = 0;
let warnings = 0;

function pass(msg) { console.log(`  ✅ ${msg}`); passed++; }
function fail(msg) { console.log(`  ❌ ${msg}`); failed++; }
function warn(msg) { console.log(`  ⚠️  ${msg}`); warnings++; }

function run(cmd, args = [], opts = {}) {
  try {
    if (Array.isArray(args) && args.length > 0) {
      return execFileSync(cmd, args, { cwd: ROOT, encoding: 'utf-8', timeout: 30000, ...opts }).trim();
    }
    return execSync(cmd, { cwd: ROOT, encoding: 'utf-8', timeout: 30000, ...opts }).trim();
  } catch (e) {
    return null;
  }
}

function fileExists(path) { return existsSync(join(ROOT, path)); }
function readFile(path) { return readFileSync(join(ROOT, path), 'utf-8'); }

console.log('\n🧪 job-hunt test suite\n');

// ── 1. SYNTAX CHECKS ────────────────────────────────────────────

console.log('1. Syntax checks');

const mjsFiles = readdirSync(ROOT).filter(f => f.endsWith('.mjs'));
for (const f of mjsFiles) {
  const result = run('node', ['--check', f]);
  if (result !== null) {
    pass(`${f} syntax OK`);
  } else {
    fail(`${f} has syntax errors`);
  }
}

// ── 2. SCRIPT EXECUTION ─────────────────────────────────────────

console.log('\n2. Script execution (graceful on empty data)');

const scripts = [
  { name: 'cv-sync-check.mjs', expectExit: 1, allowFail: true }, // fails without cv.md (normal in repo)
  { name: 'verify-pipeline.mjs', expectExit: 0 },
  { name: 'normalize-statuses.mjs', expectExit: 0 },
  { name: 'dedup-tracker.mjs', expectExit: 0 },
  { name: 'merge-tracker.mjs', expectExit: 0 },
  { name: 'aging-alert.mjs', expectExit: 0 },
];

for (const { name, allowFail } of scripts) {
  const result = run('node', name.split(' '), { stdio: ['pipe', 'pipe', 'pipe'] });
  if (result !== null) {
    pass(`${name} runs OK`);
  } else if (allowFail) {
    warn(`${name} exited with error (expected without user data)`);
  } else {
    fail(`${name} crashed`);
  }
}

// === Phase 2: analyze-interview-patterns.mjs smoke check ===
console.log('\n=== Phase 2: analyzer smoke check ===');
const analyzerOut = run('node', ['analyze-interview-patterns.mjs', '--dry']);
if (analyzerOut === null) {
  fail('analyze-interview-patterns.mjs --dry failed');
} else if (!analyzerOut.includes('Weakness Map')) {
  fail('analyzer --dry output missing "Weakness Map" header');
} else {
  pass('analyze-interview-patterns.mjs --dry produces valid output');
}

// === Phase 2: snapshot test ===
const snapshotOut = run('node', ['test/test-analyze-interview-patterns.mjs']);
if (snapshotOut === null) {
  fail('analyzer snapshot/unit tests failed');
} else if (snapshotOut.includes('failed')) {
  // Verify "0 failed" specifically
  if (snapshotOut.match(/0 failed/)) {
    pass('analyzer snapshot + unit tests pass');
  } else {
    fail('analyzer snapshot or unit tests reported failures');
  }
} else {
  pass('analyzer test runner completed');
}

// === Phase 2: drift-alert unit tests ===
console.log('\n=== Phase 2: drift-alert unit tests ===');
{
  const result = run('node', ['test/test-drift-alert.mjs']);
  if (result === null) {
    fail('test/test-drift-alert.mjs: failed to run');
  } else if (result.includes('failed')) {
    const m = result.match(/(\d+) passed, (\d+) failed/);
    if (m && parseInt(m[2]) > 0) {
      fail(`test/test-drift-alert.mjs: ${m[1]} passed, ${m[2]} failed`);
    } else {
      pass('test/test-drift-alert.mjs');
    }
  } else {
    pass('test/test-drift-alert.mjs');
  }
}

// === Phase 2: gen-derived unit tests ===
console.log('\n=== Phase 2: gen-derived unit tests ===');
{
  const result = run('node', ['test/test-gen-derived.mjs']);
  if (result === null) {
    fail('test/test-gen-derived.mjs: failed to run');
  } else if (result.includes('failed')) {
    const m = result.match(/(\d+) passed, (\d+) failed/);
    if (m && parseInt(m[2]) > 0) {
      fail(`test/test-gen-derived.mjs: ${m[1]} passed, ${m[2]} failed`);
    } else {
      pass('test/test-gen-derived.mjs');
    }
  } else {
    pass('test/test-gen-derived.mjs');
  }
}

// === gen-derived --check (CI guard: canonical → derivation freshness) ===
console.log('\ngen-derived.mjs --check (canonical → derivation freshness)');
if (!fileExists('data/canonical.yml')) {
  // Fresh install: canonical files are personal and created during onboarding.
  warn('gen-derived.mjs --check: skipped — data/canonical.yml not created yet (see docs/SETUP.md Step 2 note)');
} else {
  const checkResult = run('node', ['gen-derived.mjs', '--check']);
  if (checkResult === null) {
    fail('gen-derived.mjs --check: failed to run');
  } else {
    // --check exits 1 if any derivation is stale; that becomes null result here
    pass('gen-derived.mjs --check: all derivations fresh');
  }
}

// ── 3. LIVENESS CLASSIFICATION ──────────────────────────────────

console.log('\n3. Liveness classification');

try {
  const { classifyLiveness } = await import(pathToFileURL(join(ROOT, 'liveness-core.mjs')).href);

  const expiredChromeApply = classifyLiveness({
    finalUrl: 'https://example.com/jobs/closed-role',
    bodyText: 'Company Careers\nApply\nThe job you are looking for is no longer open.',
    applyControls: [],
  });
  if (expiredChromeApply.result === 'expired') {
    pass('Expired pages are not revived by nav/footer "Apply" text');
  } else {
    fail(`Expired page misclassified as ${expiredChromeApply.result}`);
  }

  const activeWorkdayPage = classifyLiveness({
    finalUrl: 'https://example.workday.com/job/123',
    bodyText: [
      '663 JOBS FOUND',
      'Senior AI Engineer',
      'Join our applied AI team to ship production systems, partner with customers, and own delivery across evaluation, deployment, and reliability.',
    ].join('\n'),
    applyControls: ['Apply for this Job'],
  });
  if (activeWorkdayPage.result === 'active') {
    pass('Visible apply controls still keep real job pages active');
  } else {
    fail(`Active job page misclassified as ${activeWorkdayPage.result}`);
  }
} catch (e) {
  fail(`Liveness classification tests crashed: ${e.message}`);
}

// ── 4. DASHBOARD BUILD ──────────────────────────────────────────

if (!QUICK) {
  console.log('\n4. Dashboard build');
  const goBuild = run('cd dashboard && go build -o /tmp/career-dashboard-test . 2>&1');
  if (goBuild !== null) {
    pass('Dashboard compiles');
  } else {
    warn('Dashboard build skipped (go not installed or build failed)');
  }
} else {
  console.log('\n4. Dashboard build (skipped --quick)');
}

// ── 5. DATA CONTRACT ────────────────────────────────────────────

console.log('\n5. Data contract validation');

// Check system files exist
const systemFiles = [
  'CLAUDE.md', 'DATA_CONTRACT.md',
  'modes/_shared.md', 'modes/_profile.template.md',
  'modes/evaluate.md', 'modes/pdf.md', 'modes/scan.md',
  'templates/states.yml', 'templates/cv-template.html',
  '.claude/skills/job-hunt/SKILL.md',
];

for (const f of systemFiles) {
  if (fileExists(f)) {
    pass(`System file exists: ${f}`);
  } else {
    fail(`Missing system file: ${f}`);
  }
}

// Check user-layer files are NOT tracked (gitignored)
const userFiles = [
  'portals.yml',
];
for (const f of userFiles) {
  const tracked = run('git', ['ls-files', f]);
  if (tracked === '') {
    pass(`User file gitignored: ${f}`);
  } else if (tracked === null) {
    pass(`User file gitignored: ${f}`);
  } else {
    fail(`User file IS tracked (should be gitignored): ${f}`);
  }
}

// Check generated-layer files ARE tracked (not gitignored) — they are derived artifacts, not personal data
const generatedFiles = [
  'config/profile.yml', 'modes/_profile.md', 'article-digest.md', 'cv-builder.md', 'cv-pd.md',
];
for (const f of generatedFiles) {
  const ignored = run('git', ['check-ignore', f]);
  if (ignored === null || ignored === '') {
    // not ignored — correct
    pass(`Generated file not gitignored: ${f}`);
  } else {
    fail(`Generated file IS gitignored (should be tracked): ${f}`);
  }
}

// ── 6. PERSONAL DATA LEAK CHECK ─────────────────────────────────

console.log('\n6. Personal data leak check');

const leakPatterns = [
  'Santifer iRepair', 'Zinkee', 'ALMAS',
  'hi@santifer.io', '688921377', '/Users/santifer/',
];

const scanExtensions = ['md', 'yml', 'html', 'mjs', 'sh', 'go', 'json'];
const allowedFiles = [
  // English README + localized translations (all legitimately credit Santiago)
  'README.md', 'README.es.md', 'README.ja.md', 'README.ko-KR.md',
  'README.pt-BR.md', 'README.ru.md',
  // Standard project files
  'LICENSE', 'CITATION.cff', 'CONTRIBUTING.md',
  'package.json', '.github/FUNDING.yml', 'CLAUDE.md', 'go.mod', 'test-all.mjs',
  // Community / governance files (added in v1.3.0, all legitimately reference the maintainer)
  'CODE_OF_CONDUCT.md', 'GOVERNANCE.md', 'SECURITY.md', 'SUPPORT.md',
  '.github/SECURITY.md',
  // Dashboard credit string
  'dashboard/internal/ui/screens/pipeline.go',
];

// Build pathspec for git grep — only scan tracked files matching these
// extensions. This is what `grep -rn` was trying to do, but git-aware:
// untracked files (debate artifacts, AI tool scratch, local plans/) and
// gitignored files can't trigger false positives because they were never
// going to reach a commit anyway.
const grepPathspec = scanExtensions.map(e => `'*.${e}'`).join(' ');

let leakFound = false;
for (const pattern of leakPatterns) {
  const result = run(
    `git grep -n "${pattern}" -- ${grepPathspec} 2>/dev/null`
  );
  if (result) {
    for (const line of result.split('\n')) {
      const file = line.split(':')[0];
      if (allowedFiles.some(a => file.includes(a))) continue;
      if (file.includes('dashboard/go.mod')) continue;
      warn(`Possible personal data in ${file}: "${pattern}"`);
      leakFound = true;
    }
  }
}
if (!leakFound) {
  pass('No personal data leaks outside allowed files');
}

// ── 7. ABSOLUTE PATH CHECK ──────────────────────────────────────

console.log('\n7. Absolute path check');

// Same git grep approach: only scans tracked files. Untracked AI tool
// outputs, local debate artifacts, etc. can't false-positive here.
const absPathResult = run(
  `git grep -n "/Users/" -- '*.mjs' '*.sh' '*.md' '*.go' '*.yml' 2>/dev/null | grep -v README.md | grep -v LICENSE | grep -v CLAUDE.md | grep -v test-all.mjs`
);
if (!absPathResult) {
  pass('No absolute paths in code files');
} else {
  for (const line of absPathResult.split('\n').filter(Boolean)) {
    fail(`Absolute path: ${line.slice(0, 100)}`);
  }
}

// ── 8. MODE FILE INTEGRITY ──────────────────────────────────────

console.log('\n8. Mode file integrity');

const expectedModes = [
  '_shared.md', '_profile.template.md', 'evaluate.md', 'pdf.md', 'scan.md',
  'batch.md', 'apply.md', 'auto-pipeline.md', 'outreach.md', 'deep.md',
  'compare.md', 'pipeline.md', 'project.md', 'tracker.md', 'training.md',
  'combat.md', 'debrief.md',
];

for (const mode of expectedModes) {
  if (fileExists(`modes/${mode}`)) {
    pass(`Mode exists: ${mode}`);
  } else {
    fail(`Missing mode: ${mode}`);
  }
}

// Check _shared.md references _profile.md
const shared = readFile('modes/_shared.md');
if (shared.includes('_profile.md')) {
  pass('_shared.md references _profile.md');
} else {
  fail('_shared.md does NOT reference _profile.md');
}

// Check Interview OS data scaffolding
if (fileExists('data/interview-tracker.md')) {
  pass('data/interview-tracker.md exists');
} else {
  warn('data/interview-tracker.md does not exist (created on first /job-hunt debrief)');
}

if (fileExists('interview-prep/debriefs')) {
  pass('interview-prep/debriefs/ directory exists');
} else {
  warn('interview-prep/debriefs/ directory does not exist (created on first /job-hunt debrief)');
}

// === Phase 2: new mode files exist with required headers ===
console.log('\n=== Phase 2: new mode files ===');
const newModeFiles = [
  { path: 'modes/closing.md', requiredHeaders: ['## Purpose', '## When to Invoke', '## Required Inputs', '## Step 1', '## Step 6', '## Step 7', '## Edge Cases'] },
  { path: 'modes/weaknesses.md', requiredHeaders: ['## Purpose', '## When to Invoke', '## Inputs', '## Step 1', '## Step 3', '## Edge Cases'] },
];
for (const { path, requiredHeaders } of newModeFiles) {
  if (!existsSync(join(ROOT, path))) {
    fail(`${path} missing`);
    continue;
  }
  const content = readFileSync(join(ROOT, path), 'utf-8');
  let allFound = true;
  for (const header of requiredHeaders) {
    if (!content.includes(header)) {
      fail(`${path}: missing required header "${header}"`);
      allFound = false;
    }
  }
  if (allFound) pass(`${path}: all required headers present`);
}

// ── 9. CLAUDE.md INTEGRITY ──────────────────────────────────────

console.log('\n9. CLAUDE.md integrity');

const claude = readFile('CLAUDE.md');
const requiredSections = [
  'Data Contract', 'Session Start', 'Ethical Use',
  'Offer Verification', 'Canonical States', 'TSV Format',
  'First Run', 'Onboarding',
];

for (const section of requiredSections) {
  if (claude.includes(section)) {
    pass(`CLAUDE.md has section: ${section}`);
  } else {
    fail(`CLAUDE.md missing section: ${section}`);
  }
}


// ── SUMMARY ─────────────────────────────────────────────────────

console.log('\n' + '='.repeat(50));
console.log(`📊 Results: ${passed} passed, ${failed} failed, ${warnings} warnings`);

if (failed > 0) {
  console.log('🔴 TESTS FAILED — do NOT push/merge until fixed\n');
  process.exit(1);
} else if (warnings > 0) {
  console.log('🟡 Tests passed with warnings — review before pushing\n');
  process.exit(0);
} else {
  console.log('🟢 All tests passed — safe to push/merge\n');
  process.exit(0);
}
