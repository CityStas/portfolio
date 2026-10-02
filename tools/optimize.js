/* Пережимает превью проектов через canvas в Chrome.
   Запуск (из корня проекта):
     PW_DIR="<путь к @playwright/mcp>" node tools/optimize.js [ширина] [качество] [slug...]
   По умолчанию 1600 px / q80, все файлы. Последние аргументы — имена без .webp,
   чтобы пережать только их: node tools/optimize.js 1280 82 rustore

   Превью лежат в WebP (см. assets/img/projects). canvas.toDataURL('image/webp', q)
   в Chrome даёт lossy WebP - то же, что и Pillow с quality. Для плотных
   детализированных кадров (shrooms) WebP почти не выигрывает у JPEG: экономия
   зависит от картинки, а не от формата как такового.

   ВНИМАНИЕ: файлы перезаписываются на месте. Откат — переснять заново:
     PW_DIR=... node tools/shots.js
   Каждый файл перезаписывается только если стал меньше исходного. */

const fs = require('fs');
const path = require('path');

const PW = process.env.PW_DIR
  ? path.join(process.env.PW_DIR, 'node_modules', 'playwright')
  : 'playwright';
const { chromium } = require(PW);

const DIR = path.resolve(__dirname, '..', 'assets', 'img', 'projects');
const MAXW = parseInt(process.argv[2], 10) || 1600;
const Q = (parseInt(process.argv[3], 10) || 80) / 100;
const ONLY = process.argv.slice(4);

(async () => {
  const files = fs.readdirSync(DIR)
    .filter(f => f.endsWith('.webp') && !f.includes('.orig.'))
    .filter(f => !ONLY.length || ONLY.indexOf(f.replace(/\.webp$/, '')) !== -1);
  const browser = await chromium.launch({ channel: 'chrome' });
  const page = await browser.newPage();
  await page.goto('about:blank');

  let before = 0, after = 0;

  for (const f of files) {
    const full = path.join(DIR, f);
    const src = 'data:image/webp;base64,' + fs.readFileSync(full).toString('base64');
    const was = fs.statSync(full).size;

    // data:URL не пачкает canvas, file:// — пачкает (toDataURL упадёт на SecurityError)
    const out = await page.evaluate(async ({ src, maxw, q }) => {
      const img = new Image();
      img.src = src;
      await img.decode();
      const k = Math.min(1, maxw / img.naturalWidth);
      const c = document.createElement('canvas');
      c.width = Math.round(img.naturalWidth * k);
      c.height = Math.round(img.naturalHeight * k);
      const ctx = c.getContext('2d');
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, c.width, c.height);
      return { url: c.toDataURL('image/webp', q), w: c.width, h: c.height };
    }, { src, maxw: MAXW, q: Q });

    const buf = Buffer.from(out.url.split(',')[1], 'base64');
    before += was; after += buf.length;

    const kb = n => Math.round(n / 1024) + ' KB';
    if (buf.length < was) {
      fs.writeFileSync(full, buf);
      console.log(f.padEnd(20) + kb(was).padStart(8) + '  ->  ' + kb(buf.length).padStart(8) +
                  '   ' + out.w + 'x' + out.h + '  -' + Math.round((1 - buf.length / was) * 100) + '%');
    } else {
      console.log(f.padEnd(20) + kb(was).padStart(8) + '  оставлен как есть');
    }
  }

  await browser.close();
  console.log('\nвсего: ' + Math.round(before / 1024) + ' KB -> ' + Math.round(after / 1024) + ' KB');
})();
