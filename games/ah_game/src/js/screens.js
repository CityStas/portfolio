/* AFTER HOURS -- overlay screens: menu, settings, save/load, gallery,
   premium, backlog, ending card, confirm dialog. */
(function (global) {
  'use strict';

  var I18N = global.AHI18N;

  function el(tag, cls, txt) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (txt != null) n.textContent = txt;
    return n;
  }
  function imgUrl(n) { return global.AHImages.url(n); }
  /** Is the unreliable-narrator reading active for this run? */
  function unreliableOn(app) {
    return !!(app.engine && app.engine.flags && app.engine.flags.has('unreliable'));
  }
  function btn(label, cls, fn) {
    var b = el('button', 'btn' + (cls ? ' ' + cls : ''), label);
    if (fn) b.addEventListener('click', fn);
    return b;
  }

  function Screens(app) {
    this.app = app;
    this.stack = [];
    this.mount = el('div');
    this.mount.id = 'screens';
    this.mount.style.cssText = 'position:absolute;inset:0;z-index:100;pointer-events:none;';
    document.getElementById('viewport').appendChild(this.mount);
    this.buildAll();
  }

  Screens.prototype.buildAll = function () {
    var self = this;
    ['menu', 'style', 'settings', 'load', 'save', 'gallery', 'premium', 'backlog', 'ending'].forEach(function (id) {
      var s = el('div', 'screen');
      s.id = 'scr-' + id;
      s.style.pointerEvents = 'none';
      self.mount.appendChild(s);
      self['scr_' + id] = s;
    });
    // confirm dialog
    this.confirmEl = el('div', 'screen');
    this.confirmEl.id = 'confirm';
    this.confirmEl.style.pointerEvents = 'none';
    this.mount.appendChild(this.confirmEl);
  };

  Screens.prototype.show = function (id) {
    var s = this['scr_' + id];
    if (!s) return;
    s.style.pointerEvents = 'auto';
    s.classList.add('show');
    this.stack.push(id);
  };
  Screens.prototype.hide = function (id) {
    var s = this['scr_' + id];
    if (!s) return;
    s.classList.remove('show');
    s.style.pointerEvents = 'none';
    var i = this.stack.indexOf(id);
    if (i >= 0) this.stack.splice(i, 1);
  };
  Screens.prototype.hideAll = function () {
    var self = this;
    this.stack.slice().forEach(function (id) { self.hide(id); });
    this.confirmEl.classList.remove('show');
    this.confirmEl.style.pointerEvents = 'none';
  };
  Screens.prototype.top = function () { return this.stack[this.stack.length - 1] || null; };
  Screens.prototype.isOpen = function () { return this.stack.length > 0; };

  Screens.prototype.confirm = function (message, onYes) {
    var self = this;
    this.confirmEl.innerHTML = '';
    var card = el('div', 'confirm-card');
    card.appendChild(el('p', '', message));
    var acts = el('div', 'confirm-actions');
    acts.appendChild(btn(I18N.t('ui.no'), 'ghost', function () {
      self.confirmEl.classList.remove('show');
      self.confirmEl.style.pointerEvents = 'none';
    }));
    acts.appendChild(btn(I18N.t('ui.yes'), 'primary', function () {
      self.confirmEl.classList.remove('show');
      self.confirmEl.style.pointerEvents = 'none';
      onYes && onYes();
    }));
    card.appendChild(acts);
    this.confirmEl.appendChild(card);
    this.confirmEl.classList.add('show');
    this.confirmEl.style.pointerEvents = 'auto';
  };

  /* ----------------------------------------------------------- helpers */
  function head(title, sub, right) {
    var h = el('div', 'screen-head');
    var l = el('div');
    l.appendChild(el('h2', 'screen-title', title));
    if (sub) l.appendChild(el('div', 'screen-sub', sub));
    h.appendChild(l);
    if (right) h.appendChild(right);
    return h;
  }
  function body() { return el('div', 'screen-body'); }
  function actions() { return el('div', 'screen-actions'); }

  function fmtTime(sec) {
    sec = Math.max(0, Math.floor(sec || 0));
    var h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60);
    return h > 0 ? (h + 'h ' + m + 'm') : (m + 'm');
  }
  function fmtDate(ts) {
    if (!ts) return '';
    var d = new Date(ts);
    var p = function (n) { return (n < 10 ? '0' : '') + n; };
    return p(d.getDate()) + '.' + p(d.getMonth() + 1) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
  }

  /* ============================================================ MENU */
  /* `animate` replays the staggered fly-in of the menu items. It is meant for a
     genuine entry into the menu (boot, after the style picker, back from a run)
     and must be OFF when the menu is merely re-rendered in place -- a style or
     language switch rebuilt the DOM and replayed the intro, which is what made
     the screen look like it jumped. */
  Screens.prototype.renderMenu = function (animate) {
    var self = this, app = this.app, s = this.scr_menu;
    s.innerHTML = '';

    // animated background
    var bg = el('div', 'bg show drift neutral');
    bg.style.cssText = 'position:absolute;inset:-4%;background-image:url("' + imgUrl('bg_01') + '");background-size:cover;background-position:center;opacity:.5;';
    s.appendChild(bg);
    var scrim = el('div');
    scrim.style.cssText = 'position:absolute;inset:0;background:linear-gradient(100deg, rgba(6,7,9,.96) 0%, rgba(6,7,9,.86) 42%, rgba(6,7,9,.35) 100%);';
    s.appendChild(scrim);

    var wrap = el('div', 'menu-wrap');
    wrap.appendChild(el('h1', 'logo', I18N.pick(global.AH_STORY.meta.title)));
    wrap.appendChild(el('div', 'logo-sub', I18N.pick(global.AH_STORY.meta.subtitle)));
    wrap.appendChild(el('div', 'logo-rule'));

    var list = el('div', 'menu-list');
    var items = [];

    items.push([I18N.t('ui.continue'), function () { app.continueGame(); }, !app.hasAnySave()]);
    items.push([I18N.t('ui.newGame'), function () { app.newGame(); }, false]);
    items.push([I18N.t('ui.load'), function () { self.renderLoad(); self.show('load'); }, !app.hasAnySave()]);
    items.push([I18N.t('ui.gallery'), function () { self.renderGallery(); self.show('gallery'); }, false]);
    items.push([I18N.t('ui.premium'), function () { self.renderPremium(); self.show('premium'); }, false]);
    items.push([I18N.t('ui.settings'), function () { self.renderSettings(); self.show('settings'); }, false]);
    items.push([I18N.t('ui.credits'), function () { self.showCredits(); }, false]);

    items.forEach(function (it, i) {
      var b = el('button', 'menu-item' + (animate ? '' : ' no-anim'));
      b.textContent = it[0];
      b.style.animationDelay = (420 + i * 70) + 'ms';
      b.disabled = !!it[2];
      if (!it[2]) b.addEventListener('click', function () { global.AHAudio.confirm(); it[1](); });
      list.appendChild(b);
    });
    wrap.appendChild(list);
    s.appendChild(wrap);

    var foot = el('div', 'menu-foot');
    var meta = app.meta;
    var unlocked = Object.keys(meta.endings || {}).filter(function (k) { return meta.endings[k]; }).length;
    foot.appendChild(el('span', '', I18N.pick(global.AH_STORY.meta.title) + ' · 18+'));
    foot.appendChild(el('span', '', I18N.t('ui.gallery') + ': ' + unlocked + '/4 · ' +
      (I18N.lang === 'ru' ? 'прохождений' : 'runs') + ': ' + (meta.runs || 0)));
    s.appendChild(foot);
  };

  /* Swap just the menu artwork when the art style changes. A full renderMenu()
     would rebuild the DOM and restart the drift animation on the background;
     only the background image is style-dependent, so only it is touched. */
  Screens.prototype.refreshMenuArt = function () {
    var bg = this.scr_menu.querySelector('.bg');
    if (bg) bg.style.backgroundImage = 'url("' + imgUrl('bg_01') + '")';
  };

  Screens.prototype.showCredits = function () {
    var self = this, s = this.scr_menu;
    var c = el('div');
    c.style.cssText = 'position:absolute;inset:0;background:rgba(5,6,9,.97);z-index:5;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:40px;gap:10px;';
    c.appendChild(el('h2', 'screen-title', I18N.t('credits.line1')));
    c.appendChild(el('div', 'screen-sub', I18N.t('credits.line2')));
    var r = el('div', 'logo-rule'); r.style.margin = '20px 0'; c.appendChild(r);
    // The body lines are read out of the data, not hardcoded: dropping a
    // `credits.lineN` key from strings.json removes that line, and no code
    // change is needed. Keys are numeric-sorted, so line10 follows line9.
    Object.keys((global.AH_STRINGS || {}).credits || {})
      .filter(function (k) { return /^line\d+$/.test(k) && parseInt(k.slice(4), 10) > 2; })
      .sort(function (a, b) { return parseInt(a.slice(4), 10) - parseInt(b.slice(4), 10); })
      .forEach(function (k) {
        var p = el('p', '', I18N.t('credits.' + k));
        p.style.cssText = 'max-width:60ch;color:var(--text-dim);font-size:13.5px;line-height:1.8;margin:4px 0;';
        c.appendChild(p);
      });
    var b = btn(I18N.t('ui.back'), 'ghost', function () { c.remove(); });
    b.style.marginTop = '26px';
    c.appendChild(b);
    s.appendChild(c);
  };

  /* ==================================================== STYLE PICKER */
  /** First-launch gate. Both art sets ship complete, so this is a real choice
      and not a fallback: a card only becomes clickable once its folder has been
      probed on disk, which means the player can never land in an empty set. */
  Screens.prototype.renderStylePicker = function () {
    var self = this, app = this.app, s = this.scr_style;
    s.innerHTML = '';

    var bg = el('div', 'bg show drift neutral');
    bg.style.cssText = 'position:absolute;inset:-4%;background-image:url("' + imgUrl('bg_02') + '");' +
      'background-size:cover;background-position:center;opacity:.28;';
    s.appendChild(bg);

    var wrap = el('div', 'style-wrap');
    wrap.appendChild(el('h1', 'style-title', I18N.t('style.title')));
    wrap.appendChild(el('div', 'style-sub', I18N.t('style.subtitle')));

    var grid = el('div', 'style-grid');

    // Anime leads: it is the set the project is built around, and the one the
    // in-fiction "faces in the windows" reading grew out of. When no style has
    // been committed yet it is also the card marked as the suggested pick --
    // purely visual, `settings.style` stays null until the player clicks.
    var active = app.settings.style || 'anime';

    [['anime', 'style.anime'],
     ['classic', 'style.classic']].forEach(function (def) {
      var key = def[0];
      var card = el('button', 'style-card' + (active === key ? ' on' : ''));
      card.disabled = true;

      var art = el('div', 'style-art');
      art.style.backgroundImage = 'url("' + global.AHImages.urlIn(key, 'bg_02') + '")';
      var spr = el('div', 'style-spr');
      spr.style.backgroundImage = 'url("' + global.AHImages.urlIn(key, 'spr_maya_neutral') + '")';
      art.appendChild(spr);
      card.appendChild(art);

      var bodyEl = el('div', 'style-body');
      bodyEl.appendChild(el('h3', 'style-name', I18N.t(def[1])));
      var badge = el('span', 'style-badge', I18N.t('style.checking'));
      bodyEl.appendChild(badge);
      card.appendChild(bodyEl);

      card.addEventListener('click', function () {
        global.AHAudio.confirm();
        app.pickStyle(key);
      });

      global.AHImages.probe(key, function (ok) {
        badge.textContent = ok ? I18N.t('style.ready') : I18N.t('style.unavailable');
        badge.className = 'style-badge ' + (ok ? 'ok' : 'bad');
        card.disabled = !ok;
        card.classList.toggle('missing', !ok);
        if (!ok) spr.style.display = 'none';
      });

      grid.appendChild(card);
    });

    wrap.appendChild(grid);
    s.appendChild(wrap);
  };

  /* ======================================================== SETTINGS */
  Screens.prototype.renderSettings = function () {
    var self = this, app = this.app, s = this.scr_settings;
    s.innerHTML = '';
    s.appendChild(head(I18N.t('settings.title'), I18N.pick(global.AH_STORY.meta.title)));

    var b = body();
    var grid = el('div', 'settings-grid');
    var st = app.settings;

    function row(label, hint) {
      var r = el('div', 'set-row');
      // `set-lab` grows into the leftover width. Without it the label box had
      // no flex-grow, so a wide control (a segmented toggle, a portrait strip)
      // squeezed the label down to a single word per line.
      var l = el('div', 'set-lab');
      l.appendChild(el('span', 'set-label', label));
      if (hint) l.appendChild(el('span', 'set-hint', hint));
      r.appendChild(l);
      return r;
    }
    function slider(val, min, max, step, oninput) {
      var c = el('div', 'set-ctl');
      var i = document.createElement('input');
      i.type = 'range'; i.min = min; i.max = max; i.step = step; i.value = val;
      var v = el('span', 'range-val', String(val));
      i.addEventListener('input', function () { v.textContent = i.value; oninput(parseFloat(i.value)); });
      c.appendChild(i); c.appendChild(v);
      return c;
    }
    function seg(options, current, onpick) {
      var c = el('div', 'seg');
      options.forEach(function (o) {
        var b2 = el('button', o[0] === current ? 'on' : '', o[1]);
        b2.addEventListener('click', function () {
          Array.prototype.slice.call(c.children).forEach(function (x) { x.classList.remove('on'); });
          b2.classList.add('on');
          onpick(o[0]);
        });
        c.appendChild(b2);
      });
      return c;
    }
    function toggle(val, onchange) {
      var t = el('div', 'switch' + (val ? ' on' : ''));
      t.addEventListener('click', function () {
        var on = !t.classList.contains('on');
        t.classList.toggle('on', on);
        onchange(on);
      });
      return t;
    }

    /* --- group: display --- */
    var g1 = el('div', 'set-group');
    g1.appendChild(el('h3', '', I18N.t('settings.language') + ' / ' + I18N.t('settings.textSize')));

    var rStyle = row(I18N.t('settings.style'), I18N.t('settings.styleNote'));
    // Wrapped in `set-ctl` so the segmented control keeps its intrinsic width.
    // Appended raw it became a shrinkable flex item and the second option was
    // clipped by the column edge.
    var cStyle = el('div', 'set-ctl');
    cStyle.appendChild(seg(
      [['classic', I18N.t('style.classicShort')], ['anime', I18N.t('style.animeShort')]],
      st.style || 'anime',
      function (v) { app.setStyle(v); }));
    rStyle.appendChild(cStyle);
    g1.appendChild(rStyle);

    var rLang = row(I18N.t('settings.language'));
    rLang.appendChild(seg([['ru', 'Русский'], ['en', 'English']], st.lang, function (v) {
      app.setLanguage(v);
    }));
    g1.appendChild(rLang);

    var rSpeed = row(I18N.t('settings.textSpeed'));
    rSpeed.appendChild(slider(st.textSpeed, 8, 120, 2, function (v) { st.textSpeed = v; app.persistSettings(); }));
    g1.appendChild(rSpeed);

    var rAuto = row(I18N.t('settings.autoSpeed'));
    rAuto.appendChild(slider(st.autoDelay, 600, 5000, 100, function (v) { st.autoDelay = v; app.persistSettings(); }));
    g1.appendChild(rAuto);

    var rSize = row(I18N.t('settings.textSize'));
    rSize.appendChild(slider(st.textSize, 0.8, 1.6, 0.05, function (v) {
      st.textSize = v;
      document.documentElement.style.setProperty('--textscale', String(v));
      app.persistSettings();
    }));
    g1.appendChild(rSize);

    var rMotion = row(I18N.t('settings.reduceMotion'));
    rMotion.appendChild(toggle(st.reduceMotion, function (on) {
      st.reduceMotion = on;
      document.body.classList.toggle('reduce-motion', on);
      app.persistSettings();
    }));
    g1.appendChild(rMotion);
    grid.appendChild(g1);

    /* --- group: audio --- */
    var g2 = el('div', 'set-group');
    g2.appendChild(el('h3', '', I18N.t('settings.master') + ' / ' + I18N.t('settings.sfx')));
    var rM = row(I18N.t('settings.master'));
    rM.appendChild(slider(st.master, 0, 1, 0.05, function (v) {
      st.master = v; global.AHAudio.setVolumes({ master: v }); app.persistSettings();
    }));
    g2.appendChild(rM);
    var rB = row(I18N.t('settings.bgm'));
    rB.appendChild(slider(st.bgm, 0, 1, 0.05, function (v) {
      st.bgm = v; global.AHAudio.setVolumes({ bgm: v }); app.persistSettings();
    }));
    g2.appendChild(rB);
    var rS = row(I18N.t('settings.sfx'));
    rS.appendChild(slider(st.sfx, 0, 1, 0.05, function (v) {
      st.sfx = v; global.AHAudio.setVolumes({ sfx: v }); app.persistSettings(); global.AHAudio.click();
    }));
    g2.appendChild(rS);
    grid.appendChild(g2);

    /* --- group: AI --- */
    var g3 = el('div', 'set-group');
    g3.appendChild(el('h3', '', I18N.t('settings.aiEnabled')));
    var rAI = row(I18N.t('settings.aiEnabled'), I18N.t('settings.aiNote'));
    rAI.appendChild(toggle(st.aiEnabled, function (on) { st.aiEnabled = on; app.persistSettings(); }));
    g3.appendChild(rAI);

    var rEp = row(I18N.t('settings.aiEndpoint'));
    var inp = document.createElement('input');
    inp.type = 'text'; inp.value = st.aiEndpoint || '';
    inp.placeholder = 'http://127.0.0.1:8080';
    inp.addEventListener('change', function () { st.aiEndpoint = inp.value.trim(); app.persistSettings(); });
    var ctl = el('div', 'set-ctl'); ctl.appendChild(inp);
    rEp.appendChild(ctl);
    g3.appendChild(rEp);

    var rMd = row(I18N.t('settings.aiModel'));
    var inp2 = document.createElement('input');
    inp2.type = 'text'; inp2.value = st.aiModel || '';
    inp2.addEventListener('change', function () { st.aiModel = inp2.value.trim(); app.persistSettings(); });
    var ctl2 = el('div', 'set-ctl'); ctl2.appendChild(inp2);
    rMd.appendChild(ctl2);
    g3.appendChild(rMd);
    grid.appendChild(g3);

    /* --- group: player portrait --- */
    var g5 = el('div', 'set-group');
    g5.appendChild(el('h3', '', I18N.t('settings.playerPortrait')));

    var rPort = row(I18N.t('settings.playerPortrait'), I18N.t('settings.playerPortraitNote'));
    var ctlPort = el('div', 'set-ctl');

    var isCustom = !!global.AHImages.playerOverride();
    var prev = el('div', 'portrait-prev');
    prev.style.backgroundImage = 'url("' + (global.AHImages.playerOverride() || imgUrl('avatar_player')) + '")';
    ctlPort.appendChild(prev);
    // The portrait is never an empty slot: the generated protagonist face is
    // the default, and the caption tells the player which one they are looking
    // at so the row does not read as "nothing set".
    ctlPort.appendChild(el('span', 'portrait-cap' + (isCustom ? ' custom' : ''),
                           I18N.t(isCustom ? 'player.custom' : 'player.default')));

    var fileIn = document.createElement('input');
    fileIn.type = 'file';
    fileIn.accept = 'image/*';
    fileIn.addEventListener('change', function () {
      var f = fileIn.files && fileIn.files[0];
      if (!f) return;
      var rd = new FileReader();
      rd.onerror = function () { app.ui.toast(I18N.t('player.fail')); };
      rd.onload = function () {
        var im = new Image();
        im.onerror = function () { app.ui.toast(I18N.t('player.fail')); };
        im.onload = function () {
          // Downscale before storing. A phone photo is several MB and would blow
          // the ~5 MB localStorage quota on its own; 512 px JPEG is ~80 KB.
          var MAX = 512;
          var k = Math.min(1, MAX / Math.max(im.width, im.height));
          var cw = Math.max(1, Math.round(im.width * k));
          var ch = Math.max(1, Math.round(im.height * k));
          var cv = document.createElement('canvas');
          cv.width = cw; cv.height = ch;
          cv.getContext('2d').drawImage(im, 0, 0, cw, ch);
          var data = cv.toDataURL('image/jpeg', 0.86);
          if (!global.AHImages.setPlayerOverride(data)) {
            app.ui.toast(I18N.t('player.fail'));
            return;
          }
          app.ui.refreshStyle();
          self.renderSettings();
          app.ui.toast(I18N.t('player.set'));
        };
        im.src = rd.result;
      };
      rd.readAsDataURL(f);
    });
    ctlPort.appendChild(fileIn);
    ctlPort.appendChild(btn(I18N.t('player.upload'), 'sm', function () { fileIn.click(); }));

    if (global.AHImages.playerOverride()) {
      ctlPort.appendChild(btn(I18N.t('player.reset'), 'ghost sm', function () {
        global.AHImages.setPlayerOverride(null);
        app.ui.refreshStyle();
        self.renderSettings();
        app.ui.toast(I18N.t('player.cleared'));
      }));
    }
    rPort.appendChild(ctlPort);
    g5.appendChild(rPort);
    grid.appendChild(g5);

    /* --- group: narrative --- */
    var g6 = el('div', 'set-group');
    g6.appendChild(el('h3', '', I18N.t('settings.narrative')));
    var rUn = row(I18N.t('settings.unreliable'), I18N.t('settings.unreliableNote'));
    rUn.appendChild(toggle(st.unreliable, function (on) { app.setUnreliable(on); }));
    g6.appendChild(rUn);
    grid.appendChild(g6);

    /* --- group: data --- */
    var g4 = el('div', 'set-group');
    g4.appendChild(el('h3', '', I18N.t('settings.resetAll')));
    var rR = row(I18N.t('settings.resetAll'), I18N.t('settings.resetConfirm'));
    var ctlR = el('div', 'set-ctl');
    ctlR.appendChild(btn(I18N.t('ui.delete'), 'danger sm', function () {
      self.confirm(I18N.t('settings.resetConfirm'), function () {
        global.AHSave.resetAll();
        app.reloadMeta();
        app.renderMenu();
        app.ui.toast(I18N.t('settings.resetDone'));
      });
    }));
    rR.appendChild(ctlR);
    g4.appendChild(rR);
    grid.appendChild(g4);

    b.appendChild(grid);
    s.appendChild(b);

    var acts = actions();
    acts.appendChild(btn(I18N.t('ui.back'), 'primary', function () {
      self.hide('settings');
      if (app.state === 'menu') app.renderMenu();
    }));
    s.appendChild(acts);
  };

  /* ========================================================= SAVE/LOAD */
  Screens.prototype.renderSlots = function (mode) {
    var self = this, app = this.app, id = mode === 'save' ? 'save' : 'load';
    var s = this['scr_' + id];
    s.innerHTML = '';
    s.appendChild(head(I18N.t('ui.' + id), null));

    var b = body();
    var grid = el('div', 'slots');

    global.AHSave.listSlots().forEach(function (slot) {
      var wrap = el('div');
      wrap.style.position = 'relative';

      var card = el('button', 'slot' + (slot.id === 'auto' ? ' auto' : ''));
      var thumb = el('div', 'slot-thumb');
      // Prefer the scene id so the thumbnail follows the active art style.
      // Older saves only carry a rendered URL -- use it as-is.
      if (slot.save && slot.save.thumbId) thumb.style.backgroundImage = 'url("' + imgUrl(slot.save.thumbId) + '")';
      else if (slot.save && slot.save.thumb) thumb.style.backgroundImage = 'url("' + slot.save.thumb + '")';
      card.appendChild(thumb);

      var info = el('div', 'slot-info');
      var name = slot.id === 'auto' ? I18N.t('ui.autosave') : (I18N.t('ui.save') + ' ' + slot.id);
      info.appendChild(el('div', 'slot-name', name));
      if (slot.save) {
        info.appendChild(el('div', 'slot-meta',
          I18N.t('ui.act') + ' ' + (slot.save.act || 1) + ' · ' + fmtDate(slot.save.savedAt) + ' · ' + fmtTime(slot.save.playSeconds)));
        var sc = slot.save.stats || {};
        info.appendChild(el('div', 'slot-meta',
          '◆ ' + Math.round(sc.trust || 0) + '  ❤ ' + Math.round(sc.attraction || 0) +
          '  ⚡ ' + Math.round(sc.tension || 0) + '  ? ' + Math.round(sc.curiosity || 0)));
      } else {
        info.appendChild(el('div', 'slot-meta slot-empty', I18N.t('ui.slotEmpty')));
      }
      card.appendChild(info);

      card.addEventListener('click', function () {
        if (mode === 'save') {
          if (slot.id === 'auto') return;
          var doSave = function () { app.saveToSlot(slot.id); self.renderSlots('save'); };
          if (slot.save) self.confirm(I18N.t('ui.overwrite'), doSave); else doSave();
        } else {
          if (!slot.save) return;
          app.loadFromSlot(slot.id);
          self.hideAll();
        }
      });
      wrap.appendChild(card);

      if (slot.save && slot.id !== 'auto') {
        var d = el('button', 'slot-del', '✕');
        d.title = I18N.t('ui.delete');
        d.addEventListener('click', function (e) {
          e.stopPropagation();
          self.confirm(I18N.t('ui.delete') + '?', function () {
            global.AHSave.deleteSlot(slot.id);
            self.renderSlots(mode);
          });
        });
        wrap.appendChild(d);
      }
      grid.appendChild(wrap);
    });

    b.appendChild(grid);
    s.appendChild(b);

    var acts = actions();
    acts.appendChild(btn(I18N.t('ui.back'), 'primary', function () {
      self.hide(id);
      if (app.state === 'menu') app.renderMenu();
    }));
    s.appendChild(acts);
  };
  Screens.prototype.renderSave = function () { this.renderSlots('save'); };
  Screens.prototype.renderLoad = function () { this.renderSlots('load'); };

  /* ========================================================== GALLERY */
  Screens.prototype.renderGallery = function () {
    var self = this, app = this.app, s = this.scr_gallery;
    s.innerHTML = '';
    s.appendChild(head(I18N.t('ui.gallery'), I18N.pick(global.AH_STORY.meta.title)));

    var b = body();
    var grid = el('div', 'endings');
    var engine = app.engine;
    var endings = engine.endings();

    endings.forEach(function (e) {
      var got = !!(app.meta.endings || {})[e.ending];
      var card = el('button', 'ending-card');
      var art = el('div', 'ending-art' + (got ? '' : ' locked'));
      if (e.cg) art.style.backgroundImage = 'url("' + imgUrl(e.cg) + '")';
      card.appendChild(art);
      if (!got) {
        var lk = el('div', 'locked-label', I18N.t('ui.locked'));
        art.appendChild(lk);
      }
      var eb = el('div', 'ending-body');
      eb.appendChild(el('h3', 'ending-name', got ? I18N.pick(e.title) : '???'));
      eb.appendChild(el('p', 'ending-desc', got
        ? I18N.pick(unreliableOn(app) ? (e.altBody || e.body) : e.body).slice(0, 150) + '…'
        : (I18N.lang === 'ru' ? 'Этот финал ещё не открыт.' : 'This ending is not yet unlocked.')));
      var tag = el('span', 'ending-tag' + (got ? ' got' : ''), got ? I18N.t('ui.unlocked') : I18N.t('ui.locked'));
      eb.appendChild(tag);
      card.appendChild(eb);
      if (got) card.addEventListener('click', function () { app.showEndingCard(e.ending, true); });
      grid.appendChild(card);
    });

    b.appendChild(grid);
    s.appendChild(b);

    var acts = actions();
    acts.appendChild(btn(I18N.t('ui.back'), 'primary', function () {
      self.hide('gallery');
      if (app.state === 'menu') app.renderMenu();
    }));
    s.appendChild(acts);
  };

  /* ========================================================== PREMIUM */
  Screens.prototype.renderPremium = function () {
    var self = this, app = this.app, s = this.scr_premium;
    s.innerHTML = '';
    s.appendChild(head(I18N.t('ui.premium'), I18N.t('ui.demoNote')));

    var b = body();
    var grid = el('div', 'premium-grid');

    var items = [
      { key: 'cg_17', img: 'img_17_secret_reveal', name: I18N.lang === 'ru' ? 'Сцена тайны' : 'Secret Reveal',
        desc: I18N.lang === 'ru'
          ? 'Майя с фотографией в руках. Полное разрешение, расширенная сцена в финале «Правда».'
          : 'Maya with the photograph in her hands. Full resolution, extended scene in the Reveal ending.' },
      { key: 'cg_18', img: 'img_18_ending', name: I18N.lang === 'ru' ? 'Сцена финала' : 'Ending Scene',
        desc: I18N.lang === 'ru'
          ? 'Майя у окна на рассвете. Финальный кадр для лучшей концовки.'
          : 'Maya at the window at dawn. The final frame of the best ending.' },
      { key: 'artbook', img: 'img_15_trust_moment', name: I18N.lang === 'ru' ? 'Артбук' : 'Art Book',
        desc: I18N.lang === 'ru'
          ? 'Все 18 изображений в исходном качестве плюс character bible.'
          : 'All 18 images at source quality plus the character bible.' }
    ];

    items.forEach(function (it) {
      var owned = !!(app.meta.premium || {})[it.key];
      var card = el('div', 'prem-card');
      var art = el('div', 'prem-art' + (owned ? '' : ' locked'));
      art.style.backgroundImage = 'url("' + imgUrl(it.img) + '")';
      if (!owned) art.appendChild(el('div', 'badge', '★ premium'));
      card.appendChild(art);

      var pb = el('div', 'prem-body');
      pb.appendChild(el('h3', 'prem-name', it.name));
      pb.appendChild(el('p', 'prem-desc', it.desc));

      var act = btn(owned ? I18N.t('ui.owned') : I18N.t('ui.unlock'),
        owned ? 'ghost sm' : 'primary sm', function () {
          if (owned) {
            app.ui.toast(I18N.t('ui.owned'));
            return;
          }
          app.unlockPremium(it.key, it.name);
          self.renderPremium();
        });
      act.disabled = owned;
      pb.appendChild(act);
      card.appendChild(pb);
      grid.appendChild(card);
    });

    b.appendChild(grid);
    b.appendChild(el('div', 'demo-note', I18N.t('ui.demoNote')));
    s.appendChild(b);

    var acts = actions();
    acts.appendChild(btn(I18N.t('ui.back'), 'primary', function () {
      self.hide('premium');
      if (app.state === 'menu') app.renderMenu();
    }));
    s.appendChild(acts);
  };

  /* ========================================================== BACKLOG */
  Screens.prototype.renderBacklog = function () {
    var self = this, app = this.app, s = this.scr_backlog;
    s.innerHTML = '';
    s.appendChild(head(I18N.t('ui.history'), null));

    var b = body();
    var hist = app.engine.history;
    if (!hist.length) {
      b.appendChild(el('p', 'slot-empty', I18N.lang === 'ru' ? 'Пока ничего не сказано.' : 'Nothing said yet.'));
    }
    hist.forEach(function (h) {
      var e = el('div', 'backlog-entry');
      var av = el('img', 'backlog-avatar');
      av.alt = '';
      if (h.kind === 'say') {
        av.src = imgUrl('avatar_maya_' + (h.mood || 'neutral'));
        e.appendChild(av);
        var body = el('div', 'backlog-body');
        body.appendChild(el('span', 'backlog-who', 'Maya'));
        body.appendChild(el('p', 'backlog-text', h.text));
        e.appendChild(body);
      } else if (h.kind === 'player' || h.kind === 'choice') {
        av.src = global.AHImages.playerOverride() || imgUrl('avatar_player');
        e.appendChild(av);
        var body2 = el('div', 'backlog-body');
        body2.appendChild(el('span', 'backlog-who player', I18N.t('ui.you')));
        body2.appendChild(el('p', 'backlog-text', h.text));
        e.appendChild(body2);
      } else {
        var body3 = el('div', 'backlog-body');
        body3.appendChild(el('p', 'backlog-text narr', h.text));
        e.appendChild(body3);
      }
      b.appendChild(e);
    });
    s.appendChild(b);

    var acts = actions();
    acts.appendChild(btn(I18N.t('ui.back'), 'primary', function () { self.hide('backlog'); }));
    s.appendChild(acts);
    // scroll to bottom
    setTimeout(function () { b.scrollTop = b.scrollHeight; }, 30);
  };

  /* ==================================================== ENDING CARD */
  Screens.prototype.renderEndingCard = function (endingId, replayMode) {
    var self = this, app = this.app, s = this.scr_ending;
    s.innerHTML = '';
    var e = app.engine.endingById(endingId);
    if (!e) return;

    var hero = el('div', 'ending-hero');
    if (e.cg) hero.style.backgroundImage = 'url("' + imgUrl(e.cg) + '")';
    var inner = el('div', 'eh-inner');
    // `e.ending` is the internal resolution key (STAY/BURN/...). Show the
    // localised code instead, so the kicker never leaks a raw identifier.
    var code = e.code ? I18N.pick(e.code) : e.ending;
    inner.appendChild(el('div', 'eh-kicker', I18N.t('ui.endingReached') + ' · ' + code));
    inner.appendChild(el('h1', 'eh-title', I18N.pick(e.title)));
    hero.appendChild(inner);
    s.appendChild(hero);

    var b = body();
    // The unreliable reading rewrites the four endings too -- that is where the
    // mode lands its punch, so it must not fall back to the standard text.
    var bodyText = (unreliableOn(app) && e.altBody) ? e.altBody : e.body;
    var p = el('p', 'ending-text', I18N.pick(bodyText));
    b.appendChild(p);

    var grid = el('div', 'ending-grid');

    var box1 = el('div', 'ending-box');
    box1.appendChild(el('h4', '', I18N.t('ui.howRead')));
    var ax = app.engine.persona.dominant();
    box1.appendChild(el('div', 'kv', ''))
    var kv1 = box1.lastChild;
    kv1.appendChild(el('span', '', (global.AH_STORY.persona[ax] || {}).label ? I18N.pick(global.AH_STORY.persona[ax].label) : ax));
    kv1.appendChild(el('b', '', ax));
    grid.appendChild(box1);

    var box2 = el('div', 'ending-box');
    box2.appendChild(el('h4', '', I18N.t('ui.finalStats')));
    ['trust', 'attraction', 'tension', 'curiosity'].forEach(function (k) {
      var row = el('div', 'kv');
      row.appendChild(el('span', '', I18N.pick(global.AH_STORY.stats[k].label)));
      row.appendChild(el('b', '', String(Math.round(app.engine.stats.get(k)))));
      box2.appendChild(row);
    });
    grid.appendChild(box2);

    var box3 = el('div', 'ending-box');
    box3.appendChild(el('h4', '', I18N.t('ui.playtime')));
    var total = app.engine.playSeconds;
    var row = el('div', 'kv');
    row.appendChild(el('span', '', I18N.t('ui.playtime')));
    row.appendChild(el('b', '', fmtTime(total)));
    box3.appendChild(row);
    var row2 = el('div', 'kv');
    row2.appendChild(el('span', '', I18N.t('ui.gallery')));
    var n = Object.keys(app.meta.endings || {}).filter(function (k) { return app.meta.endings[k]; }).length;
    row2.appendChild(el('b', '', n + '/4'));
    box3.appendChild(row2);
    grid.appendChild(box3);

    b.appendChild(grid);

    if (e.hint) {
      var hb = el('div', 'hint-box');
      hb.appendChild(el('b', '', I18N.t('ui.hint') + ': '));
      hb.appendChild(document.createTextNode(I18N.pick(e.hint)));
      b.appendChild(hb);
    }
    s.appendChild(b);

    var acts = actions();
    acts.appendChild(btn(I18N.t('ui.replay'), 'primary', function () {
      self.hide('ending');
      app.newGame();
    }));
    acts.appendChild(btn(I18N.t('ui.gallery'), 'ghost', function () {
      self.hide('ending');
      self.renderGallery();
      self.show('gallery');
    }));
    acts.appendChild(btn(I18N.t('ui.toMenu'), 'ghost', function () {
      self.hide('ending');
      app.toMenu();
    }));
    s.appendChild(acts);
    this.show('ending');
  };

  global.AHScreens = Screens;
})(window);
