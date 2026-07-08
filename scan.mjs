#!/usr/bin/env node

/**
 * scan.mjs — Zero-token portal scanner
 *
 * Fetches Greenhouse, Ashby, Lever, and Workday APIs directly, applies title
 * filters from portals.yml, deduplicates against existing history,
 * and appends new offers to pipeline.md + scan-history.tsv.
 *
 * Also scrapes YC Work at a Startup for small YC companies.
 *
 * Zero Claude API tokens — pure HTTP + JSON.
 *
 * Usage:
 *   node scan.mjs                  # scan all enabled companies
 *   node scan.mjs --dry-run        # preview without writing files
 *   node scan.mjs --company Cohere # scan a single company (tracked + workday)
 */

import { readFileSync, writeFileSync, appendFileSync, existsSync, mkdirSync } from 'fs';
import yaml from 'js-yaml';
const parseYaml = yaml.load;

// ── Config ──────────────────────────────────────────────────────────

const PORTALS_PATH = 'portals.yml';
const SCAN_HISTORY_PATH = 'data/scan-history.tsv';
const PIPELINE_PATH = 'data/pipeline.md';
const APPLICATIONS_PATH = 'data/applications.md';

// Ensure required directories exist (fresh setup)
mkdirSync('data', { recursive: true });

const CONCURRENCY = 10;
const FETCH_TIMEOUT_MS = 10_000;

// ── API detection ───────────────────────────────────────────────────

function detectApi(company) {
  // Greenhouse: explicit api field
  if (company.api && company.api.includes('greenhouse')) {
    return { type: 'greenhouse', url: company.api };
  }

  const url = company.careers_url || '';

  // Ashby
  const ashbyMatch = url.match(/jobs\.ashbyhq\.com\/([^/?#]+)/);
  if (ashbyMatch) {
    return {
      type: 'ashby',
      url: `https://api.ashbyhq.com/posting-api/job-board/${ashbyMatch[1]}?includeCompensation=true`,
    };
  }

  // Lever
  const leverMatch = url.match(/jobs\.lever\.co\/([^/?#]+)/);
  if (leverMatch) {
    return {
      type: 'lever',
      url: `https://api.lever.co/v0/postings/${leverMatch[1]}`,
    };
  }

  // Greenhouse EU boards
  const ghEuMatch = url.match(/job-boards(?:\.eu)?\.greenhouse\.io\/([^/?#]+)/);
  if (ghEuMatch && !company.api) {
    return {
      type: 'greenhouse',
      url: `https://boards-api.greenhouse.io/v1/boards/${ghEuMatch[1]}/jobs`,
    };
  }

  // Workday: explicit workday_tenant config takes highest precedence
  // (lets portals.yml specify the exact subdomain + site_id)
  if (company.workday_tenant) {
    const subdomain = company.workday_subdomain || 'wd5';
    const site = company.workday_site || 'External';
    const tenant = company.workday_tenant;
    return {
      type: 'workday',
      tenant,
      url: `https://${tenant}.${subdomain}.myworkdayjobs.com/wday/cxs/${tenant}/${site}/jobs`,
    };
  }

  // Workday: detect from careers_url pattern (*.wd1/wd3/wd5.myworkdayjobs.com)
  const workdayUrlMatch = url.match(/([a-z0-9-]+)\.(wd[0-9]+)\.myworkdayjobs\.com(?:\/([^/?#]+))?/);
  if (workdayUrlMatch) {
    const tenant = workdayUrlMatch[1];
    const subdomain = workdayUrlMatch[2];
    // Site ID: try to extract from URL path, default to 'External'
    const site = workdayUrlMatch[3] || 'External';
    return {
      type: 'workday',
      tenant,
      url: `https://${tenant}.${subdomain}.myworkdayjobs.com/wday/cxs/${tenant}/${site}/jobs`,
    };
  }

  return null;
}

// ── API parsers ─────────────────────────────────────────────────────

function parseGreenhouse(json, companyName) {
  const jobs = json.jobs || [];
  return jobs.map(j => ({
    title: j.title || '',
    url: j.absolute_url || '',
    company: companyName,
    location: j.location?.name || '',
  }));
}

function parseAshby(json, companyName) {
  const jobs = json.jobs || [];
  return jobs.map(j => ({
    title: j.title || '',
    url: j.jobUrl || '',
    company: companyName,
    location: j.location || '',
  }));
}

function parseLever(json, companyName) {
  if (!Array.isArray(json)) return [];
  return json.map(j => ({
    title: j.text || '',
    url: j.hostedUrl || '',
    company: companyName,
    location: j.categories?.location || '',
  }));
}

function parseWorkday(json, companyName, api) {
  const postings = json.jobPostings || [];
  const subdomain = api?.url?.match(/([a-z0-9-]+\.[a-z0-9]+\.myworkdayjobs\.com)/)?.[1] || 'wd5.myworkdayjobs.com';
  return postings.map(j => {
    // externalPath is like /job/City/Title/job/12345
    const path = j.externalPath || '';
    const jobUrl = path ? `https://${subdomain}${path}` : '';
    return {
      title: j.title || '',
      url: jobUrl,
      company: companyName,
      location: j.locationsText || '',
    };
  });
}

const PARSERS = { greenhouse: parseGreenhouse, ashby: parseAshby, lever: parseLever, workday: parseWorkday };

// ── Fetch with timeout ──────────────────────────────────────────────

async function fetchJson(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

// Workday requires POST with a JSON body (unlike Greenhouse/Ashby/Lever GET).
// Workday tenants typically cap the page size at 20; we paginate to get all jobs.
const WORKDAY_PAGE_SIZE = 20;
const WORKDAY_MAX_PAGES = 50; // safety cap (50 * 20 = 1000 jobs max per tenant)

async function fetchWorkdayPage(url, offset) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 job-hunt scanner',
      },
      body: JSON.stringify({
        appliedFacets: {},
        limit: WORKDAY_PAGE_SIZE,
        offset,
        searchText: '',
      }),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

async function fetchWorkdayJson(url) {
  const allPostings = [];
  let offset = 0;
  let total = Infinity;

  for (let page = 0; page < WORKDAY_MAX_PAGES && offset < total; page++) {
    const data = await fetchWorkdayPage(url, offset);
    total = data.total || 0;
    const postings = data.jobPostings || [];
    allPostings.push(...postings);
    offset += postings.length;
    // If this page returned fewer than the page size, we're done
    if (postings.length < WORKDAY_PAGE_SIZE) break;
  }

  return { total: allPostings.length, jobPostings: allPostings };
}

// YC Work at a Startup — HTML scraping (best-effort, unofficial)
async function fetchYCJobs(ycConfig) {
  const allJobs = [];
  const keywords = ycConfig.keywords || ['designer'];

  for (const keyword of keywords) {
    try {
      const url = `https://www.workatastartup.com/jobs?q=${encodeURIComponent(keyword)}&role=designer&remote_ok=true`;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
      let text;
      try {
        const res = await fetch(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          },
          signal: controller.signal,
        });
        if (!res.ok) continue;
        text = await res.text();
      } finally {
        clearTimeout(timer);
      }

      // YC W@S renders HTML; extract job links from the page.
      // Pattern: href="/jobs/{id}-{slug}" with nearby title text.
      // This is brittle by nature — Phase 2 replaces with Playwright.
      const jobMatches = [...text.matchAll(/href="(\/jobs\/\d+[^"]*)"[^>]*>([^<]{5,120})</g)];
      const seen = new Set();
      for (const m of jobMatches) {
        const path = m[1];
        const rawTitle = m[2].trim();
        if (seen.has(path)) continue;
        seen.add(path);
        // Skip navigation/filter links that don't look like job titles
        if (rawTitle.length < 5 || rawTitle.includes('\n')) continue;
        const limit = ycConfig.max_per_company || 100;
        if (allJobs.filter(j => j.url.includes(path)).length > 0) continue;
        allJobs.push({
          title: rawTitle,
          url: `https://www.workatastartup.com${path}`,
          company: 'YC W@S',
          location: 'Remote',
        });
        if (allJobs.length >= limit * keywords.length) break;
      }
    } catch (_err) {
      // YC scraping is best-effort — silently skip on error
    }
  }

  return allJobs;
}

// ── Title filter ────────────────────────────────────────────────────

function buildTitleFilter(titleFilter) {
  const positive = (titleFilter?.positive || []).map(k => k.toLowerCase());
  const negative = (titleFilter?.negative || []).map(k => k.toLowerCase());

  return (title) => {
    const lower = title.toLowerCase();
    const hasPositive = positive.length === 0 || positive.some(k => lower.includes(k));
    const hasNegative = negative.some(k => lower.includes(k));
    return hasPositive && !hasNegative;
  };
}

// ── Dedup ───────────────────────────────────────────────────────────

function loadSeenUrls() {
  const seen = new Set();

  // scan-history.tsv
  if (existsSync(SCAN_HISTORY_PATH)) {
    const lines = readFileSync(SCAN_HISTORY_PATH, 'utf-8').split('\n');
    for (const line of lines.slice(1)) { // skip header
      const url = line.split('\t')[0];
      if (url) seen.add(url);
    }
  }

  // pipeline.md — extract URLs from checkbox lines
  if (existsSync(PIPELINE_PATH)) {
    const text = readFileSync(PIPELINE_PATH, 'utf-8');
    for (const match of text.matchAll(/- \[[ x]\] (https?:\/\/\S+)/g)) {
      seen.add(match[1]);
    }
  }

  // applications.md — extract URLs from report links and any inline URLs
  if (existsSync(APPLICATIONS_PATH)) {
    const text = readFileSync(APPLICATIONS_PATH, 'utf-8');
    for (const match of text.matchAll(/https?:\/\/[^\s|)]+/g)) {
      seen.add(match[0]);
    }
  }

  return seen;
}

function loadSeenCompanyRoles() {
  const seen = new Set();
  if (existsSync(APPLICATIONS_PATH)) {
    const text = readFileSync(APPLICATIONS_PATH, 'utf-8');
    // Parse markdown table rows: | # | Date | Company | Role | ...
    for (const match of text.matchAll(/\|[^|]+\|[^|]+\|\s*([^|]+)\s*\|\s*([^|]+)\s*\|/g)) {
      const company = match[1].trim().toLowerCase();
      const role = match[2].trim().toLowerCase();
      if (company && role && company !== 'company') {
        seen.add(`${company}::${role}`);
      }
    }
  }
  return seen;
}

// ── Pipeline writer ─────────────────────────────────────────────────

function appendToPipeline(offers) {
  if (offers.length === 0) return;

  let text = readFileSync(PIPELINE_PATH, 'utf-8');

  // Find "## Pending" section and append after it
  const marker = '## Pending';
  const idx = text.indexOf(marker);
  if (idx === -1) {
    // No Pending section — append at end before Processed
    const procIdx = text.indexOf('## Processed');
    const insertAt = procIdx === -1 ? text.length : procIdx;
    const block = `\n${marker}\n\n` + offers.map(o =>
      `- [ ] ${o.url} | ${o.company} | ${o.title}`
    ).join('\n') + '\n\n';
    text = text.slice(0, insertAt) + block + text.slice(insertAt);
  } else {
    // Find the end of existing Pending content (next ## or end)
    const afterMarker = idx + marker.length;
    const nextSection = text.indexOf('\n## ', afterMarker);
    const insertAt = nextSection === -1 ? text.length : nextSection;

    const block = '\n' + offers.map(o =>
      `- [ ] ${o.url} | ${o.company} | ${o.title}`
    ).join('\n') + '\n';
    text = text.slice(0, insertAt) + block + text.slice(insertAt);
  }

  writeFileSync(PIPELINE_PATH, text, 'utf-8');
}

function writeToDropZone(offers, date, dropZonePath) {
  if (!dropZonePath) return;
  const lines = offers.map(o => `- [ ] [${o.company} — ${o.title}](${o.url})`).join('\n');
  const content = `---
tags: [jobs]
date: ${date}
source: job-hunt/scan.mjs
---

${offers.length} new job posting${offers.length === 1 ? '' : 's'} from portal scan.

${lines}

> Evaluate with \`/job-hunt {url}\` from job-hunt.
`;
  writeFileSync(`${dropZonePath}/[${date}] Job Scan — ${offers.length} new openings.md`, content, 'utf-8');
}

function appendToScanHistory(offers, date) {
  // Ensure file + header exist
  if (!existsSync(SCAN_HISTORY_PATH)) {
    writeFileSync(SCAN_HISTORY_PATH, 'url\tfirst_seen\tportal\ttitle\tcompany\tstatus\n', 'utf-8');
  }

  const lines = offers.map(o =>
    `${o.url}\t${date}\t${o.source}\t${o.title}\t${o.company}\tadded`
  ).join('\n') + '\n';

  appendFileSync(SCAN_HISTORY_PATH, lines, 'utf-8');
}

// ── Parallel fetch with concurrency limit ───────────────────────────

async function parallelFetch(tasks, limit) {
  const results = [];
  let i = 0;

  async function next() {
    while (i < tasks.length) {
      const task = tasks[i++];
      results.push(await task());
    }
  }

  const workers = Array.from({ length: Math.min(limit, tasks.length) }, () => next());
  await Promise.all(workers);
  return results;
}

// ── Main ────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const companyFlag = args.indexOf('--company');
  const filterCompany = companyFlag !== -1 ? args[companyFlag + 1]?.toLowerCase() : null;

  // 1. Read portals.yml
  if (!existsSync(PORTALS_PATH)) {
    console.error('Error: portals.yml not found. Run onboarding first.');
    process.exit(1);
  }

  const config = parseYaml(readFileSync(PORTALS_PATH, 'utf-8'));
  const companies = config.tracked_companies || [];
  const workdayCompanies = (config.big_tech?.workday_companies || [])
    .filter(c => c.enabled !== false);
  const titleFilter = buildTitleFilter(config.title_filter);

  // 2. Filter tracked companies to enabled ones with detectable APIs
  const trackedTargets = companies
    .filter(c => c.enabled !== false)
    .filter(c => !filterCompany || c.name.toLowerCase().includes(filterCompany))
    .map(c => ({ ...c, _api: detectApi(c) }))
    .filter(c => c._api !== null);

  // 2b. Filter Workday companies (--company flag applies to both lists)
  const workdayTargets = workdayCompanies
    .filter(c => !filterCompany || c.name.toLowerCase().includes(filterCompany))
    .map(c => ({ ...c, _api: detectApi(c) }))
    .filter(c => c._api !== null);

  const skippedTracked = companies.filter(c => c.enabled !== false).length - trackedTargets.length;
  const totalTargets = trackedTargets.length + workdayTargets.length;

  console.log(`Scanning ${trackedTargets.length} companies via API (${skippedTracked} skipped — no API detected)`);
  if (workdayTargets.length > 0) {
    console.log(`Scanning ${workdayTargets.length} Workday companies via POST API`);
  }
  if (dryRun) console.log('(dry run — no files will be written)\n');

  // 3. Load dedup sets
  const seenUrls = loadSeenUrls();
  const seenCompanyRoles = loadSeenCompanyRoles();

  // 4. Fetch all APIs
  const date = new Date().toISOString().slice(0, 10);
  let totalFound = 0;
  let totalFiltered = 0;
  let totalDupes = 0;
  const newOffers = [];
  const errors = [];

  // Helper: apply title filter + dedup to a list of jobs from one company
  function processJobs(jobs, sourceType) {
    for (const job of jobs) {
      if (!titleFilter(job.title)) {
        totalFiltered++;
        continue;
      }
      if (seenUrls.has(job.url)) {
        totalDupes++;
        continue;
      }
      const key = `${job.company.toLowerCase()}::${job.title.toLowerCase()}`;
      if (seenCompanyRoles.has(key)) {
        totalDupes++;
        continue;
      }
      seenUrls.add(job.url);
      seenCompanyRoles.add(key);
      newOffers.push({ ...job, source: sourceType });
    }
  }

  // 4a. Standard GET-based companies (Greenhouse / Ashby / Lever)
  const tasks = trackedTargets.map(company => async () => {
    const { type, url } = company._api;
    try {
      const json = await fetchJson(url);
      const jobs = PARSERS[type](json, company.name);
      totalFound += jobs.length;
      processJobs(jobs, `${type}-api`);
    } catch (err) {
      errors.push({ company: company.name, error: err.message });
    }
  });

  await parallelFetch(tasks, CONCURRENCY);

  // 4b. Workday companies (POST-based)
  if (workdayTargets.length > 0) {
    const workdayTasks = workdayTargets.map(company => async () => {
      const api = company._api;
      try {
        const json = await fetchWorkdayJson(api.url);
        const jobs = parseWorkday(json, company.name, api);
        totalFound += jobs.length;
        processJobs(jobs, 'workday-api');
      } catch (err) {
        errors.push({ company: company.name, error: `Workday: ${err.message}` });
      }
    });
    await parallelFetch(workdayTasks, CONCURRENCY);
  }

  // 4c. YC Work at a Startup (HTML scraping, best-effort)
  const ycConfig = config.big_tech?.yc_companies;
  if (ycConfig?.enabled && !filterCompany) {
    console.log('Fetching YC Work at a Startup jobs...');
    try {
      const ycJobs = await fetchYCJobs(ycConfig);
      console.log(`  YC W@S: found ${ycJobs.length} raw jobs`);
      totalFound += ycJobs.length;
      processJobs(ycJobs, 'yc-was');
    } catch (err) {
      console.log(`  YC W@S: warning — ${err.message} (skipping)`);
    }
  }

  // 5. Write results
  if (!dryRun && newOffers.length > 0) {
    appendToPipeline(newOffers);
    appendToScanHistory(newOffers, date);
    writeToDropZone(newOffers, date, config.drop_zone);
  }

  // 6. Print summary
  console.log(`\n${'━'.repeat(45)}`);
  console.log(`Portal Scan — ${date}`);
  console.log(`${'━'.repeat(45)}`);
  console.log(`Companies scanned:     ${totalTargets} (${trackedTargets.length} standard + ${workdayTargets.length} Workday)`);
  console.log(`Total jobs found:      ${totalFound}`);
  console.log(`Filtered by title:     ${totalFiltered} removed`);
  console.log(`Duplicates:            ${totalDupes} skipped`);
  console.log(`New offers added:      ${newOffers.length}`);

  if (errors.length > 0) {
    console.log(`\nErrors (${errors.length}):`);
    for (const e of errors) {
      console.log(`  ✗ ${e.company}: ${e.error}`);
    }
  }

  if (newOffers.length > 0) {
    console.log('\nNew offers:');
    for (const o of newOffers) {
      console.log(`  + ${o.company} | ${o.title} | ${o.location || 'N/A'}`);
    }
    if (dryRun) {
      console.log('\n(dry run — run without --dry-run to save results)');
    } else {
      console.log(`\nResults saved to ${PIPELINE_PATH} and ${SCAN_HISTORY_PATH}`);
    }
  }

  console.log(`\n→ Run /job-hunt pipeline to evaluate new offers.`);
  console.log('→ Share results and get help: https://discord.gg/8pRpHETxa4');
}

main().catch(err => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
