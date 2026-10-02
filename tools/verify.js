/* Проверка сайта в живом Chrome — то, что jsdom не покажет:
   реальная вёрстка, overflow, клики, лайтбокс, ошибки в консоли.
   Запуск (из корня проекта):
     PW_DIR="<путь к @playwright/mcp>" node tools/verify.js
     VERIFY_URL=http://localhost:8777/ PW_DIR=... node tools/verify.js   # как в проде
   Выход 0 — всё зелёное.

   По умолчанию проверяем через file://, но сайт живёт по HTTP — это разные режимы.
   Хотя бы раз стоит прогнать с VERIFY_URL на локальном сервере.

   Почему файлом, а не `node -e`: инлайновые скрипты в этой среде падают на fs-шиме
   хоста (cli/vendor/shim/node-brokered-fs-shim.cjs, toAbsPath). */

const fs = require('fs');
const path = require('path');
const { URL: NodeURL } = require('url');

const PW = process.env.PW_DIR
  ? path.join(process.env.PW_DIR, 'node_modules', 'playwright')
  : 'playwright';
const { chromium } = require(PW);

const ROOT = path.resolve(__dirname, '..');
const URL = process.env.VERIFY_URL ||
  'file:///' + path.join(ROOT, 'index.html').replace(/\\/g, '/');
const OVER_HTTP = /^https?:/.test(URL);
console.log('проверяем: ' + URL + (OVER_HTTP ? '  (HTTP, как в проде)' : '  (file://)'));

let bad = 0;
function check(name, got, expected) {
  const ok = got === expected;
  if (!ok) bad++;
  console.log((ok ? 'OK   ' : 'FAIL ') + name + ': ' + got + (ok ? '' : ' (ожидалось ' + expected + ')'));
}

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', args: ['--hide-scrollbars'] });

  for (const theme of ['dark', 'light']) {
    const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 }, reducedMotion: 'reduce' });
    const page = await ctx.newPage();

    const errs = [];
    page.on('pageerror', e => errs.push('pageerror: ' + e.message));
    page.on('console', m => {
      if (m.type() !== 'error') return;
      const t = m.text();
      // Игры уехали на /games/<slug>/ и стали same-origin, поэтому консоль игры
      // теперь видна родителю. Godot в headless Chrome не поднимает
      // AudioWorklet — в живом браузере со звуком это не ошибка.
      if (/Failed to create PositionWorklet/.test(t)) return;
      errs.push('console: ' + t);
    });
    page.on('requestfailed', r => {
      const u = r.url();
      const why = (r.failure() || {}).errorText || '';
      // Отмена — не ошибка. Браузер рвёт запросы, когда iframe демо удаляют
      // (а игра в этот момент ещё грузится), и часть своих же запросов на file://.
      if (/ERR_ABORTED/.test(why)) return;
      if (/^https?:/.test(u)) errs.push('requestfailed: ' + u + ' (' + why + ')');
    });

    await page.goto(URL, { waitUntil: 'load' });
    await page.evaluate(t => document.documentElement.setAttribute('data-theme', t), theme);
    await page.waitForTimeout(500);

    console.log('\n=== ' + theme + ' ===');

    // Прогрев lazy-картинок: без прокрутки всё, кроме первых двух, ещё не грузилось
    await page.evaluate(async () => {
      const h = document.body.scrollHeight;
      for (let y = 0; y < h; y += 500) { window.scrollTo(0, y); await new Promise(r => setTimeout(r, 90)); }
      window.scrollTo(0, 0);
    });
    await page.waitForLoadState('networkidle').catch(() => {});
    await page.waitForTimeout(400);

    // Ожидания берём из данных, а не литералами: контент правят часто
    const data = await page.evaluate(() => ({
      role: window.SITE.role,
      count: window.PROJECTS.length,
      // Только проекты с демо-ссылкой: главная кнопка есть лишь у них, и список
      // подписей должен совпадать с тем, что реально нашлось на странице.
      labels: window.PROJECTS.filter(p => (p.links || {}).demo).map(p => (p.links || {}).demoLabel || null)
    }));

    check('h1 совпадает с SITE.role', await page.locator('h1.lead__h').innerText(), data.role);
    check('карточек', await page.locator('#grid .card').count(), data.count);
    check('превью загрузились',
          await page.evaluate(() => Array.from(document.querySelectorAll('#grid .card__shot img'))
            .every(i => i.complete && i.naturalWidth > 0)), true);
    // document.fonts.check() врёт: он возвращает true и на пустом наборе шрифтов,
    // и когда подгруппа в статусе error. Смотрим на сами FontFace.
    check('шрифт Handjet: обе подгруппы загружены',
          await page.evaluate(async () => {
            await document.fonts.ready;
            const used = Array.from(document.fonts)
              .filter(f => f.family.replace(/['"]/g, '') === 'Handjet' && f.status !== 'unloaded');
            return used.filter(f => f.status === 'loaded').length + ' из ' + used.length;
          }), '2 из 2');

    // FOUT: подгруппы шрифта зашиты в CSS, значит отдельного запроса быть не должно.
    // resource timing на file:// подресурсы не пишет, поэтому проверка только по HTTP.
    // Саму подмену шрифта (и то, что первый кадр уже пиксельный) ловит tools/fout.js:
    // по ширине заголовка её не увидеть — при font-display: block раскладка считается
    // по системному шрифту, и ширина «до» и «после» совпадает.
    if (OVER_HTTP) {
      check('шрифт едет в CSS, отдельного запроса нет',
            await page.evaluate(() => performance.getEntriesByType('resource')
              .filter(r => /\.woff2?(\?|$)/.test(r.name))
              .map(r => r.name.split('/').pop()).join(', ') || 'запросов нет'), 'запросов нет');
    } else {
      console.log('     (file:// не пишет подресурсы в resource timing — проверка запроса только по HTTP)');
    }

    // Подписи главных кнопок: из данных, иначе — «Открыть сайт»
    const shown = await page.locator('#grid .card__links a.is-primary').allInnerTexts();
    check('подписи главных кнопок',
          shown.every((s, i) => s.trim() === (data.labels[i] || 'Открыть сайт')), true);

    // Сноска в описании. Абзац, начинающийся со «*», обязан стать отдельным
    // элементом .card__note и быть набран мельче основного текста — иначе
    // предупреждение в описании ORFree визуально сливается с описанием.
    // Проверка идёт по данным, а не по конкретному проекту: сноска может
    // появиться у любого, и тогда тест обязан её поймать.
    const notes = await page.evaluate(() => window.PROJECTS.map((p, i) => {
      const want = String(p.desc || '').split(/\n\s*\n/)
        .map(s => s.trim()).filter(s => s.charAt(0) === '*').length;
      const card = document.querySelectorAll('#grid .card')[i];
      const d = card && card.querySelector('.card__d');
      const n = card && card.querySelector('.card__note');
      return {
        title: p.title, want,
        got: card ? card.querySelectorAll('.card__note').length : -1,
        tag: n ? n.tagName : '',
        dSize: d ? parseFloat(getComputedStyle(d).fontSize) : 0,
        nSize: n ? parseFloat(getComputedStyle(n).fontSize) : 0
      };
    }));
    const withNote = notes.filter(x => x.want);
    check('сноска есть хотя бы у одного проекта', withNote.length > 0, true);
    check('сносок столько же, сколько абзацев со «*»',
          notes.every(x => x.want === x.got), true);
    check('сноска — это <small>', withNote.every(x => x.tag === 'SMALL'), true);
    check('сноска мельче основного текста',
          withNote.every(x => x.nSize > 0 && x.nSize < x.dSize), true);
    console.log('     ' + (withNote.map(x => x.title + ': ' + x.nSize + 'px против ' +
                x.dSize + 'px').join('; ') || 'сносок в данных нет'));

    // Та же сноска в лайтбоксе: #lbDesc — это <p>, и сноска обязана остаться
    // отдельным блоком, а не слипнуться с основным текстом в одну строку.
    const noteIdx = notes.findIndex(x => x.want);
    await page.locator('#grid .card').nth(noteIdx).locator('.card__shot').click();
    await page.waitForTimeout(300);
    const lbNote = await page.evaluate(() => {
      const p = document.getElementById('lbDesc');
      const n = p && p.querySelector('.card__note');
      return {
        count: p ? p.querySelectorAll('.card__note').length : -1,
        display: n ? getComputedStyle(n).display : '',
        size: n ? parseFloat(getComputedStyle(n).fontSize) : 0,
        text: p ? p.textContent.replace(/\s+/g, ' ').trim().slice(0, 40) : ''
      };
    });
    check('в лайтбоксе сноска отдельным блоком', lbNote.count === 1 && lbNote.display === 'block', true);
    check('в лайтбоксе сноска мельче', lbNote.size > 0 && lbNote.size < 16, true);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(250);

    // Меню разделов. На широком экране (1600px) пункты стоят в шапке открыто,
    // выпадающей панели там нет — это и проверяем: меню видно, оно внутри
    // строки шапки и позиционировано в потоке, а не всплывает поверх страницы.
    const navInline = await page.evaluate(() => {
      const nav = document.getElementById('navMenu');
      const hdr = document.querySelector('.hdr');
      if (!nav || !hdr) return null;
      const nb = nav.getBoundingClientRect();
      const hb = hdr.getBoundingClientRect();
      return {
        visible: nb.width > 0 && nb.height > 0,
        inHeader: nb.top >= hb.top - 1 && nb.bottom <= hb.bottom + 1,
        pos: getComputedStyle(nav).position,
        labels: Array.from(nav.querySelectorAll('a')).map(a => a.textContent.trim()).join(' / ')
      };
    });
    check('меню в шапке видно', navInline.visible, true);
    check('меню умещается в строке шапки', navInline.inHeader, true);
    check('меню в потоке, а не выпадающая панель', navInline.pos, 'static');
    check('подписи пунктов меню', navInline.labels, 'Проекты / О себе / Контакты');

    // Клик по имени на широком экране уводит наверх, а не раскрывает список.
    await page.evaluate(() => window.scrollTo(0, 1200));
    await page.waitForTimeout(250);
    await page.click('#logoBtn');
    await page.waitForFunction(() => window.scrollY < 40, null, { timeout: 3000 }).catch(() => {});
    check('клик по имени вернул наверх', await page.evaluate(() => window.scrollY < 40), true);
    // Самая хрупкая часть: скрипт ставит hidden, а CSS на широком экране его
    // перебивает. Если порядок правил в style.css поедет, меню исчезнет молча.
    check('hidden выставлен, но CSS его перебивает', await page.evaluate(() => {
      const nav = document.getElementById('navMenu');
      return nav.hasAttribute('hidden') && nav.getBoundingClientRect().height > 0;
    }), true);

    // Переход по пункту меню
    await page.click('#navMenu a[href="#about"]');
    await page.waitForTimeout(500);
    check('перешли к «О себе»', await page.evaluate(() => {
      const r = document.getElementById('about').getBoundingClientRect();
      // «О себе» — последняя секция: у нижней границы прокрутки она встаёт не
      // к самому верху окна, а как влезло. Поэтому сверяем с половиной экрана,
      // а не с жёстким отступом: тот зависел от высоты страницы и ломался от
      // любой правки в блоке (убрали список фактов — отступ уехал).
      return r.top > -200 && r.top < window.innerHeight / 2;
    }), true);

    // Чипы-фильтры по тематике: набор считается из данных (тема = kind, у
    // мультитемы — элементы themes), поэтому тест не привязан к числу проектов.
    const themes = await page.evaluate(() => {
      const out = [];
      window.PROJECTS.forEach(p => (p.themes && p.themes.length ? p.themes : [p.kind])
        .forEach(t => { if (out.indexOf(t) === -1) out.push(t); }));
      return out;
    });
    const themed = t => page.evaluate(x => window.PROJECTS
      .filter(p => (p.themes && p.themes.length ? p.themes : [p.kind]).indexOf(x) !== -1).length, t);

    await page.evaluate(() => window.scrollTo(0, 0));
    check('чипов-фильтров (+ «Все»)', await page.locator('#filters .fchip').count(), themes.length + 1);
    check('видны все карточки', await page.locator('#grid .card:visible').count(), data.count);

    // Порядок чипов фиксирован списком THEME_ORDER в данных, а не порядком
    // карточек. Проверяем литералом: это решение о продукте, а не производная
    // от данных, поэтому новый тип проекта должен уронить тест и заставить
    // вписать себя в порядок осознанно.
    check('порядок чипов',
          (await page.evaluate(() => Array.from(document.querySelectorAll('#filters .fchip'))
            .map(b => b.textContent.trim()))).join(' / '),
          'Все / AI-проекты / Игры / Сайты / Расширения');

    await page.locator('#filters .fchip').nth(1).click();
    await page.waitForTimeout(300);
    check('фильтр скрыл карточки чужих тем',
          await page.locator('#grid .card:visible').count(), await themed(themes[0]));
    check('выбранный чип помечен',
          await page.locator('#filters .fchip').nth(1).getAttribute('aria-pressed'), 'true');
    check('чип «Все» снят',
          await page.locator('#filters .fchip').first().getAttribute('aria-pressed'), 'false');

    // Мультитема: проект из themes[] обязан находиться в каждом своём чипе.
    // Сейчас это Dubbed — расширение, которое работает поверх сайтов.
    const multi = await page.evaluate(() => {
      const p = window.PROJECTS.filter(x => x.themes && x.themes.length > 1)[0];
      return p ? { title: p.title, themes: p.themes } : null;
    });
    if (multi) {
      const label = {
        'Игра': 'Игры', 'Сайт': 'Сайты', 'AI-продукт': 'AI-проекты',
        'Расширение': 'Расширения', 'Инструмент': 'Инструменты'
      };
      for (const t of multi.themes) {
        await page.locator('#filters .fchip', { hasText: label[t] || t }).click();
        await page.waitForTimeout(250);
        const seen = await page.evaluate(title => Array.from(document.querySelectorAll('#grid .card'))
          .filter(c => !c.hidden && c.querySelector('.card__t').textContent.trim() === title).length,
          multi.title);
        check('«' + multi.title + '» виден в теме «' + (label[t] || t) + '»', seen, 1);
      }
    }

    await page.locator('#filters .fchip').first().click();
    await page.waitForTimeout(300);
    check('сброс фильтра показывает все карточки',
          await page.locator('#grid .card:visible').count(), data.count);

    // Контакты перенесены в «О себе» как текст. Секции #contact больше нет.
    check('секции #contact нет', await page.locator('#contact').count(), 0);
    check('контакты в «О себе» есть', await page.locator('.about__links a').count(), 2);

    // Превью не должно быть УЖЕ 16:10: тогда cover обрежет кадр по вертикали и
    // срежет содержимое — именно на узких кадрах ломалось дважды. Шире — нормально:
    // cover обрежет по бокам, а в лайтбоксе кадр виден целиком (object-fit: contain).
    const ratios = await page.evaluate(() => Array.from(
      document.querySelectorAll('#grid .card__shot img'),
      i => ({ src: i.getAttribute('src'), r: i.naturalWidth / i.naturalHeight })
    ));
    const offRatio = ratios.filter(x => x.r < 1.6 - 0.02);
    check('превью не уже 16:10', offRatio.map(x => x.src + ' = ' + x.r.toFixed(3)).join(', '), '');

    // Галерея в лайтбоксе: у проекта с shots снизу полоска кадров, превью карточки
    // при этом берётся из shot, а просмотр открывается на первом кадре галереи.
    // Идём по всем таким проектам: галерей уже две, вторая иначе осталась бы
    // без проверки в живом браузере.
    const gals = await page.evaluate(() => window.PROJECTS
      .map((p, i) => ({ i, title: p.title, shot: p.shot, shots: p.shots }))
      .filter(p => p.shots && p.shots.length > 1));

    for (const gal of gals) {
      const n = 'галерея «' + gal.title + '»: ';
      await page.locator('#grid .card').nth(gal.i).locator('.card__shot').click();
      await page.waitForTimeout(400);
      check(n + 'полоска кадров видна', await page.locator('#lbShots').isVisible(), true);
      check(n + 'кадров в полоске',
            await page.locator('#lbShots .lb__shot').count(), gal.shots.length);
      check(n + 'открылся первый кадр',
            await page.locator('#lbImg').getAttribute('src'), gal.shots[0]);
      check(n + 'shot есть среди кадров', gal.shots.indexOf(gal.shot) !== -1, true);
      await page.locator('#lbShots .lb__shot').nth(1).click();
      await page.waitForTimeout(400);
      check(n + 'клик по превью меняет кадр',
            await page.locator('#lbImg').getAttribute('src'), gal.shots[1]);
      check(n + 'выбранный кадр обведён',
            await page.locator('#lbShots .lb__shot').nth(1).getAttribute('aria-current'), 'true');
      // Кадр обязан влезать в окно: 66vh по высоте и ширина контейнера по ширине.
      const gb = await page.locator('#lbImg').boundingBox();
      check(n + 'кадр в пределах окна',
            !!gb && gb.height <= 1000 * 0.66 + 2 && gb.width <= 1600, true);
      await page.keyboard.press('Escape');
      await page.waitForTimeout(300);
      check(n + 'лайтбокс закрылся', await page.locator('#lb').isVisible(), false);
      check(n + 'полоска очищена', await page.locator('#lbShots .lb__shot').count(), 0);
    }

    // Лайтбокс
    await page.locator('#grid .card .card__shot').first().click();
    await page.waitForTimeout(300);
    check('лайтбокс открылся', await page.locator('#lb').isVisible(), true);
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(300);
    check('лайтбокс: перелистнулся',
          (await page.locator('#lbTitle').innerText()).length > 0, true);

    // Фокус не должен уходить за пределы открытого диалога: Tab по кругу
    // обязан оставаться внутри #lb, иначе клавиатурный пользователь проваливается
    // на страницу под модалкой.
    await page.keyboard.press('Tab');
    const escaped = [];
    for (let k = 0; k < 12; k++) {
      const inside = await page.evaluate(() => {
        const a = document.activeElement;
        return !!(a && document.getElementById('lb').contains(a));
      });
      if (!inside) escaped.push(k);
      await page.keyboard.press('Tab');
    }
    check('фокус не выходит за пределы лайтбокса (12 табов)', escaped.length, 0);

    // Атрибут hidden обязан реально скрывать. У .btn задан display: inline-flex,
    // а он перебивает пользовательский стиль [hidden] { display: none },
    // поэтому кнопка без demo-ссылки оставалась бы видимой.
    const hiddenWorks = await page.evaluate(() => {
      const go = document.getElementById('lbGo');
      const was = go.hidden;
      go.hidden = true;
      const vis = !!(go.offsetWidth || go.offsetHeight);
      go.hidden = was;
      return vis;
    });
    check('hidden скрывает кнопку лайтбокса', hiddenWorks, false);

    await page.keyboard.press('Escape');
    await page.waitForTimeout(250);
    check('лайтбокс закрылся по Escape', await page.locator('#lb').isVisible(), false);

    // ---------- Демо в окне монитора ----------
    // Клик по Demo не должен уводить со страницы: открывается окно с нарисованной
    // на CSS рамкой монитора, а игра идёт в iframe внутри него.
    const embed = await page.evaluate(() => window.PROJECTS
      .map((p, i) => ({ i, title: p.title, demo: (p.links || {}).demo, embed: !!(p.links || {}).demoEmbed }))
      .filter(p => p.embed));

    const startUrl = page.url();
    const pagesBefore = ctx.pages().length;

    await page.locator('#grid .card').nth(embed[0].i).locator('a.is-primary').click();
    await page.waitForTimeout(700);

    check('демо открылось в окне монитора', await page.locator('#demo').isVisible(), true);
    check('новая вкладка не открылась', ctx.pages().length, pagesBefore);
    check('адрес страницы не изменился', page.url(), startUrl);
    check('кадр игры создан', await page.locator('#demoFrame').count(), 1);
    check('кадр ведёт на demo из данных',
          await page.locator('#demoFrame').getAttribute('src'), embed[0].demo);
    check('в окне подпись проекта',
          (await page.locator('#demoTitle').innerText()).length > 0, true);

    // Геометрия стекла. Пропорция 16:9 — иначе кадр игры обрезан или растянут;
    // потолок 720p — движок растягивает canvas по кадру, и больше пикселей ему
    // не нужно: 1280×720 это вдвое меньше работы, чем 1920×1080.
    const box = await page.evaluate(() => {
      const s = document.getElementById('demoScreen').getBoundingClientRect();
      const m = document.getElementById('demoMon').getBoundingClientRect();
      return {
        w: s.width, h: s.height, ratio: s.width / s.height,
        top: m.top, bottom: m.bottom, vw: window.innerWidth, vh: window.innerHeight
      };
    });
    console.log('     стекло ' + Math.round(box.w) + '×' + Math.round(box.h) +
                ', монитор по вертикали ' + Math.round(box.top) + '..' + Math.round(box.bottom) +
                ' при окне ' + box.vw + '×' + box.vh);
    check('стекло в пропорции 16:9', Math.abs(box.ratio - 16 / 9) < 0.02, true);
    check('стекло не шире 720p', box.w <= 1281, true);
    check('монитор целиком влез в окно', box.top >= 0 && box.bottom <= box.vh, true);

    // Низкое окно — тот случай, где формула и ломается: потолок 720p не работает,
    // стекло обязано ужаться, а монитор с подставкой всё равно влезть целиком.
    await page.setViewportSize({ width: 1280, height: 620 });
    await page.waitForTimeout(400);
    const low = await page.evaluate(() => {
      const s = document.getElementById('demoScreen').getBoundingClientRect();
      const m = document.getElementById('demoMon').getBoundingClientRect();
      return { w: s.width, h: s.height, ratio: s.width / s.height, top: m.top, bottom: m.bottom };
    });
    console.log('     в окне 1280×620 стекло ' + Math.round(low.w) + '×' + Math.round(low.h) +
                ', монитор по вертикали ' + Math.round(low.top) + '..' + Math.round(low.bottom));
    check('на низком окне стекло ужалось', low.w < 1281, true);
    check('на низком окне пропорция осталась 16:9', Math.abs(low.ratio - 16 / 9) < 0.02, true);
    check('на низком окне монитор влез', low.top >= 0 && low.bottom <= 620, true);
    await page.setViewportSize({ width: 1600, height: 1000 });
    await page.waitForTimeout(300);

    // Клик в центре стекла обязан достаться игре, а не рамке вокруг
    const hit = await page.evaluate(() => {
      const s = document.getElementById('demoScreen').getBoundingClientRect();
      const n = document.elementFromPoint(s.left + s.width / 2, s.top + s.height / 2);
      return n ? n.tagName : null;
    });
    check('клик по стеклу достаётся игре', hit, 'IFRAME');

    // Игра внутри кадра должна реально подняться. Это зависит от сети, поэтому
    // отсутствие кадра — предупреждение, а не провал.
    let gameFrame = null;
    for (let t = 0; t < 40 && !gameFrame; t++) {
      gameFrame = page.frames().find(f => f !== page.mainFrame() && /^https?:/.test(f.url()));
      if (!gameFrame) await page.waitForTimeout(500);
    }
    if (!gameFrame) {
      console.log('     ПРЕДУПРЕЖДЕНИЕ: кадр демо не появился (нет сети?) — проверки игры пропущены');
    } else {
      // demo бывает и абсолютным (https://...), и корневым (/games/<slug>/):
      // браузер всегда отдаёт в кадре абсолютный адрес, поэтому и ожидание
      // приводим к абсолютному виду.
      const wantSrc = new NodeURL(embed[0].demo, URL).href;
      check('кадр демо: адрес', gameFrame.url().replace(/\/$/, ''), wantSrc.replace(/\/$/, ''));
      const canvas = await gameFrame.waitForSelector('canvas', { timeout: 25000 })
        .then(() => true).catch(() => false);
      check('игра в кадре поднялась (есть canvas)', canvas, true);

      // Индикатор питания загорается зелёным только по load — то есть когда кадр
      // реально доехал, а не когда создан тег.
      const ready = await page.waitForFunction(
        () => document.getElementById('demoMon').classList.contains('is-ready'),
        null, { timeout: 30000 }).then(() => true).catch(() => false);
      check('индикатор питания позеленел (кадр загрузился)', ready, true);

      // Управление приходит из документа внутри кадра, значит фокус обязан уехать
      // туда. Ждём, а не проверяем сразу: canvas появляется раньше, чем load —
      // движок рисует его сразу, а load ждёт загрузки .wasm и .pck (десятки МБ).
      const focused = await page.waitForFunction(
        () => document.activeElement && document.activeElement.id === 'demoFrame',
        null, { timeout: 30000 }).then(() => true).catch(() => false);
      check('фокус уехал в кадр демо (управление работает без лишнего клика)', focused, true);
    }

    // Escape работает, пока фокус в самой странице. Как только его забрала игра,
    // выход — крестик или клик по фону.
    await page.locator('.demo__x').focus();
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);
    check('демо закрылось по Escape', await page.locator('#demo').isVisible(), false);
    check('кадр демо удалён (игра погашена)', await page.locator('#demoFrame').count(), 0);
    check('индикатор погас вместе с окном',
          await page.locator('#demoMon').evaluate(n => n.classList.contains('is-ready')), false);

    // Повторное открытие и выход крестиком — игра успевает забрать фокус
    await page.locator('#grid .card').nth(embed[0].i).locator('a.is-primary').click();
    await page.waitForTimeout(700);
    check('демо открылось повторно', await page.locator('#demo').isVisible(), true);
    await page.locator('.demo__x').click();
    await page.waitForTimeout(300);
    check('демо закрылось крестиком', await page.locator('#demo').isVisible(), false);
    check('прокрутка страницы вернулась', await page.evaluate(() => document.body.style.overflow), '');

    // На телефоне стекло вышло бы ~360 px — демо не перехватываем,
    // ссылка обязана работать как раньше, новой вкладкой.
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(300);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.locator('#grid .card').nth(embed[0].i).locator('a.is-primary').scrollIntoViewIfNeeded();
    await page.locator('#grid .card').nth(embed[0].i).locator('a.is-primary').click();
    await page.waitForTimeout(600);
    check('на 390px демо не перехватывается окном', await page.locator('#demo').isVisible(), false);
    for (const p of ctx.pages()) if (p !== page) await p.close();
    await page.setViewportSize({ width: 1600, height: 1000 });
    await page.waitForTimeout(300);

    // Тот же Demo, но из лайтбокса: окно встаёт поверх него, и при закрытии
    // лайтбокс обязан остаться открытым — с заблокированной прокруткой.
    // Карточка берётся по индексу проекта с demoEmbed: у проектов без demo
    // главной кнопки в лайтбоксе нет вовсе, и клик по ней некуда вести.
    await page.locator('#grid .card').nth(embed[0].i).locator('.card__shot').click();
    await page.waitForTimeout(400);
    await page.locator('#lbGo').click();
    await page.waitForTimeout(600);
    check('из лайтбокса демо открылось в окне', await page.locator('#demo').isVisible(), true);
    await page.locator('.demo__x').click();
    await page.waitForTimeout(400);
    check('после закрытия демо лайтбокс на месте', await page.locator('#lb').isVisible(), true);
    check('прокрутка осталась заблокирована лайтбоксом',
          await page.evaluate(() => document.body.style.overflow), 'hidden');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(350);
    check('лайтбокс закрылся после демо', await page.locator('#lb').isVisible(), false);
    check('прокрутка освободилась', await page.evaluate(() => document.body.style.overflow), '');

    // Липкая шапка: при прокрутке должен включаться класс is-stuck (нижняя рамка).
    // Ошибка была в селекторе — в разметке header это .hdr#top, а код искал #hdr.
    // Прокручиваем с behavior: 'instant': в CSS стоит scroll-behavior: smooth, из-за
    // которого программный scrollTo анимируется и проверка плавает по времени.
    await page.evaluate(() => window.scrollTo({ top: 400, behavior: 'instant' }));
    await page.waitForFunction(() => window.scrollY > 100, null, { timeout: 5000 }).catch(() => {});
    // Ждём именно класса, а не «300 мс»: на загруженной машине обработчик скролла
    // не успевал за паузой, и проверка падала через раз.
    await page.waitForFunction(
      () => document.querySelector('header.hdr').classList.contains('is-stuck'),
      null, { timeout: 5000 }).catch(() => {});
    check('шапка получила is-stuck при прокрутке',
          await page.locator('header.hdr').evaluate(n => n.classList.contains('is-stuck')), true);
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
    await page.waitForTimeout(300);

    // Горизонтальный скролл. 901 и 900 — граница медиазапроса, на которой меню
    // разделов переключается между строкой в шапке и выпадающей панелью:
    // именно там шапка рискует не влезть.
    for (const w of [1600, 901, 900, 390]) {
      await page.setViewportSize({ width: w, height: 900 });
      await page.waitForTimeout(300);
      const over = await page.evaluate(() =>
        document.documentElement.scrollWidth - document.documentElement.clientWidth);
      check('горизонтальный скролл на ' + w + 'px', over, 0);
      // Меню не должно наезжать на кнопку темы справа.
      check('шапка не наезжает на кнопку темы на ' + w + 'px', await page.evaluate(() => {
        const nb = document.getElementById('navMenu').getBoundingClientRect();
        const ab = document.querySelector('.hdr__act').getBoundingClientRect();
        return nb.width === 0 || nb.right <= ab.left + 1;
      }), true);
    }

    // Интерактив на мобильной ширине. Меню и лайтбокс раньше проверялись только
    // на 1600px, а панель меню позиционирована absolute и легко вылезает за экран.
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(300);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(200);

    await page.click('#logoBtn');
    await page.waitForTimeout(350);
    const navBox = await page.locator('#navMenu').boundingBox();
    check('меню на 390px: открылось', navBox !== null, true);
    if (navBox) {
      check('меню на 390px: не вылезает вправо', Math.round(navBox.x + navBox.width) <= 390, true);
      check('меню на 390px: не вылезает влево', Math.round(navBox.x) >= 0, true);
    }
    // пункт меню должен реально нажиматься, а не быть перекрыт
    await page.locator('#navMenu a').nth(1).click();
    await page.waitForTimeout(500);
    check('меню на 390px: пункт нажимается, меню закрылось',
          await page.locator('#navMenu').isVisible(), false);

    // Лайтбокс на телефоне: кадр, кнопка закрытия и главная ссылка в пределах экрана.
    // Снова карточка с demoEmbed — главная кнопка есть только у неё.
    await page.locator('#grid .card').nth(embed[0].i).locator('.card__shot').scrollIntoViewIfNeeded();
    await page.waitForTimeout(250);
    await page.locator('#grid .card').nth(embed[0].i).locator('.card__shot').click();
    await page.waitForTimeout(400);
    check('лайтбокс на 390px: открылся', await page.locator('#lb').isVisible(), true);
    const lbImg = await page.locator('#lbImg').boundingBox();
    check('лайтбокс на 390px: кадр виден', lbImg !== null && lbImg.height > 40, true);
    const lbGo = await page.locator('#lbGo').boundingBox();
    check('лайтбокс на 390px: главная кнопка в экране',
          lbGo !== null && lbGo.x >= 0 && Math.round(lbGo.x + lbGo.width) <= 390, true);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    check('лайтбокс на 390px: закрылся по Escape', await page.locator('#lb').isVisible(), false);

    await page.setViewportSize({ width: 1600, height: 1000 });
    await page.waitForTimeout(250);

    // Тема: переключатель работает, выбор переживает перезагрузку
    await page.setViewportSize({ width: 1600, height: 1000 });
    await page.click('#themeBtn');
    await page.waitForTimeout(250);
    check('тема переключилась', await page.evaluate(() => document.documentElement.dataset.theme),
          theme === 'dark' ? 'light' : 'dark');
    await page.reload({ waitUntil: 'load' });
    await page.waitForTimeout(400);
    const persisted = await page.evaluate(() => {
      try { return localStorage.getItem('theme'); } catch (e) { return 'localStorage недоступен'; }
    });
    console.log('     (после перезагрузки в localStorage: ' + persisted + ')');
    if (persisted === 'localStorage недоступен') {
      console.log('     ВНИМАНИЕ: на file:// Chrome не даёт localStorage — выбор темы не переживёт перезагрузку. На хостинге работает.');
    }

    if (errs.length) { bad++; console.log('ОШИБКИ:\n  ' + errs.join('\n  ')); }
    else console.log('OK   ошибок в консоли нет');

    await ctx.close();
  }

  // ---------- LIL WORLDS: диорамы из зеркала ----------
  // Три JSON-диорамы не видны обходу ссылок: путь собирается в рантайме,
  // `dioramas/${a.id}.json`. Один раз зеркало уже уехало без них, и в браузере
  // это выглядело как «Load failed: Unexpected token '<', "<!DOCTYPE"» — на 404
  // GitHub Pages отдал свою HTML-страницу вместо JSON. Проверяем ровно то,
  // что ломалось: клик по каждой диораме и отсутствие «Load failed».
  if (OVER_HTTP) {
    console.log('\n=== LIL WORLDS (диорамы) ===');
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await ctx.newPage();
    const miss = [];
    page.on('response', r => {
      // favicon браузер спрашивает сам, к диорамам он отношения не имеет
      if (r.status() === 404 && r.url().includes('/lil-worlds/')) miss.push(r.url());
    });
    await page.goto(new NodeURL('/games/lilcraft/lil-worlds/', URL).href, { waitUntil: 'load' });
    await page.waitForTimeout(5000);

    const dioramas = await page.$$eval('#themes button', ns => ns.map(n => n.textContent.trim()));
    check('диорам в меню: 3', dioramas.length, 3);
    check('404 внутри /lil-worlds/', miss.map(u => u.split('/').slice(-2).join('/')).join(', '), '');

    for (const label of dioramas) {
      await page.locator('#themes button', { hasText: label }).first().click();
      await page.waitForTimeout(2500);
      const st = await page.evaluate(() => {
        const err = Array.from(document.querySelectorAll('div'))
          .find(d => /Load failed/i.test(d.textContent || ''));
        const c = document.querySelector('canvas');
        return { err: err ? err.textContent.trim().slice(0, 60) : '', cw: c ? c.width : 0 };
      });
      check('диорама «' + label + '» поднялась', st.err || (st.cw === 0 ? 'canvas пуст' : ''), '');
    }
    await ctx.close();
  }

  // Шрифт под задушенным каналом: 400 мс задержки и 150 КБ/с. Вшитые подгруппы
  // обязаны быть готовы уже к первой отрисовке — файлом они бы в этот момент ещё
  // ехали. Саму картинку подмены (первый кадр против финального) ловит tools/fout.js:
  // по ширине заголовка её не увидеть, при font-display: block раскладка считается
  // по системному шрифту, и ширина «до» и «после» совпадает.
  if (OVER_HTTP) {
    console.log('\n=== медленная сеть (FOUT) ===');
    const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 }, reducedMotion: 'reduce' });
    const page = await ctx.newPage();
    const cdp = await ctx.newCDPSession(page);
    await cdp.send('Network.enable');
    await cdp.send('Network.emulateNetworkConditions', {
      offline: false, latency: 400, downloadThroughput: 150 * 1024, uploadThroughput: 150 * 1024
    });
    await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 90000 });
    const slow = await page.evaluate(() => Array.from(document.fonts)
      .filter(f => f.family.replace(/['"]/g, '') === 'Handjet' && f.status !== 'unloaded')
      .map(f => f.status).join(','));
    console.log('     состояние подгрупп на DOMContentLoaded: ' + (slow || 'набора шрифтов ещё нет'));
    check('медленная сеть: шрифт готов к первой отрисовке', slow, 'loaded,loaded');
    await ctx.close();
  }

  await browser.close();
  console.log(bad === 0 ? '\nИТОГ: всё зелёное' : '\nИТОГ: проблем ' + bad);
  process.exit(bad === 0 ? 0 : 1);
})();
