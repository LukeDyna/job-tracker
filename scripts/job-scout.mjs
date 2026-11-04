#!/usr/bin/env node
// Job scout helper, used by the daily scheduled Claude task.
//
// The scout never sees the Supabase secret key. It uses the public
// (publishable) key plus its own scout key, which the database only accepts
// for two things: reading search briefs and adding suggestions.
//
// Config lives OUTSIDE the repo: %USERPROFILE%\.job-tracker\scout.json
//   { "url": "https://<ref>.supabase.co", "publishableKey": "sb_publishable_…", "scoutKey": "…" }
// or, for cloud runs, environment variables (these take priority):
//   JOB_SCOUT_URL, JOB_SCOUT_PUBLISHABLE_KEY, JOB_SCOUT_KEY
//
// Commands
//   node scripts/job-scout.mjs init <supabase-url> <publishable-key>
//       Creates the config with a fresh random scout key and prints the SQL
//       to register its hash (run that once in the Supabase SQL Editor).
//   node scripts/job-scout.mjs work
//       Prints JSON: [{ user_id, brief, already_known: ["company | role", …] }, …]
//   node scripts/job-scout.mjs submit <user_id> <items.json>
//       Sends a JSON array of suggestions; prints { added, skipped }.
//   node scripts/job-scout.mjs check
//       Confirms the config works.

import { createHash, randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const CONFIG_DIR = join(homedir(), '.job-tracker');
const CONFIG = join(CONFIG_DIR, 'scout.json');

class ScoutError extends Error {}
function fail(msg) {
  throw new ScoutError(msg);
}

function loadConfig() {
  // Cloud runs: settings come from environment variables instead of a file.
  const env = process.env;
  if (env.JOB_SCOUT_URL && env.JOB_SCOUT_PUBLISHABLE_KEY && env.JOB_SCOUT_KEY) {
    return { url: env.JOB_SCOUT_URL, publishableKey: env.JOB_SCOUT_PUBLISHABLE_KEY, scoutKey: env.JOB_SCOUT_KEY };
  }
  if (!existsSync(CONFIG)) fail(`no config at ${CONFIG} and JOB_SCOUT_* environment variables not set. Run "init" first.`);
  const c = JSON.parse(readFileSync(CONFIG, 'utf8'));
  if (!c.url || !c.publishableKey || !c.scoutKey) fail(`config at ${CONFIG} is incomplete`);
  return c;
}

async function rpc(name, body) {
  const c = loadConfig();
  const res = await fetch(`${c.url.replace(/\/$/, '')}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: { apikey: c.publishableKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_key: c.scoutKey, ...body }),
  });
  const text = await res.text();
  if (!res.ok) fail(`${name} failed (${res.status}): ${text}`);
  return JSON.parse(text);
}

const [cmd, ...args] = process.argv.slice(2);

try {
switch (cmd) {
  case 'init': {
    const [url, publishableKey] = args;
    if (!url || !publishableKey) fail('usage: init <supabase-url> <publishable-key>');
    if (existsSync(CONFIG) && !args.includes('--force')) fail(`${CONFIG} already exists (add --force to replace it)`);
    const scoutKey = randomBytes(32).toString('base64url');
    mkdirSync(CONFIG_DIR, { recursive: true });
    writeFileSync(CONFIG, JSON.stringify({ url, publishableKey, scoutKey }, null, 2) + '\n', { mode: 0o600 });
    const hash = createHash('sha256').update(scoutKey).digest('hex');
    console.log(`Wrote ${CONFIG}\n\nRun this once in the Supabase SQL Editor:\n`);
    console.log(`insert into public.scout_keys (key_hash, label)\nvalues (decode('${hash}', 'hex'), 'Daily job scout (${new Date().toISOString().slice(0, 10)})');`);
    break;
  }
  case 'work': {
    const work = await rpc('scout_get_work', {});
    console.log(JSON.stringify(work, null, 2));
    break;
  }
  case 'submit': {
    const [userId, file] = args;
    if (!userId || !file) fail('usage: submit <user_id> <items.json>');
    let items = JSON.parse(readFileSync(file, 'utf8').replace(/^﻿/, ''));
    if (!Array.isArray(items)) items = items.items ?? [];
    if (!Array.isArray(items)) fail('items file must contain a JSON array');
    const result = await rpc('scout_submit', { p_user_id: userId, p_items: items });
    console.log(JSON.stringify(result));
    break;
  }
  case 'check': {
    const work = await rpc('scout_get_work', {});
    console.log(`OK: connected. ${work.length} user(s) with a search brief.`);
    break;
  }
  default:
    console.log('usage: job-scout.mjs init|work|submit|check  (see the comment at the top of the file)');
    if (cmd) process.exitCode = 1;
}
} catch (e) {
  // Set the exit code rather than calling process.exit(), which can trip a
  // libuv assertion on Windows while fetch sockets are closing.
  console.error(`job-scout: ${e instanceof ScoutError ? e.message : e?.stack || e}`);
  process.exitCode = 1;
}
