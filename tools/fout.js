/* Ловит подмену шрифта (FOUT) на уровне пикселей: кадр за кадром снимает
   заголовок с момента старта загрузки и сравнивает первый кадр, где текст
   вообще появился, с финальным.

   Запуск (из корня проекта):
     PW_DIR="<путь к @playwright/mcp>" FOUT_URL=http://127.0.0.1:8777/ node tools/fout.js
     FOUT_DUMP=1 — положить первый и финальный кадры в _preview/ для глазами

   Почему пиксели, а не ширина: при font-display: block браузер держит текст
   невидимым, но раскладку считает по системному шрифту, поэтому ширина
   заголовка «до» и «после» совпадает и на подмену не показывает. Ширина
   видна только в отрисованном кадре.

   Сравниваем не пиксели, а маску глифов (яркость выше порога): под заголовком
   размытые пятна .aurora, и они перерисовываются с чуть другим качеством —
   по полному кадру хеши не сходятся никогда, даже когда шрифт один и тот же.
   Маска глифов от этого не зависит.

   Сеть душим (400 мс задержки, 150 КБ/с): интересна первая отрисовка, а не
   загрузка картинок. CPU не душим — CDP-скриншот и так рисует весь вьюпорт,
   и под замедлением кадров получается один-два на весь прогон.

   Выход 0 — подмены нет, 1 — первый кадр с текстом не совпал с финальным. */
const fs = require('fs');
const path = require('path');

const PW = process.env.PW_DIR
  ? path.join(process.env.PW_DIR, 'node_modules', 'playwright')
  : 'playwright';
const { chromium } = require(PW);

const ROOT = path.resolve(__dirname, '..');
const URL = process.env.FOUT_URL ||
  'file:///' + path.join(ROOT, 'index.html').replace(/\\/g, '/');
const OVER_HTTP = /^https?:/.test(URL);
const SHOTS_MS = 2500;   // сколько снимаем после старта
const CLIP = { x: 0, y: 0, width: 1600, height: 420 };  // шапка + заголовок: оба Handjet
const INK = 60;          // максимальная яркость, выше которой текст нарисован
const DARK = 45;         // средняя яркость, ниже которой уже применён CSS
const GLYPH = 100;       // порог маски глифов: ниже — фон и размытие aurora

(async () => {
  const browser = await chromium.launch({ channel: 'chrome' });
  const ctx = await browser.newContext({
    viewport: { width: 1600, height: 1000 },
    reducedMotion: 'reduce'   // иначе .reveal въезжает с прозрачностью и путает кадры
  });
  const page = await ctx.newPage();

  if (OVER_HTTP) {
    const cdp = await ctx.newCDPSession(page);
    await cdp.send('Network.enable');
    await cdp.send('Network.emulateNetworkConditions', {
      offline: false, latency: 400, downloadThroughput: 150 * 1024, uploadThroughput: 150 * 1024
    });
  } else {
    console.log('ВНИМАНИЕ: file:// не душится сетью — окно подмены будет короче, часть кадров не поймаем.');
  }

  // Прямоугольник заголовка берём в каждом кадре свой: на системном шрифте текст
  // переносится по-другому, и один и тот же прямоугольник ловил бы разное.
  // До разбора <body> элемента ещё нет — такие кадры пропускаем, а не роняем прогон.
  const RECT = () => {
    const el = document.querySelector('.lead__h');
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const d = window.devicePixelRatio || 1;
    return [Math.round(r.left * d), Math.round(r.top * d), Math.round(r.width * d), Math.round(r.height * d)];
  };
  const shot = async () => ({
    b64: (await page.screenshot({ type: 'png', clip: CLIP })).toString('base64'),
    rect: await page.evaluate(RECT)
  });

  await page.goto(URL, { waitUntil: 'commit', timeout: 90000 });

  const frames = [];
  const t0 = Date.now();
  while (Date.now() - t0 < SHOTS_MS) {
    let s;
    try {
      s = await shot();
    } catch (e) {
      await page.waitForTimeout(20);
      continue;
    }
    if (s.rect) frames.push({ t: Date.now() - t0, b64: s.b64, rect: s.rect });
  }

  // Финальное состояние и второй кадр через паузу: если два кадра с заведомо
  // готовым шрифтом не совпали, значит метод нестабилен и судить по нему нельзя.
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(600);
  const final = await shot();
  await page.waitForTimeout(700);
  const again = await shot();

  // Разбор кадров внутри страницы: канвас сам декодирует PNG и считает маску
  // глифов. Данные из data: URL канвас не пачкают, в отличие от file://.
  // Сравниваем маски попиксельно, а не хешем: под заголовком размытые пятна
  // .aurora, и единичные пиксели на границе порога перерисовываются сами по себе.
  // Смена шрифта меняет форму глифов целиком — это десятки процентов различий.
  const res = await page.evaluate(async ({ frames, final, again, glyph }) => {
    async function stat(b64, rect) {
      const img = new Image();
      img.src = 'data:image/png;base64,' + b64;
      await img.decode();
      const c = document.createElement('canvas');
      c.width = img.width; c.height = img.height;
      const g = c.getContext('2d');
      g.drawImage(img, 0, 0);
      const d = g.getImageData(rect[0], rect[1], rect[2], rect[3]).data;
      const mask = new Uint8Array(d.length / 4);
      let max = 0, sum = 0, ink = 0;
      for (let i = 0, j = 0; i < d.length; i += 4, j++) {
        const v = (d[i] + d[i + 1] + d[i + 2]) / 3;
        if (v > max) max = v;
        sum += v;
        const bit = v > glyph ? 1 : 0;
        mask[j] = bit; ink += bit;
      }
      return { max: Math.round(max), mean: Math.round(sum / mask.length), ink, mask };
    }
    // -1 — размеры разные: текст на другом шрифте переносится иначе, сравнивать нечего
    function diff(a, b) {
      if (a.length !== b.length) return -1;
      let n = 0;
      for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) n++;
      return n;
    }

    const fin = await stat(final.b64, final.rect);
    const out = [];
    for (const f of frames) {
      const st = await stat(f.b64, f.rect);
      out.push({ t: f.t, rect: f.rect, max: st.max, mean: st.mean, ink: st.ink,
                 diff: diff(st.mask, fin.mask) });
    }
    const ag = await stat(again.b64, again.rect);
    return { frames: out, final: fin, againInk: ag.ink, againDiff: diff(ag.mask, fin.mask), finalRect: final.rect };
  }, { frames, final, again, glyph: GLYPH });

  // Различия меньше 2 % от числа глифов — это дрожание порога, а не другой шрифт
  const TOL = 0.02;
  const same = d => d >= 0 && d < res.final.ink * TOL;

  console.log('снято кадров: ' + res.frames.length + ', полоса ' + CLIP.width + 'x' + CLIP.height +
    ' px, заголовок в конце ' + res.finalRect[2] + 'x' + res.finalRect[3] + ' px');
  console.log('финальный кадр: яркость ' + res.final.max + ', глифов ' + res.final.ink);
  console.log('он же через 700 мс: глифов ' + res.againInk + ', отличий ' + res.againDiff);

  if (!same(res.againDiff)) {
    console.log('ОШИБКА: два кадра с готовым шрифтом расходятся на ' + res.againDiff +
      ' пикселей — метод нестабилен, судить по нему нельзя.');
    await browser.close();
    process.exit(1);
  }

  const first = res.frames.findIndex(f => f.mean < DARK && f.max > INK);
  console.log('первые кадры: ' + res.frames.slice(0, 8)
    .map(f => f.t + 'мс/' + f.ink + 'гл/' + (same(f.diff) ? 'свой' : 'чужой')).join('  '));

  if (first === -1) {
    console.log('ОШИБКА: за ' + SHOTS_MS + ' мс так и не поймали кадр со стилями и текстом — снимали слишком медленно.');
    await browser.close();
    process.exit(1);
  }

  const f = res.frames[first];
  console.log('первый кадр с текстом: t=' + f.t + ' мс, глифов ' + f.ink + ', отличий ' + f.diff +
    ', прямоугольник ' + f.rect.join(','));
  const ok = same(f.diff);
  console.log(ok
    ? 'OK: первый отрисованный текст уже тем же шрифтом, что и финальный — подмены нет'
    : 'FAIL: первый отрисованный текст другим шрифтом — FOUT');

  const before = res.frames.slice(first).filter(x => !same(x.diff)).length;
  console.log('кадров с чужим шрифтом: ' + before + ' из ' + (res.frames.length - first));

  if (process.env.FOUT_DUMP) {
    fs.mkdirSync(path.join(ROOT, '_preview'), { recursive: true });
    for (const [name, b64] of [['fout-first', frames[first].b64], ['fout-final', final.b64]]) {
      fs.writeFileSync(path.join(ROOT, '_preview', name + '.png'), Buffer.from(b64, 'base64'));
    }
    console.log('кадры сохранены в _preview/fout-first.png и _preview/fout-final.png');
  }

  await browser.close();
  process.exit(ok ? 0 : 1);
})();
