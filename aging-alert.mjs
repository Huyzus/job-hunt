#!/usr/bin/env node
/**
 * aging-alert.mjs — Surfaces unapplied 4.5+ offers older than 3 days.
 * Output: JSON { alerts: [...] } — read-only, no side effects.
 */

import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = dirname(fileURLToPath(import.meta.url));
const APPS_FILE = existsSync(join(ROOT, 'data/applications.md'))
  ? join(ROOT, 'data/applications.md')
  : join(ROOT, 'applications.md');

const THRESHOLD_SCORE = 4.5;
const THRESHOLD_DAYS = 3;

// Keep evaluated-synonym entries in sync with ALIASES in analyze-patterns.mjs
const STATUS_ALIASES = {
  'evaluada': 'evaluated', 'condicional': 'evaluated', 'hold': 'evaluated',
  'evaluar': 'evaluated', 'verificar': 'evaluated',
};

function normalizeStatus(raw) {
  const clean = raw.replace(/\*\*/g, '').trim().toLowerCase()
    .replace(/\s+\d{4}-\d{2}-\d{2}.*$/, '').trim();
  return STATUS_ALIASES[clean] || clean;
}

function parseTracker() {
  if (!existsSync(APPS_FILE)) return [];
  const entries = [];
  for (const line of readFileSync(APPS_FILE, 'utf-8').split('\n')) {
    if (!line.startsWith('|')) continue;
    const parts = line.split('|').map(s => s.trim());
    if (parts.length < 9) continue;
    const num = parseInt(parts[1]);
    if (isNaN(num)) continue;
    entries.push({
      num: String(num).padStart(3, '0'),
      date: parts[2],
      company: parts[3],
      role: parts[4],
      score: parts[5],
      status: parts[6],
      report: parts[8],
    });
  }
  return entries;
}

function daysOld(dateStr) {
  const parsed = new Date(dateStr);
  if (isNaN(parsed.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.floor((today - parsed) / 86400000);
}

function extractReportPath(reportCell) {
  const match = reportCell.match(/\]\(([^)]+)\)/);
  return match ? match[1] : reportCell;
}

const entries = parseTracker();

const alerts = entries
  .filter(e => {
    const age = daysOld(e.date);
    return age !== null &&
      normalizeStatus(e.status) === 'evaluated' &&
      parseFloat(e.score) >= THRESHOLD_SCORE &&
      age >= THRESHOLD_DAYS;
  })
  .map(e => ({
    num: e.num,
    company: e.company,
    role: e.role,
    score: e.score,
    date: e.date,
    days_old: daysOld(e.date),
    report: extractReportPath(e.report),
  }))
  .sort((a, b) => b.days_old - a.days_old || parseFloat(b.score) - parseFloat(a.score));

console.log(JSON.stringify({ alerts }, null, 2));
