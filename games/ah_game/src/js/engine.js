/* AFTER HOURS -- node-graph interpreter.
   Walks scenes, renders nodes, applies effects. Owns the run state. */
(function (global) {
  'use strict';

  var C = global.AHCore;
  var STORY = global.AH_STORY;

  function Engine(hooks) {
    this.hooks = hooks || {};
    this.scenesById = {};
    for (var i = 0; i < STORY.scenes.length; i++) this.scenesById[STORY.scenes[i].id] = STORY.scenes[i];
    this.reset(null);
  }

  Engine.prototype.reset = function (meta) {
    var s = STORY.stats;
    this.stats = new C.Stats(null);
    this.persona = new C.Persona(null);
    this.flags = new C.Flags(null);
    // The unreliable-narrator reading is a flag, not a special code path, so it
    // travels in saves and can be flipped mid-scene without touching the graph.
    var st = (global.AHState && global.AHState.settings) || {};
    if (st.unreliable) this.flags.set({ unreliable: true });
    this.history = [];
    this.visited = [];
    this.chapter = 1;
    this.act = 1;
    this.sceneId = null;
    this.nodeId = null;
    this.path = null;
    this.playSeconds = 0;
    this.thumb = null;
    this.title = '';
    this.mood = C.MoodResolver.resolve(this.stats, this.flags, this.persona);
    this.newGamePlus = !!(meta && meta.runs > 0);
    this.ended = false;
    this.terminated = false;
  };

  /** Restore from a save object. */
  Engine.prototype.restore = function (sv) {
    this.stats = new C.Stats(sv.stats);
    this.persona = new C.Persona(sv.persona);
    this.flags = new C.Flags(sv.flags);
    this.history = sv.history || [];
    this.visited = sv.visited || [];
    this.chapter = sv.chapter || 1;
    this.act = sv.act || 1;
    this.sceneId = sv.sceneId;
    this.nodeId = sv.nodeId;
    this.path = sv.path || null;
    this.playSeconds = sv.playSeconds || 0;
    this.thumb = sv.thumb || null;
    this.title = sv.title || '';
    this.ended = false;
    this.terminated = false;
    this.mood = C.MoodResolver.resolve(this.stats, this.flags, this.persona);
  };

  Engine.prototype.snapshot = function () {
    return global.AHSave.buildSave(this);
  };

  Engine.prototype.start = function () {
    this.goScene(STORY.scenes[0].id);
  };

  Engine.prototype.goScene = function (id) {
    var sc = this.scenesById[id];
    if (!sc) { console.warn('[AH] unknown scene', id); return; }
    this.sceneId = id;
    this.act = sc.act || this.act;
    if (this.visited.indexOf(id) < 0) this.visited.push(id);
    this.hooks.onScene && this.hooks.onScene(sc, this);
    this.nodeIndex = 0;
    this.terminated = false;
    this.step();
  };

  /** First node in a scene that can hand control somewhere else. */
  Engine.prototype.findTerminator = function (sc) {
    for (var i = 0; i < sc.nodes.length; i++) {
      var t = sc.nodes[i].t;
      if (t === 'goto' || t === 'actEnd' || t === 'ending') return sc.nodes[i];
    }
    return null;
  };

  Engine.prototype.step = function () {
    var sc = this.scenesById[this.sceneId];
    if (!sc) return;
    if (this.nodeIndex >= sc.nodes.length) {
      // Ran off the end of the node list. If nothing in this scene ever handed
      // control away (no goto/actEnd/ending was dispatched), fall back to the
      // first terminator the scene declares, so a malformed scene degrades into
      // "jump to the next beat" instead of soft-locking the player on a click
      // that does nothing.
      if (!this.terminated) {
        var term = this.findTerminator(sc);
        if (term) { this.dispatch(term); return; }
        this.hooks.onSceneEnd && this.hooks.onSceneEnd(sc, this);
      }
      return;
    }
    var node = sc.nodes[this.nodeIndex];
    this.nodeId = this.sceneId + ':' + this.nodeIndex;
    this.nodeIndex++;
    this.dispatch(node);
  };

  Engine.prototype.advance = function () { this.step(); };

  /** A node's line. With the unreliable-narrator flag set, a node that carries
      an `alt` variant hands that one over instead -- the narrator's own lines
      only. Nodes without `alt` are untouched, so the default run is identical. */
  Engine.prototype.text = function (node) {
    if (node.alt && this.flags.has('unreliable')) return global.AHI18N.pick(node.alt);
    return global.AHI18N.pick(node);
  };

  Engine.prototype.dispatch = function (node) {
    var self = this;
    var t = node.t;

    if (t === 'narrate') {
      var ntext = this.text(node);
      this.pushHistory({ kind: 'narrate', text: ntext, nodeId: this.nodeId });
      this.hooks.onNarrate && this.hooks.onNarrate(ntext, this);
      return;
    }

    if (t === 'say') {
      var line = this.text(node);
      if (this.persona.dominant() === 'direct' && line.length > 90) {
        // "direct" readers get Maya's clipped register
        line = line.split(/(?<=\.)\s+/).slice(0, 2).join(' ');
      }
      this.pushHistory({ kind: 'say', who: 'maya', text: line, nodeId: this.nodeId, mood: this.mood.sprite });
      if (node.sprite) this.mood = C.MoodResolver.resolve(this.stats, this.flags, this.persona);
      this.hooks.onSay && this.hooks.onSay('maya', line, this);
      return;
    }

    if (t === 'player') {
      var v = this.personaVariant(node);
      this.pushHistory({ kind: 'player', text: v, nodeId: this.nodeId });
      this.hooks.onSay && this.hooks.onSay('player', v, this);
      return;
    }

    if (t === 'cg') {
      this.hooks.onCG && this.hooks.onCG(node.img, this);
      return;
    }

    if (t === 'choice') { this.hooks.onChoice && this.hooks.onChoice(node, this); return; }

    if (t === 'branch') { this.doBranch(node); return; }

    if (t === 'goto') { this.terminated = true; this.goScene(node.next); return; }

    if (t === 'actEnd') {
      this.terminated = true;
      var delta = this.stats.decay();
      this.act++;
      this.hooks.onBeat && this.hooks.onBeat(this);
      this.hooks.onStatChange && this.hooks.onStatChange(delta, this);
      global.AHAnalytics.emit('act_end', { act: this.act - 1, stats: this.stats.snapshot() });
      this.hooks.onActCard && this.hooks.onActCard(
        global.AHI18N.pick(node.title), global.AHI18N.pick(node.subtitle),
        function () { self.goScene(node.next); });
      return;
    }

    if (t === 'ending') {
      this.terminated = true;
      var endId = C.resolveEnding(this.stats, this.flags);
      this.ended = true;
      global.AHAnalytics.emit('ending_reached', { ending: endId, stats: this.stats.snapshot(), persona: this.persona.snapshot() });
      this.hooks.onEnding && this.hooks.onEnding(endId, this);
      return;
    }

    if (t === 'ai') { this.doAI(node); return; }

    console.warn('[AH] unknown node type', t);
    this.advance();
  };

  Engine.prototype.doBranch = function (node) {
    if (node.eval === 'saw_photo') {
      return this.goScene(this.flags.has('saw_photo') ? node.then : node.else);
    }
    if (node.eval === 'path') {
      var p = this.path;
      var target = (p && node.then[p]) ? node.then[p] : node.else;
      return this.goScene(target);
    }
    return this.goScene(node.else || node.then);
  };

  /** The player's own line for this beat. The persona axis picks the register,
      and the unreliable reading swaps in its own table: the protagonist's
      asides turn against him (the hand that moved on its own, the seat that
      was already warm), which is the one place the schizo mode can reach the
      player's voice rather than the narrator's. */
  Engine.prototype.personaVariant = function (node) {
    var ax = this.persona.dominant();
    if (this.flags.has('unreliable')) {
      var altTable = (global.AH_AI.playerVariantsAlt || {})[ax] || {};
      var av = altTable[this.sceneId] || altTable['default'];
      if (av) return global.AHI18N.pick(av);
    }
    var table = (global.AH_AI.playerVariants || {})[ax] || {};
    var v = table[this.sceneId] || table['default'];
    return v ? global.AHI18N.pick(v) : '';
  };

  Engine.prototype.doAI = function (node) {
    var self = this;
    var settings = global.AHState ? global.AHState.settings : {};
    if (!global.AHClient.available(settings)) {
      var fb = global.AHI18N.pick(node.fallback);
      this.pushHistory({ kind: 'say', who: 'maya', text: fb, nodeId: this.nodeId, ai: false, mood: this.mood.sprite });
      this.hooks.onSay && this.hooks.onSay('maya', fb, this);
      return;
    }
    this.hooks.onAIThinking && this.hooks.onAIThinking(this);
    global.AHClient.complete(this, settings, node.prompt ? global.AHI18N.pick(node.prompt) : null)
      .then(function (res) {
        var txt = res.text || global.AHI18N.pick(node.fallback);
        if (res.usedFallback && res.reason !== 'disabled') {
          global.AHState && global.AHState.toast && global.AHState.toast(global.AHI18N.t('log.aiFallback'));
        }
        self.pushHistory({ kind: 'say', who: 'maya', text: txt, nodeId: self.nodeId, ai: !res.usedFallback, mood: self.mood.sprite });
        self.hooks.onSay && self.hooks.onSay('maya', txt, self, !res.usedFallback);
      });
  };

  Engine.prototype.choose = function (option, choiceNode) {
    var bias = STORY.persona[option.persona] ? STORY.persona[option.persona].bias : null;
    var effects = option.effects || bias || {};
    var delta = this.stats.apply(effects);
    if (typeof option.mood === 'number') this.stats.apply({ mood: option.mood });
    this.persona.bump(option.persona);
    this.flags.set(option.flags);
    if (option.path) this.path = option.path;

    var text = global.AHI18N.pick(option.ru ? { ru: option.ru, en: option.en } : option.text);
    this.pushHistory({ kind: 'choice', text: text, nodeId: this.nodeId, persona: option.persona });

    global.AHAnalytics.emit('choice_made', {
      choiceId: choiceNode.id, persona: option.persona, delta: delta, stats: this.stats.snapshot()
    });

    this.mood = C.MoodResolver.resolve(this.stats, this.flags, this.persona);
    this.hooks.onStatChange && this.hooks.onStatChange(delta, this);
    this.hooks.onMood && this.hooks.onMood(this.mood, this);
    this.advance();
  };

  Engine.prototype.pushHistory = function (entry) {
    entry.at = Date.now();
    this.history.push(entry);
    if (this.history.length > 400) this.history.shift();
  };

  Engine.prototype.endings = function () { return STORY.scenes.filter(function (s) { return !!s.ending; }); };
  Engine.prototype.endingById = function (id) {
    var e = this.endings();
    for (var i = 0; i < e.length; i++) if (e[i].ending === id) return e[i];
    return null;
  };

  global.AHEngine = Engine;
})(window);
