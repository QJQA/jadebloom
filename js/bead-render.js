// 水晶珠渲染：以稳定随机纹理、透光层与接触阴影模拟天然晶石

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
  const value = hex.replace('#', '');
  const number = parseInt(value, 16);
  return { r: (number >> 16) & 255, g: (number >> 8) & 255, b: number & 255 };
}

function rgba(hex, alpha) {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r},${g},${b},${alpha})`;
}

function drawSoftInclusions(ctx, cx, cy, r, beadType, rand) {
  for (let i = 0; i < 5; i++) {
    const angle = rand() * Math.PI * 2;
    const distance = rand() * r * .58;
    const radius = r * (.12 + rand() * .24);
    const x = cx + Math.cos(angle) * distance;
    const y = cy + Math.sin(angle) * distance;
    const cloud = ctx.createRadialGradient(x, y, 0, x, y, radius);
    cloud.addColorStop(0, rgba(i % 2 ? beadType.highlight : beadType.shadow, .11));
    cloud.addColorStop(1, rgba(beadType.base, 0));
    ctx.fillStyle = cloud;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
  }
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} cx
 * @param {number} cy
 * @param {number} r
 * @param {object} beadType
 * @param {number} seed
 */
function drawBead(ctx, cx, cy, r, beadType, seed) {
  if (!beadType || r <= 0) return;
  const rand = mulberry32(seed || 1);
  const lightX = cx - r * .32;
  const lightY = cy - r * .4;
  const isMatte = beadType.texture === 'stone';

  ctx.save();

  // 接触阴影让珠子落在画布上，而不是悬浮的 UI 圆点。
  ctx.save();
  ctx.filter = `blur(${Math.max(2, r * .16)}px)`;
  ctx.fillStyle = 'rgba(45,31,26,.22)';
  ctx.beginPath();
  ctx.ellipse(cx + r * .13, cy + r * .48, r * .83, r * .42, -.12, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // 主体：高光中心略偏左上，边缘增加深色与半透明感。
  const body = ctx.createRadialGradient(lightX, lightY, r * .03, cx + r * .08, cy + r * .08, r * 1.08);
  body.addColorStop(0, rgba(beadType.highlight, isMatte ? .82 : .95));
  body.addColorStop(.23, beadType.base);
  body.addColorStop(.68, beadType.base);
  body.addColorStop(1, beadType.shadow);
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = body;
  ctx.fill();

  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r - .35, 0, Math.PI * 2);
  ctx.clip();

  if (!isMatte) drawSoftInclusions(ctx, cx, cy, r, beadType, rand);

  if (beadType.texture === 'clear') {
    // 通透晶体：不规则冰裂纹与底部透光。
    ctx.strokeStyle = rgba(beadType.highlight, .32);
    ctx.lineWidth = Math.max(.6, r * .035);
    for (let i = 0; i < 3; i++) {
      const startX = cx - r * (.62 - i * .2);
      const startY = cy + r * (.45 - i * .24);
      ctx.beginPath();
      ctx.moveTo(startX, startY);
      ctx.quadraticCurveTo(cx + r * (rand() - .5) * .4, cy - r * .1, cx + r * (.2 + rand() * .42), cy - r * (.45 - i * .09));
      ctx.stroke();
    }
    const transmission = ctx.createLinearGradient(cx, cy - r, cx, cy + r);
    transmission.addColorStop(0, 'rgba(255,255,255,0)');
    transmission.addColorStop(.72, rgba(beadType.highlight, .08));
    transmission.addColorStop(1, rgba(beadType.highlight, .36));
    ctx.fillStyle = transmission;
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
  } else if (beadType.texture === 'catseye') {
    // 猫眼/月光石：柔亮光带随每颗种子略有不同。
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(-.34 + rand() * .18);
    const band = ctx.createLinearGradient(-r, 0, r, 0);
    band.addColorStop(0, rgba(beadType.highlight, 0));
    band.addColorStop(.38, rgba(beadType.highlight, .1));
    band.addColorStop(.5, rgba(beadType.highlight, .78));
    band.addColorStop(.62, rgba(beadType.highlight, .1));
    band.addColorStop(1, rgba(beadType.highlight, 0));
    ctx.fillStyle = band;
    ctx.fillRect(-r, -r, r * 2, r * 2);
    ctx.restore();
  } else if (beadType.texture === 'sparkle') {
    // 砂金内含物：细小暖色片状反光。
    for (let i = 0; i < 15; i++) {
      const angle = rand() * Math.PI * 2;
      const distance = Math.sqrt(rand()) * r * .78;
      const px = cx + Math.cos(angle) * distance;
      const py = cy + Math.sin(angle) * distance;
      const size = r * (.025 + rand() * .055);
      ctx.fillStyle = i % 3 === 0 ? 'rgba(255,235,174,.8)' : rgba(beadType.highlight, .42 + rand() * .38);
      ctx.beginPath();
      ctx.ellipse(px, py, size * 1.8, size, rand() * Math.PI, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (beadType.texture === 'banded') {
    // 玛瑙/红纹石：天然偏心纹带，不使用机械同心圆。
    ctx.lineCap = 'round';
    for (let i = 0; i < 4; i++) {
      ctx.strokeStyle = i % 2 ? rgba(beadType.highlight, .22) : rgba(beadType.shadow, .2);
      ctx.lineWidth = r * (.045 + rand() * .035);
      ctx.beginPath();
      ctx.arc(cx - r * .2, cy + r * .15, r * (.28 + i * .17), -.85, Math.PI * 1.45);
      ctx.stroke();
    }
  } else if (beadType.texture === 'stone') {
    // 哑光矿石：颗粒斑块与克制高光。
    for (let i = 0; i < 18; i++) {
      const angle = rand() * Math.PI * 2;
      const distance = Math.sqrt(rand()) * r * .78;
      const px = cx + Math.cos(angle) * distance;
      const py = cy + Math.sin(angle) * distance;
      const size = r * (.035 + rand() * .11);
      ctx.fillStyle = rand() > .45 ? rgba(beadType.shadow, .1 + rand() * .13) : rgba(beadType.highlight, .08 + rand() * .1);
      ctx.beginPath();
      ctx.arc(px, py, size, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // 玻璃罩式高光与底缘反射。
  const gloss = ctx.createRadialGradient(lightX, lightY, 0, lightX, lightY, r * .52);
  gloss.addColorStop(0, `rgba(255,255,255,${isMatte ? .28 : .7})`);
  gloss.addColorStop(.55, `rgba(255,255,255,${isMatte ? .07 : .16})`);
  gloss.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gloss;
  ctx.beginPath();
  ctx.ellipse(lightX, lightY, r * .42, r * .27, -.55, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = `rgba(255,255,255,${isMatte ? .18 : .48})`;
  ctx.lineWidth = Math.max(.8, r * .035);
  ctx.beginPath();
  ctx.arc(cx, cy, r * .83, .22, 1.35);
  ctx.stroke();
  ctx.restore();

  // 精细边缘与穿孔暗示。
  ctx.beginPath();
  ctx.arc(cx, cy, r - .3, 0, Math.PI * 2);
  ctx.strokeStyle = rgba(beadType.shadow, .36);
  ctx.lineWidth = Math.max(.7, r * .028);
  ctx.stroke();

  ctx.beginPath();
  ctx.strokeStyle = 'rgba(25,20,18,.16)';
  ctx.lineWidth = Math.max(.8, r * .045);
  ctx.arc(cx, cy, r * .94, -.16 * Math.PI, .15 * Math.PI);
  ctx.stroke();

  ctx.restore();
}

function renderBeadSwatch(canvas, beadType) {
  const dpr = window.devicePixelRatio || 1;
  const size = canvas.clientWidth || 48;
  canvas.width = Math.round(size * dpr);
  canvas.height = Math.round(size * dpr);
  const swatchCtx = canvas.getContext('2d');
  swatchCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  swatchCtx.clearRect(0, 0, size, size);
  drawBead(swatchCtx, size / 2, size / 2 - 1, size * .35, beadType, hashString(beadType.id));
}

function hashString(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (Math.imul(31, hash) + str.charCodeAt(i)) | 0;
  }
  return hash;
}
