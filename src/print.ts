import type { Design, Order } from './types';
import { collectMaterials } from './lib/stats';
import { getNozzle } from './data/nozzles';

const PATTERN_NAMES: Record<string, string> = {
  free: '沿路径挤线', rose: '玫瑰花', shell: '贝壳边', star: '星星花', bead: '圆珠边'
};
const SHAPE_NAMES: Record<string, string> = { round: '圆形', square: '方形', heart: '心形' };

export function buildProductionSheet(order: Order | undefined, design: Design, previewDataUrl?: string): string {
  const { rows, total, pipingRows } = collectMaterials(design);
  const nozzleList = Array.from(new Set(design.paths.map((p) => p.nozzleId))).map((id) => getNozzle(id));
  const sortedPaths = [...design.paths].sort((a, b) => a.sequence - b.sequence);

  const tierRows = rows.map((r) => `
    <tr>
      <td>${r.label}</td>
      <td>${r.serves} 人份</td>
      <td>${r.spongeVolumeCm3.toFixed(0)} ml / ${r.spongeG.toFixed(0)} g</td>
      <td>${r.coatingName}<br>${r.coatingVolumeCm3.toFixed(0)} ml / ${r.coatingG.toFixed(0)} g</td>
      <td>${r.pipingVolumeCm3.toFixed(1)} ml / ${r.pipingG.toFixed(0)} g</td>
      <td>${r.flowerCount} 朵 · ${r.pathCount} 条</td>
      <td>${r.nozzles.join('、') || '—'}</td>
    </tr>`).join('');

  const sequenceRows = sortedPaths.map((p) => {
    const row = pipingRows.find((r) => r.pathId === p.id);
    return `
      <tr>
        <td class="seq">${p.sequence}</td>
        <td>${PATTERN_NAMES[p.pattern] ?? p.pattern}<br><small>${p.name}</small></td>
        <td>${getNozzle(p.nozzleId).name}</td>
        <td><span class="swatch" style="background:${p.color}"></span>${p.color}</td>
        <td>压力 ${Math.round(p.pressure * 100)}%<br>速度 ${p.speedCmS.toFixed(1)} cm/s</td>
        <td>${row ? `${row.volumeCm3.toFixed(2)} ml` : '—'}</td>
      </tr>`;
  }).join('');

  return `
  <div class="sheet">
    <header class="sheet-head">
      <div>
        <h1>裱花蛋糕制作单</h1>
        <p>Gateau Studio · 用料与裱花顺序</p>
      </div>
      <div class="order-meta">
        <strong>${order?.code ?? '未关联订单'}</strong>
        <span>${order?.customer.name ?? '散客'} · ${order?.customer.phone ?? ''}</span>
        <span>日期：${order?.eventDate ?? '—'} · ${order?.people ?? '—'} 人 · 预算 ¥${order?.budget ?? '—'}</span>
      </div>
    </header>

    <section class="sheet-summary">
      <div><b>${design.proposalLabel}</b> ${design.name}</div>
      <div>总裱花奶油：<strong>${total ? total.pipingVolumeCm3.toFixed(1) : '0'} ml / ${total ? total.pipingG.toFixed(0) : '0'} g</strong></div>
      <div>花朵数量：<strong>${total?.flowerCount ?? 0}</strong> 朵；路径：<strong>${total?.pathCount ?? 0}</strong> 条</div>
    </section>

    ${previewDataUrl ? `<img class="sheet-preview" src="${previewDataUrl}" alt="效果预览图" />` : ''}

    <h2>一、每层用料</h2>
    <table class="sheet-table">
      <thead><tr><th>规格</th><th>建议份量</th><th>蛋糕胚</th><th>抹面/包覆/淋面</th><th>裱花奶油</th><th>花量</th><th>花嘴</th></tr></thead>
      <tbody>${tierRows}</tbody>
      ${total ? `<tfoot><tr><td>合计</td><td>${total.serves} 人份</td><td>${total.spongeG.toFixed(0)} g</td><td>${total.coatingG.toFixed(0)} g</td><td>${total.pipingG.toFixed(0)} g</td><td>${total.flowerCount} 朵</td><td>${nozzleList.length} 种</td></tr></tfoot>` : ''}
    </table>

    <h2>二、花嘴准备</h2>
    <ul class="nozzle-list">
      ${nozzleList.map((n) => `<li><b>${n.name}</b>：${n.description}；口径 ${n.openingMm}mm，截面积 ${n.areaCm2.toFixed(3)} cm²</li>`).join('') || '<li>无裱花路径</li>'}
    </ul>

    <h2>三、裱花顺序（按序号执行）</h2>
    <table class="sheet-table">
      <thead><tr><th>#</th><th>花型</th><th>花嘴</th><th>颜色</th><th>手法参数</th><th>体积</th></tr></thead>
      <tbody>${sequenceRows}</tbody>
    </table>

    <h2>四、制作提示</h2>
    <ol class="tips">
      <li>先烤胚、夹馅、初抹并冷冻定型；最后一层抹面应在裱花前 20 分钟完成。</li>
      <li>翻糖层需在干爽环境包覆，避免手部温度造成光泽不均；镜面淋面建议在 32–35℃ 浇注。</li>
      <li>每条路径的体积由花嘴截面、压力/速度形成的截面缩放和中心线长度积分得到，可按 ml 备料。</li>
      <li>上百朵挤花建议按“围边 → 主花定位 → 空隙星星 → 装饰件”的顺序，避免碰伤已完成花型。</li>
    </ol>
    <footer>打印时间：${new Date().toLocaleString('zh-CN')} · 本单体积统计与设计器路径使用同一积分函数。</footer>
  </div>`;
}

export function printProductionSheet(order: Order | undefined, design: Design, previewDataUrl?: string): void {
  const root = document.getElementById('print-root');
  if (!root) return;
  root.innerHTML = buildProductionSheet(order, design, previewDataUrl);
  window.setTimeout(() => window.print(), 80);
}
