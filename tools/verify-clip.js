/* Проверка клипа в карточке — то, что не покажет ни jsdom, ни общий verify.js:
   реальное воспроизведение видео, пауза вне окна, подмена кадра клипом в лайтбоксе.

   Запуск (из корня проекта):
     PW_DIR="<путь к @playwright/mcp>" node tools/verify-clip.js
   Выход 0 — всё зелёное.

   Тестовый клип пишется прямо в браузере через MediaRecorder, поэтому ffmpeg для
   прогона не нужен, а сама проверка не зависит от того, сняты ли уже настоящие
   записи. Файл-фикстура (assets/media/__test.webm) удаляется в конце.

   Карточка с клипом подсовывается перехватом projects.js: на диске ничего не
   меняется, поэтому тест можно гонять на рабочей версии данных. */

const fs = require('fs');
const path = require('path');
const http = require('http');
const { URL: NodeURL } = require('url');

const PW = process.env.PW_DIR
  ? path.join(process.env.PW_DIR, 'node_modules', 'playwright')
  : 'playwright';
const { chromium } = require(PW);

const ROOT = path.resolve(__dirname, '..');
const PORT = 8788;
const CLIP = path.join(ROOT, 'assets', 'media', '__test.webm');

const MIME = {
  '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css',
  '.jpg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2', '.webm': 'video/webm', '.mp4': 'video/mp4'
};

// Свой сервер на время прогона: page.route умеет перехватывать только http,
// а через file:// сайт ведёт себя иначе, чем в проде.
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(new NodeURL(req.url, 'http://x').pathname);
  if (p === '/') p = '/index.html';
  const f = path.resolve(ROOT, '.' + p);
  const rel = path.relative(ROOT, f);
  if (rel.startsWith('..') || path.isAbsolute(rel) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) {
    res.writeHead(404); res.end(); return;
  }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});

let bad = 0;
function check(name, got, expected) {
  const ok = got === expected;
  if (!ok) bad++;
  console.log((ok ? 'OK   ' : 'FAIL ') + name + ': ' + got + (ok ? '' : ' (ожидалось ' + expected + ')'));
}

(async () => {
  fs.mkdirSync(path.dirname(CLIP), { recursive: true });
  await new Promise(r => server.listen(PORT, '127.0.0.1', r));

  const browser = await chromium.launch({ channel: 'chrome', args: ['--hide-scrollbars'] });
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 }, locale: 'ru-RU' });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errs.push('console.error: ' + m.text()); });

  // 1. Пишем настоящий webm прямо в браузере.
  await page.goto('http://127.0.0.1:' + PORT + '/', { waitUntil: 'load' });
  const b64 = await page.evaluate(async () => {
    const c = document.createElement('canvas');
    c.width = 320; c.height = 200;
    const g = c.getContext('2d');
    const rec = new MediaRecorder(c.captureStream(20), { mimeType: 'video/webm' });
    const chunks = [];
    rec.ondataavailable = e => chunks.push(e.data);
    rec.start();
    for (let i = 0; i < 30; i++) {
      g.fillStyle = '#101820'; g.fillRect(0, 0, 320, 200);
      g.fillStyle = '#5aa9ff'; g.fillRect((i % 20) * 12, 80, 40, 40);
      await new Promise(r => setTimeout(r, 50));
    }
    await new Promise(r => { rec.onstop = r; rec.stop(); });
    const u8 = new Uint8Array(await new Blob(chunks).arrayBuffer());
    // Через apply порциями: spread на десятках тысяч байт роняет стек.
    let s = '';
    for (let i = 0; i < u8.length; i += 8192) s += String.fromCharCode.apply(null, u8.subarray(i, i + 8192));
    return btoa(s);
  });
  fs.writeFileSync(CLIP, Buffer.from(b64, 'base64'));
  console.log('тестовый клип: ' + Math.round(fs.statSync(CLIP).size / 1024) + ' KB\n');

  // 2. Подсовываем карточку с клипом. В clip намеренно webm: тип источника должен
  //    выводиться из расширения, а не из имени поля, иначе декодер молча откажет.
  await page.route('**/projects.js', async route => {
    const body = fs.readFileSync(path.join(ROOT, 'assets/data/projects.js'), 'utf8') +
      "\nwindow.PROJECTS.push({title:'TEST CLIP',kind:'Инструмент',desc:'t',year:'2026',status:'live'," +
      "shot:'assets/img/projects/rustore.webp',clip:'assets/media/__test.webm'," +
      "links:{demo:'https://example.com/'}});";
    await route.fulfill({ contentType: 'application/javascript', body });
  });
  await page.goto('http://127.0.0.1:' + PORT + '/', { waitUntil: 'load' });

  // 3. Разметка карточки. Клип ищем именно в подсунутой карточке: настоящий
  //    клип на странице теперь тоже есть (флагманская карточка), и общий
  //    селектор .card__clip попадал бы в него, а не в свежесозданный элемент.
  const info = await page.evaluate(() => {
    const card = Array.from(document.querySelectorAll('.card'))
      .find(c => c.textContent.indexOf('TEST CLIP') !== -1);
    const v = card && card.querySelector('.card__clip');
    if (!v) return null;
    return {
      tag: v.tagName,
      type: v.querySelector('source') && v.querySelector('source').getAttribute('type'),
      muted: v.hasAttribute('muted'),
      loop: v.hasAttribute('loop'),
      inline: v.hasAttribute('playsinline'),
      preload: v.getAttribute('preload'),
      ariaHidden: v.getAttribute('aria-hidden'),
      posterBelow: !!v.parentElement.querySelector('img')
    };
  });
  check('видео в карточке есть', !!info, true);
  check('это <video>', info && info.tag, 'VIDEO');
  check('тип источника по расширению', info && info.type, 'video/webm');
  check('muted атрибутом', info && info.muted, true);
  check('loop атрибутом', info && info.loop, true);
  check('playsinline атрибутом', info && info.inline, true);
  check('preload=none до появления на экране', info && info.preload, 'none');
  check('скрыто от скринридера', info && info.ariaHidden, 'true');
  check('постер под видео остался', info && info.posterBelow, true);

  // 4. Клип реально играет, когда карточка попала в окно.
  await page.evaluate(() => Array.from(document.querySelectorAll('.card'))
    .find(c => c.textContent.indexOf('TEST CLIP') !== -1)
    .querySelector('.card__clip').scrollIntoView({ block: 'center' }));
  await page.waitForTimeout(2500);
  const playing = await page.evaluate(() => {
    const v = Array.from(document.querySelectorAll('.card'))
      .find(c => c.textContent.indexOf('TEST CLIP') !== -1).querySelector('.card__clip');
    return { paused: v.paused, t: v.currentTime, preload: v.preload, ready: v.readyState };
  });
  check('клип заиграл', playing.paused, false);
  check('время идёт', playing.t > 0, true);
  check('декодер готов (readyState>=2)', playing.ready >= 2, true);
  check('preload переключился на auto', playing.preload, 'auto');

  // 5. Уход из окна — пауза, а не выгрузка.
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(1200);
  check('клип встал на паузу вне окна',
    await page.evaluate(() => Array.from(document.querySelectorAll('.card'))
      .find(c => c.textContent.indexOf('TEST CLIP') !== -1)
      .querySelector('.card__clip').paused), true);

  // 6. Лайтбокс: видео вместо кадра, и обратно.
  const testCard = page.locator('.card', { hasText: 'TEST CLIP' }).locator('.card__shot');
  await testCard.scrollIntoViewIfNeeded();
  await testCard.click();
  await page.waitForTimeout(1200);
  const lbOn = await page.evaluate(() => ({
    open: !document.querySelector('#lb').hidden,
    vidShown: !document.querySelector('#lbVid').hidden,
    imgHidden: document.querySelector('#lbImg').hidden,
    poster: document.querySelector('#lbVid').getAttribute('poster'),
    playing: !document.querySelector('#lbVid').paused,
    controls: document.querySelector('#lbVid').hasAttribute('controls')
  }));
  check('лайтбокс открылся', lbOn.open, true);
  check('в лайтбоксе видео', lbOn.vidShown, true);
  check('кадр спрятан', lbOn.imgHidden, true);
  check('у видео есть управление', lbOn.controls, true);
  check('постер подставлен', lbOn.poster, 'assets/img/projects/rustore.webp');
  check('в лайтбоксе играет', lbOn.playing, true);

  await page.keyboard.press('Escape');
  await page.waitForTimeout(800);
  const lbOff = await page.evaluate(() => ({
    closed: document.querySelector('#lb').hidden,
    vidHidden: document.querySelector('#lbVid').hidden,
    imgShown: !document.querySelector('#lbImg').hidden,
    vidPaused: document.querySelector('#lbVid').paused
  }));
  check('лайтбокс закрылся', lbOff.closed, true);
  check('видео спрятано', lbOff.vidHidden, true);
  check('кадр вернулся', lbOff.imgShown, true);
  check('видео остановлено', lbOff.vidPaused, true);

  // 7. Проект без клипа по-прежнему показывает только кадр.
  const plain = await page.evaluate(() => {
    const c = Array.from(document.querySelectorAll('.card')).find(n => n.textContent.indexOf('DedSpace') !== -1);
    return { clip: !!c.querySelector('.card__clip'), img: !!c.querySelector('img') };
  });
  check('у проекта без clip видео не появилось', plain.clip, false);
  check('у проекта без clip кадр на месте', plain.img, true);

  check('ошибок в консоли нет', errs.length ? errs.join(' | ') : 0, 0);

  await browser.close();
  server.close();
  try { fs.unlinkSync(CLIP); } catch (e) { console.log('(фикстуру удалить не вышло: ' + CLIP + ')'); }
  console.log('\nИТОГ: ' + (bad ? 'проблем ' + bad : 'всё зелёное'));
  process.exit(bad ? 1 : 0);
})();
