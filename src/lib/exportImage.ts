import type { Design, Order } from '../types';

export function composeCustomerImage(sourceDataUrl: string, order: Order | undefined, design: Design): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = 1600;
      canvas.height = 1200;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(sourceDataUrl);
        return;
      }

      const gradient = ctx.createLinearGradient(0, 0, 1600, 1200);
      gradient.addColorStop(0, design.light === 'wedding' ? '#2a1720' : '#f8efe7');
      gradient.addColorStop(1, design.light === 'wedding' ? '#6b3f4d' : '#dfe9f2');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, 1600, 1200);

      // 预览图卡片
      const cardX = 70, cardY = 70, cardW = 1460, cardH = 850;
      ctx.save();
      roundRect(ctx, cardX, cardY, cardW, cardH, 34);
      ctx.fillStyle = 'rgba(255,255,255,0.92)';
      ctx.shadowColor = 'rgba(60,35,45,0.22)';
      ctx.shadowBlur = 36;
      ctx.shadowOffsetY = 18;
      ctx.fill();
      ctx.restore();

      const pad = 28;
      const maxW = cardW - pad * 2;
      const maxH = cardH - pad * 2;
      const scale = Math.min(maxW / img.width, maxH / img.height);
      const w = img.width * scale;
      const h = img.height * scale;
      ctx.drawImage(img, cardX + (cardW - w) / 2, cardY + (cardH - h) / 2, w, h);

      ctx.fillStyle = design.light === 'wedding' ? '#fff1dc' : '#3a2a30';
      ctx.font = '700 54px "Microsoft YaHei", system-ui, sans-serif';
      ctx.fillText(design.name, 90, 1000);
      ctx.font = '32px "Microsoft YaHei", system-ui, sans-serif';
      ctx.fillStyle = design.light === 'wedding' ? '#f4d7b8' : '#7a626b';
      const meta = `${design.proposalLabel} · ${order?.customer.name ?? '散客'} · ${order?.eventDate ?? ''} · ${order?.people ?? ''} 人`;
      ctx.fillText(meta, 92, 1052);

      ctx.font = '28px "Microsoft YaHei", system-ui, sans-serif';
      ctx.fillStyle = design.light === 'wedding' ? '#e8c69b' : '#9a828b';
      const tierText = design.tiers.map((t, i) => `${i + 1}层 ${t.shape === 'round' ? '圆' : t.shape === 'square' ? '方' : '心'}${t.sizeCm}cm`).join(' / ');
      ctx.fillText(`${tierText} · ${design.paths.length} 条裱花路径 · ${design.decorations.length} 件装饰`, 92, 1102);
      ctx.fillText('Gateau Studio 客户效果确认图 · 实际颜色可能因屏幕与原料批次略有差异', 92, 1150);

      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = reject;
    img.src = sourceDataUrl;
  });
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
