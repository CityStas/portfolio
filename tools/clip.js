/* Режет короткие зацикленные клипы для карточек портфолио.
   Сырая запись экрана -> assets/media/<slug>.{mp4,webm,jpg[,gif]}.

   Запуск (из корня проекта):
     node tools/clip.js              # все записи из таблицы CLIPS
     node tools/clip.js hotcache     # только одну
     node tools/clip.js hotcache --gif   # плюс gif-версия

   Нужен ffmpeg в PATH. Ставится одной командой:
     winget install --id Gyan.FFmpeg -e
   После установки открыть новое окно терминала (PATH обновляется только в новых).

   Сырые записи кладём в _raw/ — папка в .gitignore и в деплой не уходит:
     _raw/hotcache.mkv, _raw/modellab.mp4
   Имя файла произвольное, важен только путь в поле src.

   Что получается:
     mp4    — основной источник, H.264 + yuv420p + faststart: играет везде,
              включая Safari, и начинает играть до полной загрузки
     webm   — VP9, обычно на треть легче mp4; в разметке идёт первым, браузер
              возьмёт его, если умеет, иначе молча откатится на mp4
     jpg    — постер: кадр из середины клипа, показывается до загрузки видео
     gif    — по флагу --gif. Формат заведомо хуже: 256 цветов дают бандинг
              на тёмных градиентах, а вес в разы больше. Нужен только если
              клип надо вставить туда, где <video> некуда положить

   Про съёмку, чтобы клип читался:
     - пиши в 2x разрешении (2560x1440) и отдай сюда — даунскейл сохранит
       читаемость мелкого шрифта после компрессии. Запись сразу в 720p
       превращается в кашу;
     - первая и последняя секунда должны совпадать по состоянию, иначе петля
       дёргается на стыке. Либо режь по естественному циклу анимации;
     - 6-12 секунд достаточно. Дольше не смотрят;
     - звук снимаем всегда (-an): в карточке он всё равно запрещён автоплеем. */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const RAW = path.join(ROOT, '_raw');
const OUT = path.join(ROOT, 'assets', 'media');

/*  slug  — имя проекта, по нему же ищется карточка в projects.js
    src   — сырая запись, путь от корня проекта
    from  — с какой секунды резать
    to    — по какую; dur = to - from
    w     — ширина выхода, высота считается по пропорции (не растягиваем)
    fps   — 24 для UI достаточно: счётчики успевают читаться, битрейт вдвое ниже
    crf   — качество H.264: меньше = лучше и тяжелее. 21 — почти без потерь
    poster— секунда, из которой взять кадр-заглушку. Не задана — середина клипа */
const CLIPS = [
  {
    slug: 'hotcache',
    src: '_raw/hotcache.mkv',
    from: 0, to: 10,
    w: 1280, fps: 24, crf: 21,
    poster: null
  },
  {
    slug: 'modellab',
    src: '_raw/modellab.mp4',
    from: 0, to: 10,
    w: 1280, fps: 24, crf: 21,
    poster: null
  }
];

const GIF_W = 760;      // ширина gif: шире — вес растёт нелинейно
const GIF_FPS = 15;     // 15 кадров хватает, чтобы движение читалось

const args = process.argv.slice(2);
const WITH_GIF = args.indexOf('--gif') !== -1;
const ONLY = args.filter(a => a.charAt(0) !== '-');

function have(name) {
  try { execFileSync(name, ['-version'], { stdio: 'ignore' }); return true; }
  catch (e) { return false; }
}

function ff(a) {
  execFileSync('ffmpeg', a, { stdio: 'inherit' });
}

// Внутри фильтра запятая разделяет фильтры, поэтому в аргументе min() её
// приходится экранировать. Оболочки тут нет, так что бэкслеш доедет как есть.
function fit(w) {
  return 'min(' + w + '\\,iw)';
}

function mb(file) {
  return (fs.statSync(file).size / 1048576).toFixed(2) + ' MB';
}

function build(c) {
  const src = path.join(ROOT, c.src);
  if (!fs.existsSync(src)) {
    console.log('-- ' + c.slug + ': нет ' + c.src + ' — пропускаю');
    return false;
  }

  const dur = c.to - c.from;
  if (!(dur > 0)) {
    console.log('-- ' + c.slug + ': to (' + c.to + ') не больше from (' + c.from + ')');
    return false;
  }

  const mp4 = path.join(OUT, c.slug + '.mp4');
  const webm = path.join(OUT, c.slug + '.webm');
  const jpg = path.join(OUT, c.slug + '.jpg');
  const gif = path.join(OUT, c.slug + '.gif');
  const vf = 'scale=' + fit(c.w) + ':-2:flags=lanczos,fps=' + c.fps;

  console.log('\n== ' + c.slug + '  (' + c.src + ', ' + c.from + '→' + c.to + ' с)');

  ff(['-y', '-hide_banner', '-loglevel', 'error',
      '-ss', String(c.from), '-i', src, '-t', String(dur),
      '-vf', vf,
      '-c:v', 'libx264', '-preset', 'slow', '-crf', String(c.crf),
      '-profile:v', 'high', '-pix_fmt', 'yuv420p',
      '-movflags', '+faststart', '-an', mp4]);
  console.log('   mp4   ' + mb(mp4));

  ff(['-y', '-hide_banner', '-loglevel', 'error',
      '-ss', String(c.from), '-i', src, '-t', String(dur),
      '-vf', vf,
      '-c:v', 'libvpx-vp9', '-crf', '34', '-b:v', '0',
      '-row-mt', '1', '-cpu-used', '2', '-deadline', 'good',
      '-pix_fmt', 'yuv420p', '-an', webm]);
  console.log('   webm  ' + mb(webm));

  // Постер берём из готового mp4, а не из сырья: кадр гарантированно из клипа
  // и уже приведён к той же пропорции.
  const at = (c.poster == null) ? c.from + dur / 2 : c.poster;
  ff(['-y', '-hide_banner', '-loglevel', 'error',
      '-ss', String(at), '-i', mp4, '-frames:v', '1',
      '-vf', 'scale=' + fit(c.w), '-q:v', '4', jpg]);
  console.log('   jpg   ' + mb(jpg) + '  (кадр на ' + at.toFixed(1) + ' с)');

  if (WITH_GIF) {
    // Двухпроходная схема: сначала палитра по всему клипу, потом ею красим.
    // Без palettegen gif получает системные 216 цветов и разваливается.
    const pal = path.join(OUT, '.' + c.slug + '-pal.png');
    const gvf = 'fps=' + GIF_FPS + ',scale=' + fit(GIF_W) + ':-1:flags=lanczos';
    ff(['-y', '-hide_banner', '-loglevel', 'error',
        '-ss', String(c.from), '-i', src, '-t', String(dur),
        '-vf', gvf + ',palettegen=stats_mode=diff', '-an', pal]);
    ff(['-y', '-hide_banner', '-loglevel', 'error',
        '-ss', String(c.from), '-i', src, '-t', String(dur), '-i', pal,
        '-lavfi', gvf + '[x];[x][1:v]paletteuse=dither=bayer:bayer_scale=3',
        '-an', '-loop', '0', gif]);
    fs.unlinkSync(pal);
    console.log('   gif   ' + mb(gif));
  }

  return true;
}

if (!have('ffmpeg')) {
  console.error('ffmpeg не найден в PATH.\n' +
    'Поставить:  winget install --id Gyan.FFmpeg -e\n' +
    'После установки открыть новое окно терминала.');
  process.exit(1);
}

fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(RAW, { recursive: true });

const list = CLIPS.filter(c => !ONLY.length || ONLY.indexOf(c.slug) !== -1);
if (!list.length) {
  console.error('Нет таких записей: ' + ONLY.join(', ') + '\n' +
    'Есть в таблице: ' + CLIPS.map(c => c.slug).join(', '));
  process.exit(1);
}

let done = 0;
list.forEach(c => { if (build(c)) done++; });

console.log('\nГотово: ' + done + ' из ' + list.length + '. Файлы в assets/media/');
if (!done) {
  console.log('Положи сырые записи в _raw/ — пути указаны в таблице CLIPS.');
}
