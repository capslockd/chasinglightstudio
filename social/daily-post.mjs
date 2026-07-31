#!/usr/bin/env node
// Rotates through galleries (round-robin, never repeating the gallery posted last time unless
// it's the only one with unposted photos left), picks the oldest not-yet-posted photo within
// whichever gallery is up next, asks Claude to look at the photo and write a caption in the
// voice of the photographer — the light, the mood, the technical read of the frame, not just a
// narration of what's happening — and posts it via post.mjs.
// Usage: node social/daily-post.mjs [--dry-run] [--fb-only|--ig-only]

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const GALLERIES_PATH = path.join(ROOT, 'social', 'galleries.json');
const POSTED_PATH = path.join(ROOT, 'social', 'posted.json');
const ROTATION_STATE_PATH = path.join(ROOT, 'social', 'rotation-state.json');
const IMG_ROOT = path.join(ROOT, 'assets', 'img');
const PHOTO_EXT = /\.(jpe?g|png|webp)$/i;

function loadJson(file, fallback) {
  if (!existsSync(file)) return fallback;
  return JSON.parse(readFileSync(file, 'utf8'));
}

// Oldest-unposted photo per gallery, keyed by gallery slug, in the order galleries.json lists them.
function listCandidatesByGallery(galleries, posted) {
  const byGallery = {};
  for (const slug of Object.keys(galleries)) {
    const fullDir = path.join(IMG_ROOT, slug, 'full');
    if (!existsSync(fullDir)) continue;
    const photos = readdirSync(fullDir)
      .filter((name) => PHOTO_EXT.test(name))
      .map((name) => {
        const abs = path.join(fullDir, name);
        return { slug, relPath: path.relative(ROOT, abs), mtimeMs: statSync(abs).mtimeMs };
      })
      .filter((c) => !posted.has(c.relPath))
      .sort((a, b) => a.mtimeMs - b.mtimeMs);
    if (photos.length) byGallery[slug] = photos;
  }
  return byGallery;
}

// Round-robins through the gallery order in galleries.json, starting just after whichever
// gallery was posted last, and returns the oldest unposted photo in the next gallery that still
// has one. Falls back to repeating the last gallery only when it's the sole one left.
function pickNext(galleries, posted, lastGallerySlug) {
  const gallerySlugs = Object.keys(galleries);
  const byGallery = listCandidatesByGallery(galleries, posted);
  const startIdx = lastGallerySlug ? gallerySlugs.indexOf(lastGallerySlug) : -1;
  for (let i = 1; i <= gallerySlugs.length; i++) {
    const slug = gallerySlugs[(startIdx + i + gallerySlugs.length) % gallerySlugs.length];
    if (byGallery[slug]) return byGallery[slug][0];
  }
  return null;
}

const CLAUDE_BIN = process.env.CLAUDE_BIN || 'claude';

function buildCaptionPrompt(gallery, relPath) {
  return `You are Chasing Light Studio's photographer, writing a single Instagram/Facebook caption about a photo you shot. Read the photo at "${relPath}" (relative to the repo root, current working directory) and look at it the way you'd talk about your own frame — not what's happening in the scene, but how it was shot and what makes it work as a photograph.

Context: this photo is from the "${gallery.title}" session.

Write a caption (3-5 sentences) grounded in the specific photographic craft of THIS frame:
- The light: where it's coming from, its quality (hard/soft, direct/diffused), color (warm gold, cool blue hour, neutral overcast), and what it's doing to the subject (rim light, falloff, catchlights, deep shadow, blown highlights kept intentional, etc). Only describe light you can actually see in the frame — don't invent a time of day or source you can't observe.
- The mood/feel that light and composition create together (intimate, cinematic, quiet, electric, etc) — earned from what's visible, not a generic adjective bolted on.
- One concrete technical or compositional read where it's genuinely visible in the image: shallow depth of field and where the bokeh falls, a silhouette, frozen vs. motion-blurred movement, negative space, framing/leading lines, a tight crop choice. Pick only what's actually observable — don't guess at camera settings you can't see evidence of.

Voice: a working photographer reflecting on their own shot — confident, specific, a little technical, never generic stock-caption language ("such a beautiful moment", "capturing memories"). Avoid simply narrating what the people are doing; the craft observation should be the spine of the caption, not a garnish on top of a play-by-play.

IMPORTANT: Do not name or assume the identity of anyone in the photo — you cannot actually tell who is who from a filename or gallery title, so never guess whose birthday it is, which person is "the couple," which face belongs to the client, etc. Refer to people generically and by what you can actually observe (e.g. "the birthday girl," "a guest," "the two of them," "the group") rather than by name or assumed relationship, unless a name is explicitly given to you in this prompt (none is here).

Do NOT end with a call-to-action or invitation to see the gallery — a "see the full gallery" line and link will be appended automatically after your text, so just end on the observation itself. Do not use markdown formatting or wrap the caption in quotation marks. A tasteful emoji or two is fine but don't overdo it. Output ONLY the caption text, nothing else — no preamble, no explanation.`;
}

async function main() {
  const extraArgs = process.argv.slice(2);

  const galleries = loadJson(GALLERIES_PATH, {});
  if (Object.keys(galleries).length === 0) {
    console.error(`No galleries configured in ${GALLERIES_PATH}`);
    process.exit(1);
  }

  const posted = new Set(loadJson(POSTED_PATH, []));
  const rotationState = loadJson(ROTATION_STATE_PATH, {});
  const next = pickNext(galleries, posted, rotationState.lastGallerySlug ?? null);

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
    writeFileSync(ROTATION_STATE_PATH, JSON.stringify({ lastGallerySlug: next.slug }, null, 2) + '\n');
    execFileSync('git', ['add', POSTED_PATH, ROTATION_STATE_PATH], { cwd: ROOT });
    execFileSync('git', ['commit', '-m', `Mark posted: ${next.relPath}`], { cwd: ROOT });
    execFileSync('git', ['push'], { cwd: ROOT });
    console.log(`Recorded ${next.relPath} as posted.`);
  }
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
