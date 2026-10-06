/* AFTER HOURS -- application shell. Wires engine + ui + screens. */
(function (global) {
  'use strict';

  var I18N = global.AHI18N;

  function App() {
    this.meta = global.AHSave.loadMeta();
    this.settings = this.meta.settings;
    this.state = 'boot';
    this.autoMode = false;
    this.skipMode = false;
    this.hidden = false;
    this.playTicker = null;
    this.pendingAdvance = false;
  }

  App.prototype.boot = function () {
    I18N.set(this.settings.lang);
    // Provisional style, so nothing paints out of the wrong folder while the
    // first-launch picker is still deciding.
    global.AHImages.setStyle(this.settings.style || 'classic');
    // Variant art must be armed before the first frame paints, otherwise a run
    // resumed with the unreliable reading shows the clean background until the
    // player touches the toggle.
    this.syncVariant();
    global.AHAudio.setVolumes(this.settings);
    document.body.classList.toggle('reduce-motion', !!this.settings.reduceMotion);
    document.documentElement.style.setProperty('--textscale', String(this.settings.textSize || 1));

    var self = this;
    this.ui = new global.AHUI(this);
    this.screens = new global.AHScreens(this);
    this.engine = new global.AHEngine({
      onScene: function (sc) { self.onScene(sc); },
      onNarrate: function (t) { self.onNarrate(t); },
      onSay: function (who, t, eng, isAI) { self.onSay(who, t, isAI); },
      onChoice: function (node) { self.onChoice(node); },
      // A CG node is a full-frame hero shot. The scene may not declare a
      // scene-level `cg`, so suppression has to happen here too, otherwise the
      // sprite keeps painting on top of the CG and you get two Mayas.
      onCG: function (img) {
        self.ui.showCG(img, { autoHide: false });
        self.ui.suppressSprite = true;
        self.ui.setSprite(null);
      },
      onStatChange: function (d) { self.ui.flashStat(d); },
      onMood: function (m) { self.ui.setGrade(m); self.ui.setSprite(m.sprite); },
      onActCard: function (t, s2, done) { self.ui.showActCard(t, s2, done); },
      onEnding: function (id) { self.onEnding(id); },
      onBeat: function () { self.autosave(); },
      onAIThinking: function () { self.ui.setAIPulse(true); },
      onSceneEnd: function (sc) { self.onSceneEnd(sc); }
    });

    global.AHAnalytics.emit('session_start', {
      lang: this.settings.lang, runs: this.meta.runs, aiEnabled: !!this.settings.aiEnabled
    });

    this.renderMenu(true);
    this.state = 'menu';
    this.screens.show('menu');
    this.startPlayTimer();

    // First launch: the art style is a real choice between two complete sets,
    // so it is asked once and remembered. A broken install (no classic set on
    // disk) skips the gate rather than trapping the player on an empty screen.
    if (!this.settings.style) {
      var self0 = this;
      global.AHImages.probe('classic', function (ok) {
        if (!ok) { global.AHImages.setStyle('classic'); return; }
        self0.screens.renderStylePicker();
        self0.screens.show('style');
      });
    }
  };

  App.prototype.startPlayTimer = function () {
    var self = this;
    clearInterval(this.playTicker);
    this.playTicker = setInterval(function () {
      if (self.state === 'play') self.engine.playSeconds += 1;
    }, 1000);
  };

  /* ------------------------------------------------------------ menu */
  App.prototype.renderMenu = function (animate) {
    this.screens.renderMenu(animate);
  };

  App.prototype.hasAnySave = function () {
    var slots = global.AHSave.listSlots();
    for (var i = 0; i < slots.length; i++) if (slots[i].save) return true;
    return false;
  };

  App.prototype.reloadMeta = function () {
    this.meta = global.AHSave.loadMeta();
    this.settings = this.meta.settings;
  };

  App.prototype.persistSettings = function () {
    this.meta.settings = this.settings;
    global.AHSave.saveMeta(this.meta);
  };

  App.prototype.setLanguage = function (lang) {
    this.settings.lang = lang;
    I18N.set(lang);
    this.persistSettings();
    global.AHAnalytics.emit('language_change', { lang: lang });
    // re-render everything that is language-bound
    this.ui.relabel();
    if (this.state === 'menu') this.renderMenu();
    this.screens.renderSettings();
    // Changing the language must not close the panel the player is standing in.
    // The old code picked the screen to restore from `state`, which is the *game*
    // state (menu vs play) and knows nothing about open panels -- so switching
    // the language from the menu's settings dropped the player back to the menu
    // and the art-style choice appeared to vanish. `screens.stack` is the real
    // answer: restore whatever was open, with settings on top.
    var keepSettings = this.screens.stack.indexOf('settings') >= 0;
    this.screens.hideAll();
    if (this.state === 'menu') this.screens.show('menu');
    if (keepSettings) this.screens.show('settings');
    this.ui.toast(lang === 'ru' ? 'Язык: русский' : 'Language: English');
  };

  /* ----------------------------------------------------------- style */
  /** Switch the whole art set. Both folders carry identical filenames, so the
      only thing that changes is the base directory -- but every layer caches
      the id it last drew, hence refreshStyle() rather than a plain re-render. */
  App.prototype.setStyle = function (style) {
    if (!global.AHImages.DIRS[style]) return;
    if (this.settings.style === style) return;
    this.settings.style = style;
    global.AHImages.setStyle(style);
    this.persistSettings();
    global.AHAnalytics.emit('style_change', { style: style });
    this.ui.refreshStyle();
    // In-place art swap, not a re-render: rebuilding the menu restarted the
    // item fly-in and the background drift, so switching style looked like the
    // whole screen jumped.
    if (this.state === 'menu') this.screens.refreshMenuArt();
    if (this.screens.stack.indexOf('settings') >= 0) this.screens.renderSettings();
  };

  /** Keep the artwork variant in step with the unreliable flag.
      The variant is an anime-set overlay only: `assets/images_anime/unreliable/`
      carries the frames where the sampler painted faces into the windows, and the
      classic set ships no such folder. On classic the toggle therefore stays a
      text-only change, which is exactly what the settings note says.
      Returns true when the active set actually has variant art. */
  App.prototype.syncVariant = function () {
    global.AHImages.setVariant(this.settings.unreliable ? 'unreliable' : null);
    return global.AHImages.variantAvailable();
  };

  /** Toggle the unreliable-narrator reading. Lines that carry an `alt` variant
      change in both styles; the artwork changes only where variant frames exist,
      so this is safe to flip mid-scene. */
  App.prototype.setUnreliable = function (on) {
    this.settings.unreliable = !!on;
    this.persistSettings();
    this.engine.flags.set({ unreliable: !!on });
    global.AHAnalytics.emit('unreliable_toggle', { on: !!on });
    var hasArt = this.syncVariant();
    this.ui.refreshStyle();
    if (on && !hasArt) this.ui.toast(I18N.t('settings.unreliableTextOnly'));
    else this.ui.toast(I18N.t(on ? 'settings.unreliableOn' : 'settings.unreliableOff'));
    if (this.screens.stack.indexOf('settings') >= 0) this.screens.renderSettings();
  };

  /** First-launch picker: choose, then drop straight into the menu. */
  App.prototype.pickStyle = function (style) {
    this.setStyle(style);
    this.screens.hide('style');
    this.renderMenu(true);
  };

  /* ------------------------------------------------------------ flow */
  App.prototype.newGame = function () {
    this.screens.hideAll();
    this.stopAutoSkip();
    this.ui.cancelActCard();
    this.engine.reset(this.meta);
    this.meta.runs = (this.meta.runs || 0) + 1;
    global.AHSave.saveMeta(this.meta);
    this.state = 'play';
    this.ui.refreshStats(this.engine.stats, this.engine.persona);
    this.ui.setStatusVisible(true);
    this.ui.preload();
    global.AHAnalytics.emit('new_game', { run: this.meta.runs, newGamePlus: this.engine.newGamePlus });
    this.engine.start();
  };

  App.prototype.continueGame = function () {
    var slots = global.AHSave.listSlots();
    var best = null;
    for (var i = 0; i < slots.length; i++) {
      var s = slots[i].save;
      if (!s) continue;
      if (!best || (s.savedAt || 0) > (best.save.savedAt || 0)) best = slots[i];
    }
    if (!best) return;
    this.loadFromSlot(best.id);
  };

  App.prototype.loadFromSlot = function (id) {
    var sv = global.AHSave.readSlot(id);
    if (!sv) return;
    this.screens.hideAll();
    this.stopAutoSkip();
    this.ui.cancelActCard();
    this.engine.restore(sv);
    // The setting wins over whatever the save recorded: a player who turned the
    // unreliable reading on should not have it silently revert on load.
    this.engine.flags.set({ unreliable: !!this.settings.unreliable });
    this.syncVariant();
    this.state = 'play';
    this.ui.refreshStats(this.engine.stats, this.engine.persona);
    this.ui.setStatusVisible(true);
    this.ui.preload();
    this.ui.toast(I18N.t('log.loaded', { n: id }));
    global.AHAnalytics.emit('load', { slot: id, act: sv.act });
    // resume the scene at the saved node
    this.engine.goScene(sv.sceneId || global.AH_STORY.scenes[0].id);
  };

  App.prototype.thumbUrl = function () {
    var id = this.ui._bgCurrent;
    return id ? global.AHImages.url(id) : null;
  };

  /* Saves keep the scene id as well as a rendered URL: the URL is only valid
     for the art style that was active when the save was written. */
  App.prototype.thumbId = function () { return this.ui._bgCurrent || null; };

  App.prototype.saveToSlot = function (id) {
    var sv = this.engine.snapshot();
    sv.thumb = this.thumbUrl();
    sv.thumbId = this.thumbId();
    sv.title = I18N.pick(global.AH_STORY.meta.title);
    global.AHSave.writeSlot(id, sv);
    this.ui.toast(I18N.t('log.saved', { n: id }));
    global.AHAnalytics.emit('save', { slot: id });
  };

  App.prototype.autosave = function () {
    var sv = this.engine.snapshot();
    sv.thumb = this.thumbUrl();
    sv.thumbId = this.thumbId();
    global.AHSave.writeSlot('auto', sv);
    global.AHAnalytics.emit('autosave', { act: sv.act });
  };

  App.prototype.toMenu = function () {
    this.stopAutoSkip();
    this.ui.cancelActCard();
    this.ui.clearChoices();
    this.ui.hideCG();
    this.ui.toggleDialogue(true);
    this.ui.setStatusVisible(false);
    this.screens.hideAll();
    this.reloadMeta();
    this.renderMenu(true);
    this.screens.show('menu');
    this.state = 'menu';
  };

  /* ----------------------------------------------------------- hooks */
  App.prototype.onScene = function (sc) {
    var loc = (global.AH_STORY.locations || {})[sc.location];
    var ambient = loc ? loc.ambient : 'neutral';
    this.ui.setBackground(sc.bg || (loc && loc.bg), ambient);
    this.ui.setChapterTag(this.engine.act, loc ? loc.label : '');
    this.ui.refreshStats(this.engine.stats, this.engine.persona);

    // A scene with a CG is a hero shot: the CG owns the frame for the whole
    // scene and the sprite is suppressed, otherwise the two stack awkwardly.
    if (sc.cg) {
      this.ui.showCG(sc.cg, { autoHide: false });
      this.ui.suppressSprite = true;
      this.ui.setSprite(null);
    } else {
      this.ui.hideCG();
      this.ui.suppressSprite = false;
    }
    global.AHAnalytics.emit('scene_enter', { sceneId: sc.id, act: sc.act });
  };

  App.prototype.onNarrate = function (text) {
    this.ui.showNameplate(false);
    this.ui.say('narrate', text, { narration: true });
  };

  App.prototype.onSay = function (who, text, isAI) {
    this.ui.setAIPulse(false);
    if (who === 'maya') {
      this.ui.setGrade(this.engine.mood);
      if (!this.ui.suppressSprite) this.ui.setSprite(this.engine.mood.sprite);
    }
    this.ui.say(who, text, { ai: !!isAI });
  };

  /* Auto and skip work by re-arming a timer each time a line finishes typing.
     Clearing only the newest id can leave the chain alive, so every entry point
     that changes the run (new game, load, menu, ending, a choice appearing) has
     to go through here. */
  App.prototype.stopAutoSkip = function () {
    this.autoMode = false;
    this.skipMode = false;
    if (this.autoTimer) { clearTimeout(this.autoTimer); this.autoTimer = null; }
    this.ui.setToolActive('auto', false);
    this.ui.setToolActive('skip', false);
  };

  App.prototype.onChoice = function (node) {
    var self = this;
    this.stopAutoSkip();
    this.ui.showChoices(node, function (opt, n) { self.engine.choose(opt, n); });
  };

  App.prototype.onEnding = function (id) {
    this.meta.endings = this.meta.endings || {};
    var isNew = !this.meta.endings[id];
    this.meta.endings[id] = true;
    global.AHSave.saveMeta(this.meta);
    this.state = 'ending';
    this.stopAutoSkip();
    this.ui.clearChoices();
    this.ui.setAdvance(false);
    this.ui.setAIPulse(false);
    global.AHAnalytics.emit('ending_shown', { ending: id, isNew: isNew });
    this.screens.renderEndingCard(id, false);
  };

  App.prototype.onSceneEnd = function (sc) {
    // a scene with no explicit terminator: stop cleanly rather than loop
    console.warn('[AH] scene ended without a terminator:', sc.id);
  };

  App.prototype.onTextComplete = function () {
    var self = this;
    if (this.autoMode) {
      clearTimeout(this.autoTimer);
      this.autoTimer = setTimeout(function () {
        if (self.autoMode && self.state === 'play') self.advance();
      }, this.settings.autoDelay);
    }
    if (this.skipMode && this.state === 'play') {
      clearTimeout(this.autoTimer);
      this.autoTimer = setTimeout(function () { self.advance(); }, 40);
    }
  };

  /* ------------------------------------------------------------ input */
  App.prototype.advance = function () {
    if (this.state !== 'play') return;
    if (this.ui.choicesEl.children.length) return;
    // the CG belongs to the scene, not to the line -- do not hide it here
    this.engine.advance();
  };

  App.prototype.onStageClick = function () {
    if (this.screens.isOpen() || this.screens.confirmEl.classList.contains('show')) return;
    if (this.state !== 'play') return;
    if (this.ui.choicesEl.children.length) return;
    if (this.ui.finishTyping()) return;   // first click completes the line
    this.advance();
  };

  App.prototype.onTool = function (name) {
    var self = this;
    global.AHAudio.click();
    if (name === 'menu') {
      this.screens.confirm(I18N.t('ui.quitConfirm'), function () { self.toMenu(); });
      return;
    }
    if (name === 'history') { this.screens.renderBacklog(); this.screens.show('backlog'); return; }
    if (name === 'status') {
      var on = !this.ui.statbar.classList.contains('show');
      this.ui.setStatusVisible(on);
      return;
    }
    if (name === 'save') { this.screens.renderSave(); this.screens.show('save'); return; }
    if (name === 'hide') {
      this.hidden = !this.hidden;
      this.ui.toggleDialogue(!this.hidden);
      this.ui.hud.style.opacity = this.hidden ? '0' : '1';
      this.ui.setStatusVisible(this.hidden ? false : true);
      return;
    }
    if (name === 'auto') {
      this.autoMode = !this.autoMode;
      this.skipMode = false;
      this.ui.setToolActive('auto', this.autoMode);
      this.ui.setToolActive('skip', false);
      if (this.autoMode && !this.ui.typing) this.onTextComplete();
      return;
    }
    if (name === 'skip') {
      this.skipMode = !this.skipMode;
      this.autoMode = false;
      this.ui.setToolActive('skip', this.skipMode);
      this.ui.setToolActive('auto', false);
      if (this.skipMode) {
        if (this.ui.typing) this.ui.finishTyping();
        this.onTextComplete();
      }
      return;
    }
  };

  /* -------------------------------------------------------- premium */
  App.prototype.unlockPremium = function (key, name) {
    this.meta.premium = this.meta.premium || {};
    if (this.meta.premium[key]) return;
    this.meta.premium[key] = true;
    global.AHSave.saveMeta(this.meta);
    global.AHAnalytics.emit('premium_unlock', { key: key, name: name });
    this.ui.toast(I18N.t('log.unlocked', { name: name }));
  };

  App.prototype.showEndingCard = function (id, replay) {
    this.screens.renderEndingCard(id, replay);
  };

  App.prototype.toast = function (m) { this.ui.toast(m); };

  /* ------------------------------------------------------------- boot */
  document.addEventListener('DOMContentLoaded', function () {
    try {
      var app = new App();
      global.AHState = app;
      app.boot();
    } catch (e) {
      console.error('[AH] boot failed', e);
      var vp = document.getElementById('viewport');
      if (vp) {
        vp.innerHTML = '<div style="padding:60px;font-family:monospace;color:#e88b7c">' +
          'AFTER HOURS failed to start.<br><br>' + String(e && e.message || e) + '</div>';
      }
    }
  });

  global.AHApp = App;
})(window);
