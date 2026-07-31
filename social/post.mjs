#!/usr/bin/env node
// Publish a photo + caption to the Chasing Light Studio Facebook Page and Instagram Business account.
// Usage:
//   node social/post.mjs <path-to-photo> --caption "text" [--caption-file path] [--fb-only|--ig-only] [--dry-run] [--no-push]

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, copyFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ENV_PATH = path.join(ROOT, 'social', '.env');
const GRAPH_VERSION = 'v21.0';

function loadEnv(file) {
  if (!existsSync(file)) return {};
  const out = {};
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    out[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
  }
  return out;
}

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--caption') args.caption = argv[++i];
    else if (a === '--caption-file') args.captionFile = argv[++i];
    else if (a === '--fb-only') args.fbOnly = true;
    else if (a === '--ig-only') args.igOnly = true;
    else if (a === '--dry-run') args.dryRun = true;
    else if (a === '--no-push') args.noPush = true;
    else args._.push(a);
  }
  return args;
}

function sh(cmd, args, opts = {}) {
  return execFileSync(cmd, args, { cwd: ROOT, encoding: 'utf8', ...opts });
}

function slugify(name) {
  return name
    .toLowerCase()
    .replace(/\.[^.]+$/, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

async function waitForUrl(url, { timeoutMs = 1_200_000, intervalMs = 60_000 } = {}) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url, { method: 'HEAD' });
      if (res.ok) return true;
    } catch {
      // not live yet
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return false;
}

async function graphPost(pathSegment, params) {
  const url = `https://graph.facebook.com/${GRAPH_VERSION}/${pathSegment}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params),
  });
  const json = await res.json();
  if (!res.ok || json.error) {
    throw new Error(`Graph API error on ${pathSegment}: ${JSON.stringify(json.error ?? json)}`);
  }
  return json;
}

async function graphGet(pathSegment, params) {
  const url = `https://graph.facebook.com/${GRAPH_VERSION}/${pathSegment}?${new URLSearchParams(params)}`;
  const res = await fetch(url);
  const json = await res.json();
  if (!res.ok || json.error) {
    throw new Error(`Graph API error on ${pathSegment}: ${JSON.stringify(json.error ?? json)}`);
  }
  return json;
}

// Instagram processes the media container asynchronously after creation (downloading and
// validating the image) — publishing before it reports FINISHED fails with "Media ID is not
// available" (code 9007). Poll status_code until it's ready.
async function waitForContainerReady(containerId, accessToken, { timeoutMs = 120_000, intervalMs = 5_000 } = {}) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const { status_code } = await graphGet(containerId, { fields: 'status_code', access_token: accessToken });
    if (status_code === 'FINISHED') return;
    if (status_code === 'ERROR') throw new Error(`Instagram media container ${containerId} failed processing (status_code=ERROR)`);
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error(`Timed out waiting for Instagram media container ${containerId} to finish processing.`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const photoArg = args._[0];
  if (!photoArg) {
    console.error('Usage: node social/post.mjs <path-to-photo> --caption "text" [--fb-only|--ig-only] [--dry-run]');
    process.exit(1);
  }

  const caption = args.captionFile ? readFileSync(args.captionFile, 'utf8').trim() : args.caption;
  if (!caption) {
    console.error('A caption is required: pass --caption "text" or --caption-file path.');
    process.exit(1);
  }

  const env = { ...loadEnv(ENV_PATH), ...process.env };
  const required = ['SITE_URL', 'FB_PAGE_ID', 'FB_PAGE_ACCESS_TOKEN'];
  if (!args.fbOnly) required.push('IG_USER_ID');
  const missing = required.filter((k) => !env[k]);
  if (missing.length) {
    console.error(`Missing required config in social/.env: ${missing.join(', ')}`);
    console.error('Copy social/.env.example to social/.env and fill in your values.');
    process.exit(1);
  }

  const srcPath = path.resolve(ROOT, photoArg);
  if (!existsSync(srcPath)) {
    console.error(`Photo not found: ${srcPath}`);
    process.exit(1);
  }

  const outDir = path.join(ROOT, 'assets', 'img', 'social');
  mkdirSync(outDir, { recursive: true });

  const slug = slugify(path.basename(srcPath));
  const filename = `${Date.now()}-${slug}.jpg`;
  const outPath = path.join(outDir, filename);

  console.log(`Optimizing ${path.basename(srcPath)} -> assets/img/social/${filename}`);
  copyFileSync(srcPath, outPath);
  // Resize so the largest dimension is 1600px and re-encode as JPEG (Instagram requires JPEG).
  sh('sips', ['-Z', '1600', '-s', 'format', 'jpeg', '-s', 'formatOptions', '85', outPath]);

  const publicUrl = `${env.SITE_URL.replace(/\/$/, '')}/assets/img/social/${filename}`;

  if (args.dryRun) {
    console.log('--dry-run: skipping git push and API calls.');
    console.log(`Would publish: ${publicUrl}`);
    console.log(`Caption:\n${caption}`);
    return;
  }

  if (!args.noPush) {
    console.log('Committing and pushing image to GitHub Pages...');
    sh('git', ['add', outPath]);
    sh('git', ['commit', '-m', `Add social post image: ${slug}`]);
    sh('git', ['push']);

    console.log(`Waiting for ${publicUrl} to go live...`);
    const live = await waitForUrl(publicUrl);
    if (!live) {
      console.error('Timed out waiting for the image to become publicly reachable. Aborting before posting.');
      process.exit(1);
    }
  } else {
    console.log('--no-push: assuming the image is already live at the public URL.');
  }

  // Instagram is the flakier step (async processing, transient fetch errors) — run it before
  // Facebook so a failure aborts the run before Facebook posts, instead of after (which would
  // leave a live Facebook post behind on every retry of the same product).
  if (!args.fbOnly) {
    console.log('Creating Instagram media container...');
    const container = await graphPost(`${env.IG_USER_ID}/media`, {
      image_url: publicUrl,
      caption,
      access_token: env.FB_PAGE_ACCESS_TOKEN,
    });
    console.log('Waiting for Instagram to finish processing the media container...');
    await waitForContainerReady(container.id, env.FB_PAGE_ACCESS_TOKEN);
    console.log('Publishing to Instagram...');
    const published = await graphPost(`${env.IG_USER_ID}/media_publish`, {
      creation_id: container.id,
      access_token: env.FB_PAGE_ACCESS_TOKEN,
    });
    console.log(`Instagram post created: id=${published.id}`);
  }

  if (!args.igOnly) {
    console.log('Posting to Facebook Page...');
    const fb = await graphPost(`${env.FB_PAGE_ID}/photos`, {
      url: publicUrl,
      caption,
      access_token: env.FB_PAGE_ACCESS_TOKEN,
    });
    console.log(`Facebook post created: id=${fb.post_id ?? fb.id}`);
  }

  console.log('Done.');
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
