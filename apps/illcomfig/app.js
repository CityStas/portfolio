import * as C from "./core.js";

const { state, DATA } = C;

const $ = (sel) => document.querySelector(sel);
const canvas = $("#canvas");
const wrap = $("#canvas-wrap");
const toastEl = $("#toast");

const FORMATS = ["1000x1000", "1200x630", "800x1200"];

let overlay = null;
let drag = null;
let activeSchemeIndex = 0;
let customSchemes = [];

/* ------------------------------------------------------------------ */
/* helpers                                                             */
/* ------------------------------------------------------------------ */

let toastTimer = null;
function toast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove("show"), 2600);
}

const byUid = (uid) => state.elements.find((e) => e.uid === uid) || null;
const selected = () => (state.selection ? byUid(state.selection) : null);
const scheme = () => C.getScheme();

function objectSlugs() {
  return [...new Set(state.elements.filter((e) => e.kind === "object" && e.slug).map((e) => e.slug))];
}

/* ------------------------------------------------------------------ */
/* canvas                                                              */
/* ------------------------------------------------------------------ */

function renderCanvas() {
  const { w, h } = state.canvas;
  canvas.setAttribute("viewBox", `0 0 ${w} ${h}`);
  canvas.setAttribute("width", w);
  canvas.setAttribute("height", h);

  const parts = [];
  parts.push(`<rect id="canvas-bg" x="0" y="0" width="${w}" height="${h}" fill="${state.bg.color}"/>`);
  if (state.bg.type === "frame" && state.bg.frame) {
    parts.push(`<g id="bg-frame" pointer-events="none">${C.recolor(C.namespaceIds(state.bg.frame, "bgframe"))}</g>`);
  }
  for (const el of state.elements) {
    if (!el.visible) continue;
    const t = C.transformFor(el);
    parts.push(
      `<g data-uid="${el.uid}" data-kind="${el.kind}"${el.slug ? ` data-object="${el.slug}"` : ""}${t ? ` transform="${t}"` : ""}>${C.recolor(
        C.namespaceIds(el.inner, el.uid)
      )}</g>`
    );
  }
  canvas.innerHTML = parts.join("");
  overlay = document.createElementNS("http://www.w3.org/2000/svg", "g");
  overlay.setAttribute("id", "overlay");
  canvas.appendChild(overlay);
  requestAnimationFrame(fitCanvas);
  drawOverlay();
  updateStageInfo();
}

function screenScale() {
  const m = canvas.getScreenCTM();
  return m ? m.a : 1;
}

function fitCanvas() {
  const { w, h } = state.canvas;
  const availW = Math.max(120, wrap.clientWidth - 48);
  const availH = Math.max(120, wrap.clientHeight - 48);
  const s = Math.min(availW / w, availH / h);
  canvas.style.width = Math.round(w * s) + "px";
  canvas.style.height = Math.round(h * s) + "px";
}

window.addEventListener("resize", () => {
  fitCanvas();
  drawOverlay();
});

function rotatePoint(x, y, el) {
  const r = (el.rot * Math.PI) / 180;
  const dx = x - el.cx;
  const dy = y - el.cy;
  return {
    x: el.cx + dx * Math.cos(r) - dy * Math.sin(r) + el.dx,
    y: el.cy + dx * Math.sin(r) + dy * Math.cos(r) + el.dy,
  };
}

function drawOverlay() {
  if (!overlay) return;
  overlay.innerHTML = "";
  const el = selected();
  if (!el) return;
  const s = screenScale();
  const corners = [
    [el.bx, el.by],
    [el.bx + el.bw, el.by],
    [el.bx + el.bw, el.by + el.bh],
    [el.bx, el.by + el.bh],
  ].map(([x, y]) => rotatePoint(x, y, el));
  const poly = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
  poly.setAttribute("class", "sel-box");
  poly.setAttribute("points", corners.map((p) => `${p.x},${p.y}`).join(" "));
  poly.setAttribute("vector-effect", "non-scaling-stroke");
  overlay.appendChild(poly);

  const topMid = rotatePoint(el.bx + el.bw / 2, el.by, el);
  const center = { x: el.cx + el.dx, y: el.cy + el.dy };
  const len = Math.hypot(topMid.x - center.x, topMid.y - center.y) || 1;
  const handle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
  const hx = topMid.x + ((topMid.x - center.x) / len) * (22 / s);
  const hy = topMid.y + ((topMid.y - center.y) / len) * (22 / s);
  handle.setAttribute("cx", hx);
  handle.setAttribute("cy", hy);
  handle.setAttribute("r", 6 / s);
  handle.setAttribute("class", "rot-handle");
  handle.setAttribute("vector-effect", "non-scaling-stroke");
  overlay.appendChild(handle);
}

function updateStageInfo() {
  const { w, h } = state.canvas;
  const objs = state.elements.filter((e) => e.kind === "object").length;
  const decor = state.elements.length - objs;
  $("#canvas-info").textContent = `${w} × ${h} · объектов: ${objs} · декор: ${decor} · схема: ${scheme().name}`;
}

/* ------------------------------------------------------------------ */
/* pointer interaction                                                 */
/* ------------------------------------------------------------------ */

function toCanvas(evt) {
  const m = canvas.getScreenCTM();
  if (!m) return { x: 0, y: 0 };
  const pt = new DOMPoint(evt.clientX, evt.clientY).matrixTransform(m.inverse());
  return { x: pt.x, y: pt.y };
}

canvas.addEventListener("pointerdown", (evt) => {
  const handle = evt.target.closest(".rot-handle");
  const el = selected();
  if (handle && el) {
    const c = { x: el.cx + el.dx, y: el.cy + el.dy };
    const p = toCanvas(evt);
    drag = {
      mode: "rotate",
      el,
      center: c,
      startAngle: Math.atan2(p.y - c.y, p.x - c.x) * (180 / Math.PI),
      startRot: el.rot,
    };
    canvas.setPointerCapture(evt.pointerId);
    return;
  }

  const g = evt.target.closest("g[data-uid]");
  if (!g) {
    state.selection = null;
    drawOverlay();
    renderLayers();
    renderInspector();
    return;
  }
  const hit = byUid(g.dataset.uid);
  state.selection = hit.uid;
  const p = toCanvas(evt);
  drag = { mode: "move", el: hit, start: p, orig: { dx: hit.dx, dy: hit.dy } };
  canvas.setPointerCapture(evt.pointerId);
  drawOverlay();
  renderLayers();
  renderInspector();
});

canvas.addEventListener("pointermove", (evt) => {
  if (!drag) return;
  const el = drag.el;
  if (drag.mode === "move") {
    const p = toCanvas(evt);
    el.dx = drag.orig.dx + (p.x - drag.start.x);
    el.dy = drag.orig.dy + (p.y - drag.start.y);
    const g = canvas.querySelector(`g[data-uid="${el.uid}"]`);
    if (g) g.setAttribute("transform", C.transformFor(el));
  } else if (drag.mode === "rotate") {
    const p = toCanvas(evt);
    const a = Math.atan2(p.y - drag.center.y, p.x - drag.center.x) * (180 / Math.PI);
    let rot = drag.startRot + (a - drag.startAngle);
    if (evt.shiftKey) rot = Math.round(rot / 15) * 15;
    el.rot = Math.round(rot * 10) / 10;
    const g = canvas.querySelector(`g[data-uid="${el.uid}"]`);
    if (g) g.setAttribute("transform", C.transformFor(el));
    renderInspector();
  }
  drawOverlay();
});

function endDrag(evt) {
  if (!drag) return;
  if (drag.mode === "move" && (drag.el.dx || drag.el.dy)) renderInspector();
  drag = null;
  if (evt && canvas.hasPointerCapture?.(evt.pointerId)) canvas.releasePointerCapture(evt.pointerId);
}
canvas.addEventListener("pointerup", endDrag);
canvas.addEventListener("pointercancel", endDrag);

/* ------------------------------------------------------------------ */
/* left panel                                                          */
/* ------------------------------------------------------------------ */

function renderSizeChips() {
  document.querySelectorAll("#size-chips .chip").forEach((b) => {
    b.classList.toggle("active", b.dataset.size === state.size);
  });
}

function objectThumb(slug, size, stateName) {
  const v = C.getVariant(slug, size, stateName);
  if (!v) return "";
  const inner = C.recolor(C.namespaceIds(v.inner, `thumb-${slug}-${size}-${stateName}`));
  return `<svg viewBox="0 0 ${v.w} ${v.h}" width="100%" height="100%" preserveAspectRatio="xMidYMid meet">${inner}</svg>`;
}

function renderLibrary() {
  const q = ($("#lib-search").value || "").toLowerCase().trim();
  const grid = $("#object-grid");
  const items = DATA.library.objects.filter((o) => o.variants[state.size]);
  const shown = items.filter((o) => !q || o.label.toLowerCase().includes(q) || o.slug.includes(q));
  grid.innerHTML = shown
    .map(
      (o) => `
      <div class="card" data-add="${o.slug}" title="Добавить «${o.label}» на холст">
        <span class="tag main">${state.size}</span>
        <div class="thumb">${objectThumb(o.slug, state.size, "main")}</div>
        <div class="cap"><b>${o.label}</b>${C.META[o.slug]?.title || ""}</div>
      </div>`
    )
    .join("");
  $("#lib-count").textContent = `${shown.length}/${items.length} · размер ${state.size}`;
  grid.querySelectorAll("[data-add]").forEach((card) => {
    card.addEventListener("click", () => {
      const el = C.createObjectElement(card.dataset.add, { size: state.size });
      if (!el) return;
      state.elements.push(el);
      state.selection = el.uid;
      renderCanvas();
      renderLayers();
      renderInspector();
    });
  });
}

function renderBackgrounds() {
  const grid = $("#bg-grid");
  const list = C.backgroundsFor(state.size);
  grid.innerHTML = list
    .map(
      (b) => `
      <div class="card" data-bg="${b.id}" title="Поставить фон ${b.id}">
        <div class="thumb"><svg viewBox="0 0 ${b.w} ${b.h}" width="100%" height="100%" preserveAspectRatio="xMidYMid meet">${C.recolor(
        C.namespaceIds(b.inner, "bgthumb" + b.id)
      )}</svg></div>
        <div class="cap"><b>${b.id}</b>${b.w}×${b.h}</div>
      </div>`
    )
    .join("");
  grid.querySelectorAll("[data-bg]").forEach((card) => {
    card.addEventListener("click", () => {
      const bg = list.find((b) => b.id === card.dataset.bg);
      state.bg = { type: "frame", color: scheme().bg[0], frame: bg.inner };
      renderCanvas();
      toast(`Фон ${bg.id} (${state.size}) установлен`);
    });
  });
}

/* ------------------------------------------------------------------ */
/* right panel                                                         */
/* ------------------------------------------------------------------ */

function allSchemes() {
  return DATA.palettes.concat(customSchemes);
}

function renderSchemes() {
  const box = $("#schemes");
  box.innerHTML = allSchemes()
    .map((p, i) => {
      const sw = (arr) => arr.map((c) => `<i style="background:${c}"></i>`).join("");
      return `<div class="scheme ${i === activeSchemeIndex ? "active" : ""}" data-scheme="${i}">
        <div class="name">${p.name}</div>
        <div class="sw">${sw(p.bg)}</div>
        <div class="sw obj">${sw(p.obj)}</div>
      </div>`;
    })
    .join("");
  box.querySelectorAll("[data-scheme]").forEach((row) => {
    row.addEventListener("click", () => {
      activeSchemeIndex = Number(row.dataset.scheme);
      state.palette = C.cloneScheme(allSchemes()[activeSchemeIndex]);
      remapBackgroundColor();
      renderSchemes();
      renderCanvas();
      renderLibrary();
      renderBackgrounds();
      renderTemplates();
      toast(`Схема: ${state.palette.name}`);
    });
  });
}

// keep the canvas background inside the chosen scheme
function remapBackgroundColor() {
  const roles = DATA.roles || {};
  const s = scheme();
  state.bg.color = C.mapColor(state.bg.color, s);
}

function renderTemplates() {
  const list = $("#template-list");
  const items = DATA.templates.filter((t) => t.format === state.format);
  if (!items.length) {
    list.innerHTML = `<p class="note">Для формата ${state.format} шаблонов нет.</p>`;
    return;
  }
  list.innerHTML = items
    .map(
      (t) => `<div class="tpl" data-tpl="${t.id}">
        <div class="ph" data-preview="${t.id}"></div>
        <div class="meta"><b>${t.id}</b>${t.format} · ${t.slots.map((s) => C.getObject(s.slug)?.label || s.slug).join(", ") || "декор"}</div>
      </div>`
    )
    .join("");

  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      const holder = e.target;
      const t = DATA.templates.find((x) => x.id === holder.dataset.preview);
      if (t && !holder.dataset.done) {
        holder.dataset.done = "1";
        holder.innerHTML = `<img alt="" src="${templatePreview(t)}" />`;
      }
      io.unobserve(holder);
    }
  });
  list.querySelectorAll("[data-preview]").forEach((ph) => io.observe(ph));

  list.querySelectorAll("[data-tpl]").forEach((row) => {
    row.addEventListener("click", () => {
      const t = DATA.templates.find((x) => x.id === row.dataset.tpl);
      applyTemplateById(t);
    });
  });
}

function templatePreview(t) {
  const s = scheme();
  const body = t.parts
    .map((p) => (p.kind === "bg" ? "" : C.recolorTo(C.namespaceIds(p.inner, "p" + t.id), s)))
    .join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="${Math.round(
    (160 * t.height) / t.width
  )}" viewBox="0 0 ${t.width} ${t.height}"><rect width="${t.width}" height="${t.height}" fill="${
    C.recolorTo(`fill="${t.background}"`, s).match(/#[0-9A-F]{6}/i)?.[0] || t.background
  }"/>${body}</svg>`;
  return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
}

function applyTemplateById(t) {
  C.applyTemplate(t);
  C.setBackgroundObjects($("#bg-objects").checked);
  state.selection = null;
  renderCanvas();
  renderLayers();
  renderInspector();
  toast(`Образец ${t.id} · ${t.format} · компоновка как в Figma`);
}

function renderLayers() {
  const box = $("#layers");
  const list = state.elements.slice().reverse();
  if (!list.length) {
    box.innerHTML = `<p class="note">Холст пуст. Добавьте объект из библиотеки или соберите композицию по метафоре.</p>`;
    return;
  }
  box.innerHTML = list
    .map(
      (el) => `<div class="layer ${el.uid === state.selection ? "active" : ""}" data-layer="${el.uid}">
        <span class="nm">${el.label}</span>
        <span class="kind">${el.kind === "object" ? el.state : "декор"}</span>
        <button data-act="vis" title="Показать/скрыть">${el.visible ? "◉" : "◌"}</button>
        <button data-act="up" title="Выше">↑</button>
        <button data-act="down" title="Ниже">↓</button>
        <button data-act="del" title="Удалить">✕</button>
      </div>`
    )
    .join("");

  box.querySelectorAll("[data-layer]").forEach((row) => {
    const uid = row.dataset.layer;
    row.addEventListener("click", (evt) => {
      const act = evt.target.dataset?.act;
      const el = byUid(uid);
      if (!el) return;
      if (act === "vis") {
        el.visible = !el.visible;
      } else if (act === "del") {
        state.elements = state.elements.filter((x) => x.uid !== uid);
        if (state.selection === uid) state.selection = null;
      } else if (act === "up" || act === "down") {
        const i = state.elements.indexOf(el);
        const j = act === "up" ? i + 1 : i - 1;
        if (j >= 0 && j < state.elements.length) {
          state.elements.splice(i, 1);
          state.elements.splice(j, 0, el);
        }
      } else {
        state.selection = uid;
      }
      renderCanvas();
      renderLayers();
      renderInspector();
    });
  });
}

function renderInspector() {
  const el = selected();
  const box = $("#inspector");
  $("#sel-name").textContent = el ? el.label : "не выбран";
  if (!el) {
    box.innerHTML = `<div class="empty">Выберите объект на холсте или в списке слоёв.</div>`;
    return;
  }
  const objOptions =
    el.kind === "object"
      ? `<div class="row"><label>Объект</label><select class="input" id="insp-object">${DATA.library.objects
          .filter((o) => o.variants[el.sizeKey || state.size])
          .map((o) => `<option value="${o.slug}" ${o.slug === el.slug ? "selected" : ""}>${o.label}</option>`)
          .join("")}</select></div>`
      : "";
  const stateRow =
    el.kind === "object"
      ? `<div class="row"><label>Вид</label>
          <button class="chip ${el.state === "main" ? "active" : ""}" data-state="main">главный</button>
          <button class="chip ${el.state === "background" ? "active" : ""}" data-state="background">фоновый</button>
        </div>`
      : "";
  box.innerHTML = `
    <div class="row"><label>Тип</label><span class="hintline">${el.kind}${el.slug ? " · " + el.slug : ""}</span></div>
    ${stateRow}
    ${objOptions}
    <div class="row"><label>X / Y</label>
      <input class="input" type="number" id="insp-x" value="${Math.round(el.dx)}" />
      <input class="input" type="number" id="insp-y" value="${Math.round(el.dy)}" />
    </div>
    <div class="row"><label>Поворот</label>
      <input class="input" type="number" id="insp-rot" value="${Math.round(el.rot)}" step="1" />
    </div>
    <div class="row">
      <button class="btn tiny" id="insp-dup">Дублировать</button>
      <button class="btn tiny" id="insp-del">Удалить</button>
    </div>`;

  box.querySelectorAll("[data-state]").forEach((b) =>
    b.addEventListener("click", () => {
      if (C.setElementState(el, b.dataset.state)) {
        renderCanvas();
        renderInspector();
        renderLayers();
      } else {
        toast("У этого объекта нет такого варианта в выбранном размере");
      }
    })
  );
  const sel = $("#insp-object");
  if (sel) sel.addEventListener("change", () => {
    C.replaceElementObject(el, sel.value);
    renderCanvas();
    renderLayers();
    renderInspector();
  });
  const bind = (id, fn) => {
    const node = $(id);
    if (!node) return;
    node.addEventListener("input", () => {
      fn(Number(node.value) || 0);
      renderCanvas();
      drawOverlay();
    });
  };
  bind("#insp-x", (v) => (el.dx = v));
  bind("#insp-y", (v) => (el.dy = v));
  bind("#insp-rot", (v) => (el.rot = v));
  $("#insp-dup").addEventListener("click", () => {
    const copy = { ...el, uid: "el" + Math.random().toString(36).slice(2, 9), dx: el.dx + 24, dy: el.dy + 24 };
    state.elements.push(copy);
    state.selection = copy.uid;
    renderCanvas();
    renderLayers();
    renderInspector();
  });
  $("#insp-del").addEventListener("click", () => {
    state.elements = state.elements.filter((x) => x.uid !== el.uid);
    state.selection = null;
    renderCanvas();
    renderLayers();
    renderInspector();
  });
}

/* ------------------------------------------------------------------ */
/* demo examples                                                       */
/* ------------------------------------------------------------------ */

const DEMOS = [
  {
    id: "main-objects",
    title: "Только главные объекты",
    text: "финансовый рост",
    format: "1200x630",
    scheme: "lilac",
    bgObjects: false,
  },
  {
    id: "with-background-objects",
    title: "С фоновыми объектами",
    text: "финансовый рост",
    format: "1200x630",
    scheme: "peach",
    bgObjects: true,
  },
  {
    id: "vertical-story",
    title: "Вертикальный формат",
    text: "обучение и знания",
    format: "800x1200",
    scheme: "mint",
    bgObjects: false,
  },
];

function renderDemos() {
  $("#demo-list").innerHTML = DEMOS.map(
    (d) => `<button class="demo" data-demo="${d.id}"><b>${d.title}</b><span>${d.format} · ${d.text} · схема ${
      allSchemes().find((p) => p.id === d.scheme)?.name || d.scheme
    }</span></button>`
  ).join("");
  $("#demo-list")
    .querySelectorAll("[data-demo]")
    .forEach((b) => b.addEventListener("click", () => applyDemo(DEMOS.find((d) => d.id === b.dataset.demo))));
}

function applyDemo(d) {
  if (!d) return;
  state.format = d.format;
  $("#format").value = d.format;
  $("#metaphor").value = d.text;
  const idx = allSchemes().findIndex((p) => p.id === d.scheme);
  activeSchemeIndex = idx >= 0 ? idx : 0;
  state.palette = C.cloneScheme(allSchemes()[activeSchemeIndex]);
  renderSchemes();
  state.withBackgroundObjects = d.bgObjects;
  $("#bg-objects").checked = d.bgObjects;
  const res = C.composeFromMetaphor(d.text, d.format);
  if (res.template) {
    toast(`Демо: ${d.title} · шаблон ${res.template.id} · ${res.template.format}`);
  }
  renderTemplates();
  renderLibrary();
  renderBackgrounds();
  renderCanvas();
  renderLayers();
  renderInspector();
}

/* ------------------------------------------------------------------ */
/* toolbar                                                             */
/* ------------------------------------------------------------------ */

function initFormats() {
  const sel = $("#format");
  sel.innerHTML = FORMATS.map((f) => `<option value="${f}">${f.replace("x", " × ")}</option>`).join("");
  sel.value = state.format;
  sel.addEventListener("change", () => {
    const f = sel.value;
    const [w, h] = f.split("x").map(Number);
    const objects = objectSlugs();
    state.format = f;
    if (objects.length) {
      // keep the meaning: pick the sample of the new format with the same objects
      const ranked = objects.map((slug, i) => ({ slug, score: 10 - i }));
      const t = C.pickTemplate(ranked, f);
      if (t) {
        C.applyTemplate(t);
        C.setBackgroundObjects($("#bg-objects").checked);
        toast(`Формат ${f}: образец ${t.id} (${t.slots.map((s) => C.getObject(s.slug)?.label || s.slug).join(", ")})`);
      } else {
        state.canvas = { w, h };
      }
    } else {
      state.canvas = { w, h };
      state.bg.color = scheme().bg[0];
    }
    state.selection = null;
      renderTemplates();
    renderCanvas();
    renderLayers();
    renderInspector();
  });
}

$("#btn-compose").addEventListener("click", composeByMetaphor);
$("#metaphor").addEventListener("keydown", (e) => e.key === "Enter" && composeByMetaphor());

function composeByMetaphor() {
  const text = $("#metaphor").value.trim();
  if (!text) {
    toast("Введите метафору или заголовок");
    return;
  }
  const res = C.composeFromMetaphor(text, state.format);
  if (!res.template) {
    toast("Не нашёл подходящий шаблон");
    return;
  }
  C.setBackgroundObjects($("#bg-objects").checked);
  state.selection = null;
  renderCanvas();
  renderLayers();
  renderInspector();
  const label = (s) => C.getObject(s)?.label || s;
  const matched = res.matched.map(label);
  const missing = res.missing.map(label);
  const head = `Образец ${res.template.id} (${res.template.format})`;
  if (!res.ranked.length) toast(`${head}: ключевые слова не распознаны, композиция взята как есть`);
  else if (missing.length) toast(`${head}: есть ${matched.join(", ")}; нет в образце — ${missing.join(", ")}`);
  else toast(`${head}: ${matched.join(", ")} — компоновка из Figma сохранена`);
}

$("#btn-add").addEventListener("click", addByName);
$("#names").addEventListener("keydown", (e) => e.key === "Enter" && addByName());

function addByName() {
  const text = $("#names").value.trim();
  if (!text) {
    toast("Введите названия компонентов через запятую");
    return;
  }
  const added = C.composeFromNames(text, { size: state.size });
  if (!added.length) {
    toast("Компоненты не найдены в библиотеке");
    return;
  }
  state.selection = state.elements[state.elements.length - 1]?.uid || null;
  renderCanvas();
  renderLayers();
  renderInspector();
  toast("Добавлено: " + added.map((s) => C.getObject(s)?.label || s).join(", "));
}

$("#btn-clear").addEventListener("click", () => {
  state.elements = [];
  state.selection = null;
  state.bg = { type: "color", color: scheme().bg[0], frame: null };
  renderCanvas();
  renderLayers();
  renderInspector();
});

$("#btn-export").addEventListener("click", () => {
  if (!state.elements.length) {
    toast("Холст пуст — нечего экспортировать");
    return;
  }
  C.downloadSVG(`composition-${state.format}-${scheme().id}.svg`);
  toast("SVG сохранён: векторная структура и id объектов сохранены");
});

$("#bg-objects").addEventListener("change", (e) => {
  C.setBackgroundObjects(e.target.checked);
  renderCanvas();
  renderLayers();
  renderInspector();
  toast(e.target.checked ? "Все объекты переведены в фоновое состояние" : "Все объекты переведены в главное состояние");
});

$("#lib-search").addEventListener("input", renderLibrary);

document.querySelectorAll("#size-chips .chip").forEach((b) =>
  b.addEventListener("click", () => {
    state.size = b.dataset.size;
    renderSizeChips();
    renderLibrary();
    renderBackgrounds();
    // re-load the matching library variant for every object on the canvas
    let swapped = 0;
    for (const el of state.elements) {
      if (el.kind === "object" && C.setElementSize(el, state.size)) swapped++;
    }
    renderCanvas();
    renderLayers();
    renderInspector();
    toast(`Размер ${state.size}: элементы перезагружены (${swapped})`);
  })
);

$("#palette-file").addEventListener("change", async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  try {
    const text = await file.text();
    const p = C.parsePaletteFile(text);
    customSchemes.push(p);
    activeSchemeIndex = allSchemes().length - 1;
    state.palette = C.cloneScheme(p);
    remapBackgroundColor();
    renderSchemes();
    renderCanvas();
    renderLibrary();
    renderBackgrounds();
    renderTemplates();
    toast(`Палитра «${p.name}» загружена: ${p.bg.length} фоновых + ${p.obj.length} объектных цветов`);
  } catch (err) {
    toast("Не удалось прочитать палитру: " + err.message);
  } finally {
    e.target.value = "";
  }
});

/* ------------------------------------------------------------------ */
/* keyboard                                                            */
/* ------------------------------------------------------------------ */

window.addEventListener("keydown", (e) => {
  const tag = document.activeElement?.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
  const el = selected();
  if (!el) return;
  const step = e.shiftKey ? 10 : 1;
  if (e.key === "Delete" || e.key === "Backspace") {
    state.elements = state.elements.filter((x) => x.uid !== el.uid);
    state.selection = null;
  } else if (e.key === "ArrowLeft") el.dx -= step;
  else if (e.key === "ArrowRight") el.dx += step;
  else if (e.key === "ArrowUp") el.dy -= step;
  else if (e.key === "ArrowDown") el.dy += step;
  else if (e.key.toLowerCase() === "d" && (e.ctrlKey || e.metaKey)) {
    e.preventDefault();
    const copy = { ...el, uid: "el" + Math.random().toString(36).slice(2, 9), dx: el.dx + 24, dy: el.dy + 24 };
    state.elements.push(copy);
    state.selection = copy.uid;
  } else if (e.key === "[") {
    const i = state.elements.indexOf(el);
    if (i > 0) {
      state.elements.splice(i, 1);
      state.elements.splice(i - 1, 0, el);
    }
  } else if (e.key === "]") {
    const i = state.elements.indexOf(el);
    if (i < state.elements.length - 1) {
      state.elements.splice(i, 1);
      state.elements.splice(i + 1, 0, el);
    }
  } else return;
  renderCanvas();
  renderLayers();
  renderInspector();
});

/* ------------------------------------------------------------------ */
/* boot                                                                */
/* ------------------------------------------------------------------ */

async function boot() {
  try {
    await C.loadData("data/");
  } catch (err) {
    $("#status").textContent = "ошибка загрузки данных";
    toast("Не удалось загрузить data/*.json — запустите `node bridge/server.mjs`");
    console.error(err);
    return;
  }
  $("#status").textContent = `${DATA.templates.length} шаблонов · ${DATA.library.objects.length} объектов · ${DATA.palettes.length} схемы`;
  state.palette = C.cloneScheme(DATA.palettes[0]);
  state.bg.color = DATA.palettes[0].bg[0];
  state.canvas = { w: 1000, h: 1000 };

  // ссылка на страницу плагина есть только в задеплоенной версии
  if (/\/apps\/illcomfig/.test(location.pathname)) {
    const link = $('#plugin-link');
    if (link) link.hidden = false;
  }

  initFormats();
  renderSizeChips();
  renderSchemes();
  renderLibrary();
  renderBackgrounds();
  renderTemplates();
  renderDemos();

  // стартовая демонстрация: готовая композиция 24:2437
  const demo = DATA.templates.find((t) => t.id === "24:2437") || DATA.templates[0];
  C.applyTemplate(demo);
  renderCanvas();
  renderLayers();
  renderInspector();
}

// debug/demo hook
window.composer = { state, DATA, C };

boot();
