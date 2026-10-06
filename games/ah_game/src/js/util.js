/* AFTER HOURS -- i18n + analytics + audio stub. Small utilities. */
(function (global) {
  'use strict';

  /* ------------------------------------------------------------- i18n */
  var I18N = {
    lang: 'ru',
    t: function (path, vars) {
      var node = global.AH_STRINGS;
      var parts = String(path).split('.');
      for (var i = 0; i < parts.length && node != null; i++) node = node[parts[i]];
      if (node == null) return path;
      var s = (typeof node === 'object') ? (node[this.lang] || node.en || path) : String(node);
      if (vars) for (var k in vars) s = s.split('{' + k + '}').join(vars[k]);
      return s;
    },
    /** Localize a {ru,en} pair coming from story data. */
    pick: function (pair) {
      if (pair == null) return '';
      if (typeof pair === 'string') return pair;
      return pair[this.lang] || pair.en || pair.ru || '';
    },
    set: function (lang) { this.lang = (lang === 'en') ? 'en' : 'ru'; }
  };

  /* -------------------------------------------------------- Analytics */
  var KEY = 'ah.analytics.v1';
  var RING = 500;
  var Analytics = {
    enabled: true,
    emit: function (name, props) {
      var ev = { t: Date.now(), name: name, props: props || {} };
      if (this.enabled) console.log('%c[analytics]', 'color:#c9a227', name, ev.props);
      try {
        var buf = JSON.parse(global.localStorage.getItem(KEY) || '[]');
        buf.push(ev);
        if (buf.length > RING) buf = buf.slice(-RING);
        global.localStorage.setItem(KEY, JSON.stringify(buf));
      } catch (e) { /* storage full or blocked -- analytics must never break the game */ }
    },
    dump: function () {
      try { return JSON.parse(global.localStorage.getItem(KEY) || '[]'); }
      catch (e) { return []; }
    },
    clear: function () { try { global.localStorage.removeItem(KEY); } catch (e) {} }
  };

  /* -------------------------------------------------------------- Audio */
  /* Prototype ships silent: no audio files. The bus exists so that
     adding BGM/SFX later is a one-line change, and so that the volume
     sliders in Settings are wired to something real. */
  var AudioBus = {
    ctx: null,
    volumes: { master: 0.8, bgm: 0.5, sfx: 0.7 },
    ensure: function () {
      if (this.ctx) return this.ctx;
      var AC = global.AudioContext || global.webkitAudioContext;
      if (!AC) return null;
      try { this.ctx = new AC(); } catch (e) { this.ctx = null; }
      return this.ctx;
    },
    setVolumes: function (v) {
      if (typeof v.master === 'number') this.volumes.master = v.master;
      if (typeof v.bgm === 'number') this.volumes.bgm = v.bgm;
      if (typeof v.sfx === 'number') this.volumes.sfx = v.sfx;
    },
    /** Short synthesised UI click -- proves the SFX chain works with no assets. */
    blip: function (freq, ms) {
      var ctx = this.ensure();
      if (!ctx) return;
      if (ctx.state === 'suspended') ctx.resume();
      var o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine';
      o.frequency.value = freq || 520;
      var peak = 0.06 * this.volumes.master * this.volumes.sfx;
      g.gain.setValueAtTime(peak, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + (ms || 60) / 1000);
      o.connect(g); g.connect(ctx.destination);
      o.start(); o.stop(ctx.currentTime + (ms || 60) / 1000);
    },
    click: function () { this.blip(660, 45); },
    confirm: function () { this.blip(880, 70); }
  };

  /* ------------------------------------------------------------- Images */
  /* Two complete art sets ship side by side with identical filenames, so the
     only thing that changes between styles is the base directory. Everything
     that needs a picture goes through here -- previously ui.js, screens.js and
     main.js each carried their own copy of the resolver. */
  var DIRS = {
    classic: 'assets/images/',
    anime: 'assets/images_anime/'
  };

  /* `unreliable` is a per-file overlay, not a third set. Only the frames that
     actually differ live in assets/<set>/unreliable/, and the build records
     which ones (AH_STORY.__alt). Everything else keeps resolving to the base
     set, so a set without a variant folder -- the classic one -- is untouched. */
  var VARIANT_DIR = 'unreliable/';

  var Images = {
    style: 'classic',
    DIRS: DIRS,
    variant: null,

    setStyle: function (s) { this.style = DIRS[s] ? s : 'classic'; return this.style; },

    /** Turn the unreliable-narrator artwork on/off. Returns true when the active
        set actually carries a variant, so the UI can say "no visual change". */
    setVariant: function (v) {
      this.variant = v || null;
      return this.variantAvailable();
    },

    variantAvailable: function () {
      if (!this.variant) return false;
      var sets = (global.AH_STORY && global.AH_STORY.__alt) || {};
      var key = this.style === 'anime' ? 'images_anime' : 'images';
      return !!(sets[key] && sets[key].length);
    },

    /** Does this specific file have a variant in the active set? */
    hasVariant: function (file) {
      if (!this.variant) return false;
      var sets = (global.AH_STORY && global.AH_STORY.__alt) || {};
      var key = this.style === 'anime' ? 'images_anime' : 'images';
      var list = sets[key] || [];
      return list.indexOf(file) >= 0;
    },

    base: function () { return DIRS[this.style]; },

    /** Resolve a story image id ("bg_02") or a bare filename to a URL. */
    url: function (name) {
      if (!name) return '';
      var map = (global.AH_STORY && global.AH_STORY.__img) || {};
      var file = map[name] || (name.indexOf('.') >= 0 ? name : name + '.png');
      if (this.hasVariant(file)) return DIRS[this.style] + VARIANT_DIR + file;
      return DIRS[this.style] + file;
    },

    /** Same asset in a named set -- used to preview a style before switching. */
    urlIn: function (style, name) {
      var prev = this.style;
      this.style = DIRS[style] ? style : 'classic';
      var u = this.url(name);
      this.style = prev;
      return u;
    },

    /** Is a whole set actually present on disk? Probes one known background.
        Lets the game degrade to classic instead of showing broken images when
        a set has not been generated yet. */
    probe: function (style, cb) {
      var probeName = ((global.AH_STORY && global.AH_STORY.__img) || {}).bg_01 || 'bg_01_hotel_exterior.png';
      var img = new Image();
      var done = false;
      var finish = function (ok) { if (!done) { done = true; cb(ok); } };
      img.onload = function () { finish(img.naturalWidth > 0); };
      img.onerror = function () { finish(false); };
      img.src = DIRS[DIRS[style] ? style : 'classic'] + probeName;
      setTimeout(function () { finish(false); }, 4000);
    },

    /* --- player portrait -------------------------------------------------
       The player has a generated default portrait per style (cropped from
       spr_player.png), and can drop in their own picture on top. Stored as a
       data URL, so it survives reloads and needs no server. Kept deliberately
       outside the style folders: it is the player's face, not part of an art
       set, so switching style must not throw it away. */
    playerKey: 'ah.playerimg.v1',

    playerOverride: function () {
      try { return global.localStorage.getItem(this.playerKey) || null; }
      catch (e) { return null; }
    },

    setPlayerOverride: function (dataUrl) {
      try {
        if (dataUrl) global.localStorage.setItem(this.playerKey, dataUrl);
        else global.localStorage.removeItem(this.playerKey);
        return true;
      } catch (e) {
        // Quota exceeded -- a 512px JPEG is ~80KB, so this means the storage is
        // already full of something else.
        return false;
      }
    }
  };

  global.AHI18N = I18N;
  global.AHAnalytics = Analytics;
  global.AHAudio = AudioBus;
  global.AHImages = Images;
})(window);
