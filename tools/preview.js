/* Снимает превью самого сайта — посмотреть результат без браузера.
   Запуск (из корня проекта):
     PW_DIR="<путь к @playwright/mcp>" node tools/preview.js
   Кладёт картинки в _preview/ (служебная папка, в деплой не идёт). */

const fs = require('fs');
const path = require('path');

const PW = process.env.PW_DIR
  ? path.join(process.env.PW_DIR, 'node_modules', 'playwright')
  : 'playwright';
const { chromium } = require(PW);

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, '_preview');
const URL = 'file:///' + path.join(ROOT, 'index.html').replace(/\\/g, '/');

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ channel: 'chrome', args: ['--hide-scrollbars'] });

  for (const theme of ['dark', 'light']) {
    const ctx = await browser.newContext({
      viewport: { width: 1600, height: 1000 },
      deviceScaleFactor: 1,
      reducedMotion: 'reduce' // без анимаций появления: иначе половина блоков прозрачная
    });
    const page = await ctx.newPage();
    const errs = [];
    page.on('pageerror', e => errs.push(e.message));
    page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });

    await page.goto(URL, { waitUntil: 'load' });
    await page.evaluate(t => document.documentElement.setAttribute('data-theme', t), theme);
    await page.waitForTimeout(600);

    // Прогреваем lazy-картинки: без прокрутки они остаются пустыми на fullPage-снимке
    await page.evaluate(async () => {
      const h = document.body.scrollHeight;
      for (let y = 0; y < h; y += 500) { window.scrollTo(0, y); await new Promise(r => setTimeout(r, 90)); }
      window.scrollTo(0, 0);
    });
    await page.waitForLoadState('networkidle').catch(() => {});
    await page.waitForTimeout(500);

    await page.screenshot({ path: path.join(OUT, theme + '-top.jpg'), type: 'jpeg', quality: 86 });
    await page.screenshot({ path: path.join(OUT, theme + '-full.jpg'), type: 'jpeg', quality: 84, fullPage: true });

    // Крупные планы: шапка, последняя (широкая) карточка, контакты.
    // На общем снимке страницы их не разглядеть.
    for (const [name, sel] of [['hdr', '.hdr'], ['lead', '#projects .lead__h'],
                               ['wide', '#grid .card:last-child'], ['contact', '#contact']]) {
      const el = page.locator(sel).first();
      await el.scrollIntoViewIfNeeded().catch(() => {});
      await page.waitForTimeout(250);
      await el.screenshot({ path: path.join(OUT, theme + '-' + name + '.jpg'), type: 'jpeg', quality: 90 }).catch(() => {});
    }

    // Лайтбокс: подпись с главной кнопкой. Кнопка менялась по стилю,
    // а на общем снимке её не видно — модалка перекрывает страницу.
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.locator('#grid .card .card__shot').first().click().catch(() => {});
    await page.waitForTimeout(400);
    await page.locator('.lb__cap').screenshot({ path: path.join(OUT, theme + '-lightbox.jpg'), type: 'jpeg', quality: 90 }).catch(() => {});
    await page.keyboard.press('Escape').catch(() => {});
    await page.waitForTimeout(250);

    // Демо в окне монитора. Игра грузится из сети в iframe, поэтому ждём canvas:
    // без этого в кадр попадёт чёрное стекло. Но одного canvas мало — он появляется
    // сразу, а движок стартует позже, и в кадр попадает заставка «LOADING 1%».
    // Готовность движка видно по оболочке Godot: `#status` исчезает, когда
    // движок поднялся. Ждём именно этого, с запасом и без падения.
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(250);
    await page.locator('#grid .card').first().locator('a.is-primary').click().catch(() => {});
    await page.waitForTimeout(1200);
    const gameFrame = page.frames().find(f => f !== page.mainFrame() && /^https?:/.test(f.url()));
    if (gameFrame) await gameFrame.waitForSelector('canvas', { timeout: 30000 }).catch(() => {});
    if (gameFrame) {
      await gameFrame.waitForFunction(() => {
        const st = document.querySelector('#status');
        return !st || getComputedStyle(st).display === 'none';
      }, null, { timeout: 45000 }).catch(() => {});
    }
    await page.waitForTimeout(1200);
    await page.screenshot({ path: path.join(OUT, theme + '-demo.jpg'), type: 'jpeg', quality: 88 });
    await page.keyboard.press('Escape').catch(() => {});
    await page.waitForTimeout(300);

    // Меню раскрыто: оно позиционировано absolute и вылезает за .hdr,
    // поэтому снимаем не элемент, а верх вьюпорта
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(250);
    await page.click('#logoBtn').catch(() => {});
    await page.waitForTimeout(350);
    await page.screenshot({ path: path.join(OUT, theme + '-menu.jpg'), type: 'jpeg', quality: 90 });
    await page.keyboard.press('Escape').catch(() => {});
    await page.waitForTimeout(200);

    // мобильный вид. Снимаем фокус: после Escape он возвращается на кнопку меню
    // и в кадре остаётся обводка :focus-visible — для «как выглядит на телефоне» это шум.
    await page.evaluate(() => { if (document.activeElement) document.activeElement.blur(); });
    await page.setViewportSize({ width: 420, height: 900 });
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(OUT, theme + '-mobile.jpg'), type: 'jpeg', quality: 86 });

    console.log(theme + ': снято' + (errs.length ? '  ОШИБКИ: ' + errs.join(' | ') : '  ошибок нет'));
    await ctx.close();
  }

  await browser.close();
})();
