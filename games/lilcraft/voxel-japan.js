/**
 * ============================================================================
 *  VOXEL FEUDAL JAPAN — процедурный воксельный мир
 * ============================================================================
 *  Всё строится из единичных кубов (1 voxel = 1 юнит). Кубы складываются в
 *  бакеты по цвету и собираются в ОДИН InstancedMesh на цвет: ~30 draw calls
 *  на весь мир вместо сотен тысяч. Мелкая крошка (лепестки, кувшинки) — тоже
 *  InstancedMesh.
 *
 *  Использование:
 *    import { createVoxelJapan } from './voxel-japan.js';
 *    const world = createVoxelJapan({ voxel: 0.5 });
 *    scene.add(world);
 *
 *  Для потребителей, которым нужен доступ к отдельным вокселям (FPS-демо:
 *  коллизии, ломание/установка блоков), корень отдаёт:
 *    root.userData.voxelMeshes — InstancedMesh'ы, у каждого
 *                                mesh.userData.voxels = Int32Array [x,y,z,...]
 *                                в целочисленных воксельных координатах
 *    root.userData.materials   — [{ hex, material }] по одной на цвет палитры
 *    root.userData.bounds      — { min:[x,y,z], max:[x,y,z] } в вокселях
 *    root.userData.voxelCount  — общее число вокселей
 * ============================================================================
 */

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/* ---------------------------------------------------------------------------
 *  0. ПАЛИТРА
 * ------------------------------------------------------------------------ */
export const PALETTE = {
  // дерево
  woodDark:     0x3a2418, // каркас, балки, столбы
  woodMid:      0x6b4426, // доски, настил
  woodLight:    0x9a6b3f, // светлые доски, поручни
  woodFloor:    0x4a2c1a, // лакобый пол цуба
  woodRed:      0x8c1c1c, // красное дерево (краска + лак)
  woodRedDark:  0x5e1212, // тень красного дерева

  // черепица / камень
  tile:         0x3c4045, // черепица кавара
  tileDark:     0x272a2e, // тень черепицы
  tileLight:    0x555b61, // блик
  ridge:        0x1d2023, // конёк крыши
  stone:        0x7b7f83, // камни
  stoneDark:    0x565a5e, // тень камня
  stoneLight:   0x9aa0a4, // верхний блик камня

  // сёдзи
  paper:        0xf2e6c8, // рисованная бумага
  paperDim:     0xcdbf9c, // бумага в тени

  // окружение
  sandLight:    0xe4d9b8, // песок зеркала, светлая полоса
  sandDark:     0xc9bb96, // тёмная полоса «граблей»
  grass:        0x4a7c3f, // трава
  grassDark:    0x3a6433, // тёмная трава
  moss:         0x5f8f3a, // мох

  // сакура
  bark:         0x4b2e22, // ствол
  barkLight:    0x6b4433, // ветви
  sakura1:      0xfce0ea, // блик
  sakura2:      0xf7bcd4, // светлый бутон
  sakura3:      0xee9ec0, // основной
  sakura4:      0xdd7ba6, // тень

  // вода
  water:        0x2f7fa8, // глубокая
  waterLight:   0x59b3d1, // рябь

  // акценты
  gold:         0xd9a441, // фонари, металл
  lanternPaper: 0xffd9a0, // бумага фонаря
};

/* ---------------------------------------------------------------------------
 *  0.5 ГАБАРИТЫ УЧАСТКА
 *  Додзё 32x32 (HALF=16) — центр композиции. Участок не квадрат: с севера,
 *  запада и востока отступ PAD, а на юг уходит длинная аллея AVENUE
 *  (тории -> дорожка -> дверь додзё). Южный край = 58, внешняя стена = 60.
 *  ВАЖНО: сетка FPS-демо (SIZE в index.html) должна покрывать ±(PLOT_ZS+16),
 *  иначе дальние холмы уедут за границу массива. При SIZE=128 предел 63.
 * ------------------------------------------------------------------------ */
const DOJO_HALF = 16;                        // половина 1-го этажа додзё
const PAD       = 18;                        // отступ края участка от стен додзё
const AVENUE    = 24;                        // длина южной аллеи сверх PAD
const PLOT_X    = DOJO_HALF + PAD;           // 34 — край участка по X
const PLOT_ZN   = DOJO_HALF + PAD;           // 34 — край участка на север
const PLOT_ZS   = DOJO_HALF + PAD + AVENUE;  // 58 — край участка на юг
const WALL_X    = DOJO_HALF + PAD + 2;       // 36 — внешняя стена по X
const WALL_ZS   = DOJO_HALF + PAD + 2 + AVENUE; // 60 — внешняя стена на юг

const _matCache = new Map();
function mat(hex) {
  let m = _matCache.get(hex);
  if (!m) {
    m = new THREE.MeshLambertMaterial({ color: hex });
    _matCache.set(hex, m);
  }
  return m;
}

/* ---------------------------------------------------------------------------
 *  1. VOXEL BUILDER — накопитель кубов -> merged-меши
 * ------------------------------------------------------------------------ */
/* Ключ вокселя для карты владения (упаковка в одно число, без строк — в 4 раза быстрее). */
const vkey = (x, y, z) => ((x + 512) * 1024 + (y + 512)) * 1024 + (z + 512);

class VoxelBuilder {
  constructor(voxel = 0.5) {
    this.v = voxel;
    this.buckets = new Map();   // hex -> [x,y,z, ...] целочисленные воксельные координаты
    this.instances = new Map(); // hex -> Matrix4[]
    // ключ вокселя -> [массив-бакет, слот]. Нужен, чтобы поздняя запись в ту же
    // клетку затирала раннюю (иначе в одной клетке живут два куба разных цветов
    // и они мерцают — z-fighting; таких клеток в мире ~8.7k).
    this.owner = new Map();
  }

  _push(x, y, z, hex) {
    let a = this.buckets.get(hex);
    if (!a) { a = []; this.buckets.set(hex, a); }
    const slot = a.length / 3;
    a.push(x, y, z);
    this.owner.set(vkey(x, y, z), [a, slot]);
  }

  /** Один воксель в целочисленных координатах. Поздняя запись перекрывает раннюю. */
  put(x, y, z, hex) {
    const k = vkey(x, y, z);
    const prev = this.owner.get(k);
    if (prev) prev[0][prev[1] * 3] = NaN;   // надгробие: старая запись выбрасывается в build()
    this._push(x, y, z, hex);
    return this;
  }

  /** Положить воксель, только если клетка ещё свободна (базовый слой земли). */
  putIfEmpty(x, y, z, hex) {
    if (this.owner.has(vkey(x, y, z))) return this;
    this._push(x, y, z, hex);
    return this;
  }

  /** Прямоугольный объём (инклюзивные границы). */
  fill(x0, y0, z0, x1, y1, z1, hex) {
    for (let x = x0; x <= x1; x++)
      for (let y = y0; y <= y1; y++)
        for (let z = z0; z <= z1; z++) this.put(x, y, z, hex);
    return this;
  }

  /** Мелкая деталь (лепесток, листочек) -> InstancedMesh. */
  speck(x, y, z, hex, sx = 1, sy = 1, sz = 1, ry = 0) {
    let a = this.instances.get(hex);
    if (!a) { a = []; this.instances.set(hex, a); }
    a.push(new THREE.Matrix4().compose(
      new THREE.Vector3(x * this.v, y * this.v, z * this.v),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ry, 0)),
      new THREE.Vector3(sx, sy, sz)
    ));
    return this;
  }

  /**
   * Собрать Group: по одному мешу на каждый цвет.
   * @param {string} name
   * @param {{merge?: boolean}} [opts]
   *   merge=true  — старый путь: склейка всех кубов цвета в один BufferGeometry
   *                 (mergeGeometries). Память O(число вокселей), воксели недоступны.
   *   по умолчанию — InstancedMesh: та же картинка, память O(число вокселей/24),
   *                 и есть per-instance доступ (ломание/установка блоков в FPS-демо).
   */
  build(name, opts = {}) {
    const merge = !!opts.merge;
    const group = new THREE.Group();
    group.name = name;

    // вычищаем надгробия (NaN), оставшиеся от перекрытых записей
    for (const list of this.buckets.values()) {
      let w = 0;
      for (let i = 0; i < list.length; i += 3) {
        if (Number.isNaN(list[i])) continue;
        list[w] = list[i]; list[w + 1] = list[i + 1]; list[w + 2] = list[i + 2];
        w += 3;
      }
      list.length = w;
    }
    this.owner.clear();

    const unit = new THREE.BoxGeometry(this.v, this.v, this.v);
    const m4 = new THREE.Matrix4();

    for (const [hex, list] of this.buckets) {
      const n = list.length / 3;
      if (!n) continue;
      let mesh;
      if (merge) {
        const geos = [];
        for (let i = 0; i < n; i++) {
          const g = unit.clone();
          g.translate(list[i * 3] * this.v, list[i * 3 + 1] * this.v, list[i * 3 + 2] * this.v);
          geos.push(g);
        }
        const merged = mergeGeometries(geos, false);
        for (const g of geos) g.dispose();
        if (!merged) continue;
        merged.computeBoundingSphere();
        mesh = new THREE.Mesh(merged, mat(hex));
      } else {
        mesh = new THREE.InstancedMesh(unit, mat(hex), n);
        for (let i = 0; i < n; i++) {
          m4.makeTranslation(list[i * 3] * this.v, list[i * 3 + 1] * this.v, list[i * 3 + 2] * this.v);
          mesh.setMatrixAt(i, m4);
        }
        mesh.instanceMatrix.needsUpdate = true;
        mesh.computeBoundingSphere();   // без этого фрустум-куллинг режет меш по нулевому боксу
        mesh.userData.voxels = Int32Array.from(list);
      }
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.userData.colorHex = hex;
      group.add(mesh);
    }

    for (const [hex, mats] of this.instances) {
      if (!mats.length) continue;
      const im = new THREE.InstancedMesh(unit, mat(hex), mats.length);
      mats.forEach((m, i) => im.setMatrixAt(i, m));
      im.instanceMatrix.needsUpdate = true;
      im.castShadow = true;
      im.receiveShadow = true;
      im.name = 'speck_' + hex.toString(16);
      group.add(im);
    }

    this.buckets.clear();
    this.instances.clear();
    return group;
  }
}

/* Детерминированный ГПСЧ (mulberry32): мир одинаков при каждой генерации. */
function makeRng(seed = 1337) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* =========================================================================
 *  2. DOJO — двухэтажный додзё (центральный элемент)
 * ====================================================================== */
function buildDojo(B) {
  const g = new THREE.Group();
  g.name = 'Dojo';
  const rng = makeRng(7);

  const HALF = DOJO_HALF;   // половина 1-го этажа (32x32 фундамент)
  const H1 = 11;     // высота 1-го этажа
  const H2 = 9;      // высота 2-го этажа
  const UPPER = 13;  // половина 2-го этажа (меньше => открытая терраса)
  const PLINTH = 1;  // высота каменного цоколя

  /* ---- 2.1 Каменный цоколь (клинтайн) + ступени на юг ---- */
  for (let x = -HALF - 1; x <= HALF + 1; x++)
    for (let z = -HALF - 1; z <= HALF + 1; z++) {
      const edge = Math.abs(x) === HALF + 1 || Math.abs(z) === HALF + 1;
      B.put(x, 0, z, edge
        ? (rng() < 0.3 ? PALETTE.stoneLight : PALETTE.stone)
        : PALETTE.stoneDark);
    }
  for (let s = 0; s < 3; s++)
    for (let x = -5; x <= 5; x++)
      B.put(x, 0, HALF + 2 + s, s === 0 ? PALETTE.stone : PALETTE.stoneLight);

  /* ---- 2.2 Первый этаж ---- */
  const y0 = PLINTH;
  const top1 = y0 + H1;

  // тёмный лакобый пол цуба
  for (let x = -HALF; x <= HALF; x++)
    for (let z = -HALF; z <= HALF; z++)
      B.put(x, y0, z, (x + z) % 4 === 0 ? PALETTE.woodFloor : PALETTE.woodDark);

  /**
   * Стена с проёмами под сёдзи.
   * @param fixed   — координата по неподвижной оси
   * @param axis    — 'x' (стена тянется по Z) | 'z' (стена тянется по X)
   * @param sign    — направление второй стенки (толщина стены = 2)
   * @param hasDoor — южная стена с дверным проёмом
   */
  function shojiWall(fixed, axis, sign, hasDoor) {
    for (let t = -HALF + 1; t <= HALF - 1; t++) {
      const corner = Math.abs(t) === HALF - 1;
      for (let y = y0 + 1; y <= top1; y++) {
        const nuki = (y - y0) === 4 || (y - y0) === 7;           // горизонт. риги
        const hashira = corner || (t + HALF) % 4 === 0 || (t - HALF) % 4 === 0;
        for (let d = 0; d < 2; d++) {
          const x = axis === 'x' ? fixed + d * sign : t;
          const z = axis === 'x' ? t : fixed + d * sign;
          if (hasDoor && Math.abs(t) <= 2 && y <= y0 + 5) continue; // проём двери
          if (corner || nuki || hashira) B.put(x, y, z, PALETTE.woodDark);
          else B.put(x, y, z, y - y0 <= 2 ? PALETTE.paperDim : PALETTE.paper);
        }
      }
      if (hasDoor) { // косяки дверного проёма — РОВНО по краям проёма (x = ±3)
        for (let y = y0 + 1; y <= y0 + 5; y++)
          for (const s of [-3, 3])
            for (let d = 0; d < 2; d++) {
              const x = axis === 'x' ? fixed + d * sign : s;
              const z = axis === 'x' ? s : fixed + d * sign;
              B.put(x, y, z, PALETTE.woodRed);
            }
      }
    }
  }
  shojiWall(-HALF, 'x', 1, false);
  shojiWall( HALF, 'x', -1, false);
  shojiWall(-HALF, 'z', 1, false);
  shojiWall( HALF, 'z', -1, true);

  // угловые столбы (обу) — массивнее стены
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]])
    for (let y = y0; y <= top1; y++) {
      B.put(sx * HALF, y, sz * HALF, PALETTE.woodDark);
      B.put(sx * (HALF - 1), y, sz * HALF, PALETTE.woodDark);
      B.put(sx * HALF, y, sz * (HALF - 1), PALETTE.woodDark);
    }

  // внутренние колонны (4) — задают ритм помещения
  for (const cx of [-7, 7]) for (const cz of [-7, 7]) {
    for (let y = y0; y <= top1; y++) B.put(cx, y, cz, PALETTE.woodDark);
    B.put(cx, top1 + 1, cz, PALETTE.woodRedDark);
  }

  // обвязка под перекрытие 2-го этажа
  for (let x = -HALF; x <= HALF; x++)
    for (let z = -HALF; z <= HALF; z++)
      if (x === -HALF || x === HALF || z === -HALF || z === HALF) {
        B.put(x, top1, z, PALETTE.woodDark);
        B.put(x, top1 + 1, z, PALETTE.woodLight);
      }

  // перекрытие 2-го этажа
  for (let x = -UPPER; x <= UPPER; x++)
    for (let z = -UPPER; z <= UPPER; z++)
      B.put(x, top1 + 1, z, (x + z) % 3 === 0 ? PALETTE.woodMid : PALETTE.woodFloor);


  /* ---- 2.3 Второй этаж + открытый балкон с перилами ---- */
  const uy0 = top1 + 2;
  const top2 = uy0 + H2;
  for (let x = -UPPER; x <= UPPER; x++)
    for (let z = -UPPER; z <= UPPER; z++) {
      if (Math.abs(x) !== UPPER && Math.abs(z) !== UPPER) continue;
      for (let y = uy0; y <= top2; y++) {
        const nuki = (y - uy0) === 3 || (y - uy0) === 6;
        B.put(x, y, z, nuki ? PALETTE.woodDark : PALETTE.paper);
      }
    }
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    for (let y = uy0; y <= top2; y++) {
      B.put(sx * UPPER, y, sz * UPPER, PALETTE.woodDark);
      B.put(sx * UPPER, y, sz * (UPPER - 1), PALETTE.woodRedDark);
    }
  }
  for (let x = -UPPER; x <= UPPER; x++)
    for (let z = -UPPER; z <= UPPER; z++)
      if (Math.abs(x) === UPPER || Math.abs(z) === UPPER) {
        B.put(x, top2, z, PALETTE.woodDark);
        B.put(x, top2 + 1, z, PALETTE.woodRedDark);
      }

  // перила балкона по контуру 1-го этажа (там, где ещё есть терраса)
  for (let x = -HALF; x <= HALF; x++)
    for (const z of [-HALF, HALF]) {
      if (Math.abs(x) > UPPER + 1) continue;
      B.put(x, top2 + 2, z, PALETTE.woodLight);
      B.put(x, top2 + 3, z, PALETTE.woodRedDark);
      if ((x + HALF) % 3 === 0) B.put(x, top2 + 1, z, PALETTE.woodMid);
    }
  for (let z = -UPPER; z <= UPPER; z++)
    for (const x of [-HALF, HALF]) {
      B.put(x, top2 + 2, z, PALETTE.woodLight);
      B.put(x, top2 + 3, z, PALETTE.woodRedDark);
      if ((z + UPPER) % 3 === 0) B.put(x, top2 + 1, z, PALETTE.woodMid);
    }
  // консольный свес над входом
  for (let x = -4; x <= 4; x++) {
    B.put(x, uy0 - 1, HALF + 1, PALETTE.woodRed);
    B.put(x, uy0 - 1, HALF + 2, PALETTE.woodRedDark);
  }

  /* ---- 2.4 Крыша кавара: сплошной изогнутый скат + отогнутые углы ----
   * Каждый ярус — ЦЕЛЬНЫЙ квадратный слой (а не обруч), поэтому крыша
   * читается как масса, а не как лестница. Радиус растёт быстрее высоты:
   * это и даёт изгиб (sori) — пологий к коньку, крутой у карниза.       */
  const roofBase = top2 + 4;
  const tiers = 8;
  for (let t = 0; t < tiers; t++) {
    // t=0 — широкий карниз (UPPER+2), t=tiers-1 — узкий верх (3) у конька
    const r = 3 + Math.round((UPPER - 1) * (tiers - 1 - t) / (tiers - 1));
    const y = roofBase + t;                     // слой в 1 воксель
    const edge = t === 0 ? PALETTE.tileDark : (t % 2 ? PALETTE.tile : PALETTE.tileDark);
    for (let x = -r; x <= r; x++)
      for (let z = -r; z <= r; z++) {
        const onEdge = Math.abs(x) >= r || Math.abs(z) >= r;
        B.put(x, y, z, onEdge ? edge : PALETTE.tileDark); // внутрь — тень
      }
    // черепичная «волна» по внешнему ряду — блик на солнце
    for (let x = -r; x <= r; x++)
      for (let z = -r; z <= r; z++) {
        if (Math.abs(x) !== r && Math.abs(z) !== r) continue;
        B.put(x, y + 1, z, (x + z) % 2 === 0 ? PALETTE.tile : PALETTE.tileLight);
      }
    // отгиб углов (mukuri) на нижних ярусах — черепица задирается вверх
    if (t <= 2) {
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        B.put(sx * r, y + 1, sz * r, PALETTE.tileLight);
        B.put(sx * r, y + 2, sz * r, PALETTE.tileLight);
        B.put(sx * (r - 1), y + 2, sz * r, PALETTE.tile);
        B.put(sx * r, y + 2, sz * (r - 1), PALETTE.tile);
        if (t === 0) {                     // крупная консоль под отгибом
          B.put(sx * r, y, sz * (r - 1), PALETTE.woodRedDark);
          B.put(sx * (r - 1), y, sz * r, PALETTE.woodRedDark);
        }
      }
    }
  }

  // Конёк (ridge) + торцы oni-gawara
  const ridgeY = roofBase + tiers;
  for (let x = -4; x <= 4; x++) {
    B.put(x, ridgeY, 0, PALETTE.ridge);
    B.put(x, ridgeY + 1, 0, PALETTE.tileDark);
  }
  for (const s of [-1, 1]) {
    B.put(s * 4, ridgeY + 1, 0, PALETTE.gold);
    B.put(s * 5, ridgeY + 1, 0, PALETTE.gold);
    B.put(s * 6, ridgeY, 0, PALETTE.tileLight);
    B.put(s * 6, ridgeY + 1, 0, PALETTE.tileLight);
  }

  return { group: g, HALF, top1, top2, ridgeY };
}


/* =========================================================================
 *  3. ZEN GARDEN (сухой сад) — камни + гравийные полосы «граблей»
 * ====================================================================== */
function buildZenGarden(B, cx, cz, rx, rz, seed = 21) {
  const rng = makeRng(seed);
  const g = new THREE.Group();
  g.name = 'ZenGarden';

  // гравий: чередование светлой/тёмной полосы с волной = узор граблей
  for (let x = cx - rx; x <= cx + rx; x++)
    for (let z = cz - rz; z <= cz + rz; z++) {
      const wave = Math.sin((x - cx) * 0.55 + (z - cz) * 0.18) * 1.2;
      const band = Math.floor((z + wave) / 2) % 2 === 0;
      const edge = Math.abs(x - cx) === rx || Math.abs(z - cz) === rz;
      B.put(x, 0, z, edge ? PALETTE.stoneDark
        : (band ? PALETTE.sandLight : PALETTE.sandDark));
    }

  // каменные россыпи (йока-иси): конус вверх + мох у подножия
  const rocks = [
    [-0.55, -0.35, 3], [-0.30, 0.30, 2], [0.10, -0.10, 2],
    [0.45, 0.40, 3], [0.62, -0.35, 2], [-0.05, 0.62, 2],
  ];
  for (const [fx, fz, h] of rocks) {
    const bx = Math.round(cx + fx * rx);
    const bz = Math.round(cz + fz * rz);
    for (let y = 1; y <= h; y++) {
      const r = Math.max(1, 3 - y);
      for (let dx = -r; dx <= r; dx++)
        for (let dz = -r; dz <= r; dz++) {
          if (Math.abs(dx) + Math.abs(dz) > r + 1) continue;
          if (y < h && Math.abs(dx) + Math.abs(dz) > r) continue;
          if (rng() < 0.12 && y === 1) continue;      // неровность основания
          B.put(bx + dx, y, bz + dz, y === h ? PALETTE.stoneLight
            : (y === 1 ? PALETTE.stoneDark : PALETTE.stone));
        }
    }
    for (let i = 0; i < 8; i++) {                      // мох вокруг
      const a = rng() * Math.PI * 2, rr = 3 + rng() * 2;
      B.put(bx + Math.round(Math.cos(a) * rr), 1,
        bz + Math.round(Math.sin(a) * rr),
        rng() < 0.5 ? PALETTE.moss : PALETTE.stoneDark);
    }
  }

  // «Сэйтсу-иси» — одинокий камень, главный акцент композиции
  const sx = cx - Math.round(rx * 0.1), sz = cz + Math.round(rz * 0.05);
  for (let y = 1; y <= 3; y++)
    for (let dx = -1; dx <= 1; dx++)
      for (let dz = -1; dz <= 1; dz++) {
        if (Math.abs(dx) + Math.abs(dz) > 2 - y * 0.5) continue;
        B.put(sx + dx, y, sz + dz, y === 3 ? PALETTE.stoneLight : PALETTE.stone);
      }

  // бамбуковый забор (такигаки) по северной стороне сада
  for (let x = cx - rx; x <= cx + rx; x++)
    for (let y = 1; y <= 4; y++) {
      B.put(x, y, cz - rz - 1, y === 4 ? PALETTE.woodLight : PALETTE.woodMid);
      B.put(x, y, cz - rz - 2, y === 4 ? PALETTE.woodLight : PALETTE.woodDark);
    }
  for (let x = cx - rx; x <= cx + rx; x += 6) {
    B.put(x, 0, cz - rz - 2, PALETTE.woodDark);
    B.put(x, 5, cz - rz - 2, PALETTE.woodDark);
  }
  return g;
}


/* =========================================================================
 *  4. POND + АРОЧНЫЙ МОСТ ТАЙКО-БАСИ
 * ====================================================================== */
function buildPondAndBridge(B, cx, cz, rx, rz, seed = 99) {
  const rng = makeRng(seed);
  const g = new THREE.Group();
  g.name = 'PondBridge';

  /* ---- 4.1 Котлован: каменное дно + вода + берег из камней ---- */
  for (let x = cx - rx - 3; x <= cx + rx + 3; x++)
    for (let z = cz - rz - 3; z <= cz + rz + 3; z++) {
      const inner = (x - cx) ** 2 / (rx * rx) + (z - cz) ** 2 / (rz * rz) <= 1;
      const ring = (x - cx) ** 2 / (rx + 3) ** 2 + (z - cz) ** 2 / (rz + 3) ** 2 <= 1;
      if (inner) {
        B.put(x, -3, z, PALETTE.stoneDark);                    // дно
        B.put(x, -2, z, (x * 2 + z * 3) % 5 === 0
          ? PALETTE.stoneDark : PALETTE.waterLight);            // мелкое дно
        B.put(x, -1, z, (x * 3 + z * 5) % 7 === 0              // рябь
          ? PALETTE.waterLight : PALETTE.water);
        B.put(x, 0, z, (x + z) % 6 === 0                        // поверхность
          ? PALETTE.waterLight : PALETTE.water);
      } else if (ring) {
        B.put(x, 0, z, rng() < 0.35 ? PALETTE.stone : PALETTE.stoneDark);
        B.put(x, -1, z, PALETTE.stoneDark);
      } else {
        B.put(x, 0, z, rng() < 0.18 ? PALETTE.grassDark : PALETTE.grass);
      }
    }

  // кувшинки (сан-суй) — плоские instanced-листочки на воде
  for (let i = 0; i < 26; i++) {
    const a = rng() * Math.PI * 2, rr = Math.sqrt(rng());
    B.speck(
      Math.round(cx + Math.cos(a) * rx * rr * 0.85), 0.42,
      Math.round(cz + Math.sin(a) * rz * rr * 0.85),
      rng() < 0.3 ? PALETTE.sakura1 : PALETTE.grassDark,
      1.6, 0.18, 1.6, rng() * 3
    );
  }

  /* ---- 4.2 Мост: параболическая арка, настил, перила, конёк ---- */
  const span = rx * 2 + 6;             // длина пролёта
  const zb = cz;                       // мост идёт вдоль оси X
  const PEAK = 6;                      // высота конька арки
  const deckY = (t) => Math.round(1 + PEAK * (1 - (t / (span / 2)) ** 2) * 0.9);

  // настил + продольные балки под ним
  for (let t = -span / 2; t <= span / 2; t++) {
    const y = deckY(t);
    for (let w = -1; w <= 1; w++)
      B.put(cx + t, y, zb + w, t % 2 === 0 ? PALETTE.woodRed : PALETTE.woodRedDark);
    B.put(cx + t, y - 1, zb - 1, PALETTE.woodDark);
    B.put(cx + t, y - 1, zb + 1, PALETTE.woodDark);
  }
  // опоры в воде
  for (const off of [-span / 4, span / 4])
    for (let y = -1; y <= 1; y++)
      for (let w = -1; w <= 1; w++)
        B.put(cx + Math.round(off), y, zb + w, PALETTE.woodDark);

  // перила: стойки через 2, затем два поручня по всей длине
  for (let t = -span / 2; t <= span / 2; t += 2) {
    const y = deckY(t);
    for (const s of [-2, 2]) {
      B.put(cx + t, y + 1, zb + s, PALETTE.woodRed);
      B.put(cx + t, y + 2, zb + s, PALETTE.woodRedDark);
    }
  }
  for (let t = -span / 2; t <= span / 2; t++) {
    const y = deckY(t);
    for (const s of [-2, 2]) {
      B.put(cx + t, y + 3, zb + s, PALETTE.woodRed);         // поручень
      B.put(cx + t, y + 4, zb + s, PALETTE.woodRedDark);     // конёк (кину-гасара)
    }
  }
  // золотые наконечники
  for (const s of [-1, 1]) {
    const e = cx + Math.round(s * span / 2);
    for (const w of [-2, 2])
      for (const y of [3, 4, 5]) B.put(e, y, zb + w, PALETTE.gold);
  }
  return g;
}


/* =========================================================================
 *  5. SAKURA — рекурсивное ветвление + «пушистые» кластеры лествы
 * ====================================================================== */
function buildSakura(B, x, z, scale = 1, seed = 3) {
  const rng = makeRng(seed);
  const top = Math.round(6 * scale);
  const tips = [];   // кончики ветвей — туда вешаем кроны

  /* ---- 5.1 Ствол: слегка извилистый, с корнями ---- */
  let tx = 0, tz = 0;
  for (let y = 0; y <= top; y++) {
    if (y > 1 && rng() < 0.3) {
      const d = rng() < 0.5 ? 1 : -1;
      if (rng() < 0.5) tx += d; else tz += d;
    }
    const w = y < 2 ? 1 : 0;                       // 2x2 внизу, дальше 1x1
    for (let dx = -w; dx <= w; dx++)
      for (let dz = -w; dz <= w; dz++) {
        if (w && Math.abs(dx) + Math.abs(dz) > 1) continue;
        B.put(x + tx + dx, y, z + tz + dz,
          y < top * 0.4 ? PALETTE.bark : PALETTE.barkLight);
      }
    if (y === 0) {                                  // корни
      B.put(x + 2, 0, z, PALETTE.bark);
      B.put(x - 2, 0, z, PALETTE.bark);
      B.put(x, 0, z + 2, PALETTE.bark);
      B.put(x, 0, z - 2, PALETTE.bark);
    }
  }

  /* ---- 5.2 Ветви: рекурсия с затуханием длины ---- */
  function grow(ox, oy, oz, dx, dy, dz, len, depth) {
    let cx = ox, cy = oy, cz = oz;
    for (let i = 0; i < len; i++) {
      cx += dx; cy += dy; cz += dz;
      B.put(x + Math.round(cx), Math.round(cy), z + Math.round(cz),
        depth < 2 ? PALETTE.bark : PALETTE.barkLight);
      if (depth < 2 && i > 0 && i % 2 === 0) {     // боковые веточки
        const s = rng() < 0.5 ? 1 : -1;
        if (rng() < 0.5) grow(cx, cy, cz, s * 0.7, 0.7, 0, Math.max(2, len - 2), depth + 1);
        else grow(cx, cy, cz, 0, 0.7, s * 0.7, Math.max(2, len - 2), depth + 1);
      }
    }
    tips.push([cx, cy, cz]);
  }
  grow(tx, top, tz, 0, 1, 0, Math.round(3 * scale), 0);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + rng();
    grow(tx, top, tz, Math.cos(a) * 0.7, 0.8, Math.sin(a) * 0.7,
      Math.round(3 * scale), 1);
  }

  /* ---- 5.3 Крона: эллипсоидальные «пуши» с 4 оттенками ---- */
  const shades = [PALETTE.sakura1, PALETTE.sakura2, PALETTE.sakura3, PALETTE.sakura4];
  for (const [bx, by, bz] of tips) {
    if (rng() < 0.25) continue;
    const R = Math.round((2.2 + rng() * 1.6) * scale);
    const cx = x + Math.round(bx), cy = Math.round(by), cz = z + Math.round(bz);
    for (let dx = -R; dx <= R; dx++)
      for (let dy = -R; dy <= R; dy++)
        for (let dz = -R; dz <= R; dz++) {
          const d = (dx * dx) / (R * R) + (dy * dy * 1.35) / (R * R) + (dz * dz) / (R * R);
          if (d > 1) continue;
          if (d > 0.55 && rng() < 0.35) continue;     // рваный пушистый край
          const c = shades[dy < -1 ? 0 : dy > 1 ? 3 : (rng() < 0.5 ? 1 : 2)];
          B.put(cx + dx, cy + dy, cz + dz, rng() < 0.08 ? PALETTE.sakura3 : c);
        }
  }

  /* ---- 5.4 Опадающие лепестки (instanced, висят в воздухе) ---- */
  for (let i = 0; i < Math.round(26 * scale); i++) {
    const a = rng() * Math.PI * 2, rr = rng() * 4 * scale;
    B.speck(
      x + Math.cos(a) * rr,
      top + Math.round(rng() * 3) - Math.round(3 * scale),
      z + Math.sin(a) * rr,
      rng() < 0.3 ? PALETTE.sakura1 : PALETTE.sakura4,
      0.8, 0.15, 0.8, rng() * 3
    );
  }
}


/* =========================================================================
 *  6. ДЕКОР — тории, фонари, дорожка, внешняя стена
 * ====================================================================== */
function buildDecor(B, R) {
  const rng = makeRng(55);
  const g = new THREE.Group();
  g.name = 'Decor';

  /* ---- 6.1 Тории (ворота) перед южным входом ---- */
  const tz = R.HALF + 14, pierW = 2, pierH = 12, span = 16;
  for (const s of [-1, 1]) {
    for (let y = 0; y <= pierH; y++)
      for (let d = 0; d < pierW; d++)
        B.put(s * span / 2 + d, y, tz,
          y > pierH - 2 ? PALETTE.woodRedDark : PALETTE.woodRed);
    for (let d = -1; d <= pierW; d++) B.put(s * span / 2 + d, 0, tz, PALETTE.stone);
  }
  // верхняя балка (kasagi) с приподнятыми концами
  for (let x = -span / 2 - 2; x <= span / 2 + 2; x++) {
    const lift = Math.round(Math.abs(x) / (span / 2 + 2) * 2);
    for (let d = 0; d < pierW; d++) {
      B.put(x, pierH + 1 + lift, tz + d, PALETTE.woodRedDark);
      B.put(x, pierH + 2 + lift, tz + d, PALETTE.woodRed);
      B.put(x, pierH + 3 + lift, tz + d, PALETTE.woodRedDark);
    }
  }
  for (let x = -span / 2; x <= span / 2; x++)           // nuki
    for (let d = 0; d < pierW; d++) B.put(x, pierH - 1, tz + d, PALETTE.woodRed);
  for (let x = -2; x <= 2; x++)                          // табличка
    for (let y = pierH - 4; y <= pierH - 2; y++)
      for (let d = 0; d < 2; d++) B.put(x, y, tz + d, PALETTE.woodLight);

  /* ---- 6.2 Фонари (тассо) вдоль дорожки — на всю длину южной аллеи ---- */
  function lantern(x, z) {
    for (let y = 0; y <= 4; y++) B.put(x, y, z, PALETTE.woodDark);
    for (let y = 5; y <= 8; y++)
      for (let dx = -1; dx <= 1; dx++)
        for (let dz = -1; dz <= 1; dz++) {
          if (Math.abs(dx) + Math.abs(dz) > 1) continue;
          B.put(x + dx, y, z + dz, y === 8 ? PALETTE.gold : PALETTE.lanternPaper);
        }
    B.put(x, 9, z, PALETTE.tileDark);
    B.put(x, 10, z, PALETTE.gold);
  }
  for (let z = R.HALF + 2; z <= PLOT_ZS - 2; z += 6) {
    lantern(-R.HALF - 2, z);
    lantern(R.HALF + 2, z);
  }

  /* ---- 6.3 Каменная дорожка (тоби-иси) от южной стены к двери додзё ---- */
  for (let z = R.HALF + 1; z <= PLOT_ZS - 1; z++)
    for (let x = -3; x <= 3; x++) {
      if (x === 0 && rng() < 0.5) continue;
      B.put(x, 0, z, rng() < 0.4 ? PALETTE.stoneLight : PALETTE.stone);
    }

  /* ---- 6.4 Внешняя стена (нодэгаки): столбы + плетень + черепица ---- */
  // Прямоугольник: по X — WALL_X, на юг вытянут до WALL_ZS (аллея).
  const W = WALL_X, WZ = WALL_ZS;
  function wallPost(x, z, t) {
    B.put(x, 0, z, t % 3 === 0 ? PALETTE.stoneDark : PALETTE.woodMid);
    B.put(x, 1, z, PALETTE.woodMid);
    B.put(x, 2, z, PALETTE.woodMid);
    B.put(x, 3, z, t % 3 === 0 ? PALETTE.stoneDark : PALETTE.woodLight);
    B.put(x, 4, z, PALETTE.tile);
  }
  for (let x = -W; x <= W; x++) { wallPost(x, -W, x + W); wallPost(x, WZ, x + W); }
  for (let z = -W; z <= WZ; z++) { wallPost(-W, z, z + W); wallPost(W, z, z + W); }

  /* ---- 6.5 Базальтовые стойки (исори-иси) у воды ----
   * Держим их ПОДАЛЬШЕ от центральной оси: раньше рандом ставил стойку прямо
   * на дорожке перед спавном и она закрывала вид на додзё.                   */
  for (let i = 0; i < 5; i++) {
    let x = 0, z = 0, tries = 0;
    do {
      x = Math.round(rng() * 60 - 30);
      z = Math.round(rng() * 60 - 30);
    } while (++tries < 24 && (
      Math.abs(x) < 8 ||                                   // осевая аллея
      (Math.abs(x) <= R.HALF + 3 && Math.abs(z) <= R.HALF + 3) // пятно додзё
    ));
    if (Math.abs(x) < 8) continue;
    const h = 3 + Math.floor(rng() * 4);
    for (let y = 0; y <= h; y++)
      B.put(x, y, z, y === h ? PALETTE.stoneLight : PALETTE.stoneDark);
    B.put(x, h + 1, z, PALETTE.moss);
  }

  /* ---- 6.6 Живая изгородь вдоль южной аллеи ----
   * Без неё южная половина участка читается как пустой газон: сама аллея
   * (дорожка + фонари) шириной 6 вокселей, а газона вокруг — 60.
   * Ряды: основание из тёмного дерева, зелень сверху, редкие столбики.      */
  const HEDGE_X = R.HALF + 9;                       // ±25
  for (const s of [-1, 1]) {
    const hx = s * HEDGE_X;
    for (let z = R.HALF + 1; z <= PLOT_ZS - 2; z++) {
      B.put(hx, 1, z, z % 5 === 0 ? PALETTE.bark : PALETTE.woodDark);
      B.put(hx, 2, z, z % 3 === 0 ? PALETTE.moss : PALETTE.grassDark);
      if (z % 8 === 0) B.put(hx, 3, z, PALETTE.barkLight);
    }
  }
  return g;
}

/* =========================================================================
 *  7. ЗЕМЛЯ — базовый слой + дальние холмы
 * ====================================================================== */
function buildGround(B, R) {
  const rng = makeRng(404);
  const EX = PLOT_X, EZN = PLOT_ZN, EZS = PLOT_ZS;   // прямоугольный участок
  const HX = EX + 16, HZN = EZN + 16, HZS = EZS + 16; // внешние холмы
  for (let x = -HX; x <= HX; x++)
    for (let z = -HZN; z <= HZS; z++) {
      // Земля — БАЗОВЫЙ слой: пишем только в свободные клетки. Додзё, сад, пруд,
      // стена и деревья строятся раньше/позже и сами решают, что здесь будет.
      // (Раньше здесь было жёсткое вырезание зоны додзё |x|<=HALF+2 && |z|<=HALF+5,
      //  а цоколь додзё кончается на HALF+1 — из-за разницы в 1..4 клетки вокруг
      //  додзё оставалось 287 пустых колонок: сквозь них было видно небо.)
      // Метрика участка — Чебышёв (прямоугольник), а не круг: участок вытянут
      // на юг аллеей, и круглый край оставлял бы по бокам аллеи обрывы.
      const t = Math.max(Math.abs(x) / EX, (z >= 0 ? z / EZS : -z / EZN));
      if (t > 1) {
        // дальние холмы: пологий подъём СНАРУЖИ и обрыв вниз по краю диорамы
        const k = (t - 1) * EX / 10;
        const h = Math.min(5, Math.floor(k * 2));
        for (let y = -2; y <= h; y++)
          B.putIfEmpty(x, y, z, y === h ? PALETTE.grass : PALETTE.grassDark);
        continue;
      }
      const n = rng();
      B.putIfEmpty(x, 0, z, n < 0.14 ? PALETTE.grassDark
        : n < 0.22 ? PALETTE.moss : PALETTE.grass);
    }
}


/* =========================================================================
 *  8. ПУБЛИЧНАЯ ФУНКЦИЯ — точка входа
 * ====================================================================== */
export function createVoxelJapan({ voxel = 0.5, seed = 1337, water = true } = {}) {
  const B = new VoxelBuilder(voxel);
  const root = new THREE.Group();
  root.name = 'VoxelJapan';

  // 8.1 Додзё (центр) — задаёт габариты всей композиции
  const dojo = buildDojo(B);
  const R = { HALF: dojo.HALF, top1: dojo.top1, top2: dojo.top2, ridgeY: dojo.ridgeY };

  // 8.2 Земля, зен-сад (запад), пруд с мостом (юго-восток)
  buildGround(B, R);
  root.add(buildZenGarden(B, -(R.HALF + 16), 6, 11, 9, seed + 1));
  root.add(buildPondAndBridge(B, R.HALF + 14, -R.HALF - 8, 13, 10, seed + 2));

  // 8.3 Сакура: герой у додзё + несколько по участку и вдоль южной аллеи
  buildSakura(B, -R.HALF - 5,  R.HALF + 4,  1.5, seed + 3);
  buildSakura(B,  R.HALF + 6,  R.HALF + 8,  1.0, seed + 4);
  buildSakura(B, -R.HALF - 22, -R.HALF - 4, 1.2, seed + 5);
  buildSakura(B,  R.HALF + 28,  R.HALF - 6, 0.9, seed + 6);
  buildSakura(B, -6, -R.HALF - 16, 1.1, seed + 7);
  buildSakura(B, -R.HALF - 15, R.HALF + 32, 1.3, seed + 8);   // аллея, запад (за изгородью)
  buildSakura(B,  R.HALF + 15, R.HALF + 48, 1.0, seed + 9);   // аллея, восток

  // 8.4 Декор (тории, фонари, дорожка, стена)
  root.add(buildDecor(B, R));

  // 8.5 Сборка всех кубов: один InstancedMesh на цвет палитры
  const meshGroup = B.build('VoxelJapanMeshes');
  root.add(meshGroup);

  // 8.6 Полупрозрачная плёнка воды поверх — блик и ощущение глубины
  if (water) {
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshLambertMaterial({
        color: 0x3f9ec4, transparent: true, opacity: 0.4, depthWrite: false,
      })
    );
    mesh.name = 'Water';
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set((R.HALF + 14) * voxel, 0.5 * voxel, (-R.HALF - 8) * voxel);
    mesh.scale.set(28 * voxel, 22 * voxel, 1);
    mesh.renderOrder = 2;
    root.add(mesh);
  }

  root.add(dojo.group);   // пустая группа-маркер (для отладки/поиска)

  // 8.7 Данные для внешних потребителей (FPS-демо): воксельная карта и материалы
  const voxelMeshes = [];
  const materials = [];
  const seenHex = new Set();
  let mnx = Infinity, mny = Infinity, mnz = Infinity;
  let mxx = -Infinity, mxy = -Infinity, mxz = -Infinity;
  let voxelCount = 0;
  for (const child of meshGroup.children) {
    const v = child.userData.voxels;
    if (!v) continue;                                  // speck-меши пропускаем
    voxelMeshes.push(child);
    voxelCount += v.length / 3;
    const hex = child.userData.colorHex;
    if (!seenHex.has(hex)) { seenHex.add(hex); materials.push({ hex, material: child.material }); }
    for (let i = 0; i < v.length; i += 3) {
      if (v[i]     < mnx) mnx = v[i];
      if (v[i]     > mxx) mxx = v[i];
      if (v[i + 1] < mny) mny = v[i + 1];
      if (v[i + 1] > mxy) mxy = v[i + 1];
      if (v[i + 2] < mnz) mnz = v[i + 2];
      if (v[i + 2] > mxz) mxz = v[i + 2];
    }
  }

  root.userData = {
    voxel, seed,
    radiusVoxels: PLOT_ZS + 16,
    dojoHeight: R.ridgeY * voxel,
    parts: ['Dojo', 'ZenGarden', 'PondBridge', 'Decor', 'Water'],
    meshGroup, voxelMeshes, materials, voxelCount,
    bounds: { min: [mnx, mny, mnz], max: [mxx, mxy, mxz] },
    // Габариты участка для FPS-демо: спавн/камера/клампы считаются от них,
    // а не от магических чисел. Прямоугольник: X симметричен, Z вытянут на юг.
    plot: {
      x: PLOT_X, zn: PLOT_ZN, zs: PLOT_ZS,
      wallX: WALL_X, wallZS: WALL_ZS,
      dojoHalf: R.HALF, ridgeY: R.ridgeY,
    },
  };
  return root;
}

export default createVoxelJapan;

