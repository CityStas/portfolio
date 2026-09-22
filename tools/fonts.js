/* Собирает assets/fonts/handjet.css из woff2-подгрупп.
   Запуск из корня проекта:  node tools/fonts.js

   Зачем: пока шрифт лежит отдельным файлом, браузер узнаёт о нём только после
   разбора CSS и первого расчёта раскладки, а запрос уходит в низкоприоритетную
   очередь. В этот зазор заголовки успевают отрисоваться системным шрифтом, и
   потом происходит подмена (FOUT). Preload лечит это по сети, но не по file://:
   там origin = null, и crossorigin-preload шрифта падает в CORS.

   Поэтому подгруппы, которые в тексте сайта реально есть (cyrillic и latin),
   зашиваются в CSS как data: URI. Тогда шрифт приезжает вместе со стилём,
   который и так блокирует отрисовку: подменять нечего ни по сети, ни локально.
   Остальные подгруппы (cyrillic-ext, latin-ext) остаются ссылками на файлы —
   их unicode-range в этом тексте не пересекается ни с одним символом, браузер
   их не запрашивает, но если однажды появится такой символ, он отрисуется
   Handjet, а не системным шрифтом.

   unicode-range берётся из уже существующего handjet.css, а не из констант:
   это данные Google Fonts, дублировать их в коде незачем. */
const fs = require('fs');
const path = require('path');

const DIR = path.resolve(__dirname, '..', 'assets', 'fonts');
const CSS = path.join(DIR, 'handjet.css');
// INLINE_SUBSETS="" переключает на ссылки на файлы — так проверяется, что
// проверка на подмену шрифта в verify.js действительно краснеет.
const INLINE = process.env.INLINE_SUBSETS === undefined
  ? ['cyrillic', 'latin']
  : process.env.INLINE_SUBSETS.split(',').filter(Boolean);

const src = fs.readFileSync(CSS, 'utf8');

// Блоки вида  /* subset */\n@font-face { ... }
const blocks = [];
const re = /\/\*\s*([a-z-]+)\s*\*\/\s*@font-face\s*\{([\s\S]*?)\}/g;
let m;
while ((m = re.exec(src))) {
  const range = /unicode-range:\s*([^;]+);/.exec(m[2]);
  if (!range) throw new Error('нет unicode-range в блоке ' + m[1]);
  blocks.push({ sub: m[1], range: range[1].trim() });
}
if (!blocks.length) throw new Error('в handjet.css не нашлось @font-face');

const head = `/* Сгенерировано tools/fonts.js — руками не править.
   Запуск: node tools/fonts.js
   Подгруппы ${INLINE.join(' и ')} зашиты как data: URI и идут с font-display: block:
   отдельного запроса нет, и ни один кадр не рисуется системным шрифтом. Со swap
   браузер успевает показать системный шрифт в первом кадре и подменить его (FOUT).
   Остальные подгруппы — ссылками на файлы и со swap. */
`;

let out = head;
for (const b of blocks) {
  const file = 'handjet-' + b.sub + '.woff2';
  const abs = path.join(DIR, file);
  const inlined = INLINE.indexOf(b.sub) !== -1;
  let url;
  if (inlined) {
    const b64 = fs.readFileSync(abs).toString('base64');
    url = `url(data:font/woff2;base64,${b64}) format('woff2')`;
  } else {
    url = `url(${file}) format('woff2')`;
  }
  // block, а не swap: разбор FontFace асинхронен даже для data: URI, и со swap
  // браузер успевает нарисовать системный шрифт в первом кадре, а потом подменить
  // его (это и видно как «сначала старый шрифт»). Вшитая подгруппа опоздать не
  // может, поэтому block не даёт нарисовать ни одного кадра системным шрифтом.
  // Ссылочные подгруппы наоборот: если такой символ однажды появится, лучше
  // показать его системным шрифтом, чем не показать вовсе.
  const display = inlined ? 'block' : 'swap';
  out += `
/* ${b.sub} */
@font-face {
  font-family: 'Handjet';
  font-style: normal;
  font-weight: 400 700;
  font-display: ${display};
  src: ${url};
  unicode-range: ${b.range};
}
`;
}

fs.writeFileSync(CSS, out);

const kb = n => (n / 1024).toFixed(1) + ' КБ';
console.log('handjet.css: ' + kb(src.length) + ' -> ' + kb(out.length));
for (const b of blocks) {
  const f = path.join(DIR, 'handjet-' + b.sub + '.woff2');
  const size = fs.existsSync(f) ? kb(fs.statSync(f).size) : 'нет файла';
  console.log('  ' + (INLINE.indexOf(b.sub) !== -1 ? 'вшит  ' : 'файлом') +
    '  ' + b.sub.padEnd(13) + size);
}
