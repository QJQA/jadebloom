// 手串圆环：布局计算 + 交互（点选/拖拽加入、圆环内拖拽换序、选中/删除/改尺寸）

const GAP_MM = 0.6;
const MIN_PX_PER_MM = 1.6;
const MAX_PX_PER_MM = 11;
const MIN_RING_RADIUS_MM = 18; // 珠子很少时也保持这个最小半径，避免挤成一团看起来像方块

let ringBeads = []; // { instanceId, type, sizeMm, seed }
let nextInstanceId = 1;
let selectedInstanceId = null;
let dragging = null; // { mode:'new'|'existing', type, instanceId, previewIndex, moved, clientX, clientY }
let lastPositions = []; // 最近一次 render() 计算出的屏幕坐标，供命中测试使用
let lastGeom = { cx: 0, cy: 0, pxPerMm: MIN_PX_PER_MM };

let canvas, ctx, ghostEl, infoEl, quickActionsLabelEl, sizeButtonsEl, quickActionsEl, toolbarEl;

// ---------- 纯计算：布局 ----------

function ringCircumferenceMm(beadsArr) {
  if (beadsArr.length === 0) return 0;
  return beadsArr.reduce((sum, b) => sum + b.sizeMm, 0) + beadsArr.length * GAP_MM;
}

// 圆环半径永远不小于 MIN_RING_RADIUS_MM，这样珠子再少也始终排成一个看得出来的圆，不会挤成方块/多边形
function ringRadiusMm(beadsArr) {
  const circumferenceMm = ringCircumferenceMm(beadsArr);
  const naturalRadiusMm = circumferenceMm / (2 * Math.PI);
  return Math.max(naturalRadiusMm, MIN_RING_RADIUS_MM);
}

function fitPxPerMm(beadsArr, availableRadiusPx) {
  const radiusMm = ringRadiusMm(beadsArr);
  const maxBeadRadiusMm = beadsArr.length > 0 ? Math.max(...beadsArr.map((b) => b.sizeMm)) / 2 : 4;
  const neededRadiusMm = radiusMm + maxBeadRadiusMm + 2;
  let pxPerMm = availableRadiusPx / neededRadiusMm;
  return Math.max(MIN_PX_PER_MM, Math.min(MAX_PX_PER_MM, pxPerMm));
}

// 返回 { positions:[{x,y,r,angle,bead}], boundaries:[...], circumferenceMm, radiusPx }
function computeRingLayout(beadsArr, pxPerMm, cx, cy) {
  const circumferenceMm = ringCircumferenceMm(beadsArr);
  const radiusMm = ringRadiusMm(beadsArr);
  const radiusPx = radiusMm * pxPerMm;

  const positions = [];
  const boundaries = [];
  let angle = -Math.PI / 2;

  beadsArr.forEach((bead) => {
    const arcMm = bead.sizeMm + GAP_MM;
    const deltaAngle = circumferenceMm > 0 ? (arcMm / circumferenceMm) * Math.PI * 2 : 0;
    boundaries.push(angle);
    const centerAngle = angle + deltaAngle / 2;
    const x = cx + radiusPx * Math.cos(centerAngle);
    const y = cy + radiusPx * Math.sin(centerAngle);
    const r = (bead.sizeMm / 2) * pxPerMm;
    positions.push({ x, y, r, angle: centerAngle, bead });
    angle += deltaAngle;
  });

  return { positions, boundaries, circumferenceMm, radiusPx };
}

function normalizeAngle(a) {
  let x = a % (Math.PI * 2);
  if (x < 0) x += Math.PI * 2;
  return x;
}

function circularDist(a, b) {
  const d = Math.abs(normalizeAngle(a) - normalizeAngle(b));
  return Math.min(d, Math.PI * 2 - d);
}

// 给定指针角度，在 boundaries 中找最近的插入位置（返回下标 0..boundaries.length）
function nearestBoundaryIndex(theta, boundaries) {
  if (boundaries.length === 0) return 0;
  let bestIdx = 0;
  let bestDist = Infinity;
  boundaries.forEach((b, i) => {
    const d = circularDist(theta, b);
    if (d < bestDist) {
      bestDist = d;
      bestIdx = i;
    }
  });
  return bestIdx;
}

// ---------- 渲染 ----------

function getStageSize() {
  const rect = canvas.getBoundingClientRect();
  return { w: rect.width, h: rect.height };
}

function resizeCanvas() {
  const dpr = window.devicePixelRatio || 1;
  const { w, h } = getStageSize();
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  render();
}

function drawBackground(w, h) {
  const grad = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.08, w / 2, h / 2, Math.min(w, h) * 0.62);
  grad.addColorStop(0, '#FFFFFF');
  grad.addColorStop(1, '#F1EBE9');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);
}

function render() {
  const { w, h } = getStageSize();
  ctx.clearRect(0, 0, w, h);
  drawBackground(w, h);

  const cx = w / 2;
  const cy = h / 2;
  const availableRadiusPx = Math.min(w, h) * 0.36;
  const pxPerMm = fitPxPerMm(ringBeads, availableRadiusPx);
  const { positions, boundaries, radiusPx } = computeRingLayout(ringBeads, pxPerMm, cx, cy);
  lastPositions = positions;
  lastGeom = { cx, cy, pxPerMm };

  if (ringBeads.length === 0) {
    ctx.save();
    ctx.setLineDash([6, 8]);
    ctx.strokeStyle = 'rgba(140,130,130,0.4)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(cx, cy, availableRadiusPx * 0.7, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
    const hintFontSize = Math.max(11, Math.min(15, Math.min(w, h) * 0.034));
    ctx.fillStyle = 'rgba(90,85,85,0.55)';
    ctx.font = `${hintFontSize}px -apple-system, sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText('从下方选择珠子', cx, cy - hintFontSize * 0.7);
    ctx.fillText('点一下即可加入', cx, cy + hintFontSize * 0.7);
    updateInfoText();
    updateQuickActions();
    updateToolbarVisibility();
    return;
  }

  if (positions.length > 1) {
    ctx.beginPath();
    ctx.arc(cx, cy, radiusPx, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(140,130,130,0.3)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }

  positions.forEach((p) => {
    const isDraggedExisting = dragging && dragging.mode === 'existing' && dragging.moved && dragging.instanceId === p.bead.instanceId;
    if (isDraggedExisting) return; // 拖拽中的珠子跟随指针单独绘制
    drawBead(ctx, p.x, p.y, p.r, p.bead.type, p.bead.seed);
    if (p.bead.instanceId === selectedInstanceId) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r + 5, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(185,135,149,0.9)';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  });

  // 拖拽预览：插入位置的缺口提示
  if (dragging && dragging.moved && dragging.previewIndex !== null) {
    const others = dragging.mode === 'existing'
      ? ringBeads.filter((b) => b.instanceId !== dragging.instanceId)
      : ringBeads;
    const previewSize = dragging.mode === 'new' ? DEFAULT_SIZE_MM : ringBeads.find((b) => b.instanceId === dragging.instanceId).sizeMm;
    const simulated = others.slice();
    const idx = Math.min(dragging.previewIndex, simulated.length);
    simulated.splice(idx, 0, { instanceId: '__preview__', type: null, sizeMm: previewSize, seed: 0 });
    const { positions: previewPositions } = computeRingLayout(simulated, pxPerMm, cx, cy);
    const slot = previewPositions.find((p) => p.bead.instanceId === '__preview__');
    if (slot) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(slot.x, slot.y, slot.r, 0, Math.PI * 2);
      ctx.setLineDash([4, 5]);
      ctx.strokeStyle = 'rgba(185,135,149,0.9)';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.restore();
    }
  }

  // 拖拽中的现有珠子，跟随指针绘制在最上层
  if (dragging && dragging.mode === 'existing' && dragging.moved) {
    const rect = canvas.getBoundingClientRect();
    const bead = ringBeads.find((b) => b.instanceId === dragging.instanceId);
    const p = positions.find((pp) => pp.bead.instanceId === dragging.instanceId);
    const r = p ? p.r : (bead.sizeMm / 2) * pxPerMm;
    drawBead(ctx, dragging.clientX - rect.left, dragging.clientY - rect.top, r, bead.type, bead.seed);
  }

  updateInfoText();
  updateQuickActions();
  updateToolbarVisibility();
}

// ---------- 信息文案 ----------

function sizeHint(cm) {
  if (cm < 14) return '偏小，适合手腕纤细或儿童';
  if (cm < 16) return '女生常见手围区间';
  if (cm < 17) return '女生偏大 / 男生偏小';
  if (cm < 19) return '男生常见手围区间';
  return '偏大，注意佩戴松紧';
}

function updateInfoText() {
  if (!infoEl) return;
  if (ringBeads.length === 0) {
    infoEl.textContent = '还没有串上珠子';
    return;
  }
  const cm = ringCircumferenceMm(ringBeads) / 10;
  infoEl.textContent = `约 ${cm.toFixed(1)}cm · ${ringBeads.length} 颗珠子 · ${sizeHint(cm)}`;
}

function updateQuickActions() {
  if (!sizeButtonsEl) return;
  const bead = ringBeads.find((b) => b.instanceId === selectedInstanceId);
  quickActionsEl.classList.toggle('hidden', !bead);
  if (!bead) return;
  quickActionsLabelEl.textContent = bead.type.name;
  sizeButtonsEl.querySelectorAll('button').forEach((btn) => {
    btn.classList.toggle('active', Number(btn.dataset.size) === bead.sizeMm);
  });
}

function updateToolbarVisibility() {
  if (!toolbarEl) return;
  toolbarEl.classList.toggle('hidden', ringBeads.length === 0);
}

// ---------- 增删改 ----------

function makeInstance(type, sizeMm) {
  return { instanceId: nextInstanceId++, type, sizeMm, seed: hashString(type.id + '-' + nextInstanceId) };
}

function addBeadToEnd(type, sizeMm) {
  ringBeads.push(makeInstance(type, sizeMm));
  render();
}

function insertBeadAt(type, sizeMm, index) {
  const inst = makeInstance(type, sizeMm);
  ringBeads.splice(Math.min(index, ringBeads.length), 0, inst);
  render();
}

function removeSelectedBead() {
  if (selectedInstanceId === null) return;
  ringBeads = ringBeads.filter((b) => b.instanceId !== selectedInstanceId);
  selectedInstanceId = null;
  render();
}

function clearRing() {
  ringBeads = [];
  selectedInstanceId = null;
  render();
}

function resizeSelectedBead(sizeMm) {
  const bead = ringBeads.find((b) => b.instanceId === selectedInstanceId);
  if (!bead) return;
  bead.sizeMm = sizeMm;
  render();
}

// ---------- 拖拽/点选交互 ----------

function angleFromCenter(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  const x = clientX - rect.left - lastGeom.cx;
  const y = clientY - rect.top - lastGeom.cy;
  return Math.atan2(y, x);
}

function updateNewDragPreview(clientX, clientY) {
  const theta = angleFromCenter(clientX, clientY);
  const { boundaries } = computeRingLayout(ringBeads, lastGeom.pxPerMm, lastGeom.cx, lastGeom.cy);
  dragging.previewIndex = boundaries.length === 0 ? 0 : nearestBoundaryIndex(theta, boundaries);
}

function updateExistingDragPreview(clientX, clientY) {
  const others = ringBeads.filter((b) => b.instanceId !== dragging.instanceId);
  const theta = angleFromCenter(clientX, clientY);
  const { boundaries } = computeRingLayout(others, lastGeom.pxPerMm, lastGeom.cx, lastGeom.cy);
  dragging.previewIndex = boundaries.length === 0 ? 0 : nearestBoundaryIndex(theta, boundaries);
}

function hitTestBead(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  const x = clientX - rect.left;
  const y = clientY - rect.top;
  for (let i = lastPositions.length - 1; i >= 0; i--) {
    const p = lastPositions[i];
    if (Math.hypot(p.x - x, p.y - y) <= p.r) return p.bead.instanceId;
  }
  return null;
}

function showGhost(type, clientX, clientY) {
  ghostEl.style.display = 'block';
  ghostEl.width = 64;
  ghostEl.height = 64;
  const gctx = ghostEl.getContext('2d');
  gctx.clearRect(0, 0, 64, 64);
  drawBead(gctx, 32, 32, 26, type, hashString(type.id));
  moveGhost(clientX, clientY);
}

function moveGhost(clientX, clientY) {
  ghostEl.style.left = `${clientX - 32}px`;
  ghostEl.style.top = `${clientY - 32}px`;
}

function hideGhost() {
  ghostEl.style.display = 'none';
}

function setupCanvasPointerEvents() {
  canvas.addEventListener('pointerdown', (e) => {
    const hitId = hitTestBead(e.clientX, e.clientY);
    if (hitId === null) {
      if (selectedInstanceId !== null) {
        selectedInstanceId = null;
        render();
      }
      return;
    }
    const startX = e.clientX;
    const startY = e.clientY;
    dragging = { mode: 'existing', instanceId: hitId, previewIndex: null, moved: false, clientX: startX, clientY: startY };

    function onMove(ev) {
      const moved = Math.hypot(ev.clientX - startX, ev.clientY - startY) > 6;
      dragging.moved = dragging.moved || moved;
      dragging.clientX = ev.clientX;
      dragging.clientY = ev.clientY;
      if (dragging.moved) updateExistingDragPreview(ev.clientX, ev.clientY);
      render();
    }
    function onUp(ev) {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      if (!dragging.moved) {
        selectedInstanceId = hitId;
      } else if (dragging.previewIndex !== null) {
        const idx = ringBeads.findIndex((b) => b.instanceId === hitId);
        const [bead] = ringBeads.splice(idx, 1);
        ringBeads.splice(Math.min(dragging.previewIndex, ringBeads.length), 0, bead);
      }
      dragging = null;
      render();
    }
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  });
}

function attachPaletteSwatch(swatchEl, type) {
  swatchEl.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    const startX = e.clientX;
    const startY = e.clientY;
    dragging = { mode: 'new', type, previewIndex: null, moved: false, clientX: startX, clientY: startY };
    showGhost(type, e.clientX, e.clientY);

    function onMove(ev) {
      const moved = Math.hypot(ev.clientX - startX, ev.clientY - startY) > 6;
      dragging.moved = dragging.moved || moved;
      dragging.clientX = ev.clientX;
      dragging.clientY = ev.clientY;
      moveGhost(ev.clientX, ev.clientY);
      if (dragging.moved) updateNewDragPreview(ev.clientX, ev.clientY);
      render();
    }
    function onUp(ev) {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      hideGhost();
      const rect = canvas.getBoundingClientRect();
      const overCanvas = ev.clientX >= rect.left && ev.clientX <= rect.right && ev.clientY >= rect.top && ev.clientY <= rect.bottom;
      if (!dragging.moved) {
        addBeadToEnd(type, DEFAULT_SIZE_MM);
      } else if (overCanvas && dragging.previewIndex !== null) {
        insertBeadAt(type, DEFAULT_SIZE_MM, dragging.previewIndex);
      }
      dragging = null;
      render();
    }
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  });
}

// ---------- 珠子库 UI ----------

function buildPalette(selectEl, gridEl) {
  const allCategory = {
    id: 'all',
    name: '全部分类',
    beads: BEAD_CATEGORIES.flatMap((cat) => cat.beads),
  };
  const tabList = [...BEAD_CATEGORIES, allCategory];

  tabList.forEach((cat) => {
    const option = document.createElement('option');
    option.value = cat.id;
    option.textContent = cat.name;
    selectEl.appendChild(option);
  });

  selectEl.addEventListener('change', () => {
    const cat = tabList.find((c) => c.id === selectEl.value);
    renderGrid(cat);
  });

  function renderGrid(cat) {
    gridEl.innerHTML = '';
    cat.beads.forEach((type) => {
      const item = document.createElement('div');
      item.className = 'bead-swatch';
      const c = document.createElement('canvas');
      item.appendChild(c);
      const label = document.createElement('span');
      label.textContent = type.name;
      item.appendChild(label);
      gridEl.appendChild(item);
      renderBeadSwatch(c, type);
      attachPaletteSwatch(item, type);
    });
  }

  renderGrid(BEAD_CATEGORIES[0]);
}

// ---------- 初始化 ----------

function initApp() {
  canvas = document.getElementById('ringCanvas');
  ctx = canvas.getContext('2d');
  ghostEl = document.getElementById('dragGhost');
  infoEl = document.getElementById('ringInfo');
  quickActionsLabelEl = document.getElementById('quickActionsLabel');
  sizeButtonsEl = document.getElementById('sizeButtons');
  quickActionsEl = document.getElementById('quickActions');
  toolbarEl = document.getElementById('appToolbar');

  const selectEl = document.getElementById('paletteSelect');
  const gridEl = document.getElementById('paletteGrid');
  buildPalette(selectEl, gridEl);

  sizeButtonsEl.querySelectorAll('button').forEach((btn) => {
    btn.addEventListener('click', () => resizeSelectedBead(Number(btn.dataset.size)));
  });

  document.getElementById('deleteSelectedBtn').addEventListener('click', removeSelectedBead);
  document.getElementById('clearBtn').addEventListener('click', clearRing);
  document.getElementById('exportBtn').addEventListener('click', () => exportRingAsImage(ringBeads));

  setupCanvasPointerEvents();
  window.addEventListener('resize', resizeCanvas);
  resizeCanvas();
}

document.addEventListener('DOMContentLoaded', initApp);
