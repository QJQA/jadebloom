// 导出一张可直接分享的 4:5 JADÉ BLOOM 手串设计卡

function roundedRectPath(ctx, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

function aggregateMaterials(beads) {
  const map = new Map();
  beads.forEach((bead) => {
    const current = map.get(bead.type.id) || { name: bead.type.name, count: 0, color: bead.type.base };
    current.count += 1;
    map.set(bead.type.id, current);
  });
  return Array.from(map.values());
}

function aggregateSizes(beads) {
  const sizes = new Map();
  beads.forEach((bead) => sizes.set(bead.sizeMm, (sizes.get(bead.sizeMm) || 0) + 1));
  return Array.from(sizes.entries())
    .sort(([a], [b]) => a - b)
    .map(([size, count]) => `${size}mm × ${count}`)
    .join(' · ');
}

function exportRingAsImage(beads) {
  if (!beads.length) return;

  const width = 1200;
  const height = 1500;
  const exportCanvas = document.createElement('canvas');
  exportCanvas.width = width;
  exportCanvas.height = height;
  const exportCtx = exportCanvas.getContext('2d');

  const background = exportCtx.createLinearGradient(0, 0, width, height);
  background.addColorStop(0, '#F4EFE8');
  background.addColorStop(.48, '#FFFCF8');
  background.addColorStop(1, '#E5D9CE');
  exportCtx.fillStyle = background;
  exportCtx.fillRect(0, 0, width, height);

  const glow = exportCtx.createRadialGradient(width * .42, height * .34, 0, width * .5, height * .42, 700);
  glow.addColorStop(0, 'rgba(255,255,255,.96)');
  glow.addColorStop(.66, 'rgba(255,255,255,.08)');
  glow.addColorStop(1, 'rgba(94,67,56,.08)');
  exportCtx.fillStyle = glow;
  exportCtx.fillRect(0, 0, width, height);

  // 纸张颗粒
  exportCtx.save();
  exportCtx.globalAlpha = .035;
  for (let y = 5; y < height; y += 12) {
    for (let x = (y % 24) + 5; x < width; x += 17) {
      exportCtx.fillStyle = (x + y) % 4 ? '#54443C' : '#FFFFFF';
      exportCtx.fillRect(x, y, 1, 1);
    }
  }
  exportCtx.restore();

  // 品牌页眉
  exportCtx.textAlign = 'left';
  exportCtx.fillStyle = '#282321';
  exportCtx.font = '500 22px Georgia, serif';
  exportCtx.letterSpacing = '5px';
  exportCtx.fillText('JADÉ BLOOM', 84, 91);
  exportCtx.fillStyle = 'rgba(40,35,33,.55)';
  exportCtx.font = '500 11px -apple-system, sans-serif';
  exportCtx.fillText('CRYSTAL ATELIER', 86, 115);

  exportCtx.textAlign = 'right';
  exportCtx.fillStyle = '#704952';
  exportCtx.font = '600 12px -apple-system, sans-serif';
  exportCtx.fillText('DESIGN No. 01', width - 82, 91);
  exportCtx.fillStyle = 'rgba(40,35,33,.48)';
  exportCtx.font = '400 11px -apple-system, sans-serif';
  exportCtx.fillText(new Date().toLocaleDateString('zh-CN'), width - 82, 114);

  // 产品展示台
  roundedRectPath(exportCtx, 78, 174, width - 156, 860, 34);
  exportCtx.fillStyle = 'rgba(255,253,249,.52)';
  exportCtx.fill();
  exportCtx.strokeStyle = 'rgba(67,55,48,.1)';
  exportCtx.lineWidth = 1.5;
  exportCtx.stroke();

  const cx = width / 2;
  const cy = 604;
  const availableRadiusPx = 350;
  const pxPerMm = fitPxPerMm(beads, availableRadiusPx);
  const { positions, radiusPx } = computeRingLayout(beads, pxPerMm, cx, cy);

  exportCtx.save();
  exportCtx.fillStyle = 'rgba(61,42,34,.075)';
  exportCtx.filter = 'blur(18px)';
  exportCtx.beginPath();
  exportCtx.ellipse(cx + 12, cy + radiusPx * .5, radiusPx * 1.1, radiusPx * .52, 0, 0, Math.PI * 2);
  exportCtx.fill();
  exportCtx.restore();

  if (positions.length > 1) {
    exportCtx.beginPath();
    exportCtx.arc(cx, cy, radiusPx, 0, Math.PI * 2);
    exportCtx.strokeStyle = 'rgba(92,71,61,.22)';
    exportCtx.lineWidth = 3;
    exportCtx.stroke();
  }
  positions.forEach((position) => {
    drawBead(exportCtx, position.x, position.y, position.r, position.bead.type, position.bead.seed);
  });

  exportCtx.textAlign = 'center';
  exportCtx.fillStyle = 'rgba(40,35,33,.45)';
  exportCtx.font = '600 10px -apple-system, sans-serif';
  exportCtx.fillText('HANDCRAFTED COMPOSITION', cx, 984);

  // 设计说明
  exportCtx.textAlign = 'left';
  exportCtx.fillStyle = '#704952';
  exportCtx.font = '600 12px -apple-system, sans-serif';
  exportCtx.fillText('MY CRYSTAL COMPOSITION', 84, 1114);
  exportCtx.fillStyle = '#282321';
  exportCtx.font = '400 40px Georgia, "Songti SC", serif';
  exportCtx.fillText('我的晶石手串', 82, 1168);

  exportCtx.textAlign = 'right';
  exportCtx.fillStyle = '#282321';
  exportCtx.font = '500 24px Georgia, serif';
  exportCtx.fillText(`${beads.length} 颗晶石`, width - 82, 1149);
  exportCtx.fillStyle = 'rgba(40,35,33,.48)';
  exportCtx.font = '400 12px -apple-system, sans-serif';
  exportCtx.fillText(aggregateSizes(beads), width - 82, 1174);

  exportCtx.strokeStyle = 'rgba(67,55,48,.14)';
  exportCtx.beginPath();
  exportCtx.moveTo(82, 1216);
  exportCtx.lineTo(width - 82, 1216);
  exportCtx.stroke();

  const materials = aggregateMaterials(beads);
  let x = 84;
  let y = 1266;
  materials.forEach((material) => {
    if (x > width - 260) {
      x = 84;
      y += 62;
    }
    const materialGradient = exportCtx.createRadialGradient(x + 13, y - 5, 1, x + 18, y, 14);
    materialGradient.addColorStop(0, '#FFFFFF');
    materialGradient.addColorStop(.45, material.color);
    materialGradient.addColorStop(1, 'rgba(60,45,40,.7)');
    exportCtx.fillStyle = materialGradient;
    exportCtx.beginPath();
    exportCtx.arc(x + 14, y, 12, 0, Math.PI * 2);
    exportCtx.fill();
    exportCtx.fillStyle = '#504945';
    exportCtx.font = '400 14px -apple-system, sans-serif';
    exportCtx.fillText(`${material.name} × ${material.count}`, x + 36, y + 5);
    x += 190;
  });

  exportCtx.fillStyle = 'rgba(40,35,33,.42)';
  exportCtx.font = '400 11px -apple-system, sans-serif';
  exportCtx.textAlign = 'left';
  exportCtx.fillText('搭配图仅供设计参考，实际颗数与尺寸请在线下试戴后确认。', 84, height - 54);
  exportCtx.textAlign = 'right';
  exportCtx.fillText('JADÉ BLOOM · CRYSTAL ATELIER', width - 84, height - 54);

  const link = document.createElement('a');
  const date = new Date();
  const stamp = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`;
  link.download = `JADE_BLOOM_手串设计_${stamp}.png`;
  link.href = exportCanvas.toDataURL('image/png');
  document.body.appendChild(link);
  link.click();
  link.remove();
}
