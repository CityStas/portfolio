/* ============================================================================
   Зеркалит продакшн-билды игр с Vercel в локальную папку games/<slug>/.
   ----------------------------------------------------------------------------
   Зачем: с российских провайдеров TLS-хендшейк с SNI <slug>.dvodev.space к
   эджу Vercel режется ТСПУ примерно на 50% соединений (замер: 4/8 против
   8/8 у того же IP с SNI *.vercel.app). GitHub Pages тот же SNI отдаёт 8/8,
   поэтому игры переезжают на Pages под /games/<slug>/.

   Качаем по SNI *.vercel.app — он не режется, — принудительно указывая IP из
   проверенного списка (часть адресов пула cname.vercel-dns.com с этого
   провайдера в чёрной дыре, например 76.76.21.164).

   Запуск из корня проекта:
     node tools/mirror-games.js            # все игры
     node tools/mirror-games.js deddemo    # только одну
   ============================================================================ */
'use strict';

const fs = require('fs');
const path = require('path');
const https = require('https');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'games');

// IP эджа Vercel, доступные с этого провайдера. Порядок — по убыванию скорости.
const EDGE_IPS = ['76.76.21.123', '66.33.60.130', '76.76.21.22', '64.29.17.195', '216.198.79.195'];

const GAMES = {
  deddemo: 'deddemo.vercel.app',
  bubblepeaks: 'bubblepeaks.vercel.app',
  lilcraft: 'lilcraft.vercel.app'
};

// Что точно лежит в сборке Godot, даже если на него нет ссылки в HTML.
const EXTRA = {
  deddemo: ['index.wasm', 'index.pck', 'index.js', 'index.audio.worklet.js', 'index.icon.png', 'index.apple-touch-icon.png', 'index.png'],
  bubblepeaks: ['index.wasm', 'index.pck', 'index.js', 'index.audio.worklet.js', 'index.icon.png', 'index.apple-touch-icon.png', 'index.png'],
  lilcraft: []
};

const ASSET_RE = /["'`(]\s*([A-Za-z0-9_./@+-]+\.(?:wasm|pck|js|mjs|css|png|jpe?g|webp|gif|svg|ico|glb|gltf|bin|json|ogg|mp3|wav|mp4|webm|data|mem|txt|html|xml|ttf|woff2?))\s*[)"'`?]/gi;
const HTML_RE = /(?:src|href)\s*=\s*["']([^"']+)["']/gi;

function fetchOnce(host, ip, urlPath, tries = 4) {
  return new Promise((resolve, reject) => {
    const attempt = n => {
      const req = https.get({
        host: ip,
        servername: host,
        port: 443,
        path: urlPath,
        rejectUnauthorized: false,
        headers: { Host: host, 'accept-encoding': 'identity', 'user-agent': 'mirror-games/1.0' }
      }, res => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume();
          const loc = res.headers.location;
          if (/^https?:\/\//.test(loc)) {
            const u = new URL(loc);
            return fetchOnce(u.hostname, ip, u.pathname + u.search, tries).then(resolve, reject);
          }
          return fetchOnce(host, ip, loc, tries).then(resolve, reject);
        }
        if (res.statusCode !== 200) {
          res.resume();
          return reject(new Error('HTTP ' + res.statusCode + ' ' + urlPath));
        }
        const chunks = [];
        res.on('data', c => chunks.push(c));
        res.on('end', () => resolve({
          body: Buffer.concat(chunks),
          type: res.headers['content-type'] || '',
          len: +(res.headers['content-length'] || 0)
        }));
      });
      req.setTimeout(60000, () => req.destroy(new Error('timeout ' + urlPath)));
      req.on('error', e => {
        if (n < tries) return setTimeout(() => attempt(n + 1), 400);
        reject(e);
      });
    };
    attempt(1);
  });
}

// Пробуем IP по очереди, пока какой-нибудь не отдаст файл.
async function fetchAny(host, urlPath) {
  let lastErr;
  for (const ip of EDGE_IPS) {
    try {
      return await fetchOnce(host, ip, urlPath);
    } catch (e) {
      lastErr = e;
      if (/HTTP 404|HTTP 403/.test(e.message)) throw e; // не сеть — смысла перебирать нет
    }
  }
  throw lastErr;
}

const isText = (type, p) => /text\/|javascript|json|svg|xml/.test(type) || /\.(js|mjs|css|html|json|svg|txt|xml)$/i.test(p);

function extractRefs(text) {
  const out = new Set();
  let m;
  HTML_RE.lastIndex = 0;
  while ((m = HTML_RE.exec(text))) out.add(m[1]);
  ASSET_RE.lastIndex = 0;
  while ((m = ASSET_RE.exec(text))) out.add(m[1]);
  return [...out];
}

function normalize(ref) {
  if (!ref) return null;
  if (/^(data:|blob:|mailto:|#|javascript:)/i.test(ref)) return null;
  if (/^https?:\/\//i.test(ref) || /^\/\//.test(ref)) return null; // внешний CDN не зеркалим
  const p = ref.split('#')[0].split('?')[0];
  if (!p) return null;
  return p.replace(/^\.\//, ''); // относительный путь оставляем относительным — его склеит вызывающий
}

async function mirror(slug) {
  const host = GAMES[slug];
  const dir = path.join(OUT, slug);
  fs.mkdirSync(dir, { recursive: true });

  const seen = new Set();
  const queue = ['/'];
  EXTRA[slug].forEach(f => queue.push('/' + f));
  let total = 0;
  const files = [];

  while (queue.length) {
    const p = queue.shift();
    if (seen.has(p)) continue;
    seen.add(p);
    let r;
    try {
      r = await fetchAny(host, p);
    } catch (e) {
      files.push(['skip', p, e.message]);
      continue;
    }
    const rel = p.endsWith('/') ? p + 'index.html' : p;
    const dest = path.join(dir, rel.replace(/^\//, ''));
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, r.body);
    total += r.body.length;
    files.push(['ok', p, r.body.length, r.type]);

    if (isText(r.type, p)) {
      const base = p.endsWith('/') ? p : p.slice(0, p.lastIndexOf('/') + 1);
      for (const ref of extractRefs(r.body.toString('utf8'))) {
        let n = normalize(ref);
        if (!n) continue;
        if (!n.startsWith('/')) n = base + n;
        n = path.posix.normalize(n);
        if (!seen.has(n)) queue.push(n);
      }
    }
  }

  console.log('\n### ' + slug + '  (' + host + ')');
  files.forEach(f => {
    if (f[0] === 'ok') console.log('    ' + (f[2] / 1048576).toFixed(2).padStart(8) + ' MB  ' + f[1]);
    else console.log('    ' + '---'.padStart(8) + '     ' + f[1] + '  (' + f[2] + ')');
  });
  console.log('    ИТОГО ' + (total / 1048576).toFixed(2) + ' MB, файлов: ' + files.filter(f => f[0] === 'ok').length);
  return total;
}

(async () => {
  const only = process.argv[2];
  const slugs = only ? [only] : Object.keys(GAMES);
  let grand = 0;
  for (const s of slugs) {
    if (!GAMES[s]) { console.error('неизвестная игра: ' + s); process.exit(1); }
    grand += await mirror(s);
  }
  console.log('\nВсего скачано: ' + (grand / 1048576).toFixed(2) + ' MB');
})();
