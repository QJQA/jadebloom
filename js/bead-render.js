// 珠子渲染：用 Canvas 径向渐变模拟水晶球体质感
// 后续若要换成真实照片抠图，只需替换 drawBead 内部实现，
// 上层（palette / ring-canvas）调用方式不需要改动。

function mulberry32(seed) {
  let a = seed;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hexToRgb(hex) {
  const v = hex.replace('#', '');
  const n = parseInt(v, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function rgba(hex, alpha) {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r},${g},${b},${alpha})`;
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} cx 圆心 x
 * @param {number} cy 圆心 y
 * @param {number} r 珠子半径(px)
 * @param {object} beadType 来自 beads-data.js 的珠子类型
 * @param {number} seed 稳定随机种子（同一颗珠子多次重绘保持纹理一致）
 */
function drawBead(ctx, cx, cy, r, beadType, seed) {
  const rand = mulberry32(seed || 1);
  ctx.save();

  // 底层球体渐变：左上高光 -> 主色 -> 边缘阴影
  const lightX = cx - r * 0.35;
  const lightY = cy - r * 0.4;
  const grad = ctx.createRadialGradient(lightX, lightY, r * 0.05, cx, cy, r * 1.05);
  grad.addColorStop(0, beadType.highlight);
  grad.addColorStop(0.45, beadType.base);
  grad.addColorStop(1, beadType.shadow);

  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = grad;
  ctx.fill();

  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.clip();

  if (beadType.texture === 'clear') {
    // 通透玻璃质感：内部一道折射亮纹
    ctx.strokeStyle = rgba(beadType.highlight, 0.5);
    ctx.lineWidth = r * 0.12;
    ctx.beginPath();
    ctx.moveTo(cx - r * 0.5, cy + r * 0.3);
    ctx.lineTo(cx + r * 0.1, cy - r * 0.55);
    ctx.stroke();
  } else if (beadType.texture === 'catseye') {
    // 猫眼/月光效果：一道斜向明亮光带
    const bandGrad = ctx.createLinearGradient(cx - r, cy - r * 0.6, cx + r, cy + r * 0.6);
    bandGrad.addColorStop(0, rgba(beadType.highlight, 0));
    bandGrad.addColorStop(0.5, rgba(beadType.highlight, 0.85));
    bandGrad.addColorStop(1, rgba(beadType.highlight, 0));
    ctx.fillStyle = bandGrad;
    ctx.fillRect(cx - r, cy - r * 0.22, r * 2, r * 0.44);
  } else if (beadType.texture === 'sparkle') {
    // 闪砂内含物：随机小亮点
    const count = 10;
    for (let i = 0; i < count; i++) {
      const a = rand() * Math.PI * 2;
      const d = rand() * r * 0.85;
      const px = cx + Math.cos(a) * d;
      const py = cy + Math.sin(a) * d;
      const s = r * (0.04 + rand() * 0.05);
      ctx.fillStyle = rgba(beadType.highlight, 0.55 + rand() * 0.3);
      ctx.beginPath();
      ctx.arc(px, py, s, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (beadType.texture === 'banded') {
    // 玛瑙纹带：几道同心弧线
    ctx.strokeStyle = rgba(beadType.shadow, 0.35);
    ctx.lineWidth = r * 0.06;
    for (let i = 1; i <= 3; i++) {
      ctx.beginPath();
      ctx.arc(cx, cy, r * (i / 4), 0, Math.PI * 2);
      ctx.stroke();
    }
  } else if (beadType.texture === 'stone') {
    // 哑光石感：柔和噪点斑块，无强反光
    const count = 6;
    for (let i = 0; i < count; i++) {
      const a = rand() * Math.PI * 2;
      const d = rand() * r * 0.7;
      const px = cx + Math.cos(a) * d;
      const py = cy + Math.sin(a) * d;
      const s = r * (0.1 + rand() * 0.15);
      ctx.fillStyle = rgba(beadType.shadow, 0.12 + rand() * 0.1);
      ctx.beginPath();
      ctx.arc(px, py, s, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  ctx.restore(); // release clip

  // 顶部小高光点，增加光泽感
  ctx.beginPath();
  ctx.fillStyle = rgba('#FFFFFF', beadType.texture === 'stone' ? 0.25 : 0.55);
  ctx.arc(lightX, lightY, r * 0.18, 0, Math.PI * 2);
  ctx.fill();

  // 穿孔线（顶部小凹槽，暗示线孔位置）
  ctx.beginPath();
  ctx.strokeStyle = rgba('#000000', 0.15);
  ctx.lineWidth = Math.max(1, r * 0.06);
  ctx.arc(cx, cy, r * 0.98, -Math.PI * 0.15, Math.PI * 0.15);
  ctx.stroke();

  ctx.restore();
}

function renderBeadSwatch(canvas, beadType) {
  const dpr = window.devicePixelRatio || 1;
  const size = canvas.clientWidth || 56;
  canvas.width = size * dpr;
  canvas.height = size * dpr;
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, size, size);
  const r = size * 0.4;
  drawBead(ctx, size / 2, size / 2, r, beadType, hashString(beadType.id));
}

function hashString(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
  }
  return h;
}
