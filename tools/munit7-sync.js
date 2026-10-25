/* ============================================================================
   Собирает страницу МЕДБЛОК 7 (MUNI7) из проекта-источника в web/munit7/.

   Зачем отдельный шаг, а не просто копия папки: у источника три вещи, которые
   нельзя тащить в репозиторий как есть.
     1. three.js подключён importmap'ом на ../../../vendor/three/ - снаружи
        проекта такого пути нет. Здесь он переписывается на локальный
        ./vendor/three/ и сам three копируется внутрь страницы.
     2. Текстуры лежат PNG по 1.5-3 МБ каждая (768 px, по сути без сжатия).
        15 файлов = 25 МБ, и они грузятся ДО первого кадра. Здесь они
        пережимаются в WebP q86 - та же картинка, ~10x меньше. Пути в HTML
        заменяются на .webp, движку всё равно: TextureLoader декодирует WebP
        обычным Image.
     3. В каталоге источника живут _dev/ (205 МБ) и threejs-parallax-lesson/
        (338 МБ) - это рабочий мусор, а не сборка.

   Запуск из корня проекта:
     node tools/munit7-sync.js
     MUNI7_SRC=D:/other/web_1 node tools/munit7-sync.js     # другой источник

   Нужен Python с Pillow (WebP). Ищется в PY, затем python, py, затем в
   стандартной песочнице WorkBuddy. Без Pillow скрипт не падает: копирует PNG
   как есть и предупреждает - страница останется рабочей, но тяжёлой.
   ============================================================================ */
'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const SRC = process.env.MUNI7_SRC ||
  'F:/Pets/Projects/local_tools/3GS_Master/projects/research/web_1';
const DEST = path.join(ROOT, 'web', 'munit7');

// three.js лежит рядом с источником, а не внутри него
const THREE_SRC = path.join(SRC, '..', '..', '..', 'vendor', 'three');

const Q = 86; // качество WebP для текстур

function die(msg) {
  console.error('ОШИБКА: ' + msg);
  process.exit(1);
}

function findPython() {
  const cands = [
    process.env.PY,
    'python',
    'py',
    'C:/Users/tio/.workbuddy-ai/binaries/python/envs/default/Scripts/python.exe',
    'E:/Programs/Wb/cache/.workbuddy-ai/binaries/python/envs/default/Scripts/python.exe',
  ].filter(Boolean);
  for (const py of cands) {
    try {
      execFileSync(py, ['-c', 'import PIL'], { stdio: 'ignore' });
      return py;
    } catch (e) { /* следующий */ }
  }
  return null;
}

// Один процесс на все файлы: у python запуск дороже, чем само пережатие.
const PY_WEBP = `
import json, sys
from PIL import Image
job = json.load(open(sys.argv[1], encoding='utf-8'))
q = job['q']
for it in job['items']:
    im = Image.open(it['src'])
    if im.mode not in ('RGB', 'RGBA'):
        im = im.convert('RGBA' if 'A' in im.mode else 'RGB')
    im.save(it['dst'], 'WEBP', quality=q, method=6)
    print('  webp %s -> %d KB' % (it['dst'], __import__('os').path.getsize(it['dst']) // 1024))
`;

function main() {
  if (!fs.existsSync(path.join(SRC, 'index.html'))) die('нет ' + path.join(SRC, 'index.html'));
  if (!fs.existsSync(path.join(THREE_SRC, 'three.module.js'))) die('нет three.js в ' + THREE_SRC);

  let html = fs.readFileSync(path.join(SRC, 'index.html'), 'utf8');

  // ---- 1. importmap: внешний путь -> локальный --------------------------------
  const before = html;
  html = html.replace(/\.\.\/\.\.\/\.\.\/vendor\/three\//g, './vendor/three/');
  if (html === before) {
    console.warn('ВНИМАНИЕ: importmap на ../../../vendor/three/ не найден - ' +
                 'в источнике поменялась схема подключения three.js.');
  }

  // Скроллбар: в источнике color-scheme не задан, и в рамке демо-окна портфолио
  // (iframe) справа появляется белая полоса на тёмной странице. Один тег в конец
  // head - больше ничего не трогает, вёрстку не двигает.
  if (!/color-scheme/.test(html)) {
    html = html.replace('</head>', '<style>html{color-scheme:dark}</style>\n</head>');
  }

  // ---- 2. ассеты: собираем ссылки из HTML ------------------------------------
  const refs = [...new Set(html.match(/assets\/[A-Za-z0-9_.\/-]+/g) || [])]
    .filter(r => !r.endsWith('/'));
  if (!refs.length) die('в index.html нет ссылок на assets/ - нечего копировать');

  fs.mkdirSync(DEST, { recursive: true });

  const pngs = [];
  const plain = [];
  for (const ref of refs) {
    const from = path.join(SRC, ref);
    if (!fs.existsSync(from)) {
      console.warn('ВНИМАНИЕ: нет файла ' + ref + ' - ссылка останется битой');
      continue;
    }
    if (/\.png$/i.test(ref)) pngs.push({ ref, src: from });
    else plain.push({ ref, src: from });
  }

  // ---- 3. WebP (решаем ДО правки HTML: без Pillow пути остаются .png) --------
  const py = pngs.length ? findPython() : null;
  const useWebp = !!(pngs.length && py);
  if (pngs.length && !py) {
    console.warn('ВНИМАНИЕ: Pillow не найден, текстуры копируются PNG как есть ' +
                 '(страница будет весить ~25 МБ вместо ~3 МБ).');
  }

  let copied = 0, bytes = 0;

  for (const it of plain) {
    const to = path.join(DEST, it.ref);
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.copyFileSync(it.src, to);
    bytes += fs.statSync(to).size;
    copied++;
  }

  if (useWebp) {
    const jobFile = path.join(require('os').tmpdir(), 'munit7-webp.json');
    const items = pngs.map(it => ({
      src: it.src,
      dst: path.join(DEST, it.ref.replace(/\.png$/i, '.webp')),
    }));
    for (const it of items) fs.mkdirSync(path.dirname(it.dst), { recursive: true });
    fs.writeFileSync(jobFile, JSON.stringify({ q: Q, items }));
    execFileSync(py, ['-c', PY_WEBP, jobFile], { stdio: 'inherit' });
    fs.unlinkSync(jobFile);
    for (const it of items) { bytes += fs.statSync(it.dst).size; copied++; }
    // пути в HTML правим после успешного пережатия, а не до него
    for (const it of pngs) html = html.split(it.ref).join(it.ref.replace(/\.png$/i, '.webp'));
  } else {
    for (const it of pngs) {
      const to = path.join(DEST, it.ref);
      fs.mkdirSync(path.dirname(to), { recursive: true });
      fs.copyFileSync(it.src, to);
      bytes += fs.statSync(to).size;
      copied++;
    }
  }

  // ---- 4. three.js -----------------------------------------------------------
  const vdir = path.join(DEST, 'vendor', 'three');
  fs.mkdirSync(vdir, { recursive: true });
  for (const f of ['three.module.js', 'three.core.js']) {
    fs.copyFileSync(path.join(THREE_SRC, f), path.join(vdir, f));
    bytes += fs.statSync(path.join(vdir, f)).size;
  }
  fs.cpSync(path.join(THREE_SRC, 'addons'), path.join(vdir, 'addons'), { recursive: true });
  for (const f of walk(path.join(vdir, 'addons'))) bytes += fs.statSync(f).size;

  // ---- 5. index.html ---------------------------------------------------------
  fs.writeFileSync(path.join(DEST, 'index.html'), html);

  console.log('\nготово: web/munit7');
  console.log('  ассетов: ' + copied + ', three.js + addons: да');
  console.log('  вес без HTML: ' + (bytes / 1048576).toFixed(1) + ' МБ');
  console.log('  адрес: https://dvodev.space/web/munit7/');
}

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out); else out.push(p);
  }
  return out;
}

main();
