// Смоук-тест вёрстки: грузим index.html в jsdom и проверяем, что всё отрендерилось.
// Запуск из корня проекта:  npm i jsdom && node tools/smoke.js
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

const root = path.resolve(__dirname, '..');

const errors = [];
// jsdom не реализует часть медиа-API и сообщает об этом как об ошибке, хотя
// страница тут ни при чём. pause() в app.js обойдён (не вызывается у стоящего
// клипа), а play() обойти нельзя — клип на карточке обязан играть. Поэтому
// такие сообщения отбрасываем, но считаем: если их вдруг не будет, когда
// ожидались, это тоже сигнал.
const JSDOM_GAPS = [
  "Not implemented: HTMLMediaElement's play() method"
];
let gaps = 0;
const keep = m => {
  if (JSDOM_GAPS.some(g => m.indexOf(g) !== -1)) { gaps++; return false; }
  return true;
};
const vc = new VirtualConsole();
vc.on('jsdomError', e => { if (keep(e.message)) errors.push('jsdomError: ' + e.message); });
vc.on('error', (...a) => errors.push('console.error: ' + a.join(' ')));

const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

const dom = new JSDOM(html, {
  runScripts: 'dangerously',
  virtualConsole: vc,
  url: 'http://localhost/',
  pretendToBeVisual: true
});

// Ресурсы не грузим — вставляем скрипты вручную, в том же порядке, что в HTML
const doc = dom.window.document;
for (const src of ['assets/data/projects.js', 'assets/js/app.js']) {
  const s = doc.createElement('script');
  s.textContent = fs.readFileSync(path.join(root, src), 'utf8');
  doc.body.appendChild(s);
}
doc.dispatchEvent(new dom.window.Event('DOMContentLoaded'));

const q = sel => Array.from(doc.querySelectorAll(sel));
const click = node => node.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));

let bad = 0;
function check(name, got, expected) {
  const ok = got === expected;
  if (!ok) bad++;
  console.log((ok ? 'OK   ' : 'FAIL ') + name + ': ' + got + (ok ? '' : ' (ожидалось ' + expected + ')'));
}

// Идентификаторы не должны дублироваться: на этом уже ломался рендер стека
const ids = q('[id]').map(n => n.id);
const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
check('дубликатов id', dupes.length, 0);
if (dupes.length) console.log('       дубли: ' + dupes.join(', '));

// Меню живёт под кликом по имени в шапке; отдельной строки навигации нет.
// Считаем от числа секций, а не литералом: раздел добавили или убрали — тест
// подстроится сам, а рассинхрон меню и секций всё равно поймает.
check('пунктов в меню', q('#navMenu a').length, q('main section.sec').length);
check('меню закрыто по умолчанию', doc.getElementById('navMenu').hidden, true);
check('кнопки «Резюме» в шапке нет', q('#hdrCv').length, 0);

// Hero-блок убран целиком: страница начинается с проектов
check('hero-блока нет', q('.hero').length, 0);
check('счётчиков нет', q('[data-count]').length, 0);
check('первая секция — проекты', doc.querySelector('main > section').id, 'projects');

// Дальше всё сверяем с данными (window.SITE / window.PROJECTS), а не с литералами:
// контент правят часто и параллельно, тест падать от правки текста не должен.
const S = dom.window.SITE || {};
const P = dom.window.PROJECTS || [];

// Крупный заголовок над проектами — вместо убранного hero
const h1 = doc.querySelector('#projects .lead__h');
check('роль крупным заголовком над проектами', h1 ? h1.textContent : null, S.role);
check('h1 на странице ровно один', q('h1').length, 1);

const cards = q('#grid .card');
check('карточек проектов', cards.length, P.length);
check('карточек с превью', q('#grid .card__shot img').length, P.filter(p => p.shot).length);
check('заглушек без превью', q('#grid .card__shot--empty').length, P.filter(p => !p.shot).length);
// Раздел «Стек» убран целиком 2026-10-01. Проверяем именно отсутствие всех
// четырёх частей: секции, списка, данных и пункта меню.
check('секции «Стек» нет', q('#stack, #stackList, .stack, .stack__grp').length, 0);
check('данных стека нет', S.stack == null, true);
check('пункта меню «Стек» нет', q('#navMenu a').some(a => /стек/i.test(a.textContent)), false);
const facts = S.facts || [];
check('строк фактов', q('#facts .facts__row').length, facts.length);
check('контактов', q('.about__links a').length,
      ['telegram', 'email', 'hh', 'github'].filter(k => S[k]).length);
check('абзацев «О себе»', q('#aboutTxt p:not(.about__links)').length, S.about.length);
// Абзац со «*» на первой позиции рисуется сноской. Ожидание считаем из данных:
// убрали сноску из текста — уйдёт и проверка, а не упадёт тест.
const aboutNotes = (S.about || []).reduce((n, p) => n + String(p)
  .split(/\n\s*\n/).filter(t => t.trim().charAt(0) === '*').length, 0);
check('сносок «О себе»', q('#aboutTxt .about__note').length, aboutNotes);
check('имя в шапке', doc.querySelector('.logo span[data-site]').textContent, S.name);
check('логотип-картинка в шапке', doc.querySelectorAll('.logo img.logo__mark').length, 1);

// Фильтры по тематике вернулись 2026-10-01 — уже не как отдельная секция,
// а чипами справа от заголовка «Проекты». Набор чипов считается из данных:
// тема проекта — это kind, у мультитемы — элементы themes.
const themes = [];
P.forEach(p => (p.themes && p.themes.length ? p.themes : [p.kind]).forEach(t => {
  if (themes.indexOf(t) === -1) themes.push(t);
}));
const themesOfP = p => (p.themes && p.themes.length ? p.themes : [p.kind]);
const chips = q('#filters .fchip');
check('чипов-фильтров (+ «Все»)', chips.length, themes.length + 1);
check('первый чип — «Все»', chips[0] && chips[0].textContent, 'Все');
check('«Все» включён по умолчанию', chips[0] && chips[0].classList.contains('is-on'), true);
check('по умолчанию видны все карточки', q('#grid .card').filter(c => !c.hidden).length, P.length);

// Клик по чипу прячет карточки чужих тем. Берём первую тему из данных, чтобы
// тест не зависел от порядка проектов.
const tName = themes[0];
click(chips[1]);
check('фильтр: видны только карточки темы',
  q('#grid .card').filter(c => !c.hidden).length,
  P.filter(p => themesOfP(p).indexOf(tName) !== -1).length);
check('фильтр: выбранный чип помечен', chips[1].getAttribute('aria-pressed'), 'true');
check('фильтр: «Все» снят', chips[0].getAttribute('aria-pressed'), 'false');
click(chips[0]);
check('фильтр сброшен: видны все карточки', q('#grid .card').filter(c => !c.hidden).length, P.length);

// Порядок чипов задан списком THEME_ORDER в данных, а не порядком карточек:
// флагман переезжает наверх, а «AI-проекты» обязаны остаться первым чипом.
// Литерал здесь намеренно — это решение о продукте, а не производная от данных.
check('порядок чипов', chips.map(c => c.textContent).join(' / '),
  'Все / AI-проекты / Игры / Сайты / Инструменты');

// Мультитема: проект из themes[] обязан находиться в каждом своём чипе.
// Первый такой проект — VDIE (AI-продукт, который ещё и инструмент).
const multi = P.filter(p => p.themes && p.themes.length > 1)[0];
if (multi) {
  const label = {
    'Игра': 'Игры', 'Сайт': 'Сайты', 'AI-продукт': 'AI-проекты',
    'Расширение': 'Расширения', 'Инструмент': 'Инструменты'
  };
  multi.themes.forEach(t => {
    click(chips.filter(c => c.textContent === (label[t] || t))[0]);
    const seen = q('#grid .card').filter(c => !c.hidden &&
      c.querySelector('.card__t').textContent.trim() === multi.title).length;
    check('«' + multi.title + '» виден в теме «' + (label[t] || t) + '»', seen, 1);
  });
  click(chips[0]);
}

// Скрытое по просьбе: Chattrix, бейджи «в сети», кнопка PDF
check('блока Chattrix нет', q('#grid .card').some(c => /chattrix/i.test(c.textContent)), false);
check('бейджей «в сети» нет', q('#grid .badge--live').length, 0);
// Факты убраны из данных (2026-10-02). <dl> остаётся в разметке — он держит
// вторую колонку грида, — но строк внутри быть не должно, иначе вернётся
// полоса-рамка. Вернут данные — включится проверка «факт «опыт»».
if (facts.length) check('факт «опыт»', q('#facts .facts__row dd')[0].textContent, facts[0][1]);
else check('пустой блок фактов без строк', q('#facts .facts__row, #facts dt, #facts dd').length, 0);

// Секция «Контакты» удалена: ссылки перенесены в «О себе» (renderAbout).
check('секции «Контакты» нет', q('#contact').length, 0);
check('пункта меню «Контакты» нет', q('#navMenu a').some(a => /контакт/i.test(a.textContent)), false);

// ORFree AI — последняя карточка. Набор ссылок берём из данных в том порядке,
// в каком их рисует card(): demo, web, tg, repo. Убрали поле — ушла и кнопка,
// добавили — вернулась, тест при этом не переписывают.
const last = cards[cards.length - 1];
const lastP = P[P.length - 1];
const lastLinks = Array.from(last.querySelectorAll('.card__links a'));
const expectLinks = [];
if (lastP.links.demo) expectLinks.push([lastP.links.demo, lastP.links.demoLabel || 'Открыть сайт']);
if (lastP.links.web) expectLinks.push([lastP.links.web, 'Веб-версия']);
if (lastP.links.tg) expectLinks.push([lastP.links.tg, lastP.links.tgLabel || 'Telegram-бот']);
if (lastP.links.vk) expectLinks.push([lastP.links.vk, 'ВКонтакте']);
if (lastP.links.repo) expectLinks.push([lastP.links.repo, 'GitHub']);
check('последняя карточка — из данных', last.querySelector('.card__t').textContent, lastP.title);
check('последняя карточка: превью', last.querySelector('.card__shot img').getAttribute('src'), lastP.shot);
check('последняя карточка: ссылок', lastLinks.length, expectLinks.length);
expectLinks.forEach(function (e, n) {
  check('последняя карточка: ссылка #' + (n + 1), lastLinks[n].getAttribute('href'), e[0]);
  check('последняя карточка: подпись #' + (n + 1), lastLinks[n].textContent.trim(), e[1]);
});

// Подпись главной кнопки берётся из данных, где задана (у игр — «Demo», у ORFree — «RuStore»)
P.forEach((p, i) => {
  const want = (p.links || {}).demoLabel;
  if (!want) return;
  const got = cards[i].querySelector('.card__links a.is-primary').textContent.trim();
  check('подпись кнопки у «' + p.title + '»', got, want);
});

// Второстепенные ссылки (vk, tg) проверяются по данным, а не по одной карточке:
// так новый проект с кнопкой ВКонтакте получает проверку сам, без правки теста.
P.forEach((p, i) => {
  const L = p.links || {};
  [['vk', 'ВКонтакте', null], ['tg', null, L.tgLabel || 'Telegram-бот']].forEach(([key, fixed, fallback]) => {
    if (!L[key]) return;
    const a = cards[i].querySelector('.card__links a[href="' + L[key] + '"]');
    if (!a) { bad++; console.log('FAIL кнопка ' + key + ' у «' + p.title + '»: не найдена'); return; }
    check('кнопка ' + key + ' у «' + p.title + '»: подпись', a.textContent.trim(), fixed || fallback);
    check('кнопка ' + key + ' у «' + p.title + '»: иконка', a.querySelectorAll('svg').length, 1);
  });
});

// Контакты — теперь в «О себе» (renderAbout), не в отдельной секции.
// Ждём ровно те ссылки, чьи поля заданы в SITE, и в том же порядке,
// в каком их перебирает renderAbout: telegram, email, hh. GitHub скрыт.
const hrefs = q('.about__links a').map(a => a.getAttribute('href'));
const contactDefs = [
  ['telegram', S.telegram],
  ['email', S.email && 'mailto:' + S.email],
  ['hh', S.hh]
].filter(d => d[1]);
check('контактов: ссылок столько же, сколько полей в данных', hrefs.length, contactDefs.length);
check('есть telegram', hrefs.includes(S.telegram), true);

// Подписи-домены в контактах не рисуются.
check('в контактах нет подписей-доменов', q('.about__links span').length, 0);

// Почта: mailto из адреса в данных, без target и без download.
if (S.email) {
  const mail = q('.about__links a').find(a => (a.getAttribute('href') || '').startsWith('mailto:'));
  check('почта: адрес из данных', mail && mail.getAttribute('href'), 'mailto:' + S.email);
  check('почта: без target', mail && mail.hasAttribute('target'), false);
  check('почта: без download', mail && mail.hasAttribute('download'), false);
}

// Ссылка на HH должна быть настоящей, а не заглушкой
const hhLink = hrefs.find(h => h.includes('hh.ru'));
check('есть ссылка на HH', !!hhLink, true);
check('ссылка на HH не заглушка', /^https:\/\/hh\.ru\/resume\/[0-9a-f]{8,}$/.test(hhLink || ''), true);

// PDF-резюме удалено полностью: ни ссылки, ни файла
check('ссылок на PDF нет', hrefs.some(h => /\.pdf/i.test(h)), false);
check('файла assets/resume.pdf нет', fs.existsSync(path.join(root, 'assets/resume.pdf')), false);

// Порядок контактов — из данных, а не из литерала. mailto приводим к тому же виду,
// что и адреса: у него нет ни схемы //, ни пути.
const host = u => u.replace(/^mailto:/, '').replace(/^https:\/\//, '').split('/')[0];
check('порядок контактов', hrefs.map(host).join(' | '), contactDefs.map(d => host(d[1])).join(' | '));

// Ни одного PDF в дереве сайта
const pdfs = [];
(function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p);
    else if (/\.pdf$/i.test(e.name)) pdfs.push(path.relative(root, p));
  }
})(path.join(root, 'assets'));
check('PDF в assets не осталось', pdfs.join(', '), '');

// Лайтбокс: открыть, перейти вперёд, закрыть
const lb = doc.getElementById('lb');
click(cards[0].querySelector('.card__shot'));
check('лайтбокс открылся', lb.hidden, false);
check('лайтбокс: заголовок', doc.getElementById('lbTitle').textContent, P[0].title);
click(doc.getElementById('lbNext'));
check('лайтбокс: следующий проект', doc.getElementById('lbTitle').textContent, P[1].title);
click(lb.querySelector('.lb__x'));
check('лайтбокс закрылся', lb.hidden, true);

// Галерея: у проекта с shots в лайтбоксе снизу полоска кадров, превью карточки
// при этом берётся из shot, а просмотр открывается на первом кадре галереи.
// Идём по всем таким проектам, а не по первому: галерей уже две (HC AI,
// Bubble Peaks), и вторая молча осталась бы без проверки.
P.forEach((galP, gi) => {
  if (!galP.shots || galP.shots.length < 2) return;
  const n = 'галерея «' + galP.title + '»: ';
  const strip = doc.getElementById('lbShots');
  click(cards[gi].querySelector('.card__shot'));
  check(n + 'превью карточки — из shot',
    cards[gi].querySelector('.card__shot img').getAttribute('src'), galP.shot);
  check(n + 'полоска кадров показана', strip.hidden, false);
  check(n + 'кадров в полоске', strip.querySelectorAll('.lb__shot').length, galP.shots.length);
  check(n + 'открылся первый кадр', doc.getElementById('lbImg').getAttribute('src'), galP.shots[0]);
  check(n + 'shot есть среди кадров', galP.shots.indexOf(galP.shot) !== -1, true);
  click(strip.querySelectorAll('.lb__shot')[1]);
  check(n + 'клик по превью меняет кадр', doc.getElementById('lbImg').getAttribute('src'), galP.shots[1]);
  check(n + 'выбранный кадр помечен',
    strip.querySelectorAll('.lb__shot')[1].getAttribute('aria-current'), 'true');
  click(lb.querySelector('.lb__x'));
  check(n + 'полоска очищена при закрытии', strip.querySelectorAll('.lb__shot').length, 0);
  check(n + 'полоска скрыта при закрытии', strip.hidden, true);
});

// Проект без демо, но с репозиторием: главная кнопка лайтбокса ведёт в код,
// а не прячется — иначе в просмотре у такого проекта не осталось бы ссылок вовсе.
const repoOnly = P.map((p, i) => ({ p, i }))
  .filter(x => (x.p.links || {}).repo && !(x.p.links || {}).demo)[0];
if (repoOnly) {
  click(cards[repoOnly.i].querySelector('.card__shot'));
  const go = doc.getElementById('lbGo');
  check('лайтбокс: кнопка на репозиторий показана', go.hidden, false);
  check('лайтбокс: адрес кнопки — репозиторий', go.getAttribute('href'), repoOnly.p.links.repo);
  check('лайтбокс: подпись кнопки — «GitHub»', doc.getElementById('lbGoTxt').textContent, 'GitHub');
  click(lb.querySelector('.lb__x'));
  check('лайтбокс закрылся после проекта с репо', lb.hidden, true);
}

// Подпись главной кнопки в лайтбоксе берётся из данных. Проект ищем по наличию
// demo, а не «последний»: последним может стоять проект с одной лишь ссылкой
// на репозиторий, и тогда у кнопки другая подпись.
const demoP = P.map((p, i) => ({ p, i })).filter(x => (x.p.links || {}).demo).pop();
if (demoP) {
  click(cards[demoP.i].querySelector('.card__shot'));
  check('лайтбокс: подпись главной кнопки',
        doc.getElementById('lbGoTxt').textContent, demoP.p.links.demoLabel || 'Открыть сайт');
  click(lb.querySelector('.lb__x'));
}

// Демо в окне монитора. Вёрстки в jsdom нет, но логику перехвата клика и закрытия
// проверить можно: окно jsdom 1024×768 даёт стекло ~540 px, то есть порог 430 пройден.
const demo = doc.getElementById('demo');
const embedded = P.map((p, i) => ({ i, p })).filter(x => (x.p.links || {}).demoEmbed);
check('демо-окно есть в разметке', !!demo, true);
check('демо-окно скрыто по умолчанию', demo.hidden, true);
check('стекло экрана есть в разметке', !!doc.getElementById('demoScreen'), true);
check('проекты с demoEmbed есть', embedded.length > 0, true);
check('у каждого demoEmbed есть ссылка demo',
      embedded.every(x => !!(x.p.links || {}).demo), true);

const fire = node => {
  const e = new dom.window.MouseEvent('click', { bubbles: true, cancelable: true });
  node.dispatchEvent(e);
  return e;
};

const embLink = cards[embedded[0].i].querySelector('a.is-primary');
check('клик по Demo перехвачен (новая вкладка не открывается)', fire(embLink).defaultPrevented, true);
check('демо-окно открылось', demo.hidden, false);
const demoFrame = doc.getElementById('demoFrame');
check('кадр демо создан', !!demoFrame, true);
check('кадр ведёт на demo из данных',
      demoFrame && demoFrame.getAttribute('src'), embedded[0].p.links.demo);
check('подпись в демо-окне', doc.getElementById('demoTitle').textContent, embedded[0].p.title);
check('прокрутка заблокирована', doc.body.style.overflow, 'hidden');

doc.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
check('демо-окно закрылось по Escape', demo.hidden, true);
check('кадр демо удалён (игра погашена)', !!doc.getElementById('demoFrame'), false);
check('прокрутка освободилась', doc.body.style.overflow, '');

// Проект без demoEmbed обязан вести себя как раньше — обычной ссылкой
const plain = P.map((p, i) => ({ i, p }))
  .find(x => (x.p.links || {}).demo && !(x.p.links || {}).demoEmbed);
if (plain) {
  const plainLink = cards[plain.i].querySelector('a.is-primary');
  check('без demoEmbed клик не перехвачен', fire(plainLink).defaultPrevented, false);
  check('без demoEmbed окно не открылось', demo.hidden, true);
}

// Меню в шапке: открыть кликом по имени, закрыть ссылкой, кликом мимо и Escape
const logoBtn = doc.getElementById('logoBtn');
const navMenu = doc.getElementById('navMenu');
check('кнопка меню: aria-expanded в покое', logoBtn.getAttribute('aria-expanded'), 'false');
click(logoBtn);
check('клик по имени открывает меню', navMenu.hidden, false);
check('кнопка меню: aria-expanded открыт', logoBtn.getAttribute('aria-expanded'), 'true');
click(navMenu.querySelector('a'));
check('клик по ссылке закрывает меню', navMenu.hidden, true);
click(logoBtn);
click(doc.body);
check('клик мимо закрывает меню', navMenu.hidden, true);
click(logoBtn);
doc.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
check('Escape закрывает меню', navMenu.hidden, true);

// Якоря меню ведут на существующие секции
q('#navMenu a').forEach(a => {
  const id = a.getAttribute('href').slice(1);
  const ok = !!doc.getElementById(id);
  if (!ok) bad++;
  console.log((ok ? 'OK   ' : 'FAIL ') + 'якорь меню #' + id);
});

// Файлы на месте
for (const rel of ['assets/css/style.css', 'assets/js/app.js', 'assets/data/projects.js',
                   'assets/fonts/handjet.css', 'assets/fonts/handjet-cyrillic.woff2',
                   'assets/img/favicon.svg', 'assets/img/logo.png', 'assets/img/og-v2.jpg',
                   'assets/img/projects/shrooms.jpg', 'assets/img/projects/bubblepeaks.jpg',
                   'assets/img/projects/bubblepeaks-splash.jpg',
                   'assets/img/projects/lilcraft.jpg', 'assets/img/projects/bazaskate.jpg',
                   'assets/img/projects/dubbed.jpg', 'assets/img/projects/rustore.jpg',
                   'assets/img/projects/modellab.jpg',
                   'assets/img/projects/modellab-tables.jpg']) {
  const ok = fs.existsSync(path.join(root, rel));
  if (!ok) bad++;
  console.log((ok ? 'OK   ' : 'FAIL ') + 'файл ' + rel);
}

// Godot-сборка тянет часть файлов не из HTML, а из своего JS: worklet'ы звука
// подключаются через locate_file(), поэтому обход ссылок их не видит, и в
// список зеркала (tools/mirror-static.js, GODOT) их приходится вписывать
// руками. Один раз не вписали — обе игры уехали без звука, и заметить это
// можно было только ушами. Проверяем по самому движку: какие имена он
// запрашивает, такие файлы и должны лежать рядом.
// Карта имён: движок просит "godot.<остаток>", на диске лежит "<exe><остаток>".
for (const g of ['deddemo', 'bubblepeaks']) {
  const dir = path.join(root, 'games', g);
  const jsPath = path.join(dir, 'index.js');
  const htmlPath = path.join(dir, 'index.html');
  if (!fs.existsSync(jsPath) || !fs.existsSync(htmlPath)) {
    console.log('SKIP нет сборки games/' + g);
    continue;
  }
  const js = fs.readFileSync(jsPath, 'utf8');
  const exe = (fs.readFileSync(htmlPath, 'utf8')
    .match(/"executable"\s*:\s*"([^"]+)"/) || [])[1] || 'index';
  const want = new Set();
  const re = /locate_file\(\s*"(godot\.[^"]+)"\s*\)/g;
  let m;
  while ((m = re.exec(js))) want.add(exe + m[1].slice('godot'.length));
  for (const f of want) {
    const ok = fs.existsSync(path.join(dir, f));
    if (!ok) bad++;
    console.log((ok ? 'OK   ' : 'FAIL ') + 'worklet движка на месте: games/' + g + '/' + f);
  }
}

// Все превью, указанные в данных, существуют
P.forEach(p => {
  if (!p.shot) return;
  const ok = fs.existsSync(path.join(root, p.shot));
  if (!ok) bad++;
  console.log((ok ? 'OK   ' : 'FAIL ') + 'превью из данных: ' + p.shot);
});

// Шрифт заголовков: подгруппы cyrillic и latin вшиты в CSS как data: URI и идут
// с font-display: block. Саму подмену шрифта видно только глазами — её ловит
// tools/fout.js по кадрам, — а здесь проверяется механизм, который её исключает:
// отдельного запроса нет (шрифт приезжает со стилём), и ни один кадр не может
// быть отрисован системным шрифтом. Плюс у вшитых подгрупп не должно быть
// preload: он бы тянул те же файлы вторым запросом и впустую.
const fcss = fs.readFileSync(path.join(root, 'assets/fonts/handjet.css'), 'utf8');
const faces = fcss.split('@font-face').slice(1);
const inlined = faces.filter(b => /src:\s*url\(data:font\/woff2/.test(b));
const byFile = faces.filter(b => /src:\s*url\(handjet-/.test(b));
check('@font-face в handjet.css', faces.length, 4);
check('подгрупп вшито в CSS', inlined.length, 2);
check('вшитые подгруппы: font-display block', inlined.every(b => /font-display:\s*block/.test(b)), true);
check('ссылочные подгруппы: font-display swap', byFile.every(b => /font-display:\s*swap/.test(b)), true);
check('preload шрифта не нужен (шрифт уже в CSS)', q('link[rel=preload][as=font]').length, 0);

if (errors.length) { bad++; console.log('ОШИБКИ В JS:\n' + errors.join('\n')); }
if (gaps) console.log('(известные пробелы jsdom, не ошибки страницы: ' + gaps + ')');
console.log(bad === 0 ? '\nИТОГ: всё зелёное' : '\nИТОГ: проблем ' + bad);
process.exit(bad === 0 ? 0 : 1);
