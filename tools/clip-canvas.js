/* Собирает клип для карточки из последовательности кадров, не требуя ffmpeg.
   Нужен там, где сырьё уже есть кадрами (или рендерится скриптом), а ffmpeg
   в системе нет: кодирует сам Chrome через canvas.captureStream + MediaRecorder.

   Запуск (из корня проекта):
     PW_DIR="<путь к @playwright/mcp>" node tools/clip-canvas.js <slug> <папка с кадрами> [fps] [ширина] [Мбит/с]
     PW_DIR=... node tools/clip-canvas.js vdie _raw/vdie_frames 30 1280 4

   Кадры берутся по маске *.png, сортируются по имени. Ширина — верхняя граница:
   кадр шире даунскейлится с сохранением пропорции, уже — остаётся как есть.
   Высота округляется до чётного: H.264 с yuv420p нечётную не примет.

   На выходе, как у tools/clip.js, — assets/media/<slug>.{mp4,webm,jpg}:
     mp4    — H.264, играет везде, включая Safari
     webm   — VP9, обычно легче; в разметке идёт первым
     jpg    — постер: кадр из середины клипа

   Отличие от clip.js: запись идёт в реальном времени (MediaRecorder пишет по
   часам), поэтому 6 секунд клипа = примерно 12 секунд работы на два формата.
   Кадры должны лежать локально — они раздаются временным http-сервером, чтобы
   canvas не считался «испорченным» и captureStream не отказал. */

const fs = require('fs');
const path = require('path');
const http = require('http');
const { URL: NodeURL } = require('url');

const PW = process.env.PW_DIR
  ? path.join(process.env.PW_DIR, 'node_modules', 'playwright')
  : 'playwright';
const { chromium } = require(PW);

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'assets', 'media');
const PORT = 8791;

const MIME = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp'
};

const slug = process.argv[2];
const dir = process.argv[3];
const FPS = parseInt(process.argv[4], 10) || 30;
const MAXW = parseInt(process.argv[5], 10) || 1280;
const MBPS = parseFloat(process.argv[6]) || 4;

if (!slug || !dir) {
  console.error('Запуск: node tools/clip-canvas.js <slug> <папка с кадрами> [fps] [ширина] [Мбит/с]');
  process.exit(1);
}

const SRC = path.isAbsolute(dir) ? dir : path.join(ROOT, dir);
if (!fs.existsSync(SRC)) {
  console.error('Нет папки с кадрами: ' + SRC);
  process.exit(1);
}

const frames = fs.readdirSync(SRC).filter(f => /\.(png|jpe?g|webp)$/i.test(f)).sort();
if (!frames.length) {
  console.error('В папке нет кадров: ' + SRC);
  process.exit(1);
}

// Кадры раздаём по http: file:// испортил бы canvas, и captureStream мог бы отказать.
const server = http.createServer((req, res) => {
  const p = decodeURIComponent(new NodeURL(req.url, 'http://x').pathname);
  // Пустой документ на корне: странице нужен origin, чтобы canvas.captureStream
  // не упирался в ограничения, а 404 на "/" Playwright считает провалом навигации.
  if (p === '/') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end('<!doctype html><meta charset="utf-8"><title>clip</title>');
    return;
  }
  const f = path.resolve(SRC, '.' + p);
  const rel = path.relative(SRC, f);
  // isDirectory обязателен: на "/" путь сходится к самой папке кадров, и
  // createReadStream падает на EISDIR уже после отправки заголовков.
  if (rel.startsWith('..') || path.isAbsolute(rel) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) {
    res.writeHead(404); res.end(); return;
  }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(f).toLowerCase()] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});

const kb = n => Math.round(n / 1024) + ' KB';

// Один прогон: открыть страницу, прогнать кадры через canvas, вернуть запись.
async function record(page, mime, w, h) {
  return page.evaluate(async ({ list, mime, w, h, fps, bps }) => {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const g = c.getContext('2d');
    g.fillStyle = '#05070c'; g.fillRect(0, 0, w, h);

    const stream = c.captureStream(fps);
    const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: bps });
    const chunks = [];
    rec.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };

    const imgs = [];
    for (const src of list) {
      const im = new Image();
      im.src = src;
      await im.decode();
      imgs.push(im);
    }

    const stop = new Promise(r => { rec.onstop = r; });
    rec.start();
    const dt = 1000 / fps;
    for (const im of imgs) {
      const k = Math.min(1, w / im.naturalWidth);
      const dw = Math.round(im.naturalWidth * k);
      const dh = Math.round(im.naturalHeight * k);
      g.fillStyle = '#05070c'; g.fillRect(0, 0, w, h);
      g.drawImage(im, Math.round((w - dw) / 2), Math.round((h - dh) / 2), dw, dh);
      await new Promise(r => setTimeout(r, dt));
    }
    // Полсекунды хвоста: последний кадр успевает попасть в поток, иначе клип
    // обрывается на предпоследнем и петля дёргается.
    await new Promise(r => setTimeout(r, 500));
    rec.stop();
    await stop;

    const u8 = new Uint8Array(await new Blob(chunks).arrayBuffer());
    let s = '';
    for (let i = 0; i < u8.length; i += 8192) s += String.fromCharCode.apply(null, u8.subarray(i, i + 8192));
    return { b64: btoa(s), w: c.width, h: c.height };
  }, { list: frames.map(f => '/' + encodeURIComponent(f)), mime, w, h, fps: FPS, bps: MBPS * 1000000 });
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  await new Promise(r => server.listen(PORT, '127.0.0.1', r));

  const browser = await chromium.launch({ channel: 'chrome' });
  const page = await browser.newPage();
  await page.goto('http://127.0.0.1:' + PORT + '/');

  // Размер выясняем по первому кадру: тянем его в браузер и спрашиваем габариты.
  const nat = await page.evaluate(async (src) => {
    const im = new Image();
    im.src = src;
    await im.decode();
    return { w: im.naturalWidth, h: im.naturalHeight };
  }, '/' + encodeURIComponent(frames[0]));

  const k = Math.min(1, MAXW / nat.w);
  const W = Math.round(nat.w * k);
  const H = Math.round(nat.h * k / 2) * 2;

  console.log('кадров ' + frames.length + ', ' + nat.w + 'x' + nat.h + ' -> ' + W + 'x' + H +
              ', ' + FPS + ' fps, ' + MBPS + ' Мбит/с');
  console.log('длительность ~' + (frames.length / FPS).toFixed(1) + ' с\n');

  for (const [ext, mime] of [['mp4', 'video/mp4;codecs=avc1.42E01E'], ['webm', 'video/webm;codecs=vp9']]) {
    if (!await page.evaluate(m => MediaRecorder.isTypeSupported(m), mime)) {
      console.log(ext + ': браузер не умеет ' + mime + ' — пропускаю');
      continue;
    }
    const t0 = Date.now();
    const res = await record(page, mime, W, H);
    const buf = Buffer.from(res.b64, 'base64');
    const file = path.join(OUT, slug + '.' + ext);
    fs.writeFileSync(file, buf);
    console.log(ext.padEnd(5) + kb(buf.length).padStart(8) + '   ' + res.w + 'x' + res.h +
                '   ' + ((Date.now() - t0) / 1000).toFixed(1) + ' с');
  }

  // Постер — средний кадр, уже приведённый к выходному размеру.
  const mid = frames[Math.floor(frames.length / 2)];
  const jpgB64 = await page.evaluate(async ({ src, w, h }) => {
    const im = new Image();
    im.src = src;
    await im.decode();
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const g = c.getContext('2d');
    g.fillStyle = '#05070c'; g.fillRect(0, 0, w, h);
    const kk = Math.min(1, w / im.naturalWidth);
    const dw = Math.round(im.naturalWidth * kk);
    const dh = Math.round(im.naturalHeight * kk);
    g.drawImage(im, Math.round((w - dw) / 2), Math.round((h - dh) / 2), dw, dh);
    return c.toDataURL('image/jpeg', 0.82).split(',')[1];
  }, { src: '/' + encodeURIComponent(mid), w: W, h: H });
  const jpg = Buffer.from(jpgB64, 'base64');
  fs.writeFileSync(path.join(OUT, slug + '.jpg'), jpg);
  console.log('jpg  ' + kb(jpg.length).padStart(8) + '   постер из ' + mid);

  await browser.close();
  server.close();
  console.log('\nГотово: assets/media/' + slug + '.{mp4,webm,jpg}');
})();
