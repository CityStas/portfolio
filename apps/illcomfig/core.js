/* core.js — data model, palette recoloring, semantic matching, SVG export.
   No dependencies, runs in the browser. */

const NS = "http://www.w3.org/2000/svg";

export const state = {
  size: "L",
  format: "1000x1000",
  scheme: "lilac",
  palette: null, // {bg:[3], obj:[3]} — active scheme, may be user-loaded
  withBackgroundObjects: false,
  bg: { type: "color", color: "#D7CDF5", frame: null },
  elements: [],
  selection: null,
  canvas: { w: 1000, h: 1000 },
  scale: 1,
};

export const DATA = { library: null, templates: null, palettes: null, roles: null };

let uidSeq = 0;
const nextUid = () => "el" + ++uidSeq;

/* ------------------------------------------------------------------ */
/* loading                                                             */
/* ------------------------------------------------------------------ */

export async function loadData(base = "data/") {
  const [library, templates, palettes] = await Promise.all([
    fetch(base + "library.json").then((r) => r.json()),
    fetch(base + "templates.json").then((r) => r.json()),
    fetch(base + "palettes.json").then((r) => r.json()),
  ]);
  DATA.library = library;
  // стартовая композиция всегда первая в списке образцов
  const preferred = "24:3592";
  DATA.templates = templates.templates
    .slice()
    .sort((a, b) => (a.id === preferred ? -1 : b.id === preferred ? 1 : 0));
  DATA.palettes = palettes.palettes;
  DATA.roles = palettes.roles;
  state.palette = cloneScheme(DATA.palettes[0]);
  return DATA;
}

export function cloneScheme(p) {
  return { id: p.id, name: p.name, bg: p.bg.slice(), obj: p.obj.slice(), ink: p.ink, paper: p.paper };
}

export function getScheme() {
  return state.palette || DATA.palettes[0];
}

/* ------------------------------------------------------------------ */
/* palette recoloring                                                  */
/* ------------------------------------------------------------------ */

const HEX_RE = /#[0-9A-Fa-f]{6}\b/g;

/**
 * Recolor an SVG fragment inside the rules of the active scheme.
 * Only colors that belong to a known scheme slot are replaced:
 *   background slots -> background slots, object slots -> object slots.
 * Neutral ink/paper colors are preserved.
 */
export function recolor(inner) {
  const scheme = getScheme();
  const roles = DATA.roles || {};
  return inner
    .replace(/fill="white"/g, 'fill="#FFFFFF"')
    .replace(/stroke="white"/g, 'stroke="#FFFFFF"')
    .replace(/fill="black"/g, 'fill="#181817"')
    .replace(/stroke="black"/g, 'stroke="#181817"')
    .replace(HEX_RE, (hex) => {
      const role = roles[hex.toUpperCase()];
      if (!role) return hex;
      if (role.role === "bg") return scheme.bg[role.slot % scheme.bg.length] || hex;
      if (role.role === "obj") return scheme.obj[role.slot % scheme.obj.length] || hex;
      return hex;
    });
}

export function recolorTo(inner, scheme) {
  const roles = DATA.roles || {};
  return inner.replace(HEX_RE, (hex) => {
    const role = roles[hex.toUpperCase()];
    if (!role) return hex;
    if (role.role === "bg") return scheme.bg[role.slot % scheme.bg.length] || hex;
    if (role.role === "obj") return scheme.obj[role.slot % scheme.obj.length] || hex;
    return hex;
  });
}

/** Map a single color through the active scheme (used for canvas background). */
export function mapColor(hex, scheme = getScheme()) {
  const role = (DATA.roles || {})[String(hex).toUpperCase()];
  if (!role) return hex;
  if (role.role === "bg") return scheme.bg[role.slot % scheme.bg.length] || hex;
  if (role.role === "obj") return scheme.obj[role.slot % scheme.obj.length] || hex;
  return hex;
}

/* ------------------------------------------------------------------ */
/* id namespacing (several library items can share ids)                */
/* ------------------------------------------------------------------ */

export function namespaceIds(inner, uid) {
  const ids = new Set();
  inner.replace(/\sid="([^"]+)"/g, (_, id) => {
    ids.add(id);
    return "";
  });
  if (!ids.size) return inner;
  let out = inner;
  for (const id of ids) {
    const safe = id.replace(/[^\w:-]/g, "_");
    const prefixed = `${uid}_${safe}`;
    out = out
      .split(`id="${id}"`)
      .join(`id="${prefixed}"`)
      .split(`url(#${id})`)
      .join(`url(#${prefixed})`)
      .split(`href="#${id}"`)
      .join(`href="#${prefixed}"`);
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* geometry helpers                                                    */
/* ------------------------------------------------------------------ */

export function measure(inner, W, H) {
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  svg.setAttribute(
    "style",
    "position:absolute;left:-99999px;top:0;width:1px;height:1px;overflow:visible;opacity:0"
  );
  const g = document.createElementNS(NS, "g");
  g.innerHTML = inner;
  svg.appendChild(g);
  document.body.appendChild(svg);
  let box;
  try {
    box = g.getBBox();
  } catch {
    box = { x: 0, y: 0, width: W, height: H };
  }
  svg.remove();
  return { x: box.x, y: box.y, w: box.width, h: box.height };
}

/** Wrap library inner content so that it lands exactly on the target box. */
export function placeInto(inner, itemW, itemH, box) {
  if (!box.w || !box.h) return inner;
  const s = Math.min(box.w / itemW, box.h / itemH) || 1;
  return `<g transform="translate(${box.x} ${box.y}) scale(${s.toFixed(5)})">${inner}</g>`;
}

/* ------------------------------------------------------------------ */
/* library access                                                      */
/* ------------------------------------------------------------------ */

export function getObject(slug) {
  return DATA.library.objects.find((o) => o.slug === slug) || null;
}

export function getVariant(slug, size, stateName) {
  const obj = getObject(slug);
  if (!obj) return null;
  const v = obj.variants[size];
  if (!v) return null;
  return v[stateName] || v.main;
}

export function hasVariant(slug, size, stateName) {
  const obj = getObject(slug);
  return !!(obj && obj.variants[size] && obj.variants[size][stateName]);
}

export function backgroundsFor(size) {
  return DATA.library.backgrounds.filter((b) => b.size === size);
}

/* ------------------------------------------------------------------ */
/* elements                                                            */
/* ------------------------------------------------------------------ */

function makeElement(props) {
  const el = {
    uid: nextUid(),
    kind: "object",
    slug: null,
    label: "Object",
    inner: "",
    bx: 0,
    by: 0,
    bw: 100,
    bh: 100,
    dx: 0,
    dy: 0,
    rot: 0,
    visible: true,
    state: "main",
    ...props,
  };
  el.cx = el.bx + el.bw / 2;
  el.cy = el.by + el.bh / 2;
  return el;
}

export function createObjectElement(slug, { x, y, stateName = "main", size = state.size } = {}) {
  const variant = getVariant(slug, size, stateName);
  if (!variant) return null;
  const el = makeElement({
    kind: "object",
    slug,
    label: getObject(slug).label,
    inner: variant.inner,
    bx: 0,
    by: 0,
    bw: variant.w,
    bh: variant.h,
    state: stateName,
    sizeKey: size,
    origin: variant.inner,
    originSize: size,
  });
  el.dx = x != null ? x : (state.canvas.w - variant.w) / 2;
  el.dy = y != null ? y : (state.canvas.h - variant.h) / 2;
  return el;
}

export function createBackgroundFrameElement(id, size = state.size) {
  const bg = backgroundsFor(size).find((b) => b.id === id);
  if (!bg) return null;
  return makeElement({
    kind: "decor",
    slug: "frame",
    label: bg.label,
    inner: bg.inner,
    bx: 0,
    by: 0,
    bw: bg.w,
    bh: bg.h,
    sizeKey: size,
    locked: false,
  });
}

export function setElementState(el, stateName) {
  if (el.kind !== "object" || !el.slug) return false;
  const variant = getVariant(el.slug, el.sizeKey || state.size, stateName);
  if (!variant) return false;
  const box = { x: el.bx, y: el.by, w: el.bw, h: el.bh };
  const canRestore = el.origin && stateName === "main" && el.sizeKey === el.originSize;
  el.inner = canRestore ? el.origin : placeInto(variant.inner, variant.w, variant.h, box);
  el.state = stateName;
  return true;
}

export function setElementSize(el, sizeKey) {
  if (el.kind !== "object" || !el.slug) return false;
  const variant = getVariant(el.slug, sizeKey, el.state);
  if (!variant) return false;
  const box = { x: el.bx, y: el.by, w: el.bw, h: el.bh };
  const canRestore = el.origin && el.state === "main" && sizeKey === el.originSize;
  el.inner = canRestore ? el.origin : placeInto(variant.inner, variant.w, variant.h, box);
  el.sizeKey = sizeKey;
  return true;
}

export function replaceElementObject(el, slug) {
  if (el.kind !== "object") return false;
  const variant = getVariant(slug, el.sizeKey || state.size, el.state) || getVariant(slug, el.sizeKey || state.size, "main");
  if (!variant) return false;
  const box = { x: el.bx, y: el.by, w: el.bw, h: el.bh };
  el.slug = slug;
  el.label = getObject(slug).label;
  el.inner = placeInto(variant.inner, variant.w, variant.h, box);
  return true;
}

/* ------------------------------------------------------------------ */
/* templates                                                           */
/* ------------------------------------------------------------------ */

export function templatesFor(format, sizeKey) {
  return DATA.templates.filter((t) => (format ? t.format === format : true) && t.format);
}

export function sizeKeyOfFormat(format) {
  const [w, h] = format.split("x").map(Number);
  return w * h > 700000 ? "L" : "S";
}

/**
 * Load a ready-made composition exactly as it is in Figma: the sample keeps its
 * own layout, scale and layer order. Objects are never substituted into foreign
 * slots (that breaks the composition); only the state (main/background),
 * palette and size variants of the same object may change.
 */
export function applyTemplate(template, { slots = {} } = {}) {
  state.canvas = { w: template.width, h: template.height };
  state.format = template.format;
  state.elements = [];
  state.selection = null;
  state.bg = { type: "color", color: mapColor(template.background), frame: null };

  const sizeKey = state.size;

  template.parts.forEach((part) => {
    if (part.kind === "bg") return;

    if (part.kind === "object" && part.slug) {
      const box = measure(part.inner, template.width, template.height);
      const slug = slots[part.slug] || part.slug;
      const variant = getVariant(slug, sizeKey, "main");
      // Образцы собраны из набора L. Пока размер совпадает — берём геометрию
      // прямо из образца (1:1 с Figma). При смене размера подставляем вариант
      // нужной детализации, вписывая его в тот же бокс.
      const lVariant = getVariant(part.slug, "L", "main");
      const nativeSize = lVariant && Math.abs(box.w - lVariant.w) < 2 ? "L" : "S";
      const keepOriginal = sizeKey === nativeSize;
      state.elements.push(
        makeElement({
          kind: "object",
          slug,
          label: getObject(slug).label,
          inner: keepOriginal ? part.inner : placeInto(variant.inner, variant.w, variant.h, box),
          bx: box.x,
          by: box.y,
          bw: box.w,
          bh: box.h,
          sizeKey,
          state: "main",
          templateName: part.name,
          origin: part.inner,
          originSize: nativeSize,
        })
      );
      return;
    }

    const box = measure(part.inner, template.width, template.height);
    state.elements.push(
      makeElement({
        kind: "decor",
        slug: null,
        label: part.name || "Декор",
        inner: part.inner,
        bx: box.x,
        by: box.y,
        bw: box.w,
        bh: box.h,
      })
    );
  });

  if (state.withBackgroundObjects) setBackgroundObjects(true);
  return state.elements;
}

export function setBackgroundObjects(on) {
  state.withBackgroundObjects = on;
  for (const el of state.elements) {
    if (el.kind !== "object" || !el.slug) continue;
    if (on) {
      if (hasVariant(el.slug, el.sizeKey || state.size, "background")) setElementState(el, "background");
    } else if (el.state === "background") {
      setElementState(el, "main");
    }
  }
}

/* ------------------------------------------------------------------ */
/* semantic engine                                                     */
/* ------------------------------------------------------------------ */

export const LEXICON = {
  book: ["книга", "книг", "знани", "обучен", "учеб", "образован", "чтен", "истор", "библиотек", "справочник", "методолог", "гайд", "book", "knowledge", "learn", "study", "read", "education", "story", "guide", "manual", "research"],
  phone: ["телефон", "связ", "коммуникац", "звон", "поддержк", "клиент", "сервис", "приложен", "мобильн", "смс", "мессенджер", "phone", "call", "support", "communication", "app", "mobile", "contact", "chat"],
  puzzle: ["пазл", "решен", "задач", "интеграц", "сложн", "собрат", "стратег", "логик", "процесс", "puzzle", "solution", "integration", "problem", "complexity", "strategy", "logic"],
  lamp: ["иде", "свет", "вдохновен", "мысл", "ламп", "креатив", "инсайт", "озарен", "инновац", "idea", "light", "inspiration", "brainstorm", "creative", "insight", "innovation"],
  wallet: ["кошел", "финанс", "деньг", "бюджет", "платеж", "покупк", "оплат", "транзакц", "wallet", "finance", "money", "budget", "payment", "purchase", "cash", "checkout"],
  coin: ["монет", "деньг", "инвестиц", "доход", "прибыл", "рост", "цен", "накоплен", "экономик", "выгод", "coin", "money", "invest", "income", "profit", "growth", "price", "savings", "revenue", "value"],
  pen: ["ручк", "письм", "текст", "контент", "редактор", "дизайн", "творч", "документ", "стать", "копирайт", "pen", "write", "text", "content", "edit", "design", "draft", "copy"],
  folder: ["папк", "документ", "архив", "проект", "организац", "структур", "файл", "каталог", "порядок", "folder", "document", "archive", "project", "organize", "files", "structure", "storage"],
  headphones: ["наушник", "музык", "звук", "отдых", "поддержк", "помощ", "фокус", "концентрац", "headphones", "music", "sound", "audio", "relax", "support", "help", "listen", "focus"],
  abstract: ["абстракц", "концепц", "фон", "паттерн", "стиль", "abstract", "concept", "background", "pattern"],
  spark: ["искр", "акцент", "детал", "звезд", "spark", "accent", "detail", "star"],
};

export const META = {
  book: { title: "Знания и обучение", tags: ["образование", "контент"] },
  phone: { title: "Связь и поддержка", tags: ["сервис", "коммуникация"] },
  puzzle: { title: "Решения и интеграции", tags: ["продукт", "процесс"] },
  lamp: { title: "Идеи и инсайты", tags: ["креатив", "инновации"] },
  wallet: { title: "Финансы и платежи", tags: ["финансы", "b2c"] },
  coin: { title: "Доход и рост", tags: ["финансы", "рост"] },
  pen: { title: "Контент и текст", tags: ["редакция", "дизайн"] },
  folder: { title: "Документы и порядок", tags: ["структура", "b2b"] },
  headphones: { title: "Фокус и поддержка", tags: ["сервис", "музыка"] },
  abstract: { title: "Абстрактная форма", tags: ["фон", "декор"] },
  spark: { title: "Акцентная искра", tags: ["декор"] },
};

function normalize(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[^\p{L}\p{N}\s,+-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function analyze(text) {
  const q = normalize(text);
  if (!q) return [];
  const tokens = q.split(/[\s,]+/).filter((t) => t.length > 1);
  const scores = {};
  for (const [slug, words] of Object.entries(LEXICON)) {
    let score = 0;
    const label = (getObject(slug)?.label || "").toLowerCase();
    if (label && q.includes(label)) score += 6;
    for (const token of tokens) {
      for (const w of words) {
        if (token === w) score += 3;
        else if (w.length >= 4 && (token.startsWith(w) || (token.length >= 4 && w.startsWith(token)))) score += 2;
        else if (w.length >= 3 && token.includes(w)) score += 1;
      }
    }
    if (score > 0) scores[slug] = score;
  }
  return Object.entries(scores)
    .map(([slug, score]) => ({ slug, score }))
    .sort((a, b) => b.score - a.score);
}

/** Pick the ready-made composition that fits the query best. */
export function pickTemplate(ranked, format) {
  const pool = DATA.templates.filter((t) => (format ? t.format === format : true));
  if (!pool.length) return null;
  const scoreOf = (slug) => (ranked.find((r) => r.slug === slug) || { score: 0 }).score;

  let best = null;
  for (const t of pool) {
    let score = 0;
    let matched = 0;
    for (const slot of t.slots) {
      const s = scoreOf(slot.slug);
      if (s > 0) {
        matched++;
        score += 12 + s;
      }
    }
    // a composition that already contains the strongest object wins
    if (ranked[0] && t.slots.some((s) => s.slug === ranked[0].slug)) score += 8;
    // prefer the sample that covers more of the requested semantics
    score += matched * 2;
    const entry = { template: t, score, matched };
    if (!best || entry.score > best.score || (entry.score === best.score && t.parts.length < best.template.parts.length)) best = entry;
  }
  return best ? best.template : pool[0];
}

/** What of the query the chosen sample actually contains. */
export function matchReport(template, ranked) {
  const slots = template.slots.map((s) => s.slug);
  const matched = ranked.filter((r) => slots.includes(r.slug)).map((r) => r.slug);
  const missing = ranked.filter((r) => !slots.includes(r.slug)).map((r) => r.slug);
  return { matched, missing };
}

/** Scenario 1: metaphor / headline -> the closest ready-made composition, as is. */
export function composeFromMetaphor(text, format) {
  const ranked = analyze(text);
  const template = pickTemplate(ranked, format);
  if (!template) return { template: null, ranked, matched: [], missing: [] };
  applyTemplate(template);
  return { template, ranked, ...matchReport(template, ranked) };
}

/** Scenario 2: explicit component names -> free placement on the canvas. */
export function composeFromNames(text, { size = state.size } = {}) {
  const ranked = analyze(text);
  const added = [];
  const W = state.canvas.w;
  const H = state.canvas.h;

  // objects already on the canvas — new ones should not land on top of them
  const taken = state.elements
    .filter((e) => e.kind === 'object')
    .map((e) => ({ x: e.bx + e.dx, y: e.by + e.dy, w: e.bw, h: e.bh }));

  for (const r of ranked) {
    const variant = getVariant(r.slug, size, 'main');
    if (!variant) continue;

    // keep proportions: scale so the object takes at most ~40% of the canvas
    const s = Math.min((W * 0.42) / variant.w, (H * 0.42) / variant.h, 1);
    const w = variant.w * s;
    const h = variant.h * s;

    const spot = findFreeSpot(w, h, taken, W, H);
    const el = createObjectElement(r.slug, { x: 0, y: 0, stateName: 'main', size });
    if (!el) continue;
    el.inner = `<g transform="scale(${s.toFixed(4)})">${el.inner}</g>`;
    el.bx = 0;
    el.by = 0;
    el.bw = w;
    el.bh = h;
    el.cx = w / 2;
    el.cy = h / 2;
    el.dx = spot.x;
    el.dy = spot.y;
    el.scaled = true;
    taken.push({ x: spot.x, y: spot.y, w, h });
    state.elements.push(el);
    added.push(r.slug);
  }
  return added;
}

/** Greedy free-spot search: minimal overlap, then closest to the canvas centre. */
function findFreeSpot(w, h, taken, W, H) {
  const steps = 6;
  let best = null;
  for (let gy = 0; gy <= steps; gy++) {
    for (let gx = 0; gx <= steps; gx++) {
      const x = (W - w) * (gx / steps);
      const y = (H - h) * (gy / steps);
      let overlap = 0;
      for (const t of taken) {
        const ox = Math.max(0, Math.min(x + w, t.x + t.w) - Math.max(x, t.x));
        const oy = Math.max(0, Math.min(y + h, t.y + t.h) - Math.max(y, t.y));
        overlap += ox * oy;
      }
      const dist = Math.hypot(x + w / 2 - W / 2, y + h / 2 - H / 2);
      const score = overlap * 4 + dist;
      if (!best || score < best.score) best = { x, y, score };
    }
  }
  return best;
}

/* ------------------------------------------------------------------ */
/* export                                                              */
/* ------------------------------------------------------------------ */

export function buildSVG({ scale = 1 } = {}) {
  const { w, h } = state.canvas;
  const scheme = getScheme();
  const parts = [];
  parts.push(`<svg xmlns="${NS}" width="${Math.round(w * scale)}" height="${Math.round(h * scale)}" viewBox="0 0 ${w} ${h}" fill="none">`);
  parts.push(`<title>Illustration composition · ${scheme.name}</title>`);
  parts.push(`<rect width="${w}" height="${h}" fill="${state.bg.type === "frame" ? state.bg.color : state.bg.color}"/>`);
  if (state.bg.type === "frame" && state.bg.frame) {
    parts.push(`<g id="bg-frame">${recolor(namespaceIds(state.bg.frame, "bgframe"))}</g>`);
  }
  for (const el of state.elements) {
    if (!el.visible) continue;
    const inner = recolor(namespaceIds(el.inner, el.uid));
    const t = transformFor(el);
    parts.push(`<g id="${el.uid}" data-kind="${el.kind}"${el.slug ? ` data-object="${el.slug}" data-state="${el.state}"` : ""}${t ? ` transform="${t}"` : ""}>${inner}</g>`);
  }
  parts.push("</svg>");
  return parts.join("\n");
}

export function transformFor(el) {
  const bits = [];
  if (el.dx || el.dy) bits.push(`translate(${+el.dx.toFixed(3)} ${+el.dy.toFixed(3)})`);
  if (el.rot) bits.push(`rotate(${+el.rot.toFixed(3)} ${+el.cx.toFixed(3)} ${+el.cy.toFixed(3)})`);
  return bits.join(" ");
}

export function downloadSVG(filename = "composition.svg") {
  const svg = buildSVG();
  const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

/* ------------------------------------------------------------------ */
/* palette file upload                                                 */
/* ------------------------------------------------------------------ */

/**
 * Accepts {bg:[3 hex], obj:[3 hex]} | {name, bg, obj} | [[hex...],[hex...]]
 * and extends the active palette without touching the built-in ones.
 */
export function parsePaletteFile(text) {
  const raw = JSON.parse(text);
  let bg, obj, name;
  if (Array.isArray(raw)) {
    bg = raw[0];
    obj = raw[1];
  } else if (Array.isArray(raw.palette)) {
    bg = raw.palette[0];
    obj = raw.palette[1];
    name = raw.name;
  } else {
    bg = raw.bg || raw.backgrounds || raw.background;
    obj = raw.obj || raw.objects || raw.object;
    name = raw.name;
  }
  const norm = (list) => {
    if (!list || !list.length) throw new Error("В палитре нет цветов");
    return list.map((c) => {
      const hex = String(c).trim().toUpperCase();
      if (!/^#[0-9A-F]{6}$/.test(hex)) throw new Error("Некорректный цвет: " + c);
      return hex;
    });
  };
  return { id: "custom-" + Date.now(), name: name || "Загруженная схема", bg: norm(bg), obj: norm(obj), ink: "#181817", paper: "#FFFFFF" };
}
