// JADÉ BLOOM 手串设计器：布局、状态、交互与本地保存

const GAP_MM = 0.6;
const INITIAL_PX_PER_MM = 1.6;
const MAX_PX_PER_MM = 11;
const MIN_RING_RADIUS_MM = 18;
const STORAGE_KEY = 'jade-bloom-bracelet-v2';
const MAX_HISTORY = 50;

let ringBeads = []; // { instanceId, type, sizeMm, seed }
let nextInstanceId = 1;
let selectedInstanceId = null;
let dragging = null;
let lastPositions = [];
let lastGeom = { cx: 0, cy: 0, pxPerMm: INITIAL_PX_PER_MM };
let undoStack = [];
let redoStack = [];
let toastTimer = null;
let toastActionCallback = null;
let clearArmTimer = null;
let clearArmed = false;

let canvas, ctx, ghostEl, infoEl, quickActionsLabelEl, sizeButtonsEl, quickActionsEl;
let undoBtnEl, redoBtnEl, clearBtnEl, exportBtnEl;
let compositionBarEl, toastEl, toastMessageEl, toastActionEl;

const PRESETS = {
  rose: ['pink-quartz', 'pink-quartz', 'rhodochrosite', 'clear-quartz', 'pink-quartz', 'peach-moon'],
  moon: ['moonstone', 'aquamarine', 'clear-quartz', 'moonstone', 'amethyst', 'aquamarine'],
  earth: ['smoky-quartz', 'tiger-eye', 'obsidian', 'smoky-quartz', 'aventurine', 'tiger-eye'],
};

const TEXTURE_LABELS = {
  clear: '通透',
  catseye: '月光',
  sparkle: '砂金',
  banded: '纹带',
  stone: '原石',
};

// ---------- 布局计算 ----------

function ringCircumferenceMm(beadsArr) {
  if (beadsArr.length === 0) return 0;
  return beadsArr.reduce((sum, b) => sum + b.sizeMm, 0) + beadsArr.length * GAP_MM;
}

function ringRadiusMm(beadsArr) {
  const naturalRadiusMm = ringCircumferenceMm(beadsArr) / (2 * Math.PI);
  return Math.max(naturalRadiusMm, MIN_RING_RADIUS_MM);
}

function fitPxPerMm(beadsArr, availableRadiusPx) {
  const radiusMm = ringRadiusMm(beadsArr);
  const maxBeadRadiusMm = beadsArr.length ? Math.max(...beadsArr.map((b) => b.sizeMm)) / 2 : 4;
  const pxPerMm = availableRadiusPx / (radiusMm + maxBeadRadiusMm + 2);
  return Math.min(MAX_PX_PER_MM, pxPerMm);
}

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
    const centerAngle = beadsArr.length === 1 ? -Math.PI / 2 : angle + deltaAngle / 2;
    positions.push({
      x: cx + radiusPx * Math.cos(centerAngle),
      y: cy + radiusPx * Math.sin(centerAngle),
      r: (bead.sizeMm / 2) * pxPerMm,
      angle: centerAngle,
      bead,
    });
    angle += deltaAngle;
  });

  return { positions, boundaries, circumferenceMm, radiusPx };
}

function normalizeAngle(a) {
  let value = a % (Math.PI * 2);
  if (value < 0) value += Math.PI * 2;
  return value;
}

function circularDist(a, b) {
  const d = Math.abs(normalizeAngle(a) - normalizeAngle(b));
  return Math.min(d, Math.PI * 2 - d);
}

function nearestBoundaryIndex(theta, boundaries) {
  if (!boundaries.length) return 0;
  let bestIdx = 0;
  let bestDist = Infinity;
  boundaries.forEach((boundary, index) => {
    const dist = circularDist(theta, boundary);
    if (dist < bestDist) {
      bestDist = dist;
      bestIdx = index;
    }
  });
  return bestIdx;
}

// ---------- 状态与历史 ----------

function serializeRing() {
  return ringBeads.map((bead) => ({
    instanceId: bead.instanceId,
    typeId: bead.type.id,
    sizeMm: bead.sizeMm,
    seed: bead.seed,
  }));
}

function hydrateRing(data) {
  if (!Array.isArray(data)) return [];
  return data.map((item) => {
    const type = findBeadType(item.typeId);
    if (!type) return null;
    return {
      instanceId: Number(item.instanceId) || nextInstanceId++,
      type,
      sizeMm: BEAD_SIZES_MM.includes(Number(item.sizeMm)) ? Number(item.sizeMm) : DEFAULT_SIZE_MM,
      seed: Number(item.seed) || hashString(`${item.typeId}-${item.instanceId}`),
    };
  }).filter(Boolean);
}

function snapshotState() {
  return { beads: serializeRing(), selectedInstanceId };
}

function restoreSnapshot(snapshot) {
  ringBeads = hydrateRing(snapshot?.beads || []);
  selectedInstanceId = ringBeads.some((b) => b.instanceId === snapshot?.selectedInstanceId)
    ? snapshot.selectedInstanceId
    : null;
  nextInstanceId = Math.max(1, ...ringBeads.map((b) => b.instanceId + 1));
  render();
}

function commitHistory() {
  undoStack.push(snapshotState());
  if (undoStack.length > MAX_HISTORY) undoStack.shift();
  redoStack = [];
}

function undo() {
  if (!undoStack.length) return;
  redoStack.push(snapshotState());
  restoreSnapshot(undoStack.pop());
  showToast('已撤销上一步');
}

function redo() {
  if (!redoStack.length) return;
  undoStack.push(snapshotState());
  restoreSnapshot(redoStack.pop());
  showToast('已恢复设计');
}

function persistState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      beads: serializeRing(),
    }));
  } catch (_) {
    // 本地存储不可用时不影响设计器本身。
  }
}

function restorePersistedState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const saved = JSON.parse(raw);
    ringBeads = hydrateRing(saved.beads);
    nextInstanceId = Math.max(1, ...ringBeads.map((b) => b.instanceId + 1));
  } catch (_) {
    ringBeads = [];
  }
}

// ---------- 渲染 ----------

function getStageSize() {
  const rect = canvas.getBoundingClientRect();
  return { w: rect.width, h: rect.height };
}

function resizeCanvas() {
  const dpr = window.devicePixelRatio || 1;
  const { w, h } = getStageSize();
  canvas.width = Math.max(1, Math.round(w * dpr));
  canvas.height = Math.max(1, Math.round(h * dpr));
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  render();
}

function drawBackground(w, h) {
  const base = ctx.createLinearGradient(0, 0, w, h);
  base.addColorStop(0, '#F7F3EE');
  base.addColorStop(0.52, '#FFFDFC');
  base.addColorStop(1, '#E8DED4');
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, w, h);

  const light = ctx.createRadialGradient(w * 0.42, h * 0.35, 0, w * 0.48, h * 0.45, Math.max(w, h) * 0.66);
  light.addColorStop(0, 'rgba(255,255,255,.9)');
  light.addColorStop(0.55, 'rgba(255,255,255,.15)');
  light.addColorStop(1, 'rgba(111,77,62,.08)');
  ctx.fillStyle = light;
  ctx.fillRect(0, 0, w, h);

  ctx.save();
  ctx.globalAlpha = 0.055;
  for (let y = 3; y < h; y += 9) {
    for (let x = (y % 18) + 3; x < w; x += 13) {
      ctx.fillStyle = (x + y) % 3 ? '#7F7068' : '#FFFFFF';
      ctx.fillRect(x, y, 0.7, 0.7);
    }
  }
  ctx.restore();
}

function drawElastic(cx, cy, radiusPx) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, radiusPx, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(102,82,72,.22)';
  ctx.lineWidth = 2.2;
  ctx.shadowColor = 'rgba(255,255,255,.8)';
  ctx.shadowBlur = 2;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, cy, radiusPx - 2.6, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(255,255,255,.5)';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.restore();
}

function render() {
  const { w, h } = getStageSize();
  ctx.clearRect(0, 0, w, h);
  drawBackground(w, h);

  const cx = w / 2;
  const cy = h * 0.51;
  const availableRadiusPx = Math.min(w, h) * 0.355;
  const pxPerMm = fitPxPerMm(ringBeads, availableRadiusPx);
  const { positions, boundaries, radiusPx } = computeRingLayout(ringBeads, pxPerMm, cx, cy);
  lastPositions = positions;
  lastGeom = { cx, cy, pxPerMm };

  if (!ringBeads.length) {
    ctx.save();
    ctx.setLineDash([4, 9]);
    ctx.strokeStyle = 'rgba(102,82,72,.23)';
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.arc(cx, cy, availableRadiusPx * 0.72, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    const titleSize = Math.max(14, Math.min(20, Math.min(w, h) * 0.04));
    ctx.fillStyle = 'rgba(55,47,43,.72)';
    ctx.font = `400 ${titleSize}px Georgia, "Songti SC", serif`;
    ctx.textAlign = 'center';
    ctx.fillText('开始你的晶石配方', cx, cy - 5);
    ctx.fillStyle = 'rgba(90,81,76,.5)';
    ctx.font = `400 ${Math.max(10, titleSize * .58)}px -apple-system, sans-serif`;
    ctx.fillText('轻触素材加入 · 拖动调整顺序', cx, cy + titleSize + 5);
    updateInterface();
    return;
  }

  if (positions.length > 1) drawElastic(cx, cy, radiusPx);

  positions.forEach((p) => {
    const isDragged = dragging && dragging.mode === 'existing' && dragging.moved && dragging.instanceId === p.bead.instanceId;
    if (isDragged) return;
    drawBead(ctx, p.x, p.y, p.r, p.bead.type, p.bead.seed);
    if (p.bead.instanceId === selectedInstanceId) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r + 6, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(112,73,82,.78)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([2, 3]);
      ctx.stroke();
      ctx.restore();
    }
  });

  if (dragging && dragging.moved && dragging.previewIndex !== null) {
    const others = dragging.mode === 'existing'
      ? ringBeads.filter((b) => b.instanceId !== dragging.instanceId)
      : ringBeads;
    const draggedBead = dragging.mode === 'existing'
      ? ringBeads.find((b) => b.instanceId === dragging.instanceId)
      : null;
    const previewSize = draggedBead ? draggedBead.sizeMm : DEFAULT_SIZE_MM;
    const simulated = others.slice();
    simulated.splice(Math.min(dragging.previewIndex, simulated.length), 0, {
      instanceId: '__preview__', type: null, sizeMm: previewSize, seed: 0,
    });
    const previewLayout = computeRingLayout(simulated, pxPerMm, cx, cy);
    const slot = previewLayout.positions.find((p) => p.bead.instanceId === '__preview__');
    if (slot) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(slot.x, slot.y, slot.r + 2, 0, Math.PI * 2);
      ctx.setLineDash([4, 5]);
      ctx.strokeStyle = 'rgba(112,73,82,.85)';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.restore();
    }
  }

  if (dragging && dragging.mode === 'existing' && dragging.moved) {
    const rect = canvas.getBoundingClientRect();
    const bead = ringBeads.find((b) => b.instanceId === dragging.instanceId);
    const original = positions.find((p) => p.bead.instanceId === dragging.instanceId);
    if (bead) {
      drawBead(
        ctx,
        dragging.clientX - rect.left,
        dragging.clientY - rect.top,
        original ? original.r : (bead.sizeMm / 2) * pxPerMm,
        bead.type,
        bead.seed,
      );
    }
  }

  updateInterface();
  void boundaries;
}

// ---------- 界面状态 ----------

function sizeMixSummary(beads) {
  const counts = new Map();
  beads.forEach((bead) => counts.set(bead.sizeMm, (counts.get(bead.sizeMm) || 0) + 1));
  const sizes = Array.from(counts.keys()).sort((a, b) => a - b);
  if (sizes.length === 1) return `${beads.length} 颗晶石 · ${sizes[0]}mm`;
  const dominantSize = sizes.reduce((best, size) => (
    counts.get(size) > counts.get(best) ? size : best
  ), sizes[0]);
  return `${beads.length} 颗晶石 · 以 ${dominantSize}mm 为主`;
}

function updateInterface() {
  if (!ringBeads.length) {
    infoEl.textContent = '还没有串上珠子';
  } else {
    infoEl.textContent = sizeMixSummary(ringBeads);
  }

  const bead = ringBeads.find((b) => b.instanceId === selectedInstanceId);
  quickActionsEl.classList.toggle('hidden', !bead);
  if (bead) {
    quickActionsLabelEl.textContent = bead.type.name;
    sizeButtonsEl.querySelectorAll('button').forEach((btn) => {
      btn.classList.toggle('active', Number(btn.dataset.size) === bead.sizeMm);
    });
  }

  undoBtnEl.disabled = !undoStack.length;
  redoBtnEl.disabled = !redoStack.length;
  clearBtnEl.disabled = !ringBeads.length;
  exportBtnEl.disabled = !ringBeads.length;
  canvas.setAttribute(
    'aria-label',
    ringBeads.length
      ? `手串设计画布，当前 ${ringBeads.length} 颗晶石。点击单颗可编辑，拖动可调整顺序。`
      : '空白手串设计画布。请从晶石素材库选择珠子。',
  );

  updateCompositionBar();
  persistState();
}

function updateCompositionBar() {
  compositionBarEl.innerHTML = '';
  if (!ringBeads.length) {
    const empty = document.createElement('span');
    empty.className = 'composition-empty';
    empty.textContent = '从右侧晶石库轻触添加，拖入画布可指定位置';
    compositionBarEl.appendChild(empty);
    return;
  }

  ringBeads.slice(0, 18).forEach((bead) => {
    const chip = document.createElement('span');
    chip.className = 'composition-chip';
    chip.style.background = `linear-gradient(145deg, ${bead.type.highlight}, ${bead.type.base} 58%, ${bead.type.shadow})`;
    chip.title = `${bead.type.name} ${bead.sizeMm}mm`;
    compositionBarEl.appendChild(chip);
  });
  if (ringBeads.length > 18) {
    const more = document.createElement('span');
    more.className = 'composition-more';
    more.textContent = `+${ringBeads.length - 18}`;
    compositionBarEl.appendChild(more);
  }
}

function showToast(message, actionLabel = '', action = null) {
  clearTimeout(toastTimer);
  toastMessageEl.textContent = message;
  toastActionEl.classList.toggle('hidden', !actionLabel || !action);
  toastActionEl.textContent = actionLabel;
  toastActionCallback = action;
  toastEl.classList.add('show');
  toastTimer = setTimeout(() => toastEl.classList.remove('show'), action ? 6000 : 3600);
}

// ---------- 增删改 ----------

function makeInstance(type, sizeMm = DEFAULT_SIZE_MM) {
  const id = nextInstanceId++;
  return { instanceId: id, type, sizeMm, seed: hashString(`${type.id}-${id}`) };
}

function addBeadToEnd(type, sizeMm = DEFAULT_SIZE_MM) {
  commitHistory();
  ringBeads.push(makeInstance(type, sizeMm));
  render();
}

function insertBeadAt(type, sizeMm, index) {
  commitHistory();
  ringBeads.splice(Math.min(index, ringBeads.length), 0, makeInstance(type, sizeMm));
  render();
}

function removeSelectedBead() {
  if (selectedInstanceId === null) return;
  commitHistory();
  ringBeads = ringBeads.filter((b) => b.instanceId !== selectedInstanceId);
  selectedInstanceId = null;
  render();
  showToast('已删除这颗晶石，可使用撤销恢复');
}

function clearRing() {
  if (!ringBeads.length) return;
  commitHistory();
  ringBeads = [];
  selectedInstanceId = null;
  render();
  showToast('设计已清空，可使用撤销恢复');
}

function resetClearArm() {
  clearArmed = false;
  clearTimeout(clearArmTimer);
  clearBtnEl.textContent = '清空设计';
}

function requestClearRing() {
  if (!ringBeads.length) return;
  if (clearArmed) {
    resetClearArm();
    clearRing();
    return;
  }
  clearArmed = true;
  clearBtnEl.textContent = '再次点击清空';
  showToast('再次点击“清空”确认操作');
  clearArmTimer = setTimeout(resetClearArm, 8000);
}

function resizeSelectedBead(sizeMm) {
  const bead = ringBeads.find((b) => b.instanceId === selectedInstanceId);
  if (!bead || bead.sizeMm === sizeMm) return;
  commitHistory();
  bead.sizeMm = sizeMm;
  render();
}

function applyPreset(presetId) {
  if (presetId === 'blank') {
    if (!ringBeads.length) {
      selectedInstanceId = null;
      render();
      showToast('从第一颗晶石开始你的自由设计');
      return;
    }
    commitHistory();
    ringBeads = [];
    selectedInstanceId = null;
    render();
    showToast('已进入自由设计，可使用撤销恢复原方案');
    return;
  }

  const ids = PRESETS[presetId];
  if (!ids) return;
  commitHistory();
  ringBeads = [];
  for (let i = 0; i < 18; i++) {
    const type = findBeadType(ids[i % ids.length]);
    if (type) ringBeads.push(makeInstance(type));
  }
  selectedInstanceId = null;
  render();
  showToast('灵感配方已加入，可继续自由调整');
}

// ---------- 指针交互 ----------

function angleFromCenter(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  return Math.atan2(clientY - rect.top - lastGeom.cy, clientX - rect.left - lastGeom.cx);
}

function updateNewDragPreview(clientX, clientY) {
  const layout = computeRingLayout(ringBeads, lastGeom.pxPerMm, lastGeom.cx, lastGeom.cy);
  dragging.previewIndex = layout.boundaries.length
    ? nearestBoundaryIndex(angleFromCenter(clientX, clientY), layout.boundaries)
    : 0;
}

function updateExistingDragPreview(clientX, clientY) {
  const others = ringBeads.filter((b) => b.instanceId !== dragging.instanceId);
  const layout = computeRingLayout(others, lastGeom.pxPerMm, lastGeom.cx, lastGeom.cy);
  dragging.previewIndex = layout.boundaries.length
    ? nearestBoundaryIndex(angleFromCenter(clientX, clientY), layout.boundaries)
    : 0;
}

function hitTestBead(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  const x = clientX - rect.left;
  const y = clientY - rect.top;
  for (let i = lastPositions.length - 1; i >= 0; i--) {
    const p = lastPositions[i];
    if (Math.hypot(p.x - x, p.y - y) <= p.r + 3) return p.bead.instanceId;
  }
  return null;
}

function showGhost(type, clientX, clientY) {
  ghostEl.style.display = 'block';
  ghostEl.width = 72;
  ghostEl.height = 72;
  const ghostCtx = ghostEl.getContext('2d');
  ghostCtx.clearRect(0, 0, 72, 72);
  drawBead(ghostCtx, 36, 36, 28, type, hashString(type.id));
  moveGhost(clientX, clientY);
}

function moveGhost(clientX, clientY) {
  ghostEl.style.left = `${clientX - 36}px`;
  ghostEl.style.top = `${clientY - 36}px`;
}

function hideGhost() {
  ghostEl.style.display = 'none';
}

function setupCanvasPointerEvents() {
  canvas.addEventListener('pointerdown', (event) => {
    const hitId = hitTestBead(event.clientX, event.clientY);
    if (hitId === null) {
      selectedInstanceId = null;
      render();
      return;
    }

    event.preventDefault();
    const startX = event.clientX;
    const startY = event.clientY;
    dragging = {
      mode: 'existing', instanceId: hitId, previewIndex: null,
      moved: false, clientX: startX, clientY: startY,
    };

    function cleanup() {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
    }

    function onMove(moveEvent) {
      if (!dragging) return;
      dragging.moved = dragging.moved || Math.hypot(moveEvent.clientX - startX, moveEvent.clientY - startY) > 7;
      dragging.clientX = moveEvent.clientX;
      dragging.clientY = moveEvent.clientY;
      if (dragging.moved) updateExistingDragPreview(moveEvent.clientX, moveEvent.clientY);
      render();
    }

    function onUp() {
      cleanup();
      if (!dragging) return;
      if (!dragging.moved) {
        selectedInstanceId = hitId;
      } else if (dragging.previewIndex !== null) {
        const oldIndex = ringBeads.findIndex((b) => b.instanceId === hitId);
        if (oldIndex >= 0 && oldIndex !== dragging.previewIndex) {
          commitHistory();
          const [bead] = ringBeads.splice(oldIndex, 1);
          ringBeads.splice(Math.min(dragging.previewIndex, ringBeads.length), 0, bead);
        }
      }
      dragging = null;
      render();
    }

    function onCancel() {
      cleanup();
      dragging = null;
      render();
    }

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
  });
}

function attachPaletteSwatch(swatchEl, type) {
  let lastPointerType = '';

  swatchEl.addEventListener('click', (event) => {
    // 键盘触发的 click(detail=0) 与触摸 click 在这里处理；鼠标由拖拽流程处理。
    if (event.detail === 0 || lastPointerType === 'touch') addBeadToEnd(type);
  });

  swatchEl.addEventListener('pointerdown', (event) => {
    lastPointerType = event.pointerType;
    if (event.pointerType === 'touch') return;
    event.preventDefault();

    const startX = event.clientX;
    const startY = event.clientY;
    dragging = {
      mode: 'new', type, previewIndex: null, moved: false,
      clientX: startX, clientY: startY,
    };
    showGhost(type, startX, startY);

    function cleanup() {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
    }

    function onMove(moveEvent) {
      if (!dragging) return;
      dragging.moved = dragging.moved || Math.hypot(moveEvent.clientX - startX, moveEvent.clientY - startY) > 7;
      dragging.clientX = moveEvent.clientX;
      dragging.clientY = moveEvent.clientY;
      moveGhost(moveEvent.clientX, moveEvent.clientY);
      if (dragging.moved) updateNewDragPreview(moveEvent.clientX, moveEvent.clientY);
      render();
    }

    function onUp(upEvent) {
      cleanup();
      hideGhost();
      if (!dragging) return;
      const rect = canvas.getBoundingClientRect();
      const overCanvas = upEvent.clientX >= rect.left && upEvent.clientX <= rect.right
        && upEvent.clientY >= rect.top && upEvent.clientY <= rect.bottom;
      const moved = dragging.moved;
      const previewIndex = dragging.previewIndex;
      dragging = null;
      if (!moved) addBeadToEnd(type);
      else if (overCanvas && previewIndex !== null) insertBeadAt(type, DEFAULT_SIZE_MM, previewIndex);
      else render();
    }

    function onCancel() {
      cleanup();
      hideGhost();
      dragging = null;
      render();
    }

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
  });
}

// ---------- 晶石库 ----------

function buildPalette(tabsEl, gridEl, searchEl, emptyEl, categorySelectEl) {
  const categories = [
    ...BEAD_CATEGORIES,
    { id: 'all', name: '全部', beads: BEAD_CATEGORIES.flatMap((cat) => cat.beads) },
  ];
  let activeCategory = categories[0];
  let query = '';

  categories.forEach((category) => {
    const option = document.createElement('option');
    option.value = category.id;
    option.textContent = category.name;
    categorySelectEl.appendChild(option);
  });

  function renderTabs() {
    tabsEl.innerHTML = '';
    categories.forEach((category) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `palette-tab${category.id === activeCategory.id ? ' active' : ''}`;
      button.textContent = category.name;
      button.dataset.category = category.id;
      button.setAttribute('role', 'tab');
      button.setAttribute('aria-selected', String(category.id === activeCategory.id));
      button.addEventListener('click', () => {
        activeCategory = category;
        categorySelectEl.value = category.id;
        renderTabs();
        renderGrid();
      });
      tabsEl.appendChild(button);
    });
  }

  function renderGrid() {
    gridEl.innerHTML = '';
    const keyword = query.trim().toLowerCase();
    const sourceBeads = keyword
      ? BEAD_CATEGORIES.flatMap((category) => category.beads)
      : activeCategory.beads;
    const beads = sourceBeads.filter((type) => !keyword || type.name.toLowerCase().includes(keyword));
    emptyEl.classList.toggle('hidden', beads.length > 0);

    beads.forEach((type) => {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'bead-swatch';
      item.setAttribute('aria-label', `添加${type.name}，${TEXTURE_LABELS[type.texture] || '晶石'}质感`);
      item.title = `轻触添加${type.name}，拖入画布可指定位置`;

      const beadCanvas = document.createElement('canvas');
      beadCanvas.setAttribute('aria-hidden', 'true');
      beadCanvas.dataset.beadId = type.id;
      const name = document.createElement('strong');
      name.textContent = type.name;
      const texture = document.createElement('small');
      texture.textContent = TEXTURE_LABELS[type.texture] || '晶石';

      item.append(beadCanvas, name, texture);
      gridEl.appendChild(item);
      renderBeadSwatch(beadCanvas, type);
      attachPaletteSwatch(item, type);
    });
  }

  categorySelectEl.addEventListener('change', () => {
    activeCategory = categories.find((category) => category.id === categorySelectEl.value) || categories[0];
    renderTabs();
    renderGrid();
  });

  searchEl.addEventListener('input', () => {
    query = searchEl.value;
    renderGrid();
  });

  renderTabs();
  renderGrid();

  return { refresh: renderGrid };
}

function refreshPaletteSwatches() {
  document.querySelectorAll('.bead-swatch canvas[data-bead-id]').forEach((beadCanvas) => {
    const type = findBeadType(beadCanvas.dataset.beadId);
    if (type) renderBeadSwatch(beadCanvas, type);
  });
}

function queueResponsiveRender() {
  window.requestAnimationFrame(() => {
    resizeCanvas();
    refreshPaletteSwatches();
  });
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
  undoBtnEl = document.getElementById('undoBtn');
  redoBtnEl = document.getElementById('redoBtn');
  clearBtnEl = document.getElementById('clearBtn');
  exportBtnEl = document.getElementById('exportBtn');
  compositionBarEl = document.getElementById('compositionBar');
  toastEl = document.getElementById('toast');
  toastMessageEl = document.getElementById('toastMessage');
  toastActionEl = document.getElementById('toastAction');

  toastActionEl.addEventListener('click', () => {
    const callback = toastActionCallback;
    toastActionCallback = null;
    toastEl.classList.remove('show');
    if (callback) callback();
  });

  restorePersistedState();

  buildPalette(
    document.getElementById('paletteTabs'),
    document.getElementById('paletteGrid'),
    document.getElementById('paletteSearch'),
    document.getElementById('paletteEmpty'),
    document.getElementById('paletteCategorySelect'),
  );

  sizeButtonsEl.querySelectorAll('button').forEach((button) => {
    button.addEventListener('click', () => resizeSelectedBead(Number(button.dataset.size)));
  });

  document.getElementById('presetGrid').querySelectorAll('button').forEach((button) => {
    button.addEventListener('click', () => applyPreset(button.dataset.preset));
  });

  const mobilePresetSelect = document.getElementById('mobilePresetSelect');
  mobilePresetSelect.addEventListener('change', () => {
    if (!mobilePresetSelect.value) return;
    applyPreset(mobilePresetSelect.value);
    mobilePresetSelect.value = '';
  });

  document.getElementById('closeSelectionBtn').addEventListener('click', () => {
    selectedInstanceId = null;
    render();
  });
  document.getElementById('deleteSelectedBtn').addEventListener('click', removeSelectedBead);
  undoBtnEl.addEventListener('click', undo);
  redoBtnEl.addEventListener('click', redo);
  clearBtnEl.addEventListener('click', requestClearRing);
  exportBtnEl.addEventListener('click', () => {
    exportRingAsImage(ringBeads);
    showToast('设计卡已保存到下载目录');
  });

  document.addEventListener('keydown', (event) => {
    const isTyping = ['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement?.tagName);
    if (isTyping) return;
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') {
      event.preventDefault();
      if (event.shiftKey) redo(); else undo();
    } else if ((event.key === 'Delete' || event.key === 'Backspace') && selectedInstanceId !== null) {
      event.preventDefault();
      removeSelectedBead();
    } else if (event.key === 'Escape' && selectedInstanceId !== null) {
      selectedInstanceId = null;
      render();
    }
  });

  setupCanvasPointerEvents();
  window.addEventListener('resize', queueResponsiveRender);
  resizeCanvas();
  queueResponsiveRender();
}

document.addEventListener('DOMContentLoaded', initApp);
