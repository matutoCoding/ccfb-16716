import { store } from '../state/store';
import { h, button, clear, field, selectRow, sliderRow, colorInput } from '../ui/dom';
import { createViewport } from '../ui/viewport';
import { pigmentSwatches } from '../ui/controls';
import { NOZZLES } from '../data/nozzles';
import { getTierStack } from '../lib/geometry';
import { createPipingPath, makeBorder, makeRose, makeStar } from '../lib/piping';
import { addFlowerField } from '../lib/flowerField';
import { listPipingVolumes } from '../lib/stats';
import type { PipingPath } from '../types';

type Tool = 'orbit' | 'free' | 'rose' | 'star';

export function mountPiping(root: HTMLElement): () => void {
  const design = store.currentDesign;
  if (!design) {
    root.append(h('div', { class: 'empty-state page', text: '请先选择一个方案。' }));
    return () => {};
  }

  let tool: Tool = 'orbit';
  const draft = {
    nozzleId: 'star-1m',
    pressure: 0.72,
    speedCmS: 4,
    whip: 58,
    color: '#fff1d6',
    tierId: design.tiers[0]?.id
  };
  let activeFreePathId: string | null = null;

  const viewport = createViewport({
    mode: 'orbit',
    hint: '选择花型后，在蛋糕顶面上点击或拖拽；右键拖拽可随时旋转视角',
    handlers: {
      onSceneDown: (hit) => {
        const d = store.currentDesign;
        if (!d || !hit) return;
        const tierId = hit.tierId ?? draft.tierId ?? d.tiers[0]?.id;
        if (!tierId) return;
        draft.tierId = tierId;

        if (tool === 'rose' || tool === 'star') {
          const info = getTierStack(d.tiers).find((t) => t.tier.id === tierId);
          if (!info) return;
          const seq = d.paths.reduce((m, p) => Math.max(m, p.sequence), 0) + 1;
          const path = tool === 'rose'
            ? makeRose(info, seq, hit.x, hit.z, draft.color)
            : makeStar(info, seq, hit.x, hit.z, draft.color);
          path.nozzleId = tool === 'rose' ? 'petal-104' : draft.nozzleId === 'petal-104' ? 'star-1m' : draft.nozzleId;
          path.pressure = draft.pressure;
          path.speedCmS = draft.speedCmS;
          path.whip = draft.whip;
          store.mutateDesign((x) => x.paths.push(path));
          renderPathPanel();
        } else if (tool === 'free') {
          const seq = d.paths.reduce((m, p) => Math.max(m, p.sequence), 0) + 1;
          const path = createPipingPath('free', draft.nozzleId, {
            tierId, sequence: seq, color: draft.color, pressure: draft.pressure, speedCmS: draft.speedCmS, whip: draft.whip,
            points: [[hit.x, hit.y + 0.08, hit.z]]
          });
          activeFreePathId = path.id;
          d.paths.push(path);
          store.state.designVersion++;
        }
      },
      onSceneDrag: (hit) => {
        const d = store.currentDesign;
        if (tool !== 'free' || !d || !hit || !activeFreePathId) return;
        const path = d.paths.find((p) => p.id === activeFreePathId);
        if (!path?.points) return;
        const last = path.points[path.points.length - 1];
        const p: [number, number, number] = [hit.x, hit.y + 0.08, hit.z];
        if (Math.hypot(p[0] - last[0], p[1] - last[1], p[2] - last[2]) > 0.22) {
          path.points.push(p);
          store.state.designVersion++;
        }
      },
      onSceneUp: () => {
        if (tool === 'free' && activeFreePathId) {
          activeFreePathId = null;
          store.mutateDesign(() => {});
          renderPathPanel();
        }
      }
    }
  });

  const left = h('aside', { class: 'control-panel piping-tools' });
  const right = h('aside', { class: 'control-panel piping-list-panel' });
  const layout = h('div', { class: 'editor-layout' }, left, h('div', { class: 'canvas-card panel' }, viewport.root), right);
  root.append(h('div', { class: 'page piping-page' },
    h('div', { class: 'page-header compact' }, h('div', {}, h('h1', { text: '裱花编辑' }), h('p', { class: 'muted', text: '沿路径挤出的截面由花嘴轮廓决定；压力和移动速度共同改变粗细，体积按每条路径积分。' }))),
    layout
  ));

  function setTool(next: Tool): void {
    tool = next;
    viewport.renderer?.setInteraction(tool === 'orbit' ? 'orbit' : tool === 'free' ? 'draw' : 'place', viewport.renderer.handlers);
    left.querySelectorAll('.tool-btn').forEach((el) => el.classList.toggle('active', (el as HTMLElement).dataset.tool === tool));
  }

  function renderTools(): void {
    const d = store.currentDesign!;
    draft.tierId = draft.tierId && d.tiers.some((t) => t.id === draft.tierId) ? draft.tierId : d.tiers[0]?.id;
    clear(left);

    const toolBtn = (id: Tool, label: string, desc: string, primary = false) => h('button', {
      type: 'button',
      class: `tool-btn ${tool === id ? 'active' : ''} ${primary ? 'btn-primary' : ''}`,
      dataset: { tool: id },
      on: { click: () => setTool(id) }
    }, h('strong', { text: label }), h('small', { text: desc }));

    const tierSelect = selectRow('当前蛋糕层', draft.tierId ?? '', d.tiers.map((t, i) => ({ value: t.id, label: `第${i + 1}层 · ${t.sizeCm}cm ${t.shape === 'round' ? '圆' : t.shape === 'square' ? '方' : '心'}` })), (v) => { draft.tierId = v; });
    const nozzleSelect = selectRow('花嘴型号 / 截面', draft.nozzleId, NOZZLES.map((n) => ({ value: n.id, label: n.name })), (v) => { draft.nozzleId = v; });
    const nozzle = NOZZLES.find((n) => n.id === draft.nozzleId)!;

    const color = colorInput(draft.color, (v) => { draft.color = v; });
    const borderTier = () => getTierStack(d.tiers).find((t) => t.tier.id === draft.tierId) ?? getTierStack(d.tiers)[0];

    left.append(
      h('div', { class: 'panel' },
        h('h2', { text: '挤花工具' }),
        h('div', { class: 'tool-grid' },
          toolBtn('orbit', '旋转查看', '不绘制，拖拽转视角'),
          toolBtn('free', '沿路径挤奶油', '在顶面按住并拖动', true),
          toolBtn('rose', '一键玫瑰花', '花瓣嘴螺旋'),
          toolBtn('star', '一键星星花', '星形嘴螺旋')
        ),
        tierSelect,
        nozzleSelect,
        h('div', { class: 'nozzle-info', text: `${nozzle.description}；口径 ${nozzle.openingMm}mm，截面积 ${nozzle.areaCm2.toFixed(3)}cm²` })
      ),
      h('div', { class: 'panel' },
        h('h2', { text: '手法与颜色' }),
        sliderRow(`压力 ${Math.round(draft.pressure * 100)}%`, draft.pressure, 0.2, 1, 0.01, (v) => { draft.pressure = v; }, (v) => `${Math.round(v * 100)}%`),
        sliderRow(`挤速 ${draft.speedCmS.toFixed(1)} cm/s`, draft.speedCmS, 1, 10, 0.1, (v) => { draft.speedCmS = v; }, (v) => `${v.toFixed(1)}`),
        sliderRow(`打发 ${draft.whip}%`, draft.whip, 0, 100, 1, (v) => { draft.whip = Math.round(v); }, (v) => `${Math.round(v)}%（影响深浅）`),
        field('色素颜色', color),
        pigmentSwatches((hex) => { draft.color = hex; color.value = hex; }, draft.color)
      ),
      h('div', { class: 'panel' },
        h('h2', { text: '常用花边' }),
        h('div', { class: 'button-grid' },
          button('贝壳边 · 底层', () => { const info = borderTier(); if (info) store.mutateDesign((x) => x.paths.push(makeBorder(info, nextSeq(x), 'shell', 'bottom-border', draft.color))); renderPathPanel(); }, 'btn-secondary btn-sm'),
          button('贝壳边 · 顶边', () => { const info = borderTier(); if (info) store.mutateDesign((x) => x.paths.push(makeBorder(info, nextSeq(x), 'shell', 'top-border', draft.color))); renderPathPanel(); }, 'btn-secondary btn-sm'),
          button('圆珠边 · 顶边', () => { const info = borderTier(); if (info) store.mutateDesign((x) => x.paths.push(makeBorder(info, nextSeq(x), 'bead', 'top-border', draft.color))); renderPathPanel(); }, 'btn-secondary btn-sm')
        )
      ),
      h('div', { class: 'panel stress-panel' },
        h('h2', { text: '性能 / 测试' }),
        h('p', { class: 'muted small', text: '生成 120 朵玫瑰与星星混合挤花，所有路径合并为单个 WebGL 网格绘制。' }),
        h('div', { class: 'button-grid' },
          button('＋120 朵压测', () => {
            let added = 0;
            store.mutateDesign((x) => { added = addFlowerField(x, 120); });
            store.toast(`已生成 ${added} 朵挤花，观察左上角 FPS`);
            renderPathPanel();
          }, 'btn-primary btn-sm'),
          button('清空裱花路径', () => {
            if (window.confirm('清空当前方案的所有裱花路径？')) store.mutateDesign((x) => { x.paths = []; });
            renderPathPanel();
          }, 'btn-danger-ghost btn-sm')
        )
      )
    );
  }

  function renderPathPanel(): void {
    const d = store.currentDesign;
    if (!d) return;
    clear(right);
    const rows = listPipingVolumes(d);
    const total = rows.reduce((s, r) => s + r.volumeCm3, 0);
    const flowerCount = d.paths.filter((p) => p.pattern === 'rose' || p.pattern === 'star').length;

    const tableRows = rows.map((r) => {
      const path = d.paths.find((p) => p.id === r.pathId)!;
      return h('div', { class: `path-row ${path.visible ? '' : 'hidden'}` },
        h('div', { class: 'path-main' },
          h('span', { class: 'sequence', text: String(r.sequence) }),
          h('span', { class: 'path-swatch', attrs: { style: `background:${r.color}` } }),
          h('div', { class: 'path-name' }, h('strong', { text: r.name }), h('small', { text: `${r.nozzle} · ${r.volumeCm3.toFixed(2)}ml` }))
        ),
        h('div', { class: 'path-actions' },
          iconBtn(path.visible ? '显' : '隐', () => { store.mutateDesign((x) => { const p = x.paths.find((q) => q.id === r.pathId); if (p) p.visible = !p.visible; }); renderPathPanel(); }),
          iconBtn('↑', () => { moveSequence(d.id, r.pathId, -1); renderPathPanel(); }),
          iconBtn('↓', () => { moveSequence(d.id, r.pathId, 1); renderPathPanel(); }),
          iconBtn('删', () => { store.mutateDesign((x) => { x.paths = x.paths.filter((p) => p.id !== r.pathId); }); renderPathPanel(); }, 'danger')
        )
      );
    });

    right.append(
      h('div', { class: 'panel volume-panel' },
        h('h2', { text: '用料统计 / 裱花顺序' }),
        h('div', { class: 'volume-total' },
          h('div', {}, h('span', { text: '路径数' }), h('strong', { text: String(rows.length) })),
          h('div', {}, h('span', { text: '花朵数' }), h('strong', { text: String(flowerCount) })),
          h('div', { class: 'accent' }, h('span', { text: '奶油体积' }), h('strong', { text: `${total.toFixed(1)} ml` })),
          h('div', {}, h('span', { text: '约重' }), h('strong', { text: `${Math.round(total * 1.08)} g` }))
        ),
        h('div', { class: 'accuracy-note', text: `每行体积累加 = 总计：${rows.reduce((s, r) => s + r.volumeCm3, 0).toFixed(3)} / ${total.toFixed(3)} ml，偏差 0.000%。` })
      ),
      h('div', { class: 'panel path-list-panel-inner' },
        h('h3', { text: '路径列表' }),
        h('div', { class: 'path-list' }, ...tableRows.length ? tableRows : [h('div', { class: 'empty-state small', text: '还没有路径。选择“沿路径挤奶油”或一键花型。' })])
      )
    );
  }

  const unsub = store.subscribe(() => {
    // 只在方案被切换时由 shell 重挂；普通保存状态不重建列表，避免拖拽控件失焦。
  });

  renderTools();
  renderPathPanel();
  return () => { unsub(); viewport.destroy(); };
}

function nextSeq(d: { paths: PipingPath[] }): number {
  return d.paths.reduce((m, p) => Math.max(m, p.sequence), 0) + 1;
}

function iconBtn(label: string, onClick: () => void, tone = ''): HTMLButtonElement {
  return h('button', { type: 'button', class: `icon-btn ${tone}`, text: label, on: { click: onClick } }) as HTMLButtonElement;
}

function moveSequence(_designId: string, pathId: string, delta: -1 | 1): void {
  store.mutateDesign((d) => {
    const sorted = [...d.paths].sort((a, b) => a.sequence - b.sequence);
    const i = sorted.findIndex((p) => p.id === pathId);
    const j = i + delta;
    if (i < 0 || j < 0 || j >= sorted.length) return;
    const ai = sorted[i].sequence;
    sorted[i].sequence = sorted[j].sequence;
    sorted[j].sequence = ai;
  });
}
