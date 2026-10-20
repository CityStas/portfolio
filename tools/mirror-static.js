/* ============================================================================
   Зеркалит продакшн-сборки с Vercel в локальные папки внутри репозитория:
   games/<slug>/ и apps/<slug>/. Дальше они отдаются с того же домена, что и
   сайт, — без поддоменов и без обращения к Vercel из браузера.

   Зачем: с российских провайдеров TLS-хендшейк с SNI <slug>.dvodev.space к
   эджу Vercel режется ТСПУ примерно на половине соединений (замер: 5/10 против
   10/10 у того же IP с SNI *.vercel.app). GitHub Pages тот же SNI отдаёт 12/12.

   Качаем по SNI *.vercel.app — он не режется, — принудительно указывая IP из
   проверенного списка (часть адресов пула cname.vercel-dns.com с этого
   провайдера в чёрной дыре, например 76.76.21.164).

   Запуск из корня проекта:
     node tools/mirror-static.js                 # всё, что перечислено ниже
     node tools/mirror-static.js apps/dubbed     # одна сборка
     node tools/mirror-static.js dubbed          # то же по короткому имени

   Старое имя tools/mirror-games.js сохранено как обёртка над этим скриптом.
   ============================================================================ */
'use strict';

const fs = require('fs');
const path = require('path');
const https = require('https');

const ROOT = path.resolve(__dirname, '..');

// IP эджа Vercel, доступные с этого провайдера. Порядок — по убыванию скорости.
const EDGE_IPS = ['76.76.21.123', '66.33.60.130', '76.76.21.22', '64.29.17.195', '216.198.79.195'];

// Ключ — путь внутри репозитория, значение — откуда берём сборку.
// extra — файлы, на которые нет ссылки в HTML (движок тянет их из JS).
//
// Второй worklet обязателен наравне с первым: `godot.audio.worklet.js` — сам
// драйвер звука, `godot.audio.position.worklet.js` — отчёт о позиции
// проигрываемого сэмпла. Без второго движок печатает «Failed to create
// PositionWorklet» и не играет сэмплы, то есть звука нет вообще. В HTML ни
// один из них не упомянут, поэтому обход ссылок их не находит — только этот
// список. Проверка на пропажу — в tools/smoke.js, «worklet движка на месте».
const GODOT = ['index.wasm', 'index.pck', 'index.js',
               'index.audio.worklet.js', 'index.audio.position.worklet.js',
               'index.icon.png', 'index.apple-touch-icon.png', 'index.png'];

// Диорамы LIL WORLDS. Путь собирается в рантайме — `dioramas/${a.id}.json`, —
// поэтому в тексте бандла его нет целиком и обход ссылок его не находит.
// Список id вытащен из modes-массива в assets/index-CGcEfhrU.js; если в игре
// появится новая диорама, её надо дописать сюда (и в подпись ниже).
const LILWORLDS = ['lil-worlds/dioramas/deep_sea_lab.json',
                   'lil-worlds/dioramas/neon_cyber_alley.json',
                   'lil-worlds/dioramas/steampunk_island.json'];

const SOURCES = {
  'games/deddemo': { host: 'deddemo.vercel.app', extra: GODOT },
  'games/bubblepeaks': { host: 'bubblepeaks.vercel.app', extra: GODOT },
  'games/lilcraft': { host: 'lilcraft.vercel.app', extra: LILWORLDS },

  // Лендинг расширения. Статика целиком, включая downloads/*.zip и *.xpi:
  // смысл переезда в том, чтобы установщики скачивались без VPN.
  'apps/dubbed': { host: 'dubbedru.vercel.app', extra: [] },

  // apps/orfree здесь СОЗНАТЕЛЬНО нет. Его веб-версия — не просто статика:
  // без релея на Vercel (api/relay.js, путь через ?path=) она не может ходить
  // в OpenRouter, который отдаёт РФ-адресам 403 «Access denied by security
  // policy». Пока UI не переключён на свой релей, зеркалирование даст мёртвую
  // страницу, поэтому сначала правка в проекте orfree, потом запись сюда.
};

// Расширения `data` и `mem` — исторически для emscripten-сборок. Здесь они дают
// ложные срабатывания на обращениях к свойствам вида `(i.data)`: скобка попадает
// в границу шаблона. Такие строки уходят в очередь и возвращают 404 с самого
// Vercel, то есть это шум обходчика, а не пропущенный файл — строки `---`
// в выводе с этими двумя расширениями можно игнорировать.
const ASSET_RE = /["'`(]\s*([A-Za-z0-9_./@+-]+\.(?:wasm|pck|js|mjs|css|png|jpe?g|webp|gif|svg|ico|glb|gltf|bin|json|ogg|mp3|wav|mp4|webm|data|mem|txt|html|xml|ttf|woff2?|zip|xpi|webmanifest))\s*[)"'`?]/gi;
const HTML_RE = /(?:src|href)\s*=\s*["']([^"']+)["']/gi;

// Путь, собранный в рантайме — `dioramas/${a.id}.json` — обход ссылок не видит:
// в тексте нет готового имени файла. Ровно так из зеркала LIL WORLDS пропали
// три диорамы, а в браузере это выглядело как «Load failed: Unexpected token
// '<', "<!DOCTYPE"» на месте JSON: GitHub Pages отдал на 404 свою HTML-страницу.
// Такие места приходится перечислять в extra руками, поэтому о них хотя бы
// сообщаем — молчаливый пропуск здесь дороже лишней строки в выводе.
const DYN_RE = /`[^`$]*\$\{[^}]*\}[^`]*\.(?:json|glb|gltf|bin|data|png|jpe?g|webp|gif|svg|ogg|mp3|wav|mp4|webm|wasm|pck|css|mjs|js|txt|xml)`/g;

/* ---------------------------------------------------------------------------
   Сборка Godot 4 под http: снять требование Secure Context и вернуть звук.

   Godot 4 не стартует, если страница открыта не по HTTPS: вместо игры
   посетитель видит плашку «The following features required to run Godot
   projects on the Web are missing: Secure Context». GitHub Pages отдаёт этот
   домен по http, пока не выпущен сертификат (и вообще не умеет отдавать
   COOP/COEP), поэтому сборку приходится готовить к слабому контексту.

   Вне защищённого контекста браузер не даёт AudioWorklet, но у движка есть
   ЗАПАСНОЙ аудиодрайвер на ScriptProcessorNode, которому HTTPS не нужен.
   Мешают ему три ссылки на worklet — их и правим, идемпотентно:

     1. index.js   - isSecureContext() начинает возвращать true;
     2. index.js   - `ctx.audioWorklet.addModule(...)` вызывается только при
                     наличии audioWorklet (иначе TypeError в _godot_audio_init);
     3. index.js   - connectPositionWorklet(): подключение к position-worklet
                     в try/catch, иначе не вызывается start() и сэмпл молчит;
     4. index.html - убирает старый костыль `--audio-driver Dummy`, если он
                     остался от прежней версии патча (он глушил звук).

   Цена http (по https всё проходит само): Chrome ругается, что
   ScriptProcessorNode устарел, и get_playback_position() замирает на смещении
   старта — позицию считает worklet, которого нет.

   Тот же патч лежит в самих проектах игр - tools/web/patch_http.py, его
   прогоняют после каждого экспорта перед выкладкой на Vercel. Здесь он нужен
   потому, что зеркало качает уже собранные файлы: если сборка на Vercel
   осталась непатченной, сайт получил бы её как есть.
   --------------------------------------------------------------------------- */
const HTTP_JS_STEPS = [
  [
    "isSecureContext: function () {\n\t\treturn window['isSecureContext'] === true;\n\t}",
    "isSecureContext: function () {\n" +
    "\t\t// патч tools/web/patch_http.py: игра должна запускаться и по http,\n" +
    "\t\t// пока у домена нет сертификата (иначе вместо игры - плашка с ошибкой)\n" +
    "\t\treturn true;\n" +
    "\t}",
    'проверка Secure Context снята',
  ],
  [
    'GodotAudio.audioPositionWorkletPromise=ctx.audioWorklet.addModule(path);',
    'GodotAudio.audioPositionWorkletPromise=ctx.audioWorklet?ctx.audioWorklet.addModule(path):Promise.resolve();',
    'position-worklet больше не обязателен',
  ],
  [
    'if(this.isCanceled){return}this._source.connect(this.getPositionWorklet());if(start){this.start()}',
    'if(this.isCanceled){return}try{this._source.connect(this.getPositionWorklet())}catch(e){}if(start){this.start()}',
    'сэмпл стартует без position-worklet',
  ],
];

const HTTP_DUMMY_BLOCK =
  "// патч tools/web/patch_http.py: вне https браузер не даёт AudioWorklet,\n" +
  "// поэтому движок стартует с пустым аудиодрайвером (иначе - падение в\n" +
  "// _godot_audio_init). По https этот блок ничего не делает.\n" +
  "if (!window.isSecureContext) {\n" +
  "\tGODOT_CONFIG.args.push('--audio-driver', 'Dummy');\n" +
  "}\n";

function patchGodotHttp(dir) {
  const js = path.join(dir, 'index.js');
  const html = path.join(dir, 'index.html');
  if (fs.existsSync(js)) {
    let s = fs.readFileSync(js, 'utf8');
    for (const [needle, repl, label] of HTTP_JS_STEPS) {
      if (s.includes(needle)) {
        s = s.replace(needle, repl);
        console.log('    http-патч: index.js - ' + label);
      } else if (s.includes(repl)) {
        console.log('    http-патч: index.js - уже применено (' + label + ')');
      } else {
        console.log('    http-патч: index.js - НЕ нашёл фрагмент (' + label + '), формат движка изменился');
      }
    }
    fs.writeFileSync(js, s, 'utf8');
  }
  if (fs.existsSync(html)) {
    const h = fs.readFileSync(html, 'utf8');
    if (h.includes(HTTP_DUMMY_BLOCK)) {
      fs.writeFileSync(html, h.replace(HTTP_DUMMY_BLOCK, ''), 'utf8');
      console.log('    http-патч: index.html - Dummy-драйвер убран, звук настоящий');
    } else {
      console.log('    http-патч: index.html - костыля с Dummy нет, звук настоящий');
    }
  }
}

function dynamicRefs(text) {
  const out = new Set();
  let m;
  DYN_RE.lastIndex = 0;
  while ((m = DYN_RE.exec(text))) out.add(m[0]);
  return [...out];
}

function fetchOnce(host, ip, urlPath, tries = 4) {
  return new Promise((resolve, reject) => {
    const attempt = n => {
      const req = https.get({
        host: ip,
        servername: host,
        port: 443,
        path: urlPath,
        rejectUnauthorized: false,
        headers: { Host: host, 'accept-encoding': 'identity', 'user-agent': 'mirror-static/1.0' }
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

async function mirror(key) {
  const { host, extra } = SOURCES[key];
  const dir = path.join(ROOT, key);
  fs.mkdirSync(dir, { recursive: true });

  const seen = new Set();
  const queue = ['/'];
  extra.forEach(f => queue.push('/' + f));
  let total = 0;
  const files = [];
  const dynamic = [];

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
      const text = r.body.toString('utf8');
      const base = p.endsWith('/') ? p : p.slice(0, p.lastIndexOf('/') + 1);
      for (const ref of extractRefs(text)) {
        let n = normalize(ref);
        if (!n) continue;
        if (!n.startsWith('/')) n = base + n;
        n = path.posix.normalize(n);
        if (!seen.has(n)) queue.push(n);
      }
      dynamicRefs(text).forEach(d => { if (dynamic.indexOf(d) === -1) dynamic.push(d); });
    }
  }

  console.log('\n### ' + key + '  (' + host + ')');
  files.forEach(f => {
    if (f[0] === 'ok') console.log('    ' + (f[2] / 1048576).toFixed(2).padStart(8) + ' MB  ' + f[1]);
    else console.log('    ' + '---'.padStart(8) + '     ' + f[1] + '  (' + f[2] + ')');
  });
  console.log('    ИТОГО ' + (total / 1048576).toFixed(2) + ' MB, файлов: ' + files.filter(f => f[0] === 'ok').length);
  // Сборки Godot узнаём по pck в списке extra: у остальных (three.js, лендинги)
  // такого файла нет и патчить нечего.
  if (extra.includes('index.pck')) patchGodotHttp(dir);
  if (dynamic.length) {
    console.log('    ! пути собираются в рантайме, обход ссылок их не видит.');
    console.log('      Проверьте, что каждый есть в extra у ' + key + ':');
    dynamic.forEach(d => console.log('        ' + d));
  }
  return total;
}

function pick(args, allowed) {
  const all = Object.keys(SOURCES).filter(k => !allowed || allowed.some(a => k === a || k.startsWith(a + '/')));
  if (!args.length) return all;
  return args.map(a => {
    const hit = all.find(k => k === a || k === path.posix.basename(k));
    if (!hit) {
      console.error('неизвестная сборка: ' + a + '\nдоступно: ' + all.join(', '));
      process.exit(1);
    }
    return hit;
  });
}

async function run(args, opts = {}) {
  const keys = pick(args, opts.sections);
  let grand = 0;
  for (const k of keys) grand += await mirror(k);
  console.log('\nВсего скачано: ' + (grand / 1048576).toFixed(2) + ' MB');
  return grand;
}

if (require.main === module) {
  run(process.argv.slice(2)).catch(e => { console.error(e); process.exit(1); });
}

module.exports = { SOURCES, mirror, run };
