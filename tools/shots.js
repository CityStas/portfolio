/* Снимает превью проектов для портфолио.
   Запуск (из корня проекта):
     PW_DIR="<путь к @playwright/mcp>" node tools/shots.js
   Свои браузеры не качаем: используем установленный Google Chrome как канал. */

const fs = require('fs');
const path = require('path');

// playwright берём из пакета @playwright/mcp — отдельная установка не нужна
const PW = process.env.PW_DIR
  ? path.join(process.env.PW_DIR, 'node_modules', 'playwright')
  : 'playwright';
const { chromium } = require(PW);

const OUT = path.resolve(__dirname, '..', 'assets', 'img', 'projects');

// wait   — сколько ждать после загрузки, мс
// keys   — что нажать, чтобы дойти до геймплея
// clicks — клики по координатам (кнопки внутри canvas не находятся селектором)
// look   — поворот камеры протяжкой мыши: [dx, dy]
// walk   — сколько миллисекунд идти вперёд (W)
// scroll — прокрутить перед снимком
// scrollTo — прокрутить до абсолютной Y (для липких шапок важнее, чем wheel)
// clip   — { x, y, width, height }: снимок области, а не всей страницы
// scale  — deviceScaleFactor (по умолчанию 1)
const SITES = [
  { slug: 'shrooms',     url: 'https://deddemo.vercel.app/',      wait: 20000, keys: [], clicks: [[800, 655]], look: null, walk: 0, scroll: 0 },
  { slug: 'bubblepeaks', url: 'https://bubblepeaks.vercel.app/',  wait: 22000, keys: ['Enter', 'Space'], clicks: [], look: null, walk: 0, scroll: 0 },
  { slug: 'lilcraft',    url: 'https://lilcraft.vercel.app/',     wait: 9000,  keys: [], clicks: [[100, 878]], look: null, walk: 0, scroll: 0 },
  { slug: 'bazaskate',   url: 'https://bazaskate.shop/',          wait: 7000,  keys: [], clicks: [], look: null, walk: 0, scroll: 0 },
  { slug: 'dubbed',      url: 'https://dubbedru.vercel.app/',     wait: 7000,  keys: [], clicks: [], look: null, walk: 0, scroll: 0 },

  // ORFree AI в портфолио показывается страницей RuStore, а не веб-версией:
  // именно RuStore — основной канал. Правую колонку RuStore прячем (иначе в кадр
  // лезет «Полезные инструменты»), клип 1083x677 = ровно 16/10 под карточку,
  // scrollTo 12 подтягивает полосу скриншотов в кадр целиком.
  { slug: 'rustore',     url: 'https://www.rustore.ru/catalog/app/com.orfree.app',
    wait: 7000, keys: [], clicks: [], look: null, walk: 0, scroll: 0,
    scrollTo: 12, hideSidebar: true,
    clip: { x: 24, y: 0, width: 1083, height: 677 }, scale: 1.2 }
];

// node tools/shots.js shrooms lilcraft — снять только указанные
const only = process.argv.slice(2);

(async () => {
  fs.mkdirSync(OUT, { recursive: true });

  const browser = await chromium.launch({
    channel: 'chrome',
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--hide-scrollbars']
  });

  for (const s of SITES) {
    if (only.length && only.indexOf(s.slug) === -1) continue;

    const ctx = await browser.newContext({
      viewport: { width: 1600, height: 1000 },
      deviceScaleFactor: s.scale || 1,
      locale: 'ru-RU',
      reducedMotion: 'no-preference'
    });
    const page = await ctx.newPage();
    const file = path.join(OUT, s.slug + '.jpg');

    try {
      process.stdout.write(s.slug.padEnd(12) + ' открываю... ');
      await page.goto(s.url, { waitUntil: 'load', timeout: 60000 });
      await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {});
      await page.waitForTimeout(s.wait);

      for (const k of s.keys) {
        await page.keyboard.press(k).catch(() => {});
        await page.waitForTimeout(2500);
      }
      for (const c of s.clicks) {
        await page.mouse.click(c[0], c[1]).catch(() => {});
        await page.waitForTimeout(9000);
      }
      if (s.look) {
        await page.mouse.move(800, 500);
        await page.mouse.down();
        await page.mouse.move(800 + s.look[0], 500 + s.look[1], { steps: 24 });
        await page.mouse.up();
        await page.waitForTimeout(1200);
      }
      if (s.walk) {
        await page.keyboard.down('w');
        await page.waitForTimeout(s.walk);
        await page.keyboard.up('w');
        await page.waitForTimeout(1500);
      }
      if (s.scroll) {
        await page.mouse.wheel(0, s.scroll);
        await page.waitForTimeout(1500);
      }
      if (s.scrollTo != null) {
        await page.evaluate(y => window.scrollTo(0, y), s.scrollTo);
        await page.waitForTimeout(1500);
      }

      // RuStore: правая колонка («Полезные инструменты») — сосед основного контента
      // в grid. Классы там хешированные и меняются между сборками, поэтому ищем по геометрии.
      if (s.hideSidebar) {
        await page.evaluate(() => {
          for (const n of document.querySelectorAll('main div')) {
            const r = n.getBoundingClientRect();
            if (r.left > 900 && r.width > 300 && r.width < 520 && r.height > 300) {
              n.style.display = 'none';
            }
          }
        });
        await page.waitForTimeout(600);
      }

      const shot = { path: file, type: 'jpeg', quality: 88 };
      if (s.clip) shot.clip = s.clip;
      await page.screenshot(shot);
      const kb = Math.round(fs.statSync(file).size / 1024);
      console.log('ok  ' + path.basename(file) + '  ' + kb + ' KB');
    } catch (e) {
      console.log('FAIL ' + e.message.split('\n')[0]);
    } finally {
      await ctx.close();
    }
  }

  await browser.close();
})();
