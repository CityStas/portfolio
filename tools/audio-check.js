/* Диагностика звука в Godot-веб-сборке: что движок говорит про аудио.
   Запуск: PW_DIR="..." GAME=deddemo node tools/audio-check.js */
const path = require('path');
const PW = process.env.PW_DIR
  ? path.join(process.env.PW_DIR, 'node_modules', 'playwright')
  : 'playwright';
const { chromium } = require(PW);

const BASE = process.env.BASE || 'http://127.0.0.1:8777/';
const GAME = process.env.GAME || 'deddemo';
const WAIT = parseInt(process.env.WAIT || '45000', 10);

(async () => {
  const browser = await chromium.launch({
    channel: 'chrome',
    args: ['--autoplay-policy=no-user-gesture-required', '--hide-scrollbars']
  });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();

  const logs = [];
  const reqs = [];
  page.on('console', m => logs.push('[' + m.type() + '] ' + m.text()));
  page.on('pageerror', e => logs.push('[pageerror] ' + e.message));
  page.on('requestfailed', r => reqs.push('FAILED ' + r.url() + ' :: ' + (r.failure() || {}).errorText));
  // Логируем ВСЁ, а не только звук: пропажа worklet'а видна именно как
  // отсутствие запроса, а не как ошибка в консоли. Фильтр тут мешает.
  page.on('response', r => reqs.push(r.status() + ' ' + r.url().replace(BASE, '')));

  // Патч ставится ДО скриптов страницы: иначе созданные двитком узлы
  // не поймать, а именно они и есть доказательство работающего звука.
  // «Ошибки в консоли нет» доказательством не является: движок может молча
  // не создать ни одного источника.
  await page.addInitScript(() => {
    window.__ctxs = [];
    window.__nodes = 0;
    window.__started = 0;
    window.__connected = 0;

    const A = window.AudioContext || window.webkitAudioContext;
    if (A) {
      const WrappedCtx = function (...args) {
        const c = new A(...args);
        window.__ctxs.push(c);
        return c;
      };
      WrappedCtx.prototype = A.prototype;
      window.AudioContext = WrappedCtx;
      window.webkitAudioContext = WrappedCtx;
    }

    if (window.AudioWorkletNode) {
      const N = window.AudioWorkletNode;
      const WrappedNode = function (...args) {
        const n = new N(...args);
        window.__nodes++;
        const origConnect = n.connect.bind(n);
        n.connect = function (...a) { window.__connected++; return origConnect(...a); };
        return n;
      };
      WrappedNode.prototype = N.prototype;
      window.AudioWorkletNode = WrappedNode;
    }

    if (window.AudioBufferSourceNode) {
      const S = window.AudioBufferSourceNode.prototype.start;
      window.AudioBufferSourceNode.prototype.start = function (...a) {
        window.__started++;
        return S.apply(this, a);
      };
    }
  });

  await page.goto(BASE + 'games/' + GAME + '/', { waitUntil: 'load' });

  // Движок поднимается небыстро: ждём появления аудио-объектов в window.
  await page.waitForTimeout(WAIT);

  const probe = await page.evaluate(() => {
    const out = { crossOriginIsolated: window.crossOriginIsolated };
    out.hasAudioContextCtor = !!(window.AudioContext || window.webkitAudioContext);
    out.windowKeys = Object.keys(window).filter(k => /audio|godot|engine/i.test(k));
    try {
      const g = window.GodotAudio;
      out.godotAudio = g ? Object.keys(g) : null;
    } catch (e) { out.godotAudio = 'err: ' + e.message; }
    return out;
  });

  const live = await page.evaluate(() => (window.__ctxs || []).map(c => ({
    state: c.state, sampleRate: c.sampleRate, currentTime: +c.currentTime.toFixed(3)
  })));

  const audio = await page.evaluate(() => ({
    ctxCount: (window.__ctxs || []).length,
    workletNodes: window.__nodes,
    workletConnected: window.__connected,
    sourcesStarted: window.__started
  }));
  console.log('=== аудио ===', JSON.stringify(audio));

  console.log('=== проба ===');
  console.log(JSON.stringify(probe, null, 1));
  console.log('=== живые AudioContext ===', JSON.stringify(live));
  console.log('=== сеть ===');
  console.log(reqs.join('\n') || '(нет записей)');
  console.log('=== консоль ===');
  console.log(logs.join('\n') || '(пусто)');

  await page.screenshot({ path: path.join(__dirname, '..', '_preview', 'audio-' + GAME + '.png') });
  await browser.close();
})();
