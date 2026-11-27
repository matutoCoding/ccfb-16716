import { store } from '../state/store';
import { h, button, clear, field, selectRow, sliderRow, colorInput } from '../ui/dom';
import { createViewport } from '../ui/viewport';
import { DECORATION_COLORS } from '../data/palettes';
import { uid } from '../lib/util';
import type { Decoration, DecorationType } from '../types';

const TYPE_LABELS: Record<DecorationType, string> = {
  strawberry: '草莓',
  blueberry: '蓝莓',
  cherry: '樱桃',
  'chocolate-slab': '巧克力片',
  'chocolate-chip': '巧克力豆',
  pearl: '糖珠',
  'candle-number': '数字蜡烛'
};

export function mountDecorations(root: HTMLElement): () => void {
  const design = store.currentDesign;
  if (!design) {
    root.append(h('div', { class: 'empty-state page', text: '请先选择一个方案。' }));
    return () => {};
  }

  let selectedId: string | null = design.decorations[0]?.id ?? null;
  let addType: DecorationType = 'strawberry';
  let interaction: 'add' | 'move' = 'add';

  const viewport = createViewport({
    mode: 'place',
    hint: '选择装饰件后点击蛋糕顶面连续摆放；切换“移动选中”可拖拽定位，右侧可旋转缩放',
    handlers: {
      onSceneDown: (hit) => {
        const d = store.currentDesign;
        if (!d || !hit) return;
        if (interaction === 'add') {
          const dec: Decoration = {
            id: uid('dec'),
            tierId: hit.tierId ?? d.tiers[0]?.id,
            type: addType,
            x: hit.x,
            z: hit.z,
            rotation: Math.random() * Math.PI * 2,
            scale: 1,
            number: addType === 'candle-number' ? 8 : undefined,
            color: addType === 'pearl' ? '#ffffff' : addType === 'candle-number' ? '#ef5b7a' : undefined
          };
          d.decorations.push(dec);
          selectedId = dec.id;
          store.mutateDesign(() => {});
          renderAll();
        } else if (selectedId) {
          applyPosition(hit.x, hit.z, hit.tierId);
        }
      },
      onSceneDrag: (hit) => {
        if (interaction === 'move' && selectedId && hit) applyPosition(hit.x, hit.z, hit.tierId);
      }
    }
  });

  const left = h('aside', { class: 'control-panel' });
  const right = h('aside', { class: 'control-panel deco-list-panel' });
  const layout = h('div', { class: 'editor-layout decorate-layout' }, left, h('div', { class: 'canvas-card panel' }, viewport.root), right);
  root.append(h('div', { class: 'page decorate-page' },
    h('div', { class: 'page-header compact' }, h('div', {}, h('h1', { text: '装饰件摆放' }), h('p', { class: 'muted', text: '水果、巧克力片/豆、糖珠和数字蜡烛均可定位、旋转和缩放；位置随方案保存。' }))),
    layout
  ));

  function applyPosition(x: number, z: number, tierId?: string): void {
    if (!selectedId) return;
    store.mutateDesign((d) => {
      const dec = d.decorations.find((q) => q.id === selectedId);
      if (!dec) return;
      dec.x = x;
      dec.z = z;
      if (tierId) dec.tierId = tierId;
    });
    updateSelectedReadouts();
  }

  function updateSelectedReadouts(): void {
    // slider 自带 output；拖拽画布后下次渲染面板会同步。为避免拖拽中重建控件，这里仅更新数据。
  }

  function renderLeft(): void {
    const d = store.currentDesign!;
    clear(left);
    const typeGrid = h('div', { class: 'deco-type-grid' },
      ...(Object.keys(TYPE_LABELS) as DecorationType[]).map((type) => h('button', {
        type: 'button',
        class: `deco-type-btn ${addType === type ? 'active' : ''}`,
        on: { click: () => { addType = type; interaction = 'add'; viewport.renderer?.setInteraction('place', viewport.renderer.handlers); renderLeft(); } }
      }, h('span', { class: `deco-icon deco-${type}` }), h('strong', { text: TYPE_LABELS[type] })))
    );

    const modeBox = h('div', { class: 'mode-switch' },
      button('点击添加', () => { interaction = 'add'; }, interaction === 'add' ? 'btn-primary btn-sm' : 'btn-ghost btn-sm'),
      button('移动选中', () => { interaction = 'move'; if (!selectedId) selectedId = d.decorations[0]?.id ?? null; }, interaction === 'move' ? 'btn-primary btn-sm' : 'btn-ghost btn-sm'),
      button('旋转视角', () => viewport.renderer?.setInteraction('orbit'), 'btn-ghost btn-sm')
    );

    left.append(
      h('div', { class: 'panel' }, h('h2', { text: '装饰库' }), typeGrid, modeBox, h('p', { class: 'muted small', text: '在中间蛋糕顶面上点击即可放置；可连续点击。' })),
      renderSelectedEditor()
    );
  }

  function renderSelectedEditor(): HTMLElement {
    const d = store.currentDesign!;
    const dec = d.decorations.find((x) => x.id === selectedId);
    const box = h('div', { class: 'panel selected-editor' });
    if (!dec) {
      box.append(h('h2', { text: '选中装饰' }), h('p', { class: 'muted', text: '点击画布添加，或从右侧列表选择。' }));
      return box;
    }

    const tierSelect = selectRow('所属层', dec.tierId ?? '', d.tiers.map((t, i) => ({ value: t.id, label: `第${i + 1}层 ${t.sizeCm}cm` })), (v) => {
      store.mutateDesign((x) => { const q = x.decorations.find((z) => z.id === dec.id); if (q) q.tierId = v; });
    });

    box.append(
      h('h2', { text: `编辑 · ${TYPE_LABELS[dec.type]}` }),
      tierSelect,
      sliderRow(`X ${dec.x.toFixed(1)} cm`, dec.x, -22, 22, 0.1, (v) => store.mutateDesign((x) => { const q = x.decorations.find((z) => z.id === dec.id); if (q) q.x = v; }), (v) => `${v.toFixed(1)}`),
      sliderRow(`Z ${dec.z.toFixed(1)} cm`, dec.z, -22, 22, 0.1, (v) => store.mutateDesign((x) => { const q = x.decorations.find((z) => z.id === dec.id); if (q) q.z = v; }), (v) => `${v.toFixed(1)}`),
      sliderRow(`旋转 ${Math.round((dec.rotation * 180) / Math.PI)}°`, (dec.rotation * 180) / Math.PI, -180, 180, 1, (v) => store.mutateDesign((x) => { const q = x.decorations.find((z) => z.id === dec.id); if (q) q.rotation = (v * Math.PI) / 180; }), (v) => `${Math.round(v)}°`),
      sliderRow(`缩放 ${dec.scale.toFixed(2)}×`, dec.scale, 0.45, 2.2, 0.05, (v) => store.mutateDesign((x) => { const q = x.decorations.find((z) => z.id === dec.id); if (q) q.scale = v; }), (v) => `${v.toFixed(2)}×`)
    );

    if (dec.type === 'candle-number') {
      box.append(sliderRow(`数字 ${dec.number ?? 0}`, dec.number ?? 0, 0, 9, 1, (v) => store.mutateDesign((x) => { const q = x.decorations.find((z) => z.id === dec.id); if (q) q.number = Math.round(v); }), (v) => String(Math.round(v))));
    }
    if (dec.type === 'pearl' || dec.type === 'candle-number') {
      const color = colorInput(dec.color ?? '#ffffff', (v) => store.mutateDesign((x) => { const q = x.decorations.find((z) => z.id === dec.id); if (q) q.color = v; }));
      box.append(field('颜色', color), h('div', { class: 'color-chip-row' }, ...DECORATION_COLORS.map((c) => h('button', { type: 'button', class: 'color-chip', attrs: { style: `background:${c}` }, on: { click: () => store.mutateDesign((x) => { const q = x.decorations.find((z) => z.id === dec.id); if (q) q.color = c; }) } }))));
    }

    box.append(h('div', { class: 'button-grid' },
      button('复制', () => {
        const copy = structuredClone(dec);
        copy.id = uid('dec');
        copy.x += 1.2;
        copy.z += 1.2;
        store.mutateDesign((x) => x.decorations.push(copy));
        selectedId = copy.id;
        renderAll();
      }, 'btn-secondary btn-sm'),
      button('删除', () => {
        store.mutateDesign((x) => { x.decorations = x.decorations.filter((q) => q.id !== dec.id); });
        selectedId = null;
        renderAll();
      }, 'btn-danger-ghost btn-sm')
    ));
    return box;
  }

  function renderRight(): void {
    const d = store.currentDesign!;
    clear(right);
    const rows = d.decorations.map((dec) => h('button', {
      type: 'button',
      class: `deco-row ${selectedId === dec.id ? 'active' : ''}`,
      on: { click: () => { selectedId = dec.id; interaction = 'move'; renderAll(); } }
    },
      h('span', { class: `deco-icon deco-${dec.type}` }),
      h('span', { class: 'deco-row-name' }, h('strong', { text: dec.type === 'candle-number' ? `数字蜡烛 ${dec.number ?? ''}` : TYPE_LABELS[dec.type] }), h('small', { text: `(${dec.x.toFixed(1)}, ${dec.z.toFixed(1)}) · ${Math.round((dec.rotation * 180) / Math.PI)}°` })),
      h('span', { class: 'deco-count-badge', text: `×${dec.scale.toFixed(1)}` })
    ));
    right.append(h('div', { class: 'panel' }, h('h2', { text: `已摆放 ${d.decorations.length} 件` }), h('div', { class: 'deco-list' }, ...rows.length ? rows : [h('div', { class: 'empty-state small', text: '暂无装饰件' })]) ));
  }

  function renderAll(): void {
    renderLeft();
    renderRight();
  }

  renderAll();
  return () => viewport.destroy();
}
