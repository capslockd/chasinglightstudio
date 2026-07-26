#!/usr/bin/env node
// Picks the oldest not-yet-posted photo across all galleries, asks Claude to look at the
// photo and write a longer, meaningful caption about that specific moment (not a generic
// gallery blurb), and posts it via post.mjs.
// Usage: node social/daily-post.mjs [--dry-run] [--fb-only|--ig-only]

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const GALLERIES_PATH = path.join(ROOT, 'social', 'galleries.json');
const POSTED_PATH = path.join(ROOT, 'social', 'posted.json');
const IMG_ROOT = path.join(ROOT, 'assets', 'img');
const PHOTO_EXT = /\.(jpe?g|png|webp)$/i;

function loadJson(file, fallback) {
  if (!existsSync(file)) return fallback;
  return JSON.parse(readFileSync(file, 'utf8'));
}

function listCandidates(galleries) {
  const candidates = [];
  for (const slug of Object.keys(galleries)) {
    const fullDir = path.join(IMG_ROOT, slug, 'full');
    if (!existsSync(fullDir)) continue;
    for (const name of readdirSync(fullDir)) {
      if (!PHOTO_EXT.test(name)) continue;
      const abs = path.join(fullDir, name);
      candidates.push({
        slug,
        relPath: path.relative(ROOT, abs),
        abs,
        mtimeMs: statSync(abs).mtimeMs,
      });
    }
  }
  candidates.sort((a, b) => a.mtimeMs - b.mtimeMs);
  return candidates;
}

const CLAUDE_BIN = process.env.CLAUDE_BIN || 'claude';

function buildCaptionPrompt(gallery, relPath) {
  return `You are writing a single Instagram/Facebook caption for Chasing Light Studio, a photography business. Read the photo at "${relPath}" (relative to the repo root, current working directory) and look closely at what's actually happening in it — the people, the setting, the light, the small gestures.

Context: this photo is from the "${gallery.title}" session.

Write a longer, genuinely meaningful caption (3-5 sentences) about this specific photo — what you actually see in the moment, not a generic description of the event type. Warm, personal, observational tone, like a photographer reflecting on why this frame matters. Do NOT end with a call-to-action or invitation to see the gallery — a "see the full gallery" line and link will be appended automatically after your text, so just end on the observation itself. Do not use markdown formatting or wrap the caption in quotation marks. A tasteful emoji or two is fine but don't overdo it. Output ONLY the caption text, nothing else — no preamble, no explanation.`;
}

async function main() {
  const extraArgs = process.argv.slice(2);

  const galleries = loadJson(GALLERIES_PATH, {});
  if (Object.keys(galleries).length === 0) {
    console.error(`No galleries configured in ${GALLERIES_PATH}`);
    process.exit(1);
  }

  const posted = new Set(loadJson(POSTED_PATH, []));
  const candidates = listCandidates(galleries);
  const next = candidates.find((c) => !posted.has(c.relPath));

  if (!next) {
    console.error('No unposted photos remain across any configured gallery.');
    process.exit(1);
  }

  const gallery = galleries[next.slug];
  const dryRun = extraArgs.includes('--dry-run');

  console.log(`Next photo: ${next.relPath}`);

  const prompt = buildCaptionPrompt(gallery, next.relPath);
  const captionBody = execFileSync(CLAUDE_BIN, ['-p', prompt], { cwd: ROOT, encoding: 'utf8' }).trim();
  const caption = `${captionBody}\n\nSee the full gallery at Chasing Light Studio:\n${gallery.url}`;

  console.log(`Caption:\n${caption}\n`);

  const postArgs = [path.join(ROOT, 'social', 'post.mjs'), next.relPath, '--caption', caption, ...extraArgs];
  execFileSync('node', postArgs, { cwd: ROOT, stdio: 'inherit' });

  if (!dryRun) {
    posted.add(next.relPath);
    writeFileSync(POSTED_PATH, JSON.stringify([...posted].sort(), null, 2) + '\n');
    execFileSync('git', ['add', POSTED_PATH], { cwd: ROOT });
    execFileSync('git', ['commit', '-m', `Mark posted: ${next.relPath}`], { cwd: ROOT });
    execFileSync('git', ['push'], { cwd: ROOT });
    console.log(`Recorded ${next.relPath} as posted.`);
  }
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
