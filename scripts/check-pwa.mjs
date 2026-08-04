#!/usr/bin/env node
/**
 * Перевірка артефактів PWA у зібраному dist:
 *  - index.html існує та містить посилання на скрипт;
 *  - manifest існує, валідний JSON, має icons/start_url/scope;
 *  - усі іконки з manifest фізично присутні;
 *  - service worker (sw.js) згенеровано.
 * Виходить з кодом 1 при будь-якій помилці.
 */
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const dist = process.argv[2] || 'dist';
const errors = [];
const ok = (m) => console.log(`  ✓ ${m}`);
const fail = (m) => { errors.push(m); console.log(`  ✗ ${m}`); };

console.log(`Перевірка PWA у «${dist}»:`);

if (!existsSync(dist)) {
  console.error(`Каталог ${dist} не знайдено. Спочатку виконайте build.`);
  process.exit(1);
}

// index.html
const indexPath = join(dist, 'index.html');
if (existsSync(indexPath)) {
  const html = readFileSync(indexPath, 'utf8');
  ok('index.html присутній');
  if (/<script[^>]+src=/.test(html)) ok('index.html підключає скрипт'); else fail('index.html без <script src>');
  if (/manifest/i.test(html)) ok('index.html посилається на manifest'); else fail('index.html без manifest');
} else fail('index.html відсутній');

// manifest
const manifestName = readdirSync(dist).find((f) => /manifest\.webmanifest$|manifest\.json$/.test(f));
if (manifestName) {
  ok(`manifest знайдено: ${manifestName}`);
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(join(dist, manifestName), 'utf8'));
    ok('manifest — валідний JSON');
  } catch {
    fail('manifest не є валідним JSON');
  }
  if (manifest) {
    for (const key of ['name', 'short_name', 'start_url', 'scope', 'icons', 'display']) {
      if (manifest[key] != null) ok(`manifest.${key} присутній`); else fail(`manifest.${key} відсутній`);
    }
    if (manifest.lang !== 'uk') fail(`manifest.lang має бути 'uk' (зараз: ${manifest.lang})`); else ok("manifest.lang = 'uk'");
    for (const icon of manifest.icons || []) {
      const p = join(dist, icon.src.replace(/^\.?\//, ''));
      const base = manifest.scope && manifest.scope !== '/' ? manifest.scope.replace(/^\//, '') : '';
      const alt = join(dist, base, icon.src.replace(/^\.?\//, ''));
      if (existsSync(p) || existsSync(alt)) ok(`іконка присутня: ${icon.src}`); else fail(`іконка відсутня: ${icon.src}`);
    }
  }
} else fail('manifest не знайдено');

// service worker
if (existsSync(join(dist, 'sw.js'))) ok('service worker (sw.js) присутній'); else fail('sw.js відсутній');
if (existsSync(join(dist, 'registerSW.js'))) ok('registerSW.js присутній');

if (errors.length) {
  console.error(`\n❌ Помилок: ${errors.length}`);
  process.exit(1);
}
console.log('\n✅ PWA-артефакти в порядку.');
