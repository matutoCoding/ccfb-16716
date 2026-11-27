import { store } from '../state/store';
import { h, button, clear, field, selectRow, sliderRow, colorInput } from '../ui/dom';
import { createViewport } from '../ui/viewport';
import { pigmentSwatches } from '../ui/controls';
import { createTier } from '../data/defaults';
import { estimateServings, recommendTiers } from '../lib/geometry';
import { collectMaterials } from '../lib/stats';
import type { CakeShape, CoatingMaterial, Tier } from '../types';

export function mountCake(root: HTMLElement): () => void {
  const design = store.currentDesign;
  if (!design) {
    root.append(h('div', { class: 'empty-state page', text: '请先在订单页创建或选择一个方案。' }));
    return () => {};
  }

  const viewport = createViewport({ mode: 'orbit', hint: '蛋糕胚 / 材质预览：拖拽旋转，滚轮缩放' });
  const side = h('aside', { class: 'control-panel' });
  const layout = h('div', { class: 'design-layout' }, h('div', { class: 'canvas-card panel' }, viewport.root), side);
  root.append(h('div', { class: 'page design-page' },
    h('div', { class: 'page-header compact' },
      h('div', {}, h('h1', { text: '蛋糕胚与材质' }), h('p', { class: 'muted', text: '圆 / 方 / 心形多层叠加；尺寸按人数推荐，奶油、翻糖、镜面淋面分别着色。' }))
    ),
    layout
  ));

  const renderControls = () => {
    clear(side);
    const d = store.currentDesign;
    const order = store.currentOrder;
    if (!d) return;
    const mats = collectMaterials(d);

    const nameInput = h('input', {
      attrs: { value: d.name },
      on: { change: (e) => store.mutateDesign((x) => { x.name = (e.target as HTMLInputElement).value; }) }
    }) as HTMLInputElement;

    const recommendBox = h('div', { class: 'panel inner-panel recommend' },
      h('div', { class: 'recommend-head' }, h('strong', { text: '按人数推荐尺寸' }), h('span', { class: 'muted', text: `${order?.people ?? 12} 人 · ${order?.eventType === 'wedding' ? '婚礼切块' : '派对切块'}` })),
      h('div', { class: 'recommend-sizes', text: recommendTiers(order?.people ?? 12, order?.eventType ?? 'party').map((s) => `${s}cm`).join(' / ') }),
      button('应用推荐层数和直径', () => {
        const sizes = recommendTiers(order?.people ?? 12, order?.eventType ?? 'party');
        store.mutateDesign((x) => {
          const old = x.tiers;
          x.tiers = sizes.map((size, i) => createTier({
            id: old[i]?.id,
            sizeCm: size,
            heightCm: old[i]?.heightCm ?? (i === 0 ? 12 : 10),
            shape: old[i]?.shape ?? 'round',
            material: old[i]?.material ?? (i === 0 ? 'fondant' : 'cream'),
            color: old[i]?.color ?? '#fff1d6',
            whip: old[i]?.whip ?? 55
          }));
        });
        renderControls();
        store.toast('已按人数更新尺寸');
      }, 'btn-secondary btn-sm')
    );

    const tierCards = d.tiers.map((tier, index) => renderTierCard(tier, index, () => renderControls()));
    const addBtn = button('＋ 叠加一层', () => {
      store.mutateDesign((x) => {
        const last = x.tiers[x.tiers.length - 1];
        x.tiers.push(createTier({ sizeCm: Math.max(10, (last?.sizeCm ?? 20) - 6), heightCm: 10, offsetXCm: 0 }));
      });
      renderControls();
    }, 'btn-primary');

    const summary = h('div', { class: 'panel inner-panel material-summary' },
      h('h3', { text: '规格与用料速览' }),
      h('div', { class: 'summary-grid' },
        h('div', {}, h('span', { text: '建议份量' }), h('strong', { text: `${mats.total?.serves ?? 0} 人份` })),
        h('div', {}, h('span', { text: '蛋糕胚' }), h('strong', { text: `${Math.round(mats.total?.spongeG ?? 0)} g` })),
        h('div', {}, h('span', { text: '外皮用料' }), h('strong', { text: `${Math.round(mats.total?.coatingG ?? 0)} g` })),
        h('div', {}, h('span', { text: '裱花奶油' }), h('strong', { text: `${(mats.total?.pipingVolumeCm3 ?? 0).toFixed(1)} ml` }))
      )
    );

    side.append(
      h('div', { class: 'panel' },
        h('h2', { text: '方案' }),
        field('方案名称', nameInput),
        recommendBox
      ),
      h('div', { class: 'tier-list' }, ...tierCards),
      ...(d.tiers.length < 5 ? [addBtn] : []),
      summary
    );
  };

  renderControls();
  return () => viewport.destroy();
}

function renderTierCard(tier: Tier, index: number, rerender: () => void): HTMLElement {
  const update = (fn: (t: Tier) => void) => store.mutateDesign((d) => {
    const t = d.tiers[index];
    if (t) fn(t);
  });

  const shapeSelect = selectRow<CakeShape>('形状', tier.shape, [
    { value: 'round', label: '圆形' }, { value: 'square', label: '方形' }, { value: 'heart', label: '心形' }
  ], (v) => { update((t) => { t.shape = v; }); rerender(); });

  const materialSelect = selectRow<CoatingMaterial>('外皮材质', tier.material, [
    { value: 'cream', label: '奶油（颗粒哑光）' },
    { value: 'fondant', label: '翻糖（平滑微亮）' },
    { value: 'glaze', label: '镜面淋面（滴落高光）' }
  ], (v) => { update((t) => { t.material = v; }); rerender(); });

  const sizeLabel = tier.shape === 'square' ? '边长' : '直径';
  const card = h('div', { class: 'panel tier-card' },
    h('div', { class: 'panel-title-row' },
      h('h2', { text: `第 ${index + 1} 层` }),
      h('div', { class: 'tier-head-actions' },
        h('span', { class: 'badge', text: `${estimateServings(tier)} 人份` }),
        button('删除', () => {
          if (store.currentDesign!.tiers.length <= 1) { store.toast('至少保留一层'); return; }
          store.mutateDesign((d) => { d.tiers.splice(index, 1); });
          rerender();
        }, 'btn-text-danger btn-sm')
      )
    ),
    shapeSelect,
    sliderRow(`${sizeLabel} ${tier.sizeCm.toFixed(1)} cm`, tier.sizeCm, 10, 42, 0.5, (v) => update((t) => { t.sizeCm = v; }), (v) => `${v.toFixed(1)}cm`),
    sliderRow(`高度 ${tier.heightCm.toFixed(1)} cm`, tier.heightCm, 6, 16, 0.5, (v) => update((t) => { t.heightCm = v; }), (v) => `${v.toFixed(1)}cm`),
    sliderRow(`X 偏移 ${tier.offsetXCm.toFixed(1)}`, tier.offsetXCm, -6, 6, 0.2, (v) => update((t) => { t.offsetXCm = v; })),
    sliderRow(`Z 偏移 ${tier.offsetZCm.toFixed(1)}`, tier.offsetZCm, -6, 6, 0.2, (v) => update((t) => { t.offsetZCm = v; })),
    materialSelect
  );

  const colorTarget = tier.material === 'glaze' ? tier.glaze.color : tier.color;
  const color = colorInput(colorTarget, (hex) => update((t) => {
    if (t.material === 'glaze') t.glaze.color = hex;
    else t.color = hex;
  }));
  card.append(field(tier.material === 'glaze' ? '淋面颜色（色卡调色）' : '奶油/翻糖颜色', color));
  card.append(pigmentSwatches((hex) => {
    update((t) => { if (t.material === 'glaze') t.glaze.color = hex; else t.color = hex; });
    rerender();
  }, colorTarget));

  card.append(sliderRow(`打发程度 ${tier.whip}%（越高颜色越浅）`, tier.whip, 0, 100, 1, (v) => update((t) => { t.whip = Math.round(v); }), (v) => `${Math.round(v)}%`));

  if (tier.material === 'glaze') {
    card.append(
      h('div', { class: 'glaze-box' },
        h('strong', { text: '淋面滴落' }),
        sliderRow(`滴落条数 ${tier.glaze.drips}`, tier.glaze.drips, 0, 24, 1, (v) => update((t) => { t.glaze.drips = Math.round(v); }), (v) => `${Math.round(v)} 条`),
        sliderRow(`最长滴落 ${tier.glaze.dripLengthCm.toFixed(1)} cm`, tier.glaze.dripLengthCm, 1, 10, 0.1, (v) => update((t) => { t.glaze.dripLengthCm = v; }), (v) => `${v.toFixed(1)}cm`)
      )
    );
  }
  return card;
}
