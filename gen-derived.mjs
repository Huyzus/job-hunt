#!/usr/bin/env node
/**
 * gen-derived.mjs — Render derived files from canonical SoT.
 *
 * Usage:
 *   node gen-derived.mjs              # regenerate all
 *   node gen-derived.mjs --check      # dry-run; exit 1 if any derivation stale
 *   node gen-derived.mjs cv-builder   # regenerate just one
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import yaml from 'js-yaml';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = __dirname;

// ── Targets: template → output path ─────────────────────────────
const TARGETS = {
  'cv-builder':       { tpl: 'templates/cv-builder.template.md',     out: 'cv-builder.md' },
  'cv-pd':            { tpl: 'templates/cv-pd.template.md',          out: 'cv-pd.md' },
  'cv-consumer':      { tpl: 'templates/cv-consumer.template.md',    out: 'cv-consumer.md' },
  'article-digest':   { tpl: 'templates/article-digest.template.md', out: 'article-digest.md' },
  '_profile':         { tpl: 'templates/_profile.template.md',       out: 'modes/_profile.md' },
  'profile':          { tpl: 'templates/profile.template.yml',       out: 'config/profile.yml' },
};

// ── Canonical loader ────────────────────────────────────────────
export function loadCanonical(dataDir) {
  const yml = yaml.load(readFileSync(join(dataDir, 'canonical.yml'), 'utf-8')) || {};
  const md  = readFileSync(join(dataDir, 'canonical-narrative.md'), 'utf-8');
  const narrative = parseNarrative(md);
  return { yml, narrative };
}

function parseNarrative(md) {
  const sections = {};
  const lines = md.split('\n');
  let curId = null;
  let buf = [];
  const flush = () => {
    if (curId !== null) sections[curId] = buf.join('\n').trim();
  };
  for (const line of lines) {
    const m = line.match(/^##\s+(\S.*)$/);
    if (m) {
      flush();
      curId = m[1].trim();
      buf = [];
    } else if (curId !== null) {
      buf.push(line);
    }
  }
  flush();
  return sections;
}

// ── Renderer ────────────────────────────────────────────────────
export function renderTemplate(tpl, canonical) {
  return tpl.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_, expr) => {
    expr = expr.trim();
    if (expr.startsWith('narrative:')) {
      const id = expr.slice('narrative:'.length).trim();
      if (!(id in canonical.narrative)) {
        throw new Error(`Missing narrative section: ${id}`);
      }
      return canonical.narrative[id];
    }
    const value = expr.split('.').reduce((acc, k) => {
      if (acc == null || !(k in acc)) {
        throw new Error(`Missing canonical key: ${expr}`);
      }
      return acc[k];
    }, canonical.yml);
    if (typeof value === 'object' && value !== null) {
      throw new Error(`Non-scalar value at canonical key: ${expr} (${Array.isArray(value) ? 'array' : 'object'})`);
    }
    return String(value);
  });
}

// ── CLI ─────────────────────────────────────────────────────────
function main() {
  const args = process.argv.slice(2);
  const checkMode = args.includes('--check');
  const filtered = args.filter(a => !a.startsWith('--'));
  const targetNames = filtered.length ? filtered : Object.keys(TARGETS);
  const canonical = loadCanonical(join(ROOT, 'data'));
  let stale = 0;

  for (const name of targetNames) {
    const t = TARGETS[name];
    if (!t) { console.error(`Unknown target: ${name}`); process.exit(2); }
    const tplPath = join(ROOT, t.tpl);
    const outPath = join(ROOT, t.out);
    let tpl;
    try {
      tpl = readFileSync(tplPath, 'utf-8');
    } catch (e) {
      if (e.code === 'ENOENT') {
        console.error(`Template not found: ${t.tpl}`);
        process.exit(2);
      }
      throw e;
    }
    const rendered = renderTemplate(tpl, canonical);
    if (checkMode) {
      const current = existsSync(outPath) ? readFileSync(outPath, 'utf-8') : '';
      if (current !== rendered) {
        console.error(`STALE: ${t.out}`);
        stale++;
      } else {
        console.log(`OK:    ${t.out}`);
      }
    } else {
      writeFileSync(outPath, rendered);
      console.log(`wrote: ${t.out}`);
    }
  }
  if (checkMode && stale > 0) process.exit(1);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
