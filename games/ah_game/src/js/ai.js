/* AFTER HOURS -- AI character client.
   Assembles the 9-block system prompt from live game state and calls an
   OpenAI-compatible endpoint. Every AI node has a scripted fallback, so the
   game can never be blocked on the model. */
(function (global) {
  'use strict';

  var AI = global.AH_AI;

  function buildSecretsBlock(stats, flags) {
    var lines = [];
    for (var i = 0; i < AI.secrets.length; i++) {
      var s = AI.secrets[i], u = s.unlock || {}, ok = true;
      if (typeof u.trust === 'number' && stats.get('trust') < u.trust) ok = false;
      if (typeof u.curiosity === 'number' && stats.get('curiosity') < u.curiosity) ok = false;
      if (u.flag && !flags.has(u.flag)) ok = false;
      if (ok) lines.push('- You may reveal now: ' + s.id + '.');
      else lines.push('- ' + s.id + ' is LOCKED. If asked, ' + s.hint + '.');
    }
    return lines.join('\n') || '- Nothing is off limits yet, but stay guarded.';
  }

  function buildStatsReading(stats) {
    return [
      'trust: ' + Math.round(stats.get('trust')) + ' -- ' + global.AHCore.describeStat('trust', stats.get('trust')),
      'attraction: ' + Math.round(stats.get('attraction')) + ' -- ' + global.AHCore.describeStat('attraction', stats.get('attraction')),
      'tension: ' + Math.round(stats.get('tension')) + ' -- ' + global.AHCore.describeStat('tension', stats.get('tension')),
      'curiosity: ' + Math.round(stats.get('curiosity')) + ' -- ' + global.AHCore.describeStat('curiosity', stats.get('curiosity'))
    ].join('\n');
  }

  function buildRecentChoices(history) {
    var out = [];
    for (var i = history.length - 1; i >= 0 && out.length < 5; i--) {
      if (history[i].kind === 'choice') out.unshift('They chose: ' + history[i].text);
    }
    return out.length ? out.join('\n') : 'They have not committed to anything yet.';
  }

  function buildHistoryBlock(history) {
    var slice = history.slice(-12), out = [];
    for (var i = 0; i < slice.length; i++) {
      var h = slice[i];
      if (h.kind === 'choice') out.push('Player: ' + h.text);
      else out.push((h.who === 'maya' ? 'Maya' : 'Narration') + ': ' + h.text);
    }
    return out.join('\n') || '(this is the beginning of the scene)';
  }

  function buildSystemPrompt(state) {
    var tpl = AI.systemTemplate;
    var scene = AI.sceneGoals[state.sceneId] || AI.sceneGoals['default'];
    var map = {
      name: AI.character.name,
      age: AI.character.age,
      role: AI.character.role,
      profile: AI.character.profile,
      scene: scene,
      statsReading: buildStatsReading(state.stats),
      personaRead: state.persona.read(global.AHI18N.lang),
      recentChoices: buildRecentChoices(state.history),
      mood: state.mood.sprite,
      moodDirective: AI.moodDirectives[state.mood.sprite] || AI.moodDirectives.neutral,
      secretsBlock: buildSecretsBlock(state.stats, state.flags),
      history: buildHistoryBlock(state.history),
      goal: scene
    };
    return tpl.replace(/\{(\w+)\}/g, function (m, key) {
      return (key in map) ? map[key] : m;
    });
  }

  var META_RE = /\b(as an ai|language model|i cannot|i'm an ai|i am an ai|openai|prompt)\b/i;
  var fails = 0;
  var MAX_FAILS = 3;

  var AIClient = {
    available: function (settings) {
      return !!(settings.aiEnabled && settings.aiEndpoint && fails < MAX_FAILS);
    },
    resetFails: function () { fails = 0; },

    /** Resolve one AI turn. Always resolves -- never rejects. */
    complete: function (state, settings, scenePrompt) {
      var self = this;
      if (!this.available(settings)) {
        return Promise.resolve({ text: null, usedFallback: true, reason: 'disabled' });
      }
      var url = settings.aiEndpoint.replace(/\/+$/, '') + '/v1/chat/completions';
      var body = {
        model: settings.aiModel || 'local-model',
        messages: [
          { role: 'system', content: buildSystemPrompt(state) },
          { role: 'user', content: scenePrompt || 'React to what just happened.' }
        ],
        temperature: state.stats.get('tension') > 60 ? 1.1 : 0.85,
        max_tokens: 90,
        stop: ['\n\n', 'User:', 'Player:']
      };

      var ctl = ('AbortController' in global) ? new global.AbortController() : null;
      var timer = setTimeout(function () { if (ctl) ctl.abort(); }, 20000);
      var t0 = Date.now();

      return global.fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: ctl ? ctl.signal : undefined
      }).then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      }).then(function (j) {
        clearTimeout(timer);
        var txt = (j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content) || '';
        txt = String(txt).trim().replace(/^["']|["']$/g, '');
        if (!txt) throw new Error('empty');
        if (META_RE.test(txt)) {
          global.AHAnalytics.emit('ai_meta_leak', { text: txt.slice(0, 120) });
          throw new Error('meta');
        }
        if (txt.length > 400) txt = txt.slice(0, txt.lastIndexOf('.', 400) + 1 || 400);
        fails = 0;
        global.AHAnalytics.emit('ai_turn', { usedFallback: false, latencyMs: Date.now() - t0, mood: state.mood.sprite });
        return { text: txt, usedFallback: false, latencyMs: Date.now() - t0 };
      }).catch(function (e) {
        clearTimeout(timer);
        fails++;
        global.AHAnalytics.emit('ai_turn', { usedFallback: true, latencyMs: Date.now() - t0, error: String(e.message || e) });
        return { text: null, usedFallback: true, reason: String(e.message || e) };
      });
    },

    buildSystemPrompt: buildSystemPrompt,
    buildSecretsBlock: buildSecretsBlock
  };

  global.AHClient = AIClient;
})(window);
