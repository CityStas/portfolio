/* Рендерит og:image 1200×630 из tools/og.html в assets/img/og.jpg.
   Запуск (из корня проекта):
     PW_DIR="<путь к @playwright/mcp>" node tools/og.js
   Картинку в og.html править под себя: имя, роль, подпись и три превью внизу. */

const fs = require('fs');
const path = require('path');

const PW = process.env.PW_DIR
  ? path.join(process.env.PW_DIR, 'node_modules', 'playwright')
  : 'playwright';
const { chromium } = require(PW);

const ROOT = path.resolve(__dirname, '..');
const SRC = 'file:///' + path.join(ROOT, 'tools', 'og.html').replace(/\\/g, '/');
const OUT = path.join(ROOT, 'assets', 'img', 'og.jpg');

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', args: ['--hide-scrollbars'] });
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });

  const errs = [];
  page.on('pageerror', e => errs.push(e.message));

  await page.goto(SRC, { waitUntil: 'load' });
  await page.evaluate(() => Promise.all(
    Array.from(document.images).map(i => i.complete ? null : i.decode().catch(() => null))
  ));
  await page.waitForTimeout(400);

  await page.screenshot({ path: OUT, type: 'jpeg', quality: 90 });
  await browser.close();

  console.log('og.jpg: ' + Math.round(fs.statSync(OUT).size / 1024) + ' KB, 1200x630' +
              (errs.length ? '  ОШИБКИ: ' + errs.join(' | ') : ''));
})();
