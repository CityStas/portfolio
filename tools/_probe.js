/* Временный зонд FOUT: когда реально приходит пиксельный шрифт относительно
   первой отрисовки. Удаляется после ответа. */
const path = require('path');
const PW_DIR = process.env.PW_DIR;
const { chromium } = require(path.join(PW_DIR, 'node_modules', 'playwright-core'));

(async () => {
  const ROOT = path.join(__dirname, '..');
  const url = process.env.PROBE_URL ||
    ('file:///' + path.join(ROOT, 'index.html').replace(/\\/g, '/'));

  const browser = await chromium.launch({ channel: 'chrome' });
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  const page = await ctx.newPage();

  // момент первой отрисовки фиксируем изнутри страницы
  await page.addInitScript(() => {
    window.__t0 = performance.now();
    new PerformanceObserver(list => {
      for (const e of list.getEntries()) {
        if (e.name === 'first-contentful-paint') window.__fcp = e.startTime;
      }
    }).observe({ type: 'paint', buffered: true });
  });

  await page.goto(url, { waitUntil: 'commit' });

  const log = [];
  page.on('console', m => { if (m.type() !== 'log') log.push(m.type() + ': ' + m.text().slice(0, 160)); });
  page.on('requestfailed', r => log.push('failed: ' + r.url().split('/').pop() + ' ' + (r.failure() || {}).errorText));
  page.on('response', r => { if (/woff2/.test(r.url())) log.push('resp: ' + r.url().split('/').pop()); });

  const seen = [];
  for (const ms of [0, 100, 200, 350, 500, 750, 1000, 1500, 2500]) {
    if (ms) await page.waitForTimeout(ms - (seen.length ? seen[seen.length - 1].ms : 0));
    const s = await page.evaluate(() => ({
      t: Math.round(performance.now()),
      fcp: window.__fcp ? Math.round(window.__fcp) : null,
      handjet: document.fonts.check('600 24px Handjet'),
      faces: [...document.fonts].map(f => f.family + '/' + f.status).join(' '),
      ready: document.fonts.status,
      done: performance.getEntriesByType('resource')
        .filter(r => /woff2/.test(r.name))
        .map(r => r.name.split('/').pop().slice(0, 22) + ' @' + Math.round(r.responseEnd)),
    }));
    seen.push({ ms, ...s });
  }

  console.log('URL:', url);
  console.log('--- таймлайн ---');
  for (const s of seen) {
    console.log('t=' + String(s.t).padStart(5) + 'ms  fcp=' + String(s.fcp).padStart(4) +
      '  Handjet=' + (s.handjet ? 'да ' : 'нет') + '  fonts=' + s.ready +
      '  faces: ' + s.faces +
      '  woff2: ' + (s.done.join(', ') || 'нет'));
  }
  console.log('--- консоль/запросы ---');
  console.log(log.length ? log.join('\n') : 'тихо');
  await browser.close();
})();
