/* ============================================================
   Рендер портфолио из assets/data/projects.js. Без зависимостей.
   ============================================================ */
(function () {
  'use strict';

  var S = window.SITE || {};
  var P = window.PROJECTS || [];

  var $  = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  function el(tag, cls, txt) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (txt != null) n.textContent = txt;
    return n;
  }
  function svg(path) {
    var s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    s.setAttribute('viewBox', '0 0 24 24');
    s.setAttribute('aria-hidden', 'true');
    s.innerHTML = path;
    return s;
  }

  // Описание проекта в данных — обычная строка. Пустая строка разделяет абзацы,
  // а абзац, начинающийся со «*», считается сноской: он рисуется мельче и глуше
  // (см. .card__note). Однострочное описание ведёт себя ровно как раньше —
  // один абзац без обёрток, так что старые данные ничего не замечают.
  function descParts(desc) {
    var out = [];
    String(desc == null ? '' : desc).split(/\n\s*\n/).forEach(function (part) {
      var t = part.trim();
      if (t) out.push({ text: t, note: t.charAt(0) === '*' });
    });
    return out;
  }

  var I = {
    out:   '<path d="M7 17 17 7M9 7h8v8"/>',
    store: '<path d="M4.5 8h15l-1 11.4a2 2 0 0 1-2 1.9H7.5a2 2 0 0 1-2-1.9L4.5 8z"/><path d="M9 8V6.2a3 3 0 0 1 6 0V8"/>',
    globe: '<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.2 2.4 3.4 5.3 3.4 8.5S14.2 18.1 12 20.5c-2.2-2.4-3.4-5.3-3.4-8.5S9.8 5.9 12 3.5z"/>',
    zoom: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.6-3.6M11 8.5v5M8.5 11h5"/>',
    code: '<path d="m9 18-6-6 6-6M15 6l6 6-6 6"/>',
    tg:   '<path d="m21 4-3 16-6-4.5L21 4z"/><path d="M12 15.5 9 19v-4l9-11"/>',
    // ВК нарисован литерами, а не фирменным знаком: остальные иконки набора
    // тоже контурные (GitHub, Telegram, почта), заливка выбивалась бы из ряда.
    vk:   '<path d="M2.5 7 7 17l4.5-10M14.5 7v10M14.5 12l6-5M14.5 12l6 5"/>',
    gh:   '<path d="M9 19c-4 1.2-4-2.2-5.5-2.8M15 21v-3.4c0-1 .1-1.4-.5-2 2.4-.3 4.4-1.2 4.4-5a3.9 3.9 0 0 0-1.1-2.7 3.6 3.6 0 0 0-.1-2.7s-.9-.3-2.9 1.1a10 10 0 0 0-5.2 0C7.6 4.5 6.7 4.8 6.7 4.8a3.6 3.6 0 0 0-.1 2.7A3.9 3.9 0 0 0 5.5 10.2c0 3.8 2 4.7 4.4 5-.6.6-.6 1.2-.5 2V21"/>',
    hh:   '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7V5.5A2.5 2.5 0 0 1 10.5 3h3A2.5 2.5 0 0 1 16 5.5V7M3 12h18"/>',
    mail: '<rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="m4.2 7.6 7 4.9a2 2 0 0 0 2.3 0l7-4.9"/>',
    cv:   '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/>'
  };

  /* ---------- Тексты из данных ---------- */
  function fillSite() {
    $$('[data-site]').forEach(function (n) {
      var v = S[n.getAttribute('data-site')];
      if (v) n.textContent = v;
    });
  }

  /* ---------- О себе ---------- */
  function renderAbout() {
    var box = $('#aboutTxt');
    // Абзац, начинающийся со «*», выводится сноской — тот же приём, что в
    // описаниях карточек (descParts): мельче и глуше основного текста.
    // Абзац без «*» остаётся ровно одним <p>, как было.
    if (box && S.about) S.about.forEach(function (p) {
      var parts = descParts(p);
      if (!parts.length) parts = [{ text: p == null ? '' : p, note: false }];
      parts.forEach(function (d) {
        box.appendChild(el(d.note ? 'small' : 'p', d.note ? 'about__note' : null, d.text));
      });
    });

    // Контакты перенесены из отдельной секции «03 Контакты» (удалена) сюда,
    // в текст «О себе». GitHub скрыт — выводятся только Telegram и HH.
    // Стиль .about__links — в style.css рядом с .about.
    if (box) {
      var links = [];
      if (S.telegram) links.push({ label: 'Telegram', href: S.telegram });
      if (S.email)    links.push({ label: 'Почта',    href: 'mailto:' + S.email });
      if (S.hh)       links.push({ label: 'Резюме на HH', href: S.hh });
      if (links.length) {
        var p = el('p', 'about__links');
        p.appendChild(document.createTextNode('Связь: '));
        links.forEach(function (c, i) {
          if (i) p.appendChild(document.createTextNode('  ·  '));
          var a = el('a', null, c.label);
          a.href = c.href;
          if (/^https?:/.test(c.href)) { a.target = '_blank'; a.rel = 'noopener'; }
          p.appendChild(a);
        });
        box.appendChild(p);
      }
    }

    var dl = $('#facts');
    if (dl) {
      (S.facts || []).forEach(function (row) {
        var w = el('div', 'facts__row');
        w.appendChild(el('dt', null, row[0]));
        w.appendChild(el('dd', null, row[1]));
        dl.appendChild(w);
      });
      // Факты убраны из данных — пустую рамку не оставляем: <dl> уходит из
      // разметки, и текст занимает всю ширину (.about__txt:only-child).
      if (!dl.children.length) dl.parentNode.removeChild(dl);
    }
  }

  /* ---------- Проекты ---------- */
  var STATUS = {
    live:     ['live',     'в сети'],
    wip:      ['wip',      'в разработке'],
    archived: ['archived', 'архив']
  };

  // Кадры проекта. Обычный проект — один shot; если задан shots, это галерея,
  // и она же служит источником для лайтбокса. shot при этом остаётся превью
  // карточки, поэтому «на карточке кадр 2, в просмотре кадр 1» задаётся
  // просто: shot — второй, shots — [первый, второй].
  function shotsOf(p) {
    if (p.shots && p.shots.length) return p.shots.slice();
    return p.shot ? [p.shot] : [];
  }

  /* ---------- Клип в карточке ---------- */

  // Тип источника выводим из расширения, а не из имени поля: если в clip положить
  // webm, а объявить его как mp4, декодер откажется его играть — и молча, потому
  // что play() при этом отработает без ошибки.
  function srcType(url, fallback) {
    var m = /\.([a-z0-9]+)(?:[?#]|$)/i.exec(String(url || ''));
    var ext = m ? m[1].toLowerCase() : '';
    if (ext === 'webm') return 'video/webm';
    if (ext === 'mp4' || ext === 'm4v') return 'video/mp4';
    if (ext === 'ogv' || ext === 'ogg') return 'video/ogg';
    return fallback;
  }

  // Источники в порядке предпочтения: webm легче, mp4 играет везде. Браузер берёт
  // первый, который умеет, — отдельная проверка поддержки не нужна.
  function videoSources(v, p) {
    v.textContent = '';
    if (p.clipWebm) {
      var w = document.createElement('source');
      w.src = p.clipWebm; w.type = srcType(p.clipWebm, 'video/webm');
      v.appendChild(w);
    }
    // Пустой clip — это не источник, а команда очистить: <source src=""> ушёл бы
    // запросом на саму страницу.
    if (!p.clip) return;
    var m = document.createElement('source');
    m.src = p.clip; m.type = srcType(p.clip, 'video/mp4');
    v.appendChild(m);
  }

  // Отпускаем видео целиком: пауза, снятые источники, убранный постер. Одно место
  // на закрытие лайтбокса и на переключение на проект без клипа.
  function clearVideo(v) {
    if (!v) return;
    pauseVideo(v);
    v.hidden = true;
    v.textContent = '';
    v.removeAttribute('poster');
  }

  function clipVideo(p, poster) {
    var v = document.createElement('video');
    v.className = 'card__clip';
    v.muted = true;
    v.loop = true;
    v.playsInline = true;
    // muted и playsinline нужны именно атрибутами: по одному свойству Safari
    // автоплей не разрешает. Остальные браузеры лишнее молча игнорируют.
    v.setAttribute('muted', '');
    v.setAttribute('playsinline', '');
    v.preload = 'none';                    // сеть трогаем только когда карточка на экране
    v.setAttribute('aria-hidden', 'true'); // кнопка вокруг уже подписана текстом
    if (poster) v.poster = poster;
    if (p.shotPos) v.style.objectPosition = p.shotPos;
    videoSources(v, p);
    return v;
  }

  // play() возвращает промис, который браузер вправе отклонить: энергосбережение,
  // фоновый таб, запрет автоплея. Это не ошибка страницы — остаёмся на постере.
  function playVideo(v) {
    try {
      var r = v.play();
      if (r && r.catch) r.catch(function () {});
    } catch (e) {}
  }

  // Пауза нужна только играющему клипу: у стоящего она ничего не меняет, а jsdom
  // на такой вызов пишет «Not implemented» в консоль — смоук-тест считает это ошибкой.
  function pauseVideo(v) {
    if (!v || v.paused) return;
    try { v.pause(); } catch (e) {}
  }

  // Играют только клипы, попавшие в окно. Иначе все карточки разом уходят в сеть
  // и держат декодеры, пока страница просто открыта.
  function initClips() {
    var vids = $$('.card__clip');
    if (!vids.length) return;
    if (!('IntersectionObserver' in window)) return;

    // Просили меньше движения — клип не запускаем совсем, остаётся постер.
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) {
        if (e.isIntersecting) {
          if (e.target.preload === 'none') e.target.preload = 'auto';
          playVideo(e.target);
        } else {
          pauseVideo(e.target);
        }
      });
    }, { rootMargin: '200px 0px', threshold: .25 });

    vids.forEach(function (v) { io.observe(v); });
  }

  function card(p, i) {
    var a = el('article', 'card reveal');

    // --- превью ---
    // Клип идёт поверх постера: если видео не проиграется или в системе попросили
    // меньше движения, под ним остаётся статичный кадр, а не пустое место.
    // Превью — именно shot, а не первый кадр галереи: у проекта может быть задано
    // «на карточке кадр 2, в просмотре кадр 1». shotsOf() тут только подстраховка
    // для проекта, у которого shot не задан вовсе.
    var poster = p.clipPoster || p.shot || shotsOf(p)[0];
    if (poster || p.clip) {
      var shot = el('button', 'card__shot');
      shot.type = 'button';
      shot.setAttribute('aria-label', 'Показать превью: ' + p.title);

      if (p.clip) shot.appendChild(clipVideo(p, poster));

      if (poster) {
        var img = document.createElement('img');
        img.src = poster;
        img.alt = 'Превью проекта ' + p.title;
        img.loading = i < 2 ? 'eager' : 'lazy';   // первые две карточки — сразу, остальные по скроллу
        img.decoding = 'async';
        img.width = 1280;
        img.height = 800;
        // Карточка 16:10, кадры шире — cover обрезает по бокам. Если важное в кадре
        // смещено (враг справа), проект задаёт shotPos, куда сдвинуть окно.
        if (p.shotPos) img.style.objectPosition = p.shotPos;
        shot.appendChild(img);
      }

      var hint = el('span', 'card__hint');
      hint.appendChild(svg(I.zoom));
      hint.appendChild(document.createTextNode('Увеличить'));
      shot.appendChild(hint);

      shot.addEventListener('click', function () { openLb(i); });
      a.appendChild(shot);
    } else {
      var ph = el('div', 'card__shot card__shot--empty');
      var inner = el('div', 'ph');
      inner.appendChild(el('span', 'ph__mark', (p.title || '?').trim().charAt(0).toUpperCase()));
      inner.appendChild(el('span', 'ph__note', 'превью не снято'));
      ph.appendChild(inner);
      a.appendChild(ph);
    }

    // --- тело ---
    var body = el('div', 'card__body');

    var meta = el('div', 'card__meta');
    // Бейдж рисуем только для исключений. «в сети» — состояние по умолчанию,
    // зелёный кружок на каждой карточке ничего не сообщает и только шумит.
    if (p.status && p.status !== 'live') {
      var st = STATUS[p.status] || STATUS.archived;
      var b = el('span', 'badge badge--' + st[0]);
      b.appendChild(el('i'));
      b.appendChild(document.createTextNode(st[1]));
      meta.appendChild(b);
    }
    if (p.kind) meta.appendChild(el('span', 'card__kind', p.kind));
    if (p.year) meta.appendChild(el('span', 'card__year', p.year));
    body.appendChild(meta);

    body.appendChild(el('h3', 'card__t', p.title));

    // Сноска идёт отдельным элементом, а не частью абзаца: ей нужен свой кегль.
    var parts = descParts(p.desc);
    if (!parts.length) parts = [{ text: p.desc == null ? '' : p.desc, note: false }];
    parts.forEach(function (d) {
      body.appendChild(el(d.note ? 'small' : 'p', d.note ? 'card__note' : 'card__d', d.text));
    });

    if (p.tags && p.tags.length) {
      var tags = el('div', 'card__tags');
      p.tags.forEach(function (t) { tags.appendChild(el('span', 'tag', t)); });
      body.appendChild(tags);
    }

    var L = p.links || {};
    if (L.demo || L.repo || L.web || L.tg || L.vk) {
      var links = el('div', 'card__links');
      if (L.demo) {
        var d = el('a', 'is-primary');
        d.href = L.demo; d.target = '_blank'; d.rel = 'noopener';
        d.appendChild(svg(L.demoIcon === 'store' ? I.store : I.out));
        d.appendChild(document.createTextNode(L.demoLabel || 'Открыть сайт'));
        // Ссылка остаётся ссылкой: при открытом демо-окне клик перехватываем,
        // во всех остальных случаях работает обычный переход в новую вкладку.
        d.addEventListener('click', function (e) { demoClick(e, p); });
        links.appendChild(d);
      }
      if (L.web) {
        var w = el('a');
        w.href = L.web; w.target = '_blank'; w.rel = 'noopener';
        w.appendChild(svg(I.globe));
        w.appendChild(document.createTextNode('Веб-версия'));
        links.appendChild(w);
      }
      if (L.tg) {
        var tg = el('a');
        tg.href = L.tg; tg.target = '_blank'; tg.rel = 'noopener';
        tg.appendChild(svg(I.tg));
        tg.appendChild(document.createTextNode(L.tgLabel || 'Telegram-бот'));
        links.appendChild(tg);
      }
      if (L.vk) {
        var vk = el('a');
        vk.href = L.vk; vk.target = '_blank'; vk.rel = 'noopener';
        vk.appendChild(svg(I.vk));
        vk.appendChild(document.createTextNode('ВКонтакте'));
        links.appendChild(vk);
      }
      if (L.repo) {
        var r = el('a');
        r.href = L.repo; r.target = '_blank'; r.rel = 'noopener';
        // Значок GitHub, а не «</>»: подпись «GitHub» с иконкой кода читалась бы
        // как две разные ссылки. Тот же значок стоит у GitHub в контактах.
        r.appendChild(svg(I.gh));
        r.appendChild(document.createTextNode('GitHub'));
        links.appendChild(r);
      }
      body.appendChild(links);
    }

    a.appendChild(body);
    a.appendChild(el('div', 'card__glow'));

    // подсветка под курсором
    a.addEventListener('mousemove', function (e) {
      var r = a.getBoundingClientRect();
      a.style.setProperty('--mx', (e.clientX - r.left) + 'px');
      a.style.setProperty('--my', (e.clientY - r.top) + 'px');
    });

    return a;
  }

  function renderProjects() {
    var box = $('#grid');
    if (!box) return;
    P.forEach(function (p, i) { box.appendChild(card(p, i)); });
  }

  /* ---------- Фильтр по тематике ---------- */
  var ALL = 'Все';
  var activeTheme = ALL;

  // Ярлык чипа называет группу, а не тип одной карточки: «Игры», не «Игра».
  // 'Инструмент' сейчас темой не встречается, поэтому и чипа нет; строка остаётся
  // на случай нового проекта этого типа — без неё чип получил бы подпись в
  // единственном числе («Инструмент»), а не групповую.
  var THEME_LABEL = {
    'Игра': 'Игры',
    'Сайт': 'Сайты',
    'AI-продукт': 'AI-проекты',
    'Расширение': 'Расширения',
    'Инструмент': 'Инструменты'
  };
  function themeLabel(t) { return THEME_LABEL[t] || t; }

  // Тема проекта — это kind. Проект может лежать сразу в нескольких темах
  // (игра + AI-инструмент) — тогда он задаёт themes массивом, и попадёт в оба чипа.
  function themesOf(p) {
    if (p.themes && p.themes.length) return p.themes.slice();
    return p.kind ? [p.kind] : [];
  }

  function matches(p) {
    if (activeTheme === ALL) return true;
    return themesOf(p).indexOf(activeTheme) !== -1;
  }

  // Темы, реально встречающиеся в данных, в порядке карточек.
  function themesInUse() {
    var out = [];
    P.forEach(function (p) {
      themesOf(p).forEach(function (t) { if (out.indexOf(t) === -1) out.push(t); });
    });
    return out;
  }

  // Порядок чипов задаётся списком THEME_ORDER в данных, а не порядком карточек:
  // карточки переставляются (флагман идёт первым), а ряд фильтров должен стоять
  // стабильно. Темы, которых в списке нет, дописываются в конец — новый тип
  // проекта попадёт в фильтр сам, но привычный порядок не сломает. Если списка
  // в данных нет, поведение прежнее: порядок = порядок карточек.
  function themeList() {
    var used = themesInUse();
    var out = [];
    (window.THEME_ORDER || []).forEach(function (t) {
      if (used.indexOf(t) !== -1 && out.indexOf(t) === -1) out.push(t);
    });
    used.forEach(function (t) { if (out.indexOf(t) === -1) out.push(t); });
    return out;
  }

  // Карточки не пересобираются, а прячутся: так сохраняются и уже загруженные
  // превью, и подписка на появление в кадре (скрытая карточка не пересекается
  // с окном, поэтому is-in она получит ровно тогда, когда её покажут).
  function applyFilter() {
    $$('#grid .card').forEach(function (c, i) { c.hidden = !matches(P[i]); });
  }

  function setTheme(t) {
    activeTheme = t;
    $$('#filters .fchip').forEach(function (b) {
      var on = b.getAttribute('data-th') === t;
      b.classList.toggle('is-on', on);
      b.setAttribute('aria-pressed', String(on));
    });
    applyFilter();
  }

  function renderFilters() {
    var box = $('#filters');
    if (!box) return;
    var list = themeList();
    // Один тип проектов — фильтровать нечего: ряд чипов только займёт строку.
    if (list.length < 2) { box.hidden = true; return; }

    [ALL].concat(list).forEach(function (t) {
      var b = el('button', 'fchip');
      b.type = 'button';
      b.setAttribute('data-th', t);
      b.textContent = themeLabel(t);
      b.addEventListener('click', function () { setTheme(t); });
      box.appendChild(b);
    });
    setTheme(activeTheme);
    box.hidden = false;
  }

  /* ---------- Контакты ---------- */
  // Секция «03 Контакты» удалена из HTML. Кнопки перенесены в «О себе»
  // (renderAbout). Функция оставлена для совместимости, но не вызывается:
  // контейнер #links больше не существует, return на первой строке.
  function renderContacts() {
    var box = $('#links');
    if (!box) return;
    var items = [];
    // Четвёртый элемент — подпись-домен рядом с названием. Она необязательна:
    // у Telegram и HH дублирует то, что уже написано в названии и в адресе,
    // и только удлиняет кнопку. Понадобится — добавить четвёртым элементом.
    if (S.telegram) items.push(['tg', 'Telegram', S.telegram]);
    if (S.email)    items.push(['mail', 'Почта', 'mailto:' + S.email, S.email]);
    if (S.hh)       items.push(['hh', 'Резюме на HH', S.hh]);
    if (S.github)   items.push(['gh', 'GitHub',   S.github]);
    // PDF-резюме убрано совсем: ни файла, ни ссылки. Вернуть — прописать cv в SITE.

    items.forEach(function (it) {
      var a = el('a', 'link');
      a.href = it[2];
      // mailto: открывает почтовый клиент — ни новой вкладки, ни скачивания.
      if (/^https?:/.test(it[2])) { a.target = '_blank'; a.rel = 'noopener'; }
      else if (!/^mailto:/.test(it[2])) a.download = '';   // локальный файл отдаём на скачивание
      a.appendChild(svg(I[it[0]] || ''));
      a.appendChild(document.createTextNode(it[1]));
      if (it[3]) a.appendChild(el('span', null, it[3]));
      box.appendChild(a);
    });
  }

  /* ---------- Лайтбокс ---------- */
  var lbIdx = 0, lbLast = null;
  var lbShots = [], lbShot = 0;   // галерея текущего проекта и открытый кадр

  // Проекты, у которых есть что показать крупно: кадр или клип. Скрытые
  // фильтром сюда не попадают — иначе стрелки уводили бы на карточку, которой
  // на странице нет.
  function withMedia() {
    return P.map(function (p, i) {
      if (!matches(p)) return -1;
      return (shotsOf(p).length || p.clip) ? i : -1;
    }).filter(function (i) { return i !== -1; });
  }

  // Кадр галереи. Смена src у одного <img>, а не второй <img> в разметке:
  // так кадр не дублируется в DOM и не грузится дважды.
  function setShot(n) {
    var img = $('#lbImg');
    if (!img || !lbShots.length) return;
    lbShot = (n + lbShots.length) % lbShots.length;
    img.src = lbShots[lbShot];
    img.alt = 'Превью проекта ' + (P[lbIdx] ? P[lbIdx].title : '');
    $$('#lbShots .lb__shot').forEach(function (b, i) {
      var on = i === lbShot;
      b.classList.toggle('is-on', on);
      b.setAttribute('aria-current', on ? 'true' : 'false');
    });
  }

  // Полоска превью. Один кадр — полоски нет, лишний ряд кнопок ни о чём не сообщает.
  function renderShots() {
    var box = $('#lbShots');
    if (!box) return;
    box.textContent = '';
    if (lbShots.length < 2) { box.hidden = true; return; }

    lbShots.forEach(function (src, n) {
      var b = el('button', 'lb__shot');
      b.type = 'button';
      b.setAttribute('aria-label', 'Кадр ' + (n + 1) + ' из ' + lbShots.length);
      var im = document.createElement('img');
      im.src = src;
      im.alt = '';
      im.loading = 'lazy';
      im.decoding = 'async';
      b.appendChild(im);
      b.addEventListener('click', function () { setShot(n); });
      box.appendChild(b);
    });
    box.hidden = false;
  }

  function openLb(i) {
    var lb = $('#lb');
    if (!lb || !P[i] || !(shotsOf(P[i]).length || P[i].clip)) return;

    lbLast = document.activeElement;
    lbIdx = i;

    var p = P[i];
    var img = $('#lbImg');
    var vid = $('#lbVid');
    // Постер нужен только клипу. Кадру он не нужен: кадр и есть кадр.
    var poster = p.clipPoster || p.shot || shotsOf(p)[0];

    // Галерея собирается до показа кадра: setShot ищет кнопки в разметке.
    lbShots = shotsOf(p);
    renderShots();

    // Клип показываем с управлением: его можно перемотать, а не только смотреть
    // петлю. У проектов без клипа остаётся <img> — с галереей, если кадров больше одного.
    if (p.clip && vid) {
      videoSources(vid, p);
      if (poster) vid.poster = poster; else vid.removeAttribute('poster');
      vid.hidden = false;
      playVideo(vid);
      img.hidden = true;
      img.removeAttribute('src');       // кадр держать незачем, видео его перекрыло
    } else {
      clearVideo(vid);
      img.hidden = false;
      // Открываемся на первом кадре галереи, даже если на карточке был другой:
      // в просмотре логично начать с начала, а не с середины.
      if (lbShots.length) setShot(0);
      else { img.removeAttribute('src'); img.alt = ''; }
    }

    $('#lbTitle').textContent = p.title;

    // #lbDesc — это <p>, поэтому абзацы внутри него разделяются <br>, а не
    // вложенными <p>. Сноска — <small>, ей хватает display:block из .card__note.
    var lbDesc = $('#lbDesc');
    lbDesc.textContent = '';
    descParts(p.desc).forEach(function (d, n) {
      if (n && !d.note) lbDesc.appendChild(document.createElement('br'));
      lbDesc.appendChild(el(d.note ? 'small' : 'span', d.note ? 'card__note' : '', d.text));
    });

    // Кнопка лайтбокса — та же главная ссылка, что и на карточке. Если демо нет,
    // но есть репозиторий, ведём в него: иначе у проекта, который живёт только
    // исходниками, в просмотре не осталось бы ни одной ссылки.
    var go = $('#lbGo');
    var L = p.links || {};
    var gt = $('#lbGoTxt');
    if (L.demo) {
      go.href = L.demo;
      go.hidden = false;
      if (gt) gt.textContent = L.demoLabel || 'Открыть сайт';
    } else if (L.repo) {
      go.href = L.repo;
      go.hidden = false;
      if (gt) gt.textContent = 'GitHub';
    } else {
      go.hidden = true;
    }

    lb.hidden = false;
    document.body.style.overflow = 'hidden';
    var x = $('.lb__x', lb);
    if (x) x.focus();
  }

  function closeLb() {
    var lb = $('#lb');
    if (!lb || lb.hidden) return;
    // Клип гасим и отпускаем источники: под закрытой модалкой он иначе продолжает
    // играть и держит декодер. Разметку всё равно пересоберёт следующий openLb.
    clearVideo($('#lbVid'));
    // И кадр возвращаем в нейтральное состояние: закрытый лайтбокс не должен
    // держать ничьё состояние — оба медиа-элемента пустые и в исходной видимости.
    var img = $('#lbImg');
    if (img) {
      img.hidden = false;
      img.removeAttribute('src');
    }
    // Полоску превью отпускаем вместе с кадром: закрытая модалка не должна
    // держать в разметке и в памяти десяток картинок.
    var shots = $('#lbShots');
    if (shots) { shots.textContent = ''; shots.hidden = true; }
    lbShots = [];
    lbShot = 0;
    lb.hidden = true;
    document.body.style.overflow = '';
    if (lbLast && lbLast.focus) lbLast.focus();
  }

  function stepLb(dir) {
    var list = withMedia();
    if (list.length < 2) return;
    var at = list.indexOf(lbIdx);
    openLb(list[(at + dir + list.length) % list.length]);
  }

  // Видимые и фокусируемые элементы внутри контейнера.
  // offsetParent здесь не годится: .lb позиционирован fixed, у детей он тоже null.
  function focusables(root) {
    return $$('a[href], button:not([disabled]), iframe, input, select, textarea, [tabindex]', root)
      .filter(function (n) {
        if (n.hidden || n.getAttribute('aria-hidden') === 'true') return false;
        var r = n.getBoundingClientRect();
        return !!(r.width || r.height);
      });
  }

  // Фокус не выпускаем за пределы диалога: иначе Tab уводит клавиатурного
  // пользователя на страницу под модалкой, которая перекрыта.
  function trapFocus(e, root) {
    var f = focusables(root);
    if (!f.length) return;
    var first = f[0], last = f[f.length - 1], a = document.activeElement;
    var outside = !root.contains(a);
    if (e.shiftKey) {
      if (a === first || outside) { e.preventDefault(); last.focus(); }
    } else if (a === last || outside) {
      e.preventDefault(); first.focus();
    }
  }

  function initLb() {
    var lb = $('#lb');
    if (!lb) return;

    $$('[data-lb-close]', lb).forEach(function (n) { n.addEventListener('click', closeLb); });
    var prev = $('#lbPrev'), next = $('#lbNext');
    if (prev) prev.addEventListener('click', function () { stepLb(-1); });
    if (next) next.addEventListener('click', function () { stepLb(1); });

    // Кнопка в лайтбоксе — та же ссылка на демо, что и на карточке.
    var go = $('#lbGo');
    if (go) go.addEventListener('click', function (e) { demoClick(e, P[lbIdx]); });

    document.addEventListener('keydown', function (e) {
      if (lb.hidden) return;
      // Поверх лайтбокса может быть открыто демо — тогда клавиши его, а не наши.
      var demo = $('#demo');
      if (demo && !demo.hidden) return;
      if (e.key === 'Escape') { e.preventDefault(); closeLb(); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); stepLb(-1); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); stepLb(1); }
      else if (e.key === 'Tab') trapFocus(e, lb);
    });
  }

  /* ---------- Демо в окне монитора ---------- */
  /* Рамка нарисована на CSS, игра идёт в iframe внутри неё. Константы размера
     дублируют формулу из .demo__screen в style.css — там по ним же считается
     ширина стекла. Меняешь в одном месте — поменяй и в другом. */
  var MON_CAP = 1280;        // потолок 720p: больше пикселей на кадр игре не нужно
  var MON_VW = .92;          // доля ширины окна
  var MON_RESERVE = 198;     // полоса панели управления (78) + низ (16) + рамка и подставка (104), px
  var MON_MIN = 430;         // уже стекло бесполезно: ссылка уходит в новую вкладку

  var demoLast = null, demoTimer = 0;

  // Ширина стекла при текущем окне. Считаем на каждый клик, а не один раз:
  // окно могли перетащить на другой монитор или повернуть экран.
  function monScreen() {
    return Math.min(MON_CAP,
                    window.innerWidth * MON_VW,
                    (window.innerHeight - MON_RESERVE) * 16 / 9);
  }

  // Единая точка входа для клика по ссылке на демо.
  function demoClick(e, p) {
    var L = (p && p.links) || {};
    if (!L.demo || !L.demoEmbed || monScreen() < MON_MIN) return;   // обычный переход в новую вкладку
    e.preventDefault();
    demoOpen(p);
  }

  function demoOpen(p) {
    var box = $('#demo'), screen = $('#demoScreen'), mon = $('#demoMon');
    var L = (p && p.links) || {};
    if (!box || !screen || !L.demo) return;

    demoLast = document.activeElement;

    $('#demoTitle').textContent = p.title;
    $('#demoExt').href = L.demo;
    var failLink = $('#demoFailLink');
    if (failLink) failLink.href = L.demo;

    // Кадр создаём заново на каждое открытие, а на закрытии удаляем: иначе игра
    // продолжает крутиться в фоне и держит GPU с памятью.
    var old = $('#demoFrame');
    if (old) old.remove();

    var fr = document.createElement('iframe');
    fr.id = 'demoFrame';
    fr.title = 'Демо: ' + p.title;
    // pointer-lock нужен двум играм из трёх (обзор мышью), fullscreen — кнопке
    // движка, autoplay — звуку после первого клика. Лишние токены браузер молча
    // игнорирует, поэтому перечисляем весь набор сразу.
    fr.setAttribute('allow', 'fullscreen; autoplay; gamepad; pointer-lock');
    fr.setAttribute('allowfullscreen', '');
    fr.src = L.demo;
    screen.appendChild(fr);

    if (mon) mon.classList.remove('is-ready');   // индикатор янтарный, пока грузится
    var fail = $('#demoFail');
    if (fail) fail.hidden = true;
    clearTimeout(demoTimer);
    demoTimer = setTimeout(function () { if (fail && !box.hidden) fail.hidden = false; }, 12000);

    fr.addEventListener('load', function () {
      clearTimeout(demoTimer);
      if (fail) fail.hidden = true;
      if (mon) mon.classList.add('is-ready');
      // Управление должно работать без лишнего клика: клавиатуру слушает документ
      // внутри кадра, значит фокус обязан уехать туда.
      try { fr.focus(); } catch (e) {}
    });

    box.hidden = false;
    document.body.style.overflow = 'hidden';
    var x = $('.demo__x', box);
    if (x) x.focus();
  }

  function demoClose() {
    var box = $('#demo');
    if (!box || box.hidden) return;
    clearTimeout(demoTimer);
    var fr = $('#demoFrame');
    if (fr) fr.remove();                 // гасим игру, а не прячем её
    box.hidden = true;
    var mon = $('#demoMon');
    if (mon) mon.classList.remove('is-ready');
    // Под демо может оставаться открытый лайтбокс — тогда прокрутку не снимаем.
    var lb = $('#lb');
    document.body.style.overflow = (lb && !lb.hidden) ? 'hidden' : '';
    if (demoLast && demoLast.focus) demoLast.focus();
  }

  function initDemo() {
    var box = $('#demo');
    if (!box) return;
    $$('[data-demo-close]', box).forEach(function (n) { n.addEventListener('click', demoClose); });

    // Escape сработает, пока фокус в самой странице. Как только он уехал внутрь
    // кадра, клавиши достаются игре — там остаётся крестик и клик по фону.
    document.addEventListener('keydown', function (e) {
      if (box.hidden) return;
      if (e.key === 'Escape') { e.preventDefault(); demoClose(); }
      else if (e.key === 'Tab') trapFocus(e, box);
    });
  }

  /* ---------- Меню по структуре сайта ---------- */
  // На узком экране живёт под кликом по имени в шапке. На широком пункты
  // стоят в шапке открыто (CSS, min-width: 901px), а клик по имени уводит
  // наверх — выпадающего списка там нет.
  function initMenu() {
    var btn = $('#logoBtn'), nav = $('#navMenu');
    if (!btn || !nav) return;

    var wide = window.matchMedia ? window.matchMedia('(min-width: 901px)') : null;
    function isWide() { return !!(wide && wide.matches); }

    function setOpen(open) {
      nav.hidden = !open;
      if (isWide()) return;              // aria-expanded у не-меню кнопки только путает
      btn.setAttribute('aria-expanded', String(open));
    }

    // Границу отслеживаем, а не читаем размер окна на лету: без сброса меню,
    // открытое на узком экране, осталось бы раскрытым и вылезло поверх шапки
    // после расширения окна.
    function syncWide() {
      if (isWide()) {
        setOpen(false);
        btn.removeAttribute('aria-expanded');
        btn.removeAttribute('aria-controls');
        btn.title = 'Наверх';
      } else {
        btn.setAttribute('aria-controls', 'navMenu');
        btn.setAttribute('aria-expanded', String(!nav.hidden));
        btn.title = 'Меню разделов';
      }
    }

    btn.addEventListener('click', function (e) {
      if (isWide()) { window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
      e.stopPropagation();               // иначе клик тут же закроет меню обработчиком ниже
      setOpen(nav.hidden);
    });

    // переход по якорю — меню закрываем, дальше работает обычный скролл
    nav.addEventListener('click', function (e) {
      if (e.target.closest('a')) setOpen(false);
    });

    document.addEventListener('click', function (e) {
      if (nav.hidden) return;
      if (nav.contains(e.target) || btn.contains(e.target)) return;
      setOpen(false);
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !nav.hidden) { setOpen(false); btn.focus(); }
    });

    if (wide) {
      if (wide.addEventListener) wide.addEventListener('change', syncWide);
      else if (wide.addListener) wide.addListener(syncWide);   // Safari до 14
    }
    syncWide();

    // подсветка текущего раздела
    var links = $$('a[href^="#"]', nav);
    var secs = links.map(function (a) { return document.getElementById(a.getAttribute('href').slice(1)); });
    if (!('IntersectionObserver' in window)) return;

    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) {
        if (!e.isIntersecting) return;
        links.forEach(function (a, i) { a.classList.toggle('is-active', secs[i] === e.target); });
      });
    }, { rootMargin: '-45% 0px -50% 0px' });
    secs.forEach(function (s) { if (s) io.observe(s); });
  }

  /* ---------- Тема ---------- */
  function initTheme() {
    var btn = $('#themeBtn');
    if (!btn) return;

    // Тема могла приехать из localStorage ещё до отрисовки (inline-скрипт в <head>),
    // поэтому цвет адресной строки синхронизируем сразу, а не только по клику.
    function syncMeta() {
      var meta = document.querySelector('meta[name="theme-color"]');
      if (meta) {
        meta.setAttribute('content',
          document.documentElement.getAttribute('data-theme') === 'light' ? '#f6f7fa' : '#08090c');
      }
    }
    syncMeta();

    btn.addEventListener('click', function () {
      var next = document.documentElement.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
      document.documentElement.setAttribute('data-theme', next);
      try { localStorage.setItem('theme', next); } catch (e) {}
      syncMeta();
    });
  }

  /* ---------- Прогресс, появление ---------- */
  function initChrome() {
    // Шапка в разметке — header.hdr#top. Раньше здесь стоял $('#hdr'), такого id нет,
    // поэтому класс is-stuck (нижняя рамка при прокрутке) не включался никогда.
    var hdr = $('header.hdr'), bar = $('#progressBar');
    function onScroll() {
      if (hdr) hdr.classList.toggle('is-stuck', window.scrollY > 8);
      if (bar) {
        var h = document.documentElement.scrollHeight - window.innerHeight;
        bar.style.width = (h > 0 ? Math.min(window.scrollY / h, 1) * 100 : 0) + '%';
      }
    }
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });

    var top = $('#totop');
    if (top) top.addEventListener('click', function () { window.scrollTo({ top: 0, behavior: 'smooth' }); });

    var y = $('#year');
    if (y) y.textContent = new Date().getFullYear();

    var targets = $$('.reveal');
    if (!('IntersectionObserver' in window)) {
      targets.forEach(function (n) { n.classList.add('is-in'); });
      return;
    }
    var ro = new IntersectionObserver(function (es, obs) {
      es.forEach(function (e) {
        if (!e.isIntersecting) return;
        e.target.classList.add('is-in');
        obs.unobserve(e.target);
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: .06 });
    targets.forEach(function (n) { ro.observe(n); });
  }

  function init() {
    fillSite();
    renderAbout();
    renderProjects();
    renderFilters();
    initMenu();
    initTheme();
    initLb();
    initDemo();
    initClips();
    initChrome();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
