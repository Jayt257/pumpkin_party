// Regenerates pre-rendered art from the game itself: logo, loading screen and level thumbnails.
// Needs the dev server running. Usage: node scripts/make-art.mjs [logo] [loading] [thumbs]
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';

const base = process.env.BASE || 'http://127.0.0.1:5173';
const which = process.argv.slice(2);
const want = (k) => !which.length || which.includes(k);
const out = 'public/art';
const tmp = 'shots/art_tmp';
mkdirSync(out, { recursive: true }); mkdirSync(tmp, { recursive: true });
const b = await chromium.launch({ headless: true, channel: 'chromium', args: ['--use-angle=vulkan', '--enable-features=Vulkan', '--ignore-gpu-blocklist'] });

const webp = (from, to, q = 82, size = null) => {
  const args = [from];
  if (size) args.push('-resize', size);
  args.push('-quality', String(q), '-define', 'webp:method=6', to);
  execFileSync('magick', args);
};

if (want('logo')) {
  const p = await b.newPage({ viewport: { width: 1500, height: 1000 } });
  p.on('pageerror', (e) => console.log('logo error', e.message));
  await p.goto(`${base}/art.html`);
  await p.waitForFunction('window.__logo===true || window.__logoErr', { timeout: 60000 });
  await p.locator('#logo').screenshot({ path: `${tmp}/logo.png`, omitBackground: true });
  execFileSync('magick', [`${tmp}/logo.png`, '-trim', '+repage', `${tmp}/logo_t.png`]);
  webp(`${tmp}/logo_t.png`, `${out}/logo.webp`, 88, '900x');
  await p.close();
  console.log('logo done');
}

const openGame = async (w, h, url) => {
  const p = await b.newPage({ viewport: { width: w, height: h } });
  await p.route('https://sdk.crazygames.com/**', (r) => r.abort());
  p.on('pageerror', (e) => console.log('page error', e.message));
  await p.goto(`${base}${url}`, { waitUntil: 'domcontentloaded' });
  await p.waitForFunction('window.__ready===true', { timeout: 90000 });
  return p;
};

if (want('loading')) {
  const p = await openGame(1280, 720, '/?menu=1&tier=high');
  await p.evaluate(() => {
    const a = window.__app;
    a.ui.clear();
    document.getElementById('ui').style.display = 'none';
    a.menu.setMode('title', { instant: true });
  });
  await p.waitForTimeout(1800);
  await p.screenshot({ path: `${tmp}/loading.png` });
  webp(`${tmp}/loading.png`, `${out}/loading.webp`, 72);
  await p.close();
  console.log('loading done');
}

if (want('thumbs')) {
  const shots = {
    pumpkinDash: { url: 'level=pumpkinDash&t=4&pz=-30' },
    ghostChase: { url: 'level=ghostChase&t=3.2&pz=-16' },
    hauntedFloor: { url: 'level=hauntedFloor&t=1.5' },
    witchsPlatform: { url: 'level=witchsPlatform&t=1' },
    pumpkinRoll: { url: 'level=pumpkinRoll&t=4&pz=-20&py=2.8' },
    finalShowdown: { url: 'level=finalShowdown&t=1' },
  };
  for (const [id, o] of Object.entries(shots)) {
    const p = await b.newPage({ viewport: { width: 640, height: 360 } });
    p.on('pageerror', (e) => console.log(id, e.message));
    await p.goto(`${base}/lab.html?view=level&${o.url}`, { waitUntil: 'domcontentloaded' });
    await p.waitForFunction('window.__ready===true', { timeout: 90000 });
    await p.waitForTimeout(500);
    await p.screenshot({ path: `${tmp}/th_${id}.png` });
    webp(`${tmp}/th_${id}.png`, `${out}/th_${id}.webp`, 74, '480x');
    await p.close();
    console.log('thumb', id);
  }
}
await b.close();
rmSync(tmp, { recursive: true, force: true });
