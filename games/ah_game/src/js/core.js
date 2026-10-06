/* AFTER HOURS -- core state: stats, persona, flags, mood resolution.
   Pure logic. No DOM. Loaded as a classic script (file:// safe). */
(function (global) {
  'use strict';

  var STORY = global.AH_STORY;

  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }

  /* ---------------------------------------------------------------- Stats */
  function Stats(initial) {
    this.v = {};
    var defs = STORY.stats;
    for (var k in defs) {
      if (!Object.prototype.hasOwnProperty.call(defs, k)) continue;
      this.v[k] = (initial && typeof initial[k] === 'number') ? initial[k] : defs[k].start;
    }
  }
  Stats.prototype.get = function (k) { return this.v[k] || 0; };
  Stats.prototype.apply = function (effects) {
    if (!effects) return {};
    var delta = {};
    for (var k in effects) {
      if (!Object.prototype.hasOwnProperty.call(effects, k)) continue;
      if (!(k in this.v)) continue;
      var before = this.v[k];
      this.v[k] = clamp(this.v[k] + effects[k], 0, 100);
      delta[k] = this.v[k] - before;
    }
    return delta;
  };
  /** Decay toward start value at a beat. Never crosses the start value. */
  Stats.prototype.decay = function () {
    var defs = STORY.stats, delta = {};
    for (var k in defs) {
      if (!Object.prototype.hasOwnProperty.call(defs, k)) continue;
      var d = defs[k].decay, start = defs[k].start, cur = this.v[k], next = cur;
      if (d < 0 && cur > start) next = Math.max(start, cur + d);
      else if (d > 0 && cur < start) next = Math.min(start, cur + d);
      if (next !== cur) { delta[k] = next - cur; this.v[k] = next; }
    }
    return delta;
  };
  Stats.prototype.snapshot = function () {
    var o = {};
    for (var k in this.v) o[k] = Math.round(this.v[k] * 10) / 10;
    return o;
  };

  /* -------------------------------------------------------------- Persona */
  function Persona(initial) {
    this.c = { direct: 0, warm: 0, sharp: 0, guarded: 0 };
    if (initial) for (var k in this.c) if (typeof initial[k] === 'number') this.c[k] = initial[k];
  }
  Persona.prototype.bump = function (axis) {
    if (axis && (axis in this.c)) this.c[axis]++;
  };
  /** argmax with the documented tie-break priority. */
  Persona.prototype.dominant = function () {
    var order = STORY.persona.priority, best = order[0], bestN = -1;
    for (var i = 0; i < order.length; i++) {
      var n = this.c[order[i]];
      if (n > bestN) { bestN = n; best = order[i]; }
    }
    return bestN <= 0 ? 'warm' : best;
  };
  Persona.prototype.read = function (lang) {
    var ax = this.dominant();
    var L = (global.AH_STRINGS.ui || {});
    var p = STORY.persona[ax];
    return p && p.label ? (p.label[lang] || p.label.en) : ax;
  };
  Persona.prototype.snapshot = function () { var o = {}; for (var k in this.c) o[k] = this.c[k]; return o; };

  /* ---------------------------------------------------------------- Flags */
  function Flags(initial) { this.f = {}; if (initial) for (var k in initial) this.f[k] = !!initial[k]; }
  Flags.prototype.set = function (obj) { if (!obj) return; for (var k in obj) this.f[k] = !!obj[k]; };
  Flags.prototype.has = function (k) { return !!this.f[k]; };
  Flags.prototype.snapshot = function () { var o = {}; for (var k in this.f) o[k] = this.f[k]; return o; };

  /* ----------------------------------------------------------- MoodResolver */
  var MoodResolver = {
    resolve: function (stats, flags, persona) {
      var trust = stats.get('trust'), tension = stats.get('tension'),
          curiosity = stats.get('curiosity'), attraction = stats.get('attraction'),
          mood = stats.get('mood');

      if (tension >= 50 && trust < 40) return { sprite: 'angry', dim: 0.55, ambient: 'cold', pace: 0.8 };
      if (curiosity >= 55 && trust < 45) return { sprite: 'suspicious', dim: 0.45, ambient: 'cold', pace: 0.95 };
      if (trust >= 65 && attraction >= 40) return { sprite: 'happy', dim: 0.15, ambient: 'warm', pace: 1.15 };
      if (trust >= 50 && mood >= 45) return { sprite: 'vulnerable', dim: 0.3, ambient: 'warm', pace: 1.1 };
      if (mood >= 55 && persona && persona.c.sharp > persona.c.warm) {
        return { sprite: 'playful', dim: 0.25, ambient: 'warm', pace: 1.05 };
      }
      return { sprite: 'neutral', dim: 0.35, ambient: 'neutral', pace: 1 };
    }
  };

  /* --------------------------------------------------------------- Gating */
  /** Returns {ok:bool, reason:string|null}. `reason` is an i18n hint object. */
  function checkRequire(req, stats, flags, persona) {
    if (!req) return { ok: true, reason: null };
    if (req.stat) {
      var v = stats.get(req.stat);
      if (typeof req.gte === 'number' && v < req.gte) return { ok: false, reason: 'stat' };
      if (typeof req.lte === 'number' && v > req.lte) return { ok: false, reason: 'stat' };
    }
    if (req.flag && !flags.has(req.flag)) return { ok: false, reason: 'flag' };
    if (req.notFlag && flags.has(req.notFlag)) return { ok: false, reason: 'notFlag' };
    if (req.persona && persona.c[req.persona] < (req.gte || 0)) return { ok: false, reason: 'persona' };
    return { ok: true, reason: null };
  }

  /* -------------------------------------------------------------- Endings */
  function resolveEnding(stats, flags) {
    var trust = stats.get('trust'), attraction = stats.get('attraction'),
        tension = stats.get('tension'), curiosity = stats.get('curiosity');
    if (trust >= 65 && attraction >= 40) return 'STAY';
    if (tension >= 60 && trust < 45) return 'BURN';
    if (curiosity >= 60 && flags.has('secret_found')) return 'REVEAL';
    return 'EMPTY';
  }

  /* ---------------------------------------------------------- Stat reading */
  function describeStat(statKey, value) {
    var bands = (global.AH_AI.statReadings || {})[statKey];
    if (!bands) return '';
    for (var i = 0; i < bands.length; i++) {
      if (value >= bands[i][0] && value <= bands[i][1]) return bands[i][2];
    }
    return bands[bands.length - 1][2];
  }

  global.AHCore = {
    clamp: clamp,
    Stats: Stats,
    Persona: Persona,
    Flags: Flags,
    MoodResolver: MoodResolver,
    checkRequire: checkRequire,
    resolveEnding: resolveEnding,
    describeStat: describeStat
  };
})(window);
