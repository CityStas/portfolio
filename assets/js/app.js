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
    if (box && S.about) S.about.forEach(function (p) { box.appendChild(el('p', null, p)); });

    var dl = $('#facts');
    if (dl && S.facts) {
      S.facts.forEach(function (row) {
        var w = el('div', 'facts__row');
        w.appendChild(el('dt', null, row[0]));
        w.appendChild(el('dd', null, row[1]));
        dl.appendChild(w);
      });
    }
  }

  /* ---------- Стек ---------- */
  function renderStack() {
    var box = $('#stackList');
    if (!box || !S.stack) return;
    S.stack.forEach(function (g) {
      var row = el('div', 'stack__grp reveal');
      row.appendChild(el('div', 'stack__name', g.group));
      var chips = el('div', 'chips');
      g.items.forEach(function (i) { chips.appendChild(el('span', 'chip', i)); });
      row.appendChild(chips);
      box.appendChild(row);
    });
  }

  /* ---------- Проекты ---------- */
  var STATUS = {
    live:     ['live',     'в сети'],
    wip:      ['wip',      'в разработке'],
    archived: ['archived', 'архив']
  };

  function card(p, i) {
    var a = el('article', 'card reveal');

    // --- превью ---
    if (p.shot) {
      var shot = el('button', 'card__shot');
      shot.type = 'button';
      shot.setAttribute('aria-label', 'Показать превью: ' + p.title);

      var img = document.createElement('img');
      img.src = p.shot;
      img.alt = 'Превью проекта ' + p.title;
      img.loading = i < 2 ? 'eager' : 'lazy';   // первые две карточки — сразу, остальные по скроллу
      img.decoding = 'async';
      img.width = 1280;
      img.height = 800;
      // Карточка 16:10, кадры шире — cover обрезает по бокам. Если важное в кадре
      // смещено (враг справа), проект задаёт shotPos, куда сдвинуть окно.
      if (p.shotPos) img.style.objectPosition = p.shotPos;
      shot.appendChild(img);

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
    if (L.demo || L.repo || L.web || L.tg) {
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
      if (L.repo) {
        var r = el('a');
        r.href = L.repo; r.target = '_blank'; r.rel = 'noopener';
        r.appendChild(svg(I.code));
        r.appendChild(document.createTextNode('Код'));
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

  /* ---------- Контакты ---------- */
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

  function withShot() {
    return P.map(function (p, i) { return p.shot ? i : -1; }).filter(function (i) { return i !== -1; });
  }

  function openLb(i) {
    var lb = $('#lb');
    if (!lb || !P[i] || !P[i].shot) return;

    lbLast = document.activeElement;
    lbIdx = i;

    var p = P[i];
    var img = $('#lbImg');
    img.src = p.shot;
    img.alt = 'Превью проекта ' + p.title;
    $('#lbTitle').textContent = p.title;

    // #lbDesc — это <p>, поэтому абзацы внутри него разделяются <br>, а не
    // вложенными <p>. Сноска — <small>, ей хватает display:block из .card__note.
    var lbDesc = $('#lbDesc');
    lbDesc.textContent = '';
    descParts(p.desc).forEach(function (d, n) {
      if (n && !d.note) lbDesc.appendChild(document.createElement('br'));
      lbDesc.appendChild(el(d.note ? 'small' : 'span', d.note ? 'card__note' : '', d.text));
    });

    var go = $('#lbGo');
    var L = p.links || {};
    if (L.demo) {
      go.href = L.demo;
      go.hidden = false;
      var gt = $('#lbGoTxt');
      if (gt) gt.textContent = L.demoLabel || 'Открыть сайт';
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
    lb.hidden = true;
    document.body.style.overflow = '';
    if (lbLast && lbLast.focus) lbLast.focus();
  }

  function stepLb(dir) {
    var list = withShot();
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
  // Живёт под кликом по имени в шапке: отдельной строки навигации на странице нет.
  function initMenu() {
    var btn = $('#logoBtn'), nav = $('#navMenu');
    if (!btn || !nav) return;

    function setOpen(open) {
      nav.hidden = !open;
      btn.setAttribute('aria-expanded', String(open));
    }

    btn.addEventListener('click', function (e) {
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
    renderStack();
    renderProjects();
    renderContacts();
    initMenu();
    initTheme();
    initLb();
    initDemo();
    initChrome();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
