// Illustration Composer — Figma plugin (main thread)
// Собирает композиции ТОЛЬКО из готовых образцов и элементов библиотеки файла.
// Ничего не рисует: клонирует узлы, перекрашивает по палитре, меняет состояние
// (главный/фоновый) и размер (L/S) на соответствующие варианты из библиотеки.

figma.showUI(__html__, { width: 380, height: 700, themeColors: true });

const VERSION = '1.0.0';

/* ------------------------------------------------------------------ */
/* палитры и роли цветов (те же, что в веб-версии)                     */
/* ------------------------------------------------------------------ */

const PALETTES = [
  {
    id: 'lilac',
    name: 'Схема 1 · Lilac',
    bg: ['#D7CDF5', '#AA9BF0', '#7864D7'],
    obj: ['#F9ECB0', '#F9A3AA', '#FFE3E1'],
  },
  {
    id: 'peach',
    name: 'Схема 2 · Peach',
    bg: ['#FDD7B9', '#FAC896', '#D27532'],
    obj: ['#F9ECB0', '#80DADA', '#BEEBEB'],
  },
  {
    id: 'mint',
    name: 'Схема 3 · Mint',
    bg: ['#BEEBEB', '#80DADA', '#5ABEBE'],
    obj: ['#FFD4F2', '#6D7BFC', '#B6C6FE'],
  },
];

const ROLES = {};
PALETTES.forEach((p) => {
  p.bg.forEach((hex, i) => (ROLES[hex] = { role: 'bg', slot: i }));
  p.obj.forEach((hex, i) => (ROLES[hex] = { role: 'obj', slot: i }));
});
ROLES['#181817'] = { role: 'ink', slot: 0 };
ROLES['#FFFFFF'] = { role: 'paper', slot: 0 };

/* ------------------------------------------------------------------ */
/* лексикон (сокращённая копия веб-версии)                             */
/* ------------------------------------------------------------------ */

const LEXICON = {
  'Книга': ['книг', 'знани', 'обучен', 'учеб', 'образован', 'чтен', 'истор', 'библиотек', 'методолог', 'гайд', 'book', 'knowledge', 'learn', 'study', 'read', 'education', 'guide', 'research'],
  'Телефон': ['телефон', 'связ', 'коммуникац', 'звон', 'поддержк', 'клиент', 'сервис', 'приложен', 'мобильн', 'phone', 'call', 'support', 'communication', 'app', 'mobile', 'contact', 'chat'],
  'Пазлы': ['пазл', 'решен', 'задач', 'интеграц', 'сложн', 'собрат', 'стратег', 'логик', 'puzzle', 'solution', 'integration', 'problem', 'strategy'],
  'Лампа': ['иде', 'свет', 'вдохновен', 'мысл', 'ламп', 'креатив', 'инсайт', 'инновац', 'idea', 'light', 'inspiration', 'brainstorm', 'creative', 'insight'],
  'Кошелек': ['кошел', 'финанс', 'деньг', 'бюджет', 'платеж', 'покупк', 'оплат', 'wallet', 'finance', 'money', 'budget', 'payment', 'purchase', 'cash'],
  'Монета': ['монет', 'деньг', 'инвестиц', 'доход', 'прибыл', 'рост', 'цен', 'накоплен', 'экономик', 'coin', 'invest', 'income', 'profit', 'growth', 'price', 'savings'],
  'Ручка': ['ручк', 'письм', 'текст', 'контент', 'редактор', 'дизайн', 'творч', 'документ', 'стать', 'pen', 'write', 'text', 'content', 'edit', 'design', 'draft'],
  'Папка': ['папк', 'документ', 'архив', 'проект', 'организац', 'структур', 'файл', 'каталог', 'folder', 'document', 'archive', 'project', 'organize', 'files', 'structure'],
  'Наушники': ['наушник', 'музык', 'звук', 'отдых', 'помощ', 'фокус', 'концентрац', 'headphones', 'music', 'sound', 'audio', 'relax', 'help', 'listen', 'focus'],
  'Group 2136136344': ['абстракц', 'концепц', 'паттерн', 'abstract', 'concept', 'pattern'],
  'Group 2136136345': ['абстракц', 'концепц', 'паттерн', 'abstract', 'concept', 'pattern'],
};

/* ------------------------------------------------------------------ */
/* утилиты                                                             */
/* ------------------------------------------------------------------ */

const post = (type, payload) => figma.ui.postMessage(Object.assign({ type }, payload || {}));
const round = (n) => Math.round(n * 100) / 100;

function hexOf(color) {
  if (!color) return null;
  const h = (v) => Math.max(0, Math.min(255, Math.round(v * 255))).toString(16).padStart(2, '0');
  return ('#' + h(color.r) + h(color.g) + h(color.b)).toUpperCase();
}

function rgbOf(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex).trim());
  if (!m) return null;
  const v = parseInt(m[1], 16);
  return { r: ((v >> 16) & 255) / 255, g: ((v >> 8) & 255) / 255, b: (v & 255) / 255 };
}

function mapColor(hex, scheme) {
  const role = ROLES[hex];
  if (!role) return hex;
  if (role.role === 'bg') return scheme.bg[role.slot % scheme.bg.length];
  if (role.role === 'obj') return scheme.obj[role.slot % scheme.obj.length];
  return hex;
}

function paintList(paints, scheme) {
  let changed = 0;
  const out = paints.map((p) => {
    if (!p || p.type !== 'SOLID' || p.visible === false) return p;
    const hex = hexOf(p.color);
    const next = mapColor(hex, scheme);
    if (next === hex) return p;
    const rgb = rgbOf(next);
    if (!rgb) return p;
    changed++;
    return Object.assign({}, p, { color: { r: rgb.r, g: rgb.g, b: rgb.b } });
  });
  return { out, changed };
}

function recolorTree(node, scheme) {
  let changed = 0;
  const walk = (n) => {
    if ('fills' in n && Array.isArray(n.fills) && n.fills.length) {
      const r = paintList(n.fills, scheme);
      if (r.changed) {
        n.fills = r.out;
        changed += r.changed;
      }
    }
    if ('strokes' in n && Array.isArray(n.strokes) && n.strokes.length) {
      const r = paintList(n.strokes, scheme);
      if (r.changed) {
        n.strokes = r.out;
        changed += r.changed;
      }
    }
    if ('children' in n) for (const c of n.children) walk(c);
  };
  walk(node);
  return changed;
}

/* ------------------------------------------------------------------ */
/* индекс библиотеки                                                   */
/* ------------------------------------------------------------------ */

const state = {
  lib: null,
  compsPage: null,
  comps: [],
  byName: new Map(), // name -> { L: {main, mono}, S: {main, mono} }
  byId: new Map(),
  scheme: PALETTES[0],
  sizeKey: 'L',
  bgObjects: false,
};

const isObjColor = (hex) => ROLES[hex] && ROLES[hex].role === 'obj';

function collectColors(node, acc) {
  const walk = (n) => {
    for (const key of ['fills', 'strokes']) {
      if (key in n && Array.isArray(n[key])) {
        for (const p of n[key]) if (p && p.type === 'SOLID') acc.add(hexOf(p.color));
      }
    }
    if ('children' in n) for (const c of n.children) walk(c);
  };
  walk(node);
  return acc;
}

function isMono(node) {
  const colors = collectColors(node, new Set());
  for (const c of colors) if (isObjColor(c)) return false;
  return true;
}

function isObjectNode(n) {
  if (!n || !('children' in n)) return false;
  if (n.type === 'SECTION' || n.type === 'TEXT') return false;
  if (/^Фон/i.test(n.name)) return false;
  if (/^SVG-drop/i.test(n.name)) return false;
  if (n.width < 40 || n.height < 40) return false;
  return true;
}

async function buildIndex() {
  await figma.loadAllPagesAsync();
  const pages = figma.root.children;
  const lib = pages.find((p) => p.name === 'Библиотека компонентов') || pages.find((p) => p.id === '0:1');
  const compsPage = pages.find((p) => p.name === 'Примеры композиций') || pages.find((p) => p.id === '21:2');
  if (!lib) throw new Error('Не найдена страница «Библиотека компонентов»');
  if (!compsPage) throw new Error('Не найдена страница «Примеры композиций»');
  state.lib = lib;
  state.compsPage = compsPage;

  state.byName.clear();
  const sections = lib.children.filter((n) => n.type === 'SECTION' && /Размер/i.test(n.name));
  for (const sec of sections) {
    const sizeKey = /Размер\s*S/i.test(sec.name) ? 'S' : 'L';
    // объекты лежат прямо в секции; если внутри есть вложенные контейнеры —
    // заглядываем и в них, чтобы не потерять часть библиотеки
    const candidates = [];
    for (const node of sec.children) {
      candidates.push(node);
      if (node.type === 'SECTION' || (node.type === 'FRAME' && !/Фон/i.test(node.name) && 'children' in node)) {
        for (const inner of node.children) candidates.push(inner);
      }
    }
    for (const node of candidates) {
      if (!isObjectNode(node)) continue;
      const rec = state.byName.get(node.name) || { L: {}, S: {} };
      rec[sizeKey][isMono(node) ? 'mono' : 'main'] = node;
      state.byName.set(node.name, rec);
    }
  }

  state.comps = [];
  const walk = (n) => {
    if (n.type === 'FRAME' && n.width > 200 && n.height > 200) {
      const objects = n.children.filter(isObjectNode).map((c) => c.name);
      state.comps.push({
        id: n.id,
        name: n.name,
        width: round(n.width),
        height: round(n.height),
        format: Math.round(n.width) + 'x' + Math.round(n.height),
        objects,
      });
      return;
    }
    if ('children' in n) for (const c of n.children) walk(c);
  };
  for (const child of compsPage.children) walk(child);

  return {
    objects: [...state.byName.keys()].filter((n) => !/^Group 2136/.test(n)),
    comps: state.comps,
  };
}

/* ------------------------------------------------------------------ */
/* операции с узлами                                                   */
/* ------------------------------------------------------------------ */

function replaceWith(node, libNode) {
  const parent = node.parent;
  const idx = parent.children.indexOf(node);
  const clone = libNode.clone();
  parent.insertChild(idx, clone);
  const rot = 'rotation' in node ? node.rotation : 0;
  clone.x = node.x;
  clone.y = node.y;
  if (clone.width && node.width) {
    const s = node.width / clone.width;
    if (Math.abs(s - 1) > 0.001) clone.rescale(s);
  }
  if (rot) clone.rotation = rot;
  node.remove();
  return clone;
}

function swapState(container, toMono) {
  let swapped = 0;
  const missing = [];
  for (const child of container.children.slice()) {
    if (!isObjectNode(child)) continue;
    if (isMono(child) === toMono) continue; // уже в нужном состоянии
    const rec = state.byName.get(child.name);
    const target = rec && (rec[state.sizeKey] || rec.L || {})[toMono ? 'mono' : 'main'];
    if (!target) {
      missing.push(child.name);
      continue;
    }
    replaceWith(child, target);
    swapped++;
  }
  return { swapped, missing };
}

function swapSize(container, sizeKey) {
  let swapped = 0;
  const missing = [];
  for (const child of container.children.slice()) {
    if (!isObjectNode(child)) continue;
    const rec = state.byName.get(child.name);
    const target = rec && rec[sizeKey] && rec[sizeKey].main;
    if (!target) {
      missing.push(child.name);
      continue;
    }
    // размер уже совпадает — геометрию образца не трогаем
    if (Math.abs(child.width - target.width) < target.width * 0.02) continue;
    replaceWith(child, target);
    swapped++;
  }
  return { swapped, missing };
}

async function getCompNode(id) {
  return figma.getNodeByIdAsync(id);
}

async function insertComposition(compId, opts) {
  const node = await getCompNode(compId);
  if (!node) throw new Error('Композиция не найдена: ' + compId);
  const clone = node.clone();
  figma.currentPage.appendChild(clone);
  clone.name = 'Illustration · ' + (opts.label || compId);
  const c = figma.viewport.center;
  clone.x = Math.round(c.x - clone.width / 2);
  clone.y = Math.round(c.y - clone.height / 2);

  let recolored = 0;
  if (opts.scheme) {
    state.scheme = opts.scheme;
    recolored = recolorTree(clone, opts.scheme);
  }
  let sizeReport = { swapped: 0, missing: [] };
  if (opts.sizeKey) {
    state.sizeKey = opts.sizeKey;
    sizeReport = swapSize(clone, opts.sizeKey);
    if (sizeReport.swapped) recolored += recolorTree(clone, state.scheme);
  }
  let stateReport = { swapped: 0, missing: [] };
  if (opts.bgObjects) {
    state.bgObjects = true;
    stateReport = swapState(clone, true);
    recolored += recolorTree(clone, state.scheme);
  }

  figma.currentPage.selection = [clone];
  figma.viewport.scrollAndZoomIntoView([clone]);
  return {
    id: clone.id,
    name: clone.name,
    width: round(clone.width),
    height: round(clone.height),
    recolored,
    sizeSwapped: sizeReport.swapped,
    stateSwapped: stateReport.swapped,
    missing: [...new Set([...sizeReport.missing, ...stateReport.missing])],
  };
}

function analyze(text) {
  const q = String(text || '').toLowerCase().replace(/ё/g, 'е');
  const tokens = q.split(/[^a-zа-я0-9]+/).filter((t) => t.length > 1);
  const scores = {};
  for (const [name, words] of Object.entries(LEXICON)) {
    let score = 0;
    if (q.includes(name.toLowerCase())) score += 6;
    for (const t of tokens) {
      for (const w of words) {
        if (t === w) score += 3;
        else if (w.length >= 4 && (t.startsWith(w) || (t.length >= 4 && w.startsWith(t)))) score += 2;
        else if (w.length >= 3 && t.includes(w)) score += 1;
      }
    }
    if (score > 0) scores[name] = score;
  }
  return Object.entries(scores).sort((a, b) => b[1] - a[1]);
}

function pickComp(ranked, format) {
  const pool = state.comps.filter((c) => !format || c.format === format);
  if (!pool.length) return null;
  const scoreOf = (name) => (ranked.find((r) => r[0] === name) || [null, 0])[1];
  let best = null;
  for (const c of pool) {
    let score = 0;
    for (const name of c.objects) {
      const s = scoreOf(name);
      if (s > 0) score += 12 + s;
    }
    if (ranked[0] && c.objects.includes(ranked[0][0])) score += 8;
    if (!best || score > best.score) best = { comp: c, score };
  }
  return best ? best.comp : pool[0];
}

/* ------------------------------------------------------------------ */
/* сообщения из UI                                                     */
/* ------------------------------------------------------------------ */

figma.ui.onmessage = async (msg) => {
  try {
    if (msg.type === 'ready') {
      const idx = await buildIndex();
      post('init', {
        version: VERSION,
        palettes: PALETTES,
        objects: idx.objects,
        comps: idx.comps,
        file: figma.root.name,
      });
      return;
    }

    if (msg.type === 'insert') {
      const scheme = PALETTES.find((p) => p.id === msg.schemeId) || msg.customPalette || PALETTES[0];
      const res = await insertComposition(msg.compId, {
        scheme,
        sizeKey: msg.sizeKey,
        bgObjects: msg.bgObjects,
        label: msg.label,
      });
      post('done', { action: 'insert', result: res });
      return;
    }

    if (msg.type === 'compose') {
      const ranked = analyze(msg.text);
      const comp = pickComp(ranked, msg.format);
      if (!comp) {
        post('error', { message: 'Нет образцов подходящего формата' });
        return;
      }
      const scheme = PALETTES.find((p) => p.id === msg.schemeId) || PALETTES[0];
      const res = await insertComposition(comp.id, {
        scheme,
        sizeKey: msg.sizeKey,
        bgObjects: msg.bgObjects,
        label: comp.id,
      });
      post('done', {
        action: 'compose',
        result: res,
        comp,
        ranked: ranked.slice(0, 4).map((r) => r[0]),
        matched: ranked.filter((r) => comp.objects.includes(r[0])).map((r) => r[0]),
        missing: ranked.filter((r) => !comp.objects.includes(r[0])).map((r) => r[0]),
      });
      return;
    }

    if (msg.type === 'recolor') {
      const scheme = PALETTES.find((p) => p.id === msg.schemeId) || msg.customPalette || PALETTES[0];
      const sel = figma.currentPage.selection;
      if (!sel.length) {
        post('error', { message: 'Выделите фрейм или группу' });
        return;
      }
      let changed = 0;
      for (const n of sel) changed += recolorTree(n, scheme);
      post('done', { action: 'recolor', result: { recolored: changed, nodes: sel.length } });
      return;
    }

    if (msg.type === 'insertObject') {
      const rec = state.byName.get(msg.name);
      const node = rec && (rec[msg.sizeKey] || rec.L || {})[msg.state === 'background' ? 'mono' : 'main'];
      if (!node) {
        post('error', { message: 'Объект не найден в библиотеке: ' + msg.name });
        return;
      }
      const clone = node.clone();
      figma.currentPage.appendChild(clone);
      const c = figma.viewport.center;
      clone.x = Math.round(c.x - clone.width / 2);
      clone.y = Math.round(c.y - clone.height / 2);
      const changed = recolorTree(clone, state.scheme);
      figma.currentPage.selection = [clone];
      figma.viewport.scrollAndZoomIntoView([clone]);
      post('done', { action: 'insertObject', result: { name: clone.name, recolored: changed } });
      return;
    }

    if (msg.type === 'swapState') {
      const sel = figma.currentPage.selection;
      if (!sel.length) {
        post('error', { message: 'Выделите композицию' });
        return;
      }
      let swapped = 0;
      const missing = [];
      for (const n of sel) {
        const r = swapState(n, !!msg.mono);
        swapped += r.swapped;
        missing.push(...r.missing);
      }
      let recolored = 0;
      for (const n of figma.currentPage.selection) recolored += recolorTree(n, state.scheme);
      post('done', { action: 'swapState', result: { swapped, missing: [...new Set(missing)], recolored } });
      return;
    }

    if (msg.type === 'rescan') {
      const idx = await buildIndex();
      post('init', { version: VERSION, palettes: PALETTES, objects: idx.objects, comps: idx.comps, file: figma.root.name });
      return;
    }
  } catch (err) {
    post('error', { message: String((err && err.message) || err) });
  }
};
