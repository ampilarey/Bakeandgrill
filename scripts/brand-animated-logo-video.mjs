#!/usr/bin/env node
// Video and GIF versions of the logo with moving flames, for places that cannot
// play an SVG: Facebook, Instagram, TikTok, WhatsApp, screens (owner, 2026-10-07).
//
//   node scripts/brand-animated-logo-video.mjs [outdir]
//
// Needs Playwright's Chromium (CHROMIUM_PATH to override) and ffmpeg with libx264
// and libvpx-vp9. Renders backend/public/brand/logo-animated(-dark).svg frame by
// frame (the CSS and SMIL clocks stepped together), then crossfades the last half
// second into the first so each clip loops without a jump.
import { mkdirSync, readFileSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(join(ROOT, 'package.json'));
const { chromium } = require('playwright');
const OUT = process.argv[2] || join(ROOT, 'brand-video-out');
const FPS = 30, SECONDS = 10, FADE = 15, SIZE = 1080;
const CREAM = '#F8F6F3', DARK = '#1C1408';
const TMP = join(OUT, '.frames');

async function frames(svgFile, background, dir) {
  mkdirSync(dir, { recursive: true });
  const svg = readFileSync(join(ROOT, 'backend/public/brand', svgFile), 'utf8')
    .replace('<svg ', `<svg width="${SIZE}" height="${SIZE}" `)
    // the logo (bbox x 245-835, y 76-1004) centred at about 72% of the frame height
    .replace(/viewBox="[^"]+"/, 'viewBox="-105 -105 1290 1290"');
  const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  const page = await browser.newPage({ viewport: { width: SIZE, height: SIZE } });
  await page.setContent(`<style>html,body{margin:0;background:${background}}</style>${svg}`);
  await page.evaluate(() => {
    document.querySelector('svg').pauseAnimations();
    for (const a of document.getAnimations()) a.pause();
  });
  const n = FPS * SECONDS + FADE;
  for (let i = 0; i < n; i++) {
    const t = (i * 1000) / FPS;
    await page.evaluate((ms) => {
      document.querySelector('svg').setCurrentTime(ms / 1000);
      for (const a of document.getAnimations()) a.currentTime = ms;
    }, t);
    await page.screenshot({ path: join(dir, `${String(i).padStart(4, '0')}.png`), omitBackground: background === 'transparent' });
  }
  await browser.close();
}

const ff = (...args) => execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], { stdio: 'inherit' });

// The clip: frames FADE.. as they are, the first FADE frames blended with the
// overflow so the end runs straight into the start.
function looped(dir, codecArgs, out, extraFilter = '') {
  const n = FPS * SECONDS;
  const filter =
    `[0:v]split[a][b];[a]trim=start_frame=${n}:end_frame=${n + FADE},setpts=PTS-STARTPTS[tail];` +
    `[b]trim=end_frame=${n},setpts=PTS-STARTPTS[body];` +
    `[body]split[h][r];[h]trim=end_frame=${FADE},setpts=PTS-STARTPTS[head];[r]trim=start_frame=${FADE},setpts=PTS-STARTPTS[rest];` +
    `[tail][head]blend=all_expr='A*(1-N/${FADE})+B*(N/${FADE})'[mix];[mix][rest]concat=n=2:v=1[v]` +
    (extraFilter ? `;[v]${extraFilter}[o]` : '');
  ff('-framerate', String(FPS), '-i', join(dir, '%04d.png'), '-filter_complex', filter, '-map', extraFilter ? '[o]' : '[v]', ...codecArgs, out);
}

mkdirSync(OUT, { recursive: true });
const h264 = ['-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '18', '-preset', 'slow', '-movflags', '+faststart'];
for (const [name, file, bg] of [['light', 'logo-animated.svg', CREAM], ['dark', 'logo-animated-dark.svg', DARK]]) {
  const dir = join(TMP, name);
  await frames(file, bg, dir);
  looped(dir, h264, join(OUT, `logo-animated-${name}-square.mp4`));
  looped(dir, h264, join(OUT, `logo-animated-${name}-story.mp4`), `pad=1080:1920:0:420:color=${bg.replace('#', '0x')}`);
}
// GIF (WhatsApp, email, forums): the looped light clip at 480 px, 15 fps, its own palette.
ff('-i', join(OUT, 'logo-animated-light-square.mp4'), '-vf',
  'fps=15,scale=480:-1:flags=lanczos,split[s0][s1];[s0]palettegen=max_colors=128[p];[s1][p]paletteuse=dither=bayer:bayer_scale=4',
  join(OUT, 'logo-animated.gif'));
// See-through (VP9 with alpha) for video editors and websites.
await frames('logo-animated.svg', 'transparent', join(TMP, 'alpha'));
looped(join(TMP, 'alpha'), ['-c:v', 'libvpx-vp9', '-pix_fmt', 'yuva420p', '-b:v', '0', '-crf', '30', '-auto-alt-ref', '0'], join(OUT, 'logo-animated-transparent.webm'));
rmSync(TMP, { recursive: true, force: true });
console.log('written to', OUT);
