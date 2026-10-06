/* AFTER HOURS -- persistence: 6 manual slots + autosave + cross-run meta.
   All localStorage. Schema is versioned with a migrate() path. */
(function (global) {
  'use strict';

  var SAVE_VERSION = 3;
  var KEY_SLOTS = 'ah.slots.v3';     // { [slotId]: saveObject }
  var KEY_META  = 'ah.meta.v3';      // { runs, endings, premium, settings }
  var SLOT_COUNT = 6;

  var DEFAULT_SETTINGS = {
    lang: 'ru',
    style: null,          // 'classic' | 'anime'; null = ask on first launch
    unreliable: false,    // second reading: the narrator is not reliable
    textSpeed: 34,        // chars per second
    autoDelay: 1800,      // ms between auto-advance
    master: 0.8,
    bgm: 0.5,
    sfx: 0.7,
    textSize: 1.0,
    reduceMotion: false,
    aiEnabled: false,
    aiEndpoint: '',
    aiModel: 'local-model'
  };

  function readJSON(key, fallback) {
    try {
      var raw = global.localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) { return fallback; }
  }
  function writeJSON(key, val) {
    try { global.localStorage.setItem(key, JSON.stringify(val)); return true; }
    catch (e) { console.warn('[AH] localStorage write failed', e); return false; }
  }

  /* ------------------------------------------------------------- migrate */
  function migrate(save) {
    if (!save) return null;
    if (!save.version || save.version < 2) {
      save.stats = save.stats || {};
      save.persona = save.persona || { direct: 0, warm: 0, sharp: 0, guarded: 0 };
      save.version = 2;
    }
    if (save.version < 3) {
      save.flags = save.flags || {};
      save.history = save.history || [];
      save.visited = save.visited || [];
      save.version = 3;
    }
    return save;
  }

  /* ---------------------------------------------------------------- Meta */
  function loadMeta() {
    var m = readJSON(KEY_META, null);
    if (!m) m = {};
    m.runs = m.runs || 0;
    m.endings = m.endings || {};
    m.premium = m.premium || {};
    m.settings = Object.assign({}, DEFAULT_SETTINGS, m.settings || {});
    // fill any settings key added in a later version
    for (var k in DEFAULT_SETTINGS) {
      if (!(k in m.settings)) m.settings[k] = DEFAULT_SETTINGS[k];
    }
    return m;
  }
  function saveMeta(m) { return writeJSON(KEY_META, m); }

  /* --------------------------------------------------------------- Slots */
  function loadSlots() { return readJSON(KEY_SLOTS, {}); }
  function saveSlots(s) { return writeJSON(KEY_SLOTS, s); }

  function writeSlot(id, payload) {
    var slots = loadSlots();
    slots[id] = payload;
    return saveSlots(slots);
  }
  function readSlot(id) {
    var slots = loadSlots();
    return migrate(slots[id] || null);
  }
  function deleteSlot(id) {
    var slots = loadSlots();
    if (slots[id]) { delete slots[id]; saveSlots(slots); }
  }
  function listSlots() {
    var slots = loadSlots(), out = [];
    for (var i = 1; i <= SLOT_COUNT; i++) out.push({ id: String(i), save: migrate(slots[String(i)] || null) });
    out.push({ id: 'auto', save: migrate(slots['auto'] || null) });
    return out;
  }

  /* ----------------------------------------------------------- Snapshot IO */
  function buildSave(state) {
    return {
      version: SAVE_VERSION,
      savedAt: Date.now(),
      chapter: state.chapter,
      act: state.act,
      nodeId: state.nodeId,
      sceneId: state.sceneId,
      stats: state.stats.snapshot(),
      persona: state.persona.snapshot(),
      flags: state.flags.snapshot(),
      history: state.history.slice(-400),
      visited: state.visited.slice(-500),
      playSeconds: state.playSeconds,
      path: state.path || null,
      thumb: state.thumb || null,
      thumbId: state.thumbId || null,
      title: state.title || ''
    };
  }

  function resetAll() {
    try {
      global.localStorage.removeItem(KEY_SLOTS);
      global.localStorage.removeItem(KEY_META);
      global.localStorage.removeItem('ah.analytics.v1');
      return true;
    } catch (e) { return false; }
  }

  global.AHSave = {
    SAVE_VERSION: SAVE_VERSION,
    SLOT_COUNT: SLOT_COUNT,
    DEFAULT_SETTINGS: DEFAULT_SETTINGS,
    loadMeta: loadMeta,
    saveMeta: saveMeta,
    writeSlot: writeSlot,
    readSlot: readSlot,
    deleteSlot: deleteSlot,
    listSlots: listSlots,
    buildSave: buildSave,
    migrate: migrate,
    resetAll: resetAll
  };
})(window);
