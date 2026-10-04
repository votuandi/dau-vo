import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, stat, rm, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { test } from 'node:test';
import { JSDOM } from 'jsdom';
import { normalizeStaticPermissions } from './static-permissions.mjs';

test('restrictive public-file permissions are normalized for nginx workers', async () => {
  const fixture = await mkdtemp(join(tmpdir(), 'dau-vo-static-'));
  try {
    await mkdir(join(fixture, 'assets'), { mode: 0o700 });
    await writeFile(join(fixture, 'assets', 'logo.webp'), 'image', { mode: 0o600 });
    await normalizeStaticPermissions(fixture);
    assert.equal((await stat(fixture)).mode & 0o777, 0o755);
    assert.equal((await stat(join(fixture, 'assets'))).mode & 0o777, 0o755);
    assert.equal((await stat(join(fixture, 'assets', 'logo.webp'))).mode & 0o777, 0o644);
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});

test('homepage is crawlable without JavaScript, with consistent SEO and readable assets', async () => {
  const html = await readFile('dist/index.html', 'utf8');
  const document = new JSDOM(html).window.document;
  assert.equal(document.querySelectorAll('h1').length, 1);
  assert.match(document.querySelector('h1').textContent, /chấm điểm võ thuật và võ gậy/);
  for (const keyword of [
    'võ gậy',
    'chấm điểm võ thuật',
    'chấm điểm võ gậy',
    'thi đấu võ thuật',
    'thi đấu võ gậy',
  ]) {
    assert.ok(document.body.textContent.includes(keyword), `Missing visible topic: ${keyword}`);
  }
  assert.equal(document.querySelector('meta[name="robots"]').content, 'index, follow');
  assert.equal(document.querySelectorAll('link[rel="canonical"]').length, 1);
  const canonical = document.querySelector('link[rel="canonical"]').href;
  const structured = JSON.parse(
    document.querySelector('script[type="application/ld+json"]').textContent,
  );
  assert.equal(structured['@graph'][0].url, canonical);
  assert.match(await readFile('dist/sitemap.xml', 'utf8'), new RegExp(`<loc>${canonical}</loc>`));
  assert.ok(
    (await readFile('dist/robots.txt', 'utf8')).includes(`Sitemap: ${canonical}sitemap.xml`),
  );
  assert.ok(document.querySelector('a[href="/workspace"]'));
  for (const image of document.querySelectorAll('img')) {
    assert.ok((await stat(join('dist', image.getAttribute('src')))).isFile());
  }
  async function checkModes(directory) {
    assert.equal((await stat(directory)).mode & 0o777, 0o755);
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) await checkModes(path);
      else assert.equal((await stat(path)).mode & 0o777, 0o644, path);
    }
  }
  await checkModes('dist');
  const shell = new JSDOM(await readFile('dist/app.html', 'utf8')).window.document;
  assert.equal(shell.querySelector('meta[name="robots"]').content, 'noindex, follow');
  assert.equal(shell.querySelector('link[rel="canonical"]'), null);
  assert.equal(shell.querySelector('#root').childElementCount, 0);
});
