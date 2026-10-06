/* AFTER HOURS -- UI layer: stage, dialogue, typewriter, HUD, screens.
   Owns all DOM. The engine calls into this via hooks. */
(function (global) {
  'use strict';

  var I18N = global.AHI18N;

  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };

  function el(tag, cls, txt) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (txt != null) n.textContent = txt;
    return n;
  }
  function imgUrl(name) { return global.AHImages.url(name); }
  function avatarUrl(mood) {
    // The player is not a mood of Maya: the plate has its own filename
    // (avatar_player.png). Building it as `avatar_maya_ + mood` asked the server
    // for avatar_maya_player.png, which has never existed -- so the player's
    // round plate was a 404 and rendered as an empty circle.
    if (mood === 'player') {
      return global.AHImages.playerOverride() || imgUrl('avatar_player');
    }
    return imgUrl('avatar_maya_' + (mood || 'neutral'));
  }
  function playerAvatarUrl() { return avatarUrl('player'); }

  /* The bust is the head-and-upper-body cut-out shown at the right of the chat
     box. Maya has one per mood; the player has one, cropped from spr_player. */
  function bustUrl(mood) { return imgUrl('bust_maya_' + (mood || 'neutral')); }
  function playerBustUrl() {
    // A custom portrait is a photo, not a cut-out -- framing it as a bust looks
    // wrong, so the player keeps the round plate and skips the bust entirely.
    if (global.AHImages.playerOverride()) return null;
    return imgUrl('bust_player');
  }

  /* =============================================================== UI */
  function UI(app) {
    this.app = app;
    this.root = $('#viewport');
    this._bgCache = {};
    this._spriteCache = {};
    this.typing = null;
    this.autoTimer = null;
    this.suppressSprite = false;
    this.build();
  }

  UI.prototype.build = function () {
    var r = this.root;

    /* --- background stack --- */
    this.bgLayer = el('div'); this.bgLayer.id = 'bg-layer';
    r.appendChild(this.bgLayer);

    /* --- sprite --- */
    this.spriteLayer = el('div'); this.spriteLayer.id = 'sprite-layer';
    r.appendChild(this.spriteLayer);

    /* --- cg --- */
    this.cgLayer = el('div'); this.cgLayer.id = 'cg-layer';
    r.appendChild(this.cgLayer);

    /* --- grade / bloom / grain --- */
    this.grade = el('div'); this.grade.id = 'grade'; r.appendChild(this.grade);
    this.bloom = el('div'); this.bloom.id = 'bloom'; r.appendChild(this.bloom);
    var grain = el('div'); grain.id = 'grain'; r.appendChild(grain);

    /* --- HUD --- */
    this.hud = el('div'); this.hud.id = 'hud';
    var hl = el('div', 'hud-left');
    this.chapterTag = el('div', 'chapter-tag');
    hl.appendChild(this.chapterTag);
    var hr = el('div', 'hud-right');
    this.tools = {};
    var self = this;
    [
      ['auto', 'auto'], ['skip', 'skip'], ['hide', 'hide'],
      ['history', 'history'], ['status', 'status'],
      ['save', 'save'], ['menu', 'menu']
    ].forEach(function (t) {
      var b = el('button', 'tool', I18N.t('ui.' + t[1]));
      b.dataset.tool = t[0];
      b.addEventListener('click', function () { self.app.onTool(t[0]); });
      hr.appendChild(b);
      self.tools[t[0]] = b;
    });
    this.hud.appendChild(hl); this.hud.appendChild(hr);
    r.appendChild(this.hud);

    /* --- stat mini-bars --- */
    this.statbar = el('div'); this.statbar.id = 'statbar';
    this.statRows = {};
    var order = ['trust', 'attraction', 'tension', 'curiosity', 'mood'];
    order.forEach(function (k) {
      var def = global.AH_STORY.stats[k];
      var row = el('div', 'stat-row');
      var ico = el('span', 'stat-ico', def.icon);
      var track = el('div', 'stat-track');
      var fill = el('div', 'stat-fill ' + k);
      track.appendChild(fill);
      var val = el('span', 'stat-val', '0');
      row.appendChild(ico); row.appendChild(track); row.appendChild(val);
      self.statbar.appendChild(row);
      self.statRows[k] = { fill: fill, val: val };
    });
    r.appendChild(this.statbar);

    /* --- AI thinking indicator --- */
    this.aipulse = el('div'); this.aipulse.id = 'aipulse';
    this.aipulse.appendChild(el('span', '', 'Maya'));
    this.aipulse.appendChild(el('span', 'd'));
    this.aipulse.appendChild(el('span', 'd'));
    this.aipulse.appendChild(el('span', 'd'));
    r.appendChild(this.aipulse);

    /* --- choices --- */
    this.choicesEl = el('div'); this.choicesEl.id = 'choices';
    r.appendChild(this.choicesEl);

    /* --- dialogue --- */
    this.dialogue = el('div'); this.dialogue.id = 'dialogue';

    this.speakerRow = el('div', 'speaker-row');
    this.avatarEl = el('img', 'avatar');
    this.avatarEl.alt = '';
    this.avatarEl.draggable = false;
    this.speakerRow.appendChild(this.avatarEl);

    this.nameplate = el('div', 'nameplate');
    this.nameplate.appendChild(el('span', 'dot'));
    this.nameText = el('span', '', 'Maya');
    this.nameplate.appendChild(this.nameText);
    this.speakerRow.appendChild(this.nameplate);

    this.box = el('div', 'box');
    this.textEl = el('div'); this.textEl.id = 'text';
    this.advance = el('div', '', '▼'); this.advance.id = 'advance';
    this.box.appendChild(this.textEl);
    this.box.appendChild(this.advance);
    this.dialogue.appendChild(this.speakerRow);
    this.dialogue.appendChild(this.box);

    // head + upper body cut-out, right of the box, head above its top edge
    this.bustEl = el('img', 'bust');
    this.bustEl.alt = '';
    this.bustEl.draggable = false;
    this.dialogue.appendChild(this.bustEl);

    r.appendChild(this.dialogue);

    /* click anywhere on the stage to advance */
    r.addEventListener('click', function (e) {
      if (e.target.closest('.choice') || e.target.closest('.tool') || e.target.closest('.screen')) return;
      self.app.onStageClick();
    });

    /* --- toast --- */
    this.toastEl = el('div'); this.toastEl.id = 'toast';
    r.appendChild(this.toastEl);

    /* --- act card --- */
    this.actcard = el('div'); this.actcard.id = 'actcard';
    this.actcard.innerHTML =
      '<div class="ac-num"></div><h1 class="ac-title"></h1><div class="ac-rule"></div><div class="ac-sub"></div>';
    r.appendChild(this.actcard);
  };

  /* ------------------------------------------------------ Background */
  UI.prototype.setBackground = function (name, ambient, animate) {
    if (this._bgCurrent === name) return;
    this._bgCurrent = name;
    this._bgAmbient = ambient || 'neutral';
    var bg = el('div', 'bg drift ' + (ambient || 'neutral'));
    bg.style.backgroundImage = 'url("' + imgUrl(name) + '")';
    this.bgLayer.appendChild(bg);
    var self = this;
    // two rAF so the transition actually runs
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        bg.classList.add('show');
        var old = $$('.bg', self.bgLayer);
        for (var i = 0; i < old.length - 1; i++) {
          (function (o) {
            o.classList.remove('show');
            setTimeout(function () { if (o.parentNode) o.parentNode.removeChild(o); }, 1000);
          })(old[i]);
        }
      });
    });
    // preload the next few so transitions never flash
    this.preload();
  };

  UI.prototype.preload = function () {
    var names = [];
    for (var i = 0; i < global.AH_STORY.scenes.length; i++) {
      var s = global.AH_STORY.scenes[i];
      if (s.bg) names.push(s.bg);
      if (s.cg) names.push(s.cg);
    }
    for (var j = 0; j < names.length; j++) {
      if (this._bgCache[names[j]]) continue;
      var im = new Image(); im.src = imgUrl(names[j]);
      this._bgCache[names[j]] = true;
    }
  };

  /* ---------------------------------------------------------- Sprite */
  UI.prototype.setSprite = function (moodSprite) {
    var self = this;
    if (this._spriteCurrent === moodSprite) return;
    this._spriteCurrent = moodSprite;

    $$('.sprite', this.spriteLayer).forEach(function (s) { s.classList.add('out'); });
    this.spriteLayer.classList.toggle('has-sprite', !!moodSprite);
    if (!moodSprite) return;

    var s = el('div', 'sprite breathe mood-' + moodSprite);
    s.style.backgroundImage = 'url("' + imgUrl('spr_maya_' + moodSprite) + '")';
    s.style.backgroundSize = 'contain';
    s.style.backgroundRepeat = 'no-repeat';
    s.style.backgroundPosition = 'bottom center';
    this.spriteLayer.appendChild(s);

    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        s.classList.add('show');
        var old = $$('.sprite', self.spriteLayer);
        for (var i = 0; i < old.length - 1; i++) {
          (function (o) { setTimeout(function () { if (o.parentNode) o.parentNode.removeChild(o); }, 700); })(old[i]);
        }
      });
    });
  };

  /* -------------------------------------------------------------- CG */
  UI.prototype.showCG = function (name, opts) {
    opts = opts || {};
    var self = this;
    this._cgCurrent = name;
    var c = el('div', 'cg');
    c.style.backgroundImage = 'url("' + imgUrl(name) + '")';
    this.cgLayer.appendChild(c);
    requestAnimationFrame(function () { requestAnimationFrame(function () { c.classList.add('show'); }); });
    if (opts.autoHide !== false) {
      setTimeout(function () {
        c.classList.remove('show');
        setTimeout(function () { if (c.parentNode) c.parentNode.removeChild(c); }, 800);
      }, opts.duration || 3400);
    }
    this.holdCG = c;
  };
  UI.prototype.hideCG = function () {
    this._cgCurrent = null;
    if (!this.holdCG) return;
    var c = this.holdCG;
    c.classList.remove('show');
    setTimeout(function () { if (c.parentNode) c.parentNode.removeChild(c); }, 800);
    this.holdCG = null;
  };

  /* --------------------------------------------------- Style switching */
  /** Re-paint every image currently on screen after the art style changed.
      Each layer caches the id it last drew and early-returns on a repeat, so
      the caches have to be invalidated first or the swap is silently skipped. */
  UI.prototype.refreshStyle = function () {
    var purge = function (root, sel) {
      $$(sel, root).forEach(function (n) { if (n.parentNode) n.parentNode.removeChild(n); });
    };

    this._bgCache = {};

    if (this._cgCurrent) {
      var cg = this._cgCurrent;
      purge(this.cgLayer, '.cg');
      this.holdCG = null;
      this._cgCurrent = null;
      this.showCG(cg, { autoHide: false });
    }
    if (this._bgCurrent) {
      var bg = this._bgCurrent, amb = this._bgAmbient;
      purge(this.bgLayer, '.bg');
      this._bgCurrent = null;
      this.setBackground(bg, amb);
    }
    if (this._spriteCurrent) {
      var sp = this._spriteCurrent;
      purge(this.spriteLayer, '.sprite');
      this._spriteCurrent = null;
      this.setSprite(sp);
    }
    if (this._avatarMood) this.setAvatar(avatarUrl(this._avatarMood), this._avatarMood);
    if (this._bustMood) {
      var bm = this._bustMood;
      this._bustSrc = null;   // force a re-resolve against the new directory
      this.setBust(bm === 'player' ? playerBustUrl() : bustUrl(bm), bm);
    }
    this.preload();
  };

  /* ------------------------------------------------------- Typewriter */
  UI.prototype.setGrade = function (mood) {
    var v = mood.dim != null ? mood.dim : 0.35;
    this.grade.style.setProperty('opacity', String(v));
    this.root.className = '';
    this.root.dataset.ambient = mood.ambient || 'neutral';
  };

  UI.prototype.say = function (who, text, opts) {
    opts = opts || {};
    var self = this;
    this.clearChoices();
    this.dialogue.classList.remove('choosing');
    this.setAdvance(false);

    if (who === 'narrate') {
      // Prose keeps whoever spoke last on screen, just pushed back. Blanking the
      // plate on every narration line made the box read as empty, which is the
      // "no avatars" complaint. Before the first speaker appears there is nobody
      // to keep, so the row stays hidden.
      this.nameplate.classList.remove('show');
      this.speakerRow.classList.toggle('show', !!this._lastAvatarSrc);
      this.speakerRow.classList.toggle('narrating', !!this._lastAvatarSrc);
      this.setBustNarrating(true);
    } else if (who === 'player') {
      this.speakerRow.classList.add('show');
      this.speakerRow.classList.remove('narrating');
      this.nameplate.classList.add('show');
      this.nameText.textContent = I18N.t('ui.you');
      this.setAvatar(playerAvatarUrl(), 'player');
      this.setBustNarrating(false);
      this.setBust(playerBustUrl(), 'player');
    } else {
      var mood = this.app.engine.mood.sprite;
      this.speakerRow.classList.add('show');
      this.speakerRow.classList.remove('narrating');
      this.nameplate.classList.add('show');
      this.nameText.textContent = 'Maya';
      this.setAvatar(avatarUrl(mood), mood);
      this.setBustNarrating(false);
      this.setBust(bustUrl(mood), mood);
    }

    this.textEl.className = '';
    this.dialogue.classList.remove('hidden');

    var speed = this.app.settings.textSpeed || 34;
    if (this.app.skipMode) speed = 99999;
    var ms = Math.max(6, 1000 / speed);

    // narration renders italic; player lines get a teal tint via nameplate only
    if (opts.narration) this.textEl.className = 'narration';

    var i = 0;
    if (this.typing) { clearInterval(this.typing); clearTimeout(this.typing); this.typing = null; }
    this.fullText = text;
    this.textEl.textContent = '';

    var caret = el('span', 'caret');
    this.textEl.appendChild(caret);

    this.typing = setInterval(function () {
      if (i >= text.length) {
        clearInterval(self.typing); self.typing = null;
        if (caret.parentNode) caret.parentNode.removeChild(caret);
        self.setAdvance(true);
        if (opts.ai) global.AHAnalytics.emit('ai_line_shown', {});
        self.app.onTextComplete();
        return;
      }
      var ch = text.charAt(i++);
      caret.insertAdjacentText('beforebegin', ch);
      // pause slightly on sentence-ending punctuation for a spoken cadence
      if (ch === '.' || ch === '!' || ch === '?') {
        clearInterval(self.typing); self.typing = null;
        self.typing = setTimeout(function () { self.resumeTyping(text, i, caret, ms, opts); }, 110);
      }
    }, ms);
  };

  /** Continue a typewriter run after a punctuation pause. */
  UI.prototype.resumeTyping = function (text, from, caret, ms, opts) {
    var self = this, i = from;
    this.typing = setInterval(function () {
      if (i >= text.length) {
        clearInterval(self.typing); self.typing = null;
        if (caret.parentNode) caret.parentNode.removeChild(caret);
        self.setAdvance(true);
        if (opts.ai) global.AHAnalytics.emit('ai_line_shown', {});
        self.app.onTextComplete();
        return;
      }
      var ch = text.charAt(i++);
      caret.insertAdjacentText('beforebegin', ch);
      if (ch === '.' || ch === '!' || ch === '?') {
        clearInterval(self.typing); self.typing = null;
        self.typing = setTimeout(function () { self.resumeTyping(text, i, caret, ms, opts); }, 110);
      }
    }, ms);
  };

  UI.prototype.finishTyping = function () {
    if (!this.typing) return false;
    clearInterval(this.typing);
    clearTimeout(this.typing);
    this.typing = null;
    this.textEl.textContent = this.fullText || '';
    this.setAdvance(true);
    this.app.onTextComplete();
    return true;
  };

  UI.prototype.setAdvance = function (on) {
    this.advance.classList.toggle('show', !!on);
  };

  /** Swap the dialogue avatar. Fades the plate on change so it never pops. */
  UI.prototype.setAvatar = function (src, mood) {
    if (!src) return;
    if (this.avatarEl.getAttribute('src') === src) return;
    var self = this;
    this.avatarEl.classList.remove('in');
    var pre = new Image();
    pre.onload = function () {
      self.avatarEl.src = src;
      self._lastAvatarSrc = src;
      self._avatarMood = mood || '';
      self.avatarEl.dataset.mood = mood || '';
      requestAnimationFrame(function () { self.avatarEl.classList.add('in'); });
    };
    pre.onerror = function () {
      // avatar missing: fall back to the plate only, never break the line
      self.avatarEl.removeAttribute('src');
    };
    pre.src = src;
  };

  /** Show the speaker's bust, or drop back to the round plate.
      `has-bust` is only added once the image has actually decoded, so a set
      that has no bust assets behaves exactly like the old build. */
  UI.prototype.setBust = function (src, mood) {
    this._bustMood = mood || null;
    if (!src) {
      this._bustSrc = null;
      this.dialogue.classList.remove('has-bust');
      this.bustEl.removeAttribute('src');
      return;
    }
    if (this._bustSrc === src) { this.bustEl.dataset.mood = mood || ''; return; }
    var self = this;
    var pre = new Image();
    pre.onload = function () {
      self._bustSrc = src;
      self.bustEl.src = src;
      self.bustEl.dataset.mood = mood || '';
      self.dialogue.classList.add('has-bust');
    };
    pre.onerror = function () {
      self._bustSrc = null;
      self.dialogue.classList.remove('has-bust');
      self.bustEl.removeAttribute('src');
    };
    pre.src = src;
  };

  /** Prose lines keep the last speaker on screen, stepped back. */
  UI.prototype.setBustNarrating = function (on) {
    this.dialogue.classList.toggle('narrating', !!on && !!this._bustSrc);
  };

  UI.prototype.showNameplate = function (on) {
    this.nameplate.classList.toggle('show', !!on);
  };

  UI.prototype.toggleDialogue = function (on) {
    this.dialogue.classList.toggle('hidden', on === false);
  };

  /* ---------------------------------------------------------- Choices */
  UI.prototype.showChoices = function (node, onPick) {
    var self = this;
    this.clearChoices();
    this.setAdvance(false);
    // the options stack right over the bust -- get the cut-out out of the way
    this.dialogue.classList.add('choosing');

    var prompt = I18N.pick(node.prompt);
    if (prompt) {
      this.textEl.textContent = prompt;
      this.textEl.className = 'narration';
      this.showNameplate(false);
    }

    node.options.forEach(function (opt, idx) {
      var gate = global.AHCore.checkRequire(opt.require, self.app.engine.stats, self.app.engine.flags, self.app.engine.persona);
      var b = el('button', 'choice');
      b.style.animationDelay = (idx * 70) + 'ms';

      var tag = el('span', 'tag', I18N.pick((global.AH_STORY.persona[opt.persona] || {}).label) || opt.persona);
      var label = el('span', '', I18N.pick({ ru: opt.ru, en: opt.en }));
      b.appendChild(tag);
      b.appendChild(label);

      if (!gate.ok) {
        b.disabled = true;
        var hint = opt.unlockHint ? I18N.pick(opt.unlockHint) : I18N.t('ui.locked');
        b.appendChild(el('span', 'lock', '🔒 ' + hint));
      } else {
        b.addEventListener('click', function () {
          global.AHAudio.confirm();
          self.clearChoices();
          onPick(opt, node);
        });
      }
      self.choicesEl.appendChild(b);
    });
  };

  UI.prototype.clearChoices = function () {
    this.choicesEl.innerHTML = '';
  };

  /* ------------------------------------------------------------ Stats */
  UI.prototype.refreshStats = function (stats, persona) {
    var self = this;
    ['trust', 'attraction', 'tension', 'curiosity', 'mood'].forEach(function (k) {
      var row = self.statRows[k];
      if (!row) return;
      var v = Math.round(stats.get(k));
      row.fill.style.width = v + '%';
      row.val.textContent = String(v);
    });
  };

  /* `locationLabel` is the raw label object from story.json ({ru,en}) so the
     tag can be re-resolved when the language changes. A plain string is
     accepted too, for callers that only have one. */
  UI.prototype.setChapterTag = function (act, locationLabel) {
    this._act = act;
    this._locLabel = locationLabel;
    this.renderChapterTag();
  };

  UI.prototype.renderChapterTag = function () {
    var loc = this._locLabel;
    if (loc && typeof loc === 'object') loc = I18N.pick(loc);
    this.chapterTag.innerHTML = I18N.t('ui.act') + ' ' + this._act + ' · <b>' + (loc || '') + '</b>';
  };

  /** Re-apply every language-bound string that is built once, at construction.
      The HUD tool buttons are created before the player can reach the language
      setting, so without this they stay in whatever locale booted first. */
  UI.prototype.relabel = function () {
    var self = this;
    var keys = {
      auto: 'ui.auto', skip: 'ui.skip', hide: 'ui.hide',
      history: 'ui.history', status: 'ui.status',
      save: 'ui.save', menu: 'ui.menu'
    };
    Object.keys(keys).forEach(function (k) {
      if (self.tools[k]) self.tools[k].textContent = I18N.t(keys[k]);
    });
    if (this._act != null) this.renderChapterTag();
  };

  /* ------------------------------------------------------- Act card */
  UI.prototype.showActCard = function (title, subtitle, done) {
    var a = this.actcard;
    $('.ac-num', a).textContent = I18N.t('ui.chapter') + ' I';
    $('.ac-title', a).textContent = title || '';
    $('.ac-sub', a).textContent = subtitle || '';
    a.classList.add('show');
    this.dialogue.classList.add('hidden');
    var dur = this.app.settings.reduceMotion ? 1400 : 3400;
    this.cancelActCard();
    var self = this;
    this._acT1 = setTimeout(function () {
      a.classList.remove('show');
      self._acT2 = setTimeout(function () {
        self._acT1 = self._acT2 = null;
        done && done();
      }, 620);
    }, dur);
  };

  /* The card's hand-off to the next scene lives in a timer. If the player quits
     to the menu, loads a save or starts a new run while the card is still
     animating, that timer used to fire anyway and dragged the *new* run into
     the old scene. Cancelling is mandatory, not cosmetic. */
  UI.prototype.cancelActCard = function () {
    if (this._acT1) { clearTimeout(this._acT1); this._acT1 = null; }
    if (this._acT2) { clearTimeout(this._acT2); this._acT2 = null; }
    this.actcard.classList.remove('show');
  };

  /* ----------------------------------------------------------- Toast */
  UI.prototype.toast = function (msg, ms) {
    var t = this.toastEl;
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(this._toastT);
    this._toastT = setTimeout(function () { t.classList.remove('show'); }, ms || 2200);
  };

  UI.prototype.setAIPulse = function (on) {
    this.aipulse.classList.toggle('show', !!on);
  };

  /* ------------------------------------------------------- Stat flash */
  UI.prototype.flashStat = function (delta) {
    var self = this;
    Object.keys(delta || {}).forEach(function (k) {
      var row = self.statRows[k];
      if (!row || !delta[k]) return;
      row.val.style.transition = 'color 200ms ease';
      row.val.style.color = delta[k] > 0 ? '#7fd38a' : '#e0736a';
      row.val.textContent = (delta[k] > 0 ? '+' : '') + Math.round(delta[k]);
      setTimeout(function () {
        row.val.style.color = '';
        row.val.textContent = String(Math.round(self.app.engine.stats.get(k)));
      }, 1200);
    });
  };

  UI.prototype.setToolActive = function (name, on) {
    if (this.tools[name]) this.tools[name].classList.toggle('active', !!on);
  };

  UI.prototype.setToolLabel = function (name, text) {
    if (this.tools[name]) this.tools[name].textContent = text;
  };

  UI.prototype.setStatusVisible = function (on) {
    this.statbar.classList.toggle('show', !!on);
  };

  global.AHUI = UI;
})(window);
