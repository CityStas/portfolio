// Illustration Composer — Figma plugin (main thread)
// Собирает композиции ТОЛЬКО из готовых образцов и элементов библиотеки файла.
// Ничего не рисует: клонирует узлы, перекрашивает по палитре, меняет состояние
// (главный/фоновый) и размер (L/S) на соответствующие варианты из библиотеки.

figma.showUI(__html__, { width: 380, height: 700, themeColors: true });

const VERSION = '1.1.0';

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
  'Кошелёк': ['кошел', 'финанс', 'деньг', 'бюджет', 'платеж', 'покупк', 'оплат', 'wallet', 'finance', 'money', 'budget', 'payment', 'purchase', 'cash'],
  'Монета': ['монет', 'деньг', 'инвестиц', 'доход', 'прибыл', 'рост', 'цен', 'накоплен', 'экономик', 'coin', 'invest', 'income', 'profit', 'growth', 'price', 'savings'],
  'Ручка': ['ручк', 'письм', 'текст', 'контент', 'редактор', 'дизайн', 'творч', 'документ', 'стать', 'pen', 'write', 'text', 'content', 'edit', 'design', 'draft'],
  'Папка': ['папк', 'документ', 'архив', 'проект', 'организац', 'структур', 'файл', 'каталог', 'folder', 'document', 'archive', 'project', 'organize', 'files', 'structure'],
  'Наушники': ['наушник', 'музык', 'звук', 'отдых', 'помощ', 'фокус', 'концентрац', 'headphones', 'music', 'sound', 'audio', 'relax', 'help', 'listen', 'focus'],
  'Абстракция': ['абстракц', 'концепц', 'паттерн', 'abstract', 'concept', 'pattern'],
};

/* Библиотека по id узлов: в файле часть объектов называется «Group 21361363xx»,
   поэтому имена ненадёжны — берём известные id (те же, что в веб-версии).
   L/S × главный/фоновый. */
const LIB = {
  'Книга': { L: { main: '21:29965', mono: '24:6273' }, S: { main: '24:3810', mono: '24:6934' } },
  'Телефон': { L: { main: '21:25472', mono: '24:6327' }, S: { main: '24:4746', mono: '24:6990' } },
  'Пазлы': { L: { main: '21:417', mono: '24:6214' }, S: { main: '24:4903', mono: '24:7147' } },
  'Лампа': { L: { main: '23:121', mono: '24:6569' }, S: { main: '24:5485', mono: '24:7429' } },
  'Кошелёк': { L: { main: '23:211', mono: '24:6660' }, S: { main: '24:4594', mono: '24:7568' } },
  'Монета': { L: { main: '24:2207', mono: '24:6795' }, S: { main: '24:5345', mono: '24:7205' } },
  'Ручка': { L: { main: '24:1734', mono: '24:6747' }, S: { main: '24:4287', mono: '24:7543' } },
  'Папка': { L: { main: '24:1899', mono: '24:6772' }, S: { main: '24:4430', mono: '24:7520' } },
  'Наушники': { L: { main: '23:122', mono: '24:6484' }, S: { main: '24:5089', mono: '24:7344' } },
  'Абстракция': { L: { main: '28:11628', mono: '30:11902' }, S: { main: '28:11629', mono: '28:11766' } },
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
  alias: new Map(), // имя слоя («Group 2136136335») -> подпись объекта («Книга»)
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

// запись библиотеки по имени слоя: сначала прямо по имени, потом по псевдониму
// («Group 2136136335» -> «Книга»), чтобы копии внутри композиций тоже находились
function recFor(name) {
  return state.byName.get(name) || state.byName.get(state.alias.get(name)) || null;
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
  const warnings = [];
  // страницы ищем мягко: сначала по имени, потом по id, потом берём первую/последнюю,
  // чтобы плагин работал и в копии файла с переименованными страницами
  const lib = pages.find((p) => /библиотек/i.test(p.name)) || pages.find((p) => p.id === '0:1') || pages[0];
  const compsPage =
    pages.find((p) => /пример/i.test(p.name)) || pages.find((p) => p.id === '21:2') || pages[pages.length - 1];
  state.lib = lib;
  state.compsPage = compsPage;

  state.byName.clear();
  state.alias.clear();
  // 1) по известным id узлов — не зависит от того, как названы слои
  for (const label of Object.keys(LIB)) {
    for (const sizeKey of ['L', 'S']) {
      for (const slot of ['main', 'mono']) {
        const id = LIB[label][sizeKey] && LIB[label][sizeKey][slot];
        if (!id) continue;
        let node = null;
        try {
          // при documentAccess: "dynamic-page" синхронный getNodeById недоступен
          node = figma.getNodeByIdAsync ? await figma.getNodeByIdAsync(id) : figma.getNodeById(id);
        } catch (e) {
          node = null;
        }
        if (!node || !('children' in node)) continue;
        const rec = state.byName.get(label) || { L: {}, S: {} };
        rec[sizeKey][slot] = node;
        state.byName.set(label, rec);
        state.alias.set(node.name, label);
      }
    }
  }
  let sections = lib.children.filter((n) => n.type === 'SECTION' && /размер/i.test(n.name));
  if (!sections.length) {
    try {
      sections = lib.findAll((n) => n.type === 'SECTION' && /размер/i.test(n.name));
    } catch (e) {
      sections = [];
    }
  }
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
      if (/^Group 2136/i.test(node.name) && !state.alias.has(node.name)) continue; // эти уже разобраны по id
      // если у слоя есть псевдоним — сливаем в запись объекта, а не создаём дубль
      const label = state.alias.get(node.name) || node.name;
      const rec = state.byName.get(label) || { L: {}, S: {} };
      const slot = isMono(node) ? 'mono' : 'main';
      if (!rec[sizeKey][slot]) rec[sizeKey][slot] = node;
      state.byName.set(label, rec);
    }
  }

  // запасной путь: если секции «Размер L/S» не нашлись (другая копия файла,
  // переименованные секции), собираем объекты по именам — сначала по странице
  // библиотеки, потом по всему файлу
  if (!state.byName.size) {
    const groups = new Map();
    const pages = [lib, ...figma.root.children.filter((p) => p !== lib)];
    for (const page of pages) {
      let found = [];
      try {
        found = page.findAll((n) => 'children' in n && isObjectNode(n));
      } catch (e) {
        found = [];
      }
      for (const node of found) {
        const slot = isMono(node) ? 'mono' : 'main';
        const key = node.name + '::' + slot;
        if (!groups.has(key)) groups.set(key, { name: node.name, slot, list: [] });
        groups.get(key).list.push(node);
      }
      if (groups.size) break;
    }
    for (const g of groups.values()) {
      g.list.sort((a, b) => b.width - a.width);
      const rec = state.byName.get(g.name) || { L: {}, S: {} };
      rec.L[g.slot] = g.list[0];
      rec.S[g.slot] = g.list[g.list.length - 1];
      state.byName.set(g.name, rec);
    }
    console.log('Библиотека собрана по именам: ' + state.byName.size + ' объектов');
  }

  state.comps = [];
  const walk = (n) => {
    if (n.type === 'FRAME' && n.width > 200 && n.height > 200) {
      const objects = n.children.filter(isObjectNode).map((c) => state.alias.get(c.name) || c.name);
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
  if (compsPage && compsPage !== lib) for (const child of compsPage.children) walk(child);
  if (!state.comps.length) warnings.push('Не найдены образцы композиций — доступна только вставка объектов');
  if (!state.byName.size) warnings.push('Не найдены объекты библиотеки — проверьте, что открыт файл с библиотекой');

  return {
    objects: [...state.byName.keys()].filter((n) => !/^Group 2136/.test(n)).sort((a, b) => a.localeCompare(b, 'ru')),
    comps: state.comps,
    warnings,
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
    const rec = recFor(child.name);
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
    const rec = recFor(child.name);
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
  // имена в библиотеке могут быть с «ё», а в лексиконе без — сравниваем нормализованно
  const norm = (s) => String(s || '').toLowerCase().replace(/ё/g, 'е');
  const scoreOf = (name) => {
    const r = ranked.find((x) => norm(x[0]) === norm(name));
    return r ? r[1] : 0;
  };
  let best = null;
  for (const c of pool) {
    let score = 0;
    for (const name of c.objects) {
      const s = scoreOf(name);
      if (s > 0) score += 12 + s;
    }
    if (ranked[0] && c.objects.some((o) => norm(o) === norm(ranked[0][0]))) score += 8;
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
        warnings: idx.warnings,
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
      const rec = recFor(msg.name);
      const slot = msg.state === 'background' ? 'mono' : 'main';
      // ищем нужный вариант, а если его нет — берём любой доступный
      const node =
        (rec && rec[msg.sizeKey] && rec[msg.sizeKey][slot]) ||
        (rec && rec[msg.sizeKey] && rec[msg.sizeKey].main) ||
        (rec && rec[msg.sizeKey] && rec[msg.sizeKey].mono) ||
        (rec && rec.L && rec.L[slot]) ||
        (rec && rec.L && rec.L.main) ||
        (rec && rec.S && rec.S[slot]) ||
        (rec && rec.S && rec.S.main);
      if (!node) {
        post('error', { message: 'Объект не найден в библиотеке: ' + msg.name });
        return;
      }
      const clone = node.clone();
      figma.currentPage.appendChild(clone);
      const c = figma.viewport.center;
      clone.x = Math.round(c.x - clone.width / 2);
      clone.y = Math.round(c.y - clone.height / 2);
      // красим в схему, выбранную в UI (а не в последнюю вставленную)
      const scheme = PALETTES.find((p) => p.id === msg.schemeId) || msg.customPalette || state.scheme || PALETTES[0];
      state.scheme = scheme;
      const changed = recolorTree(clone, scheme);
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
      post('init', {
        version: VERSION,
        palettes: PALETTES,
        objects: idx.objects,
        comps: idx.comps,
        warnings: idx.warnings,
        file: figma.root.name,
      });
      return;
    }
  } catch (err) {
    post('error', { message: String((err && err.message) || err) });
  }
};
