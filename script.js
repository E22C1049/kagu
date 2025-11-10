import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';

/* 家具定義（増やす場合はここに追記） */
const furnitures = [
  { id: 'desk', label: '机', file: '机.glb' },
  { id: 'sofa', label: 'ソファ', file: 'ソファ.glb' },
];

/* DOM */
const canvas = document.getElementById('canvas');
const furnList = document.getElementById('furnList');
const partsList = document.getElementById('parts');
const current = document.getElementById('current');
const btnReset = document.getElementById('btnReset');
const btnExport = document.getElementById('btnExport');
const importJson = document.getElementById('importJson');
const uiColor = document.getElementById('uiColor');
const btnApplyColor = document.getElementById('btnApplyColor');
const btnIsolate = document.getElementById('btnIsolate');
const btnShowAll = document.getElementById('btnShowAll');
const sizeX = document.getElementById('sizeX');
const sizeY = document.getElementById('sizeY');
const sizeZ = document.getElementById('sizeZ');
const btnApplySize = document.getElementById('btnApplySize');
const sizeInputs = document.querySelectorAll('.sizeInput');

/* Three.js 基本 */
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(100, 100);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xffffff);

const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 200);
camera.position.set(2.5, 1.6, 3.2);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.target.set(0, 0.75, 0);

scene.add(new THREE.HemisphereLight(0xffffff, 0x8bbbd9, 0.6));
const dir = new THREE.DirectionalLight(0xffffff, 0.8);
dir.position.set(5, 8, 4);
scene.add(dir);

const grid = new THREE.GridHelper(10, 20, 0xdddddd, 0xeeeeee);
scene.add(grid);

/* === 視認性UP: 中心の床線（X=赤、Z=青） ※Yの太線は削除 === */
const AXIS_SIZE = 10;     // 長さ（グリッド幅程度）
const AXIS_THICK = 0.025; // 太さ
const axisGroup = new THREE.Group();
// X軸（床の中心横線）- #e74a3b
const xLine = new THREE.Mesh(
  new THREE.BoxGeometry(AXIS_SIZE, 0.002, AXIS_THICK),
  new THREE.MeshBasicMaterial({ color: '#e74a3b' })
);
xLine.position.set(0, 0.001, 0);
axisGroup.add(xLine);
// Z軸（床中央の縦線＝奥行方向）- 青
const zLine = new THREE.Mesh(
  new THREE.BoxGeometry(AXIS_THICK, 0.002, AXIS_SIZE),
  new THREE.MeshBasicMaterial({ color: '#3498db' })
);
zLine.position.set(0, 0.001, 0);
axisGroup.add(zLine);
scene.add(axisGroup);

/* 環境 */
const pmrem = new THREE.PMREMGenerator(renderer);
new RGBELoader()
  .setDataType(THREE.HalfFloatType)
  .load('https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/1k/venice_sunset_1k.hdr', (tex) => {
    scene.environment = pmrem.fromEquirectangular(tex).texture;
    tex.dispose();
  });

/* ローダー */
const gltfLoader = new GLTFLoader();
gltfLoader.setDRACOLoader(
  new DRACOLoader().setDecoderPath('https://cdn.jsdelivr.net/npm/three@0.159/examples/jsm/libs/draco/')
);
gltfLoader.setKTX2Loader(
  new KTX2Loader()
    .setTranscoderPath('https://cdn.jsdelivr.net/npm/three@0.159/examples/jsm/libs/basis/')
    .detectSupport(renderer)
);

/* CSS2D 寸法ラベル（□m） */
const viewport = document.getElementById('viewport');
const labelRenderer = new CSS2DRenderer();
labelRenderer.domElement.className = 'label-layer';
viewport.appendChild(labelRenderer.domElement);

function makeLabel(axis) { // 'x' | 'y' | 'z'
  const el = document.createElement('div');
  el.className = `dimLabel dim-${axis}`; // ラベル色はCSS（x:赤 / y:緑 / z:赤）のまま
  el.innerHTML = `<span class="value">—</span><span class="unit">m</span>`;
  const wrap = document.createElement('div');
  wrap.style.position = 'absolute';
  wrap.appendChild(el);
  labelRenderer.domElement.appendChild(wrap);
  return { el, wrap, obj: new THREE.Object3D() };
}
const labelX = makeLabel('x');
const labelY = makeLabel('y');
const labelZ = makeLabel('z');
scene.add(labelX.obj, labelY.obj, labelZ.obj);

/* ===== 外寸ガイド（矢印） ===== */
const GUIDE_THICK = 0.010;  // シャフト太さ
const GUIDE_OFFSET = 0.05;   // 家具からの離し量（m）←視認性用オフセット
const HEAD_BASE_H = 1;      // コーン基準高さ（スケール前）
const HEAD_BASE_R = 0.10;   // コーン基準半径（スケール前）

function makeDimGuide(color, axis) {
  const g = new THREE.Group();
  // シャフト
  let shaftGeom;
  if (axis === 'x') shaftGeom = new THREE.BoxGeometry(1, GUIDE_THICK, GUIDE_THICK);
  else if (axis === 'y') shaftGeom = new THREE.BoxGeometry(GUIDE_THICK, 1, GUIDE_THICK);
  else shaftGeom = new THREE.BoxGeometry(GUIDE_THICK, GUIDE_THICK, 1);
  const mat = new THREE.MeshBasicMaterial({ color, depthTest: true });
  const shaft = new THREE.Mesh(shaftGeom, mat);
  g.add(shaft);

  // 矢印ヘッド（両端）
  const headGeom = new THREE.ConeGeometry(HEAD_BASE_R, HEAD_BASE_H, 16);
  const head1 = new THREE.Mesh(headGeom, mat.clone());
  const head2 = new THREE.Mesh(headGeom, mat.clone());

  // Coneは+Y方向へ尖る → 軸に合わせて回転
  if (axis === 'x') {      // +X / -X
    head1.rotation.z = -Math.PI / 2;
    head2.rotation.z = Math.PI / 2;
  } else if (axis === 'y') { // +Y / -Y
    head2.rotation.x = Math.PI;
  } else {                // 'z'
    head1.rotation.x = Math.PI / 2;
    head2.rotation.x = -Math.PI / 2;
  }
  g.add(head1, head2);

  g.userData = { axis, shaft, head1, head2, color };
  return g;
}

// ガイド作成（X=赤 / Y=青 / Z=青）
const guideX = makeDimGuide('#e74a3b', 'x');
const guideY = makeDimGuide('#2ECC71', 'y');
const guideZ = makeDimGuide('#3498db', 'z');
scene.add(guideX, guideY, guideZ);

// ガイド更新
function updateGuide(guide, start, end) {
  const { axis, shaft, head1, head2 } = guide.userData;
  const dir = new THREE.Vector3().subVectors(end, start);
  const len = dir.length();
  if (len < 1e-6) { guide.visible = false; return; }
  guide.visible = true;

  const center = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5);
  guide.position.copy(center);

  const headLen = Math.min(0.25, Math.max(0.06, len * 0.10));
  const shaftLen = Math.max(0.001, len - headLen * 2);

  // シャフトのスケール（軸方向のみ長さ適用）
  if (axis === 'x') shaft.scale.set(shaftLen, 1, 1);
  else if (axis === 'y') shaft.scale.set(1, shaftLen, 1);
  else shaft.scale.set(1, 1, shaftLen);

  // ヘッドのスケーリング
  const headRadius = GUIDE_THICK * 1.8;
  const scaleR = headRadius / HEAD_BASE_R;
  const scaleH = headLen / HEAD_BASE_H;
  if (axis === 'x') { head1.scale.set(scaleH, scaleR, scaleR); head2.scale.set(scaleH, scaleR, scaleR); }
  else if (axis === 'y') { head1.scale.set(scaleR, scaleH, scaleR); head2.scale.set(scaleR, scaleH, scaleR); }
  else { head1.scale.set(scaleR, scaleR, scaleH); head2.scale.set(scaleR, scaleR, scaleH); }

  // 端点（ローカル座標）
  const offStart = new THREE.Vector3().subVectors(start, center);
  const offEnd = new THREE.Vector3().subVectors(end, center);
  head1.position.copy(offEnd);
  head2.position.copy(offStart);
}

/* 状態 */
let root = null, nodes = [], selected = null;
let initialState = {};
const bbox = new THREE.Box3(), sizeV = new THREE.Vector3(), centerV = new THREE.Vector3();
let isEditingSize = false;

/* ユーティリティ */
const h = (t, p = {}, ...c) => {
  const e = document.createElement(t);
  Object.entries(p).forEach(([k, v]) => {
    if (k === 'class') e.className = v;
    else if (k === 'html') e.innerHTML = v;
    else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2), v);
    else if (v !== null && v !== undefined) e.setAttribute(k, v);
  });
  c.forEach((x) => e.appendChild(typeof x === 'string' ? document.createTextNode(x) : x));
  return e;
};
const stdMat = (n) => (n?.isMesh ? (Array.isArray(n.material) ? n.material[0] : n.material) : null);
function worldToScreen(obj) {
  const v = obj.getWorldPosition(new THREE.Vector3()).clone().project(camera);
  const w = renderer.domElement.clientWidth, h = renderer.domElement.clientHeight;
  return { x: (v.x * 0.5 + 0.5) * w, y: (-v.y * 0.5 + 0.5) * h };
}

/* 家具UI生成 */
function buildFurnitureUI() {
  furnList.innerHTML = '';
  furnitures.forEach((f, i) => {
    const btn = h('button', { class: 'furn-btn', onclick: () => selectFurniture(f, btn) }, f.label);
    if (i === 0) btn.classList.add('active');
    furnList.appendChild(btn);
  });
}
async function selectFurniture(f, btnEl) {
  [...furnList.children].forEach((b) => b.classList.remove('active'));
  btnEl?.classList.add('active');
  await loadModel(f.file);
}

/* パーツ一覧 */
function refreshPartsList() {
  partsList.innerHTML = '';
  nodes.forEach((n) => {
    const item = h('div', { class: 'item' },
      h('input', {
        type: 'checkbox', ...(n.visible ? { checked: '' } : {}),
        oninput: (e) => { n.visible = e.target.checked; updateBBoxAndLabels(true); }
      }),
      h('span', { class: 'name' }, n.name || '(no-name)'),
      h('button', { onclick: () => selectNode(n) }, '選択')
    );
    partsList.appendChild(item);
  });
}
function selectNode(n) {
  selected = n;
  current.textContent = n ? (n.name || '(no-name)') : '—';
}

/* BBox/ラベル＆ガイド更新 */
function updateBBoxAndLabels(skipInput = false) {
  if (!root) return;
  bbox.setFromObject(root);
  bbox.getSize(sizeV); bbox.getCenter(centerV);

  if (!skipInput && !isEditingSize) {
    sizeX.value = sizeV.x.toFixed(2);
    sizeY.value = sizeV.y.toFixed(2);
    sizeZ.value = sizeV.z.toFixed(2);
  }
  // ラベル値
  labelX.el.querySelector('.value').textContent = sizeV.x.toFixed(2);
  labelY.el.querySelector('.value').textContent = sizeV.y.toFixed(2);
  labelZ.el.querySelector('.value').textContent = sizeV.z.toFixed(2);

  // ラベル位置（辺の中点）
  const { min, max } = bbox;
  labelX.obj.position.set((min.x + max.x) / 2, min.y, max.z);
  labelZ.obj.position.set(max.x, min.y, (min.z + max.z) / 2);
  labelY.obj.position.set(min.x, (min.y + max.y) / 2, (min.z + max.z) / 2);

  // DOM座標追従
  [labelX, labelY, labelZ].forEach((L) => {
    const s = worldToScreen(L.obj);
    L.wrap.style.left = s.x + 'px';
    L.wrap.style.top = s.y + 'px';
  });

  // ==== 矢印ガイド（家具から少し離して表示） ====
  const EPS = 0.002; // 床からの浮かせ
  // X：手前の面より少し手前（z=max.z + GUIDE_OFFSET）
  updateGuide(
    guideX,
    new THREE.Vector3(min.x, min.y + EPS, max.z + GUIDE_OFFSET),
    new THREE.Vector3(max.x, min.y + EPS, max.z + GUIDE_OFFSET)
  );
  // Z：右側の面より少し右（x=max.x + GUIDE_OFFSET）
  updateGuide(
    guideZ,
    new THREE.Vector3(max.x + GUIDE_OFFSET, min.y + EPS, min.z),
    new THREE.Vector3(max.x + GUIDE_OFFSET, min.y + EPS, max.z)
  );
  // Y：左側の面より少し左（x=min.x - GUIDE_OFFSET）
  updateGuide(
    guideY,
    new THREE.Vector3(min.x - GUIDE_OFFSET, min.y, (min.z + max.z) / 2),
    new THREE.Vector3(min.x - GUIDE_OFFSET, max.y, (min.z + max.z) / 2)
  );
}

/* 外寸適用 */
function applySize() {
  if (!root) return;
  bbox.setFromObject(root);
  const now = new THREE.Vector3(); bbox.getSize(now);
  const tx = Math.max(0.001, parseFloat(sizeX.value) || now.x);
  const ty = Math.max(0.001, parseFloat(sizeY.value) || now.y);
  const tz = Math.max(0.001, parseFloat(sizeZ.value) || now.z);
  root.scale.multiply(new THREE.Vector3(tx / now.x, ty / now.y, tz / now.z));
  updateBBoxAndLabels();
}
btnApplySize.addEventListener('click', applySize);
sizeInputs.forEach((inp) => {
  inp.addEventListener('focus', () => (isEditingSize = true));
  inp.addEventListener('blur', () => { isEditingSize = false; });
  inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { isEditingSize = false; applySize(); } });
});

/* 色適用（選択なし→全体） */
btnApplyColor.addEventListener('click', () => {
  const targets = selected ? [selected] : nodes;
  targets.forEach((n) => {
    const m = stdMat(n); if (!m) return;
    (m.color ||= new THREE.Color()).set(uiColor.value);
    m.needsUpdate = true;
  });
});

/* モデル読込（日本語ファイル名OK） */
async function loadModel(urlRaw) {
  try {
    const base = new URL('.', window.location.href);
    const abs = new URL(urlRaw.trim(), base).href; // これで十分（追加の encodeURI は不要）

    if (root) {
      scene.remove(root);
      root.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material?.dispose) o.material.dispose(); });
    }
    nodes = []; selected = null; initialState = {}; current.textContent = '—';

    const gltf = await new Promise((res, rej) => gltfLoader.load(abs, res, undefined, rej));
    root = gltf.scene; scene.add(root);

    root.traverse((o) => {
      if (o.isMesh) {
        nodes.push(o);
        const m = stdMat(o);
        initialState[o.uuid] = { visible: o.visible, color: m?.color?.getHex?.() ?? null, name: o.name || '' };
      }
    });

    // カメラ合わせ
    const b = new THREE.Box3().setFromObject(root), s = new THREE.Vector3(), c = new THREE.Vector3();
    b.getSize(s); b.getCenter(c);
    controls.target.copy(c);
    const maxDim = Math.max(s.x, s.y, s.z);
    const camZ = (maxDim * 1.7) / Math.tan((camera.fov * Math.PI) / 360);
    camera.position.set(c.x + camZ * 0.25, c.y + maxDim * 0.8, c.z + camZ);
    camera.lookAt(c); controls.update();

    refreshPartsList();
    updateBBoxAndLabels();
  } catch (err) {
    console.error('[GLB load failed]', err);
    alert('モデルの読み込みに失敗しました。GLBの配置とファイル名を確認してください。');
  }
}

/* 上部ボタン */
btnReset.addEventListener('click', () => {
  nodes.forEach((n) => {
    const st = initialState[n.uuid]; if (!st) return;
    n.visible = st.visible;
    const m = stdMat(n);
    if (m && st.color != null) { m.color.setHex(st.color); m.needsUpdate = true; }
  });
  if (root) root.scale.set(1, 1, 1);
  refreshPartsList(); updateBBoxAndLabels();
});
btnExport.addEventListener('click', () => {
  const data = nodes.map((n) => {
    const m = stdMat(n);
    return { uuid: n.uuid, name: n.name || '', visible: n.visible, material: m ? { color: m.color?.getHex?.() ?? null } : null };
  });
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'furniture-config.json'; a.click(); URL.revokeObjectURL(a.href);
});
importJson.addEventListener('change', async (e) => {
  const f = e.target.files?.[0]; if (!f) return;
  const text = await f.text();
  let data = [];
  try { data = JSON.parse(text); } catch { alert('JSONの読み込みに失敗しました'); return; }
  const map = new Map(data.map((d) => [d.uuid, d]));
  nodes.forEach((n) => {
    const d = map.get(n.uuid); if (!d) return;
    n.visible = !!d.visible;
    const m = stdMat(n);
    if (m && d.material && d.material.color != null) { m.color.setHex(d.material.color); m.needsUpdate = true; }
  });
  refreshPartsList(); updateBBoxAndLabels(true);
});
btnIsolate.addEventListener('click', () => { if (!selected) return; nodes.forEach((n) => (n.visible = n === selected)); refreshPartsList(); updateBBoxAndLabels(true); });
btnShowAll.addEventListener('click', () => { nodes.forEach((n) => (n.visible = true)); refreshPartsList(); updateBBoxAndLabels(true); });

/* レイアウト＆ループ */
function resize() {
  const w = window.innerWidth - 320 - 360 - 12 * 2 - 12 * 2;
  const h = window.innerHeight - 90;
  renderer.setSize(Math.max(360, w), Math.max(320, h));
  labelRenderer.setSize(renderer.domElement.clientWidth, renderer.domElement.clientHeight);
  labelRenderer.domElement.style.left = renderer.domElement.offsetLeft + 'px';
  labelRenderer.domElement.style.top = renderer.domElement.offsetTop + 'px';
  camera.aspect = renderer.domElement.clientWidth / renderer.domElement.clientHeight;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);

renderer.setAnimationLoop(() => {
  controls.update();
  updateBBoxAndLabels(true); // 入力編集中の上書きはスキップ
  labelRenderer.render(scene, camera);
  renderer.render(scene, camera);
});

/* 起動：UI生成→最初の家具を自動表示 */
resize();
buildFurnitureUI();
selectFurniture(furnitures[0], furnList.firstElementChild).catch((err) => {
  console.error(err);
  alert('モデルの読み込みに失敗しました。GLBの配置とファイル名を確認してください。');
});
