// 导出手串成品图（依赖 ring-canvas.js 里的 computeRingLayout / fitPxPerMm / drawBead）

function exportRingAsImage(ringBeads) {
  const exportSize = 1000;
  const canvas = document.createElement('canvas');
  canvas.width = exportSize;
  canvas.height = exportSize;
  const ctx = canvas.getContext('2d');

  const bgGrad = ctx.createRadialGradient(
    exportSize / 2, exportSize / 2, exportSize * 0.1,
    exportSize / 2, exportSize / 2, exportSize * 0.65
  );
  bgGrad.addColorStop(0, '#FFFFFF');
  bgGrad.addColorStop(1, '#F1EBE9');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, exportSize, exportSize);

  const availableRadiusPx = exportSize * 0.36;
  const pxPerMm = fitPxPerMm(ringBeads, availableRadiusPx);
  const { positions, radiusPx } = computeRingLayout(ringBeads, pxPerMm, exportSize / 2, exportSize / 2);

  if (positions.length > 1) {
    ctx.beginPath();
    ctx.arc(exportSize / 2, exportSize / 2, radiusPx, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(140,130,130,0.3)';
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  positions.forEach((p) => {
    drawBead(ctx, p.x, p.y, p.r, p.bead.type, p.bead.seed);
  });

  if (positions.length === 0) {
    ctx.fillStyle = 'rgba(90,85,85,0.6)';
    ctx.font = '28px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('还没有串上珠子', exportSize / 2, exportSize / 2);
  }

  const link = document.createElement('a');
  const date = new Date();
  const stamp = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`;
  link.download = `手串定制_${stamp}.png`;
  link.href = canvas.toDataURL('image/png');
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
