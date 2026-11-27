import { store } from '../state/store';
import { h, button } from '../ui/dom';
import { createViewport } from '../ui/viewport';
import { printProductionSheet } from '../print';
import { composeCustomerImage } from '../lib/exportImage';
import { downloadDataUrl } from '../lib/util';

export function mountPreview(root: HTMLElement): () => void {
  const design = store.currentDesign;
  if (!design) {
    root.append(h('div', { class: 'empty-state page', text: '请先选择一个方案。' }));
    return () => {};
  }

  const viewport = createViewport({ mode: 'orbit', hint: '360° 转着看 · 滚轮缩放 · 可切换店内 / 婚礼现场灯光' });
  const side = h('aside', { class: 'control-panel preview-panel' });
  const layout = h('div', { class: 'preview-layout' }, h('div', { class: 'canvas-card panel preview-canvas' }, viewport.root), side);
  root.append(h('div', { class: 'page preview-page' },
    h('div', { class: 'page-header compact' }, h('div', {}, h('h1', { text: '效果预览与客户图' }), h('p', { class: 'muted', text: 'WebGL2 SDF 光线步进蛋糕材质，实时扫掠挤花网格；导出 PNG 或打印裱花师制作单。' }))),
    layout
  ));

  function renderSide(): void {
    const d = store.currentDesign!;
    const order = store.currentOrder;
    side.replaceChildren(
      h('div', { class: 'panel' },
        h('h2', { text: '灯光场景' }),
        h('div', { class: 'light-switch' },
          button('店里自然光', () => store.mutateDesign((x) => { x.light = 'shop'; }), d.light === 'shop' ? 'btn-primary' : 'btn-ghost'),
          button('婚礼现场暖光', () => store.mutateDesign((x) => { x.light = 'wedding'; }), d.light === 'wedding' ? 'btn-primary' : 'btn-ghost')
        ),
        h('label', { class: 'check-row' },
          (() => {
            const input = h('input', { attrs: { type: 'checkbox' }, on: { change: (e) => store.mutateDesign((x) => { x.settings.autoRotate = (e.target as HTMLInputElement).checked; }) } }) as HTMLInputElement;
            input.checked = d.settings.autoRotate;
            return input;
          })(),
          h('span', { text: '自动旋转展示' })
        ),
        button('复位视角', () => viewport.renderer?.fitCamera(), 'btn-secondary'),
        button('导出客户看的 PNG 图', async () => {
          if (!viewport.renderer) return store.toast('WebGL2 未就绪');
          store.toast('正在生成客户图…');
          const raw = viewport.renderer.captureDataUrl();
          const composed = await composeCustomerImage(raw, order, d);
          downloadDataUrl(`${order?.code ?? 'cake'}-${d.proposalLabel}.png`, composed);
          store.toast('客户图已导出');
        }, 'btn-primary'),
        button('打印 / 导出制作单 PDF', () => {
          const raw = viewport.renderer?.captureDataUrl();
          printProductionSheet(order, d, raw);
        }, 'btn-secondary')
      ),
      h('div', { class: 'panel' },
        h('h2', { text: '预览信息' }),
        h('ul', { class: 'preview-meta' },
          h('li', {}, h('span', { text: '方案' }), h('strong', { text: d.proposalLabel })),
          h('li', {}, h('span', { text: '层数' }), h('strong', { text: `${d.tiers.length} 层` })),
          h('li', {}, h('span', { text: '挤花路径' }), h('strong', { text: `${d.paths.length} 条` })),
          h('li', {}, h('span', { text: '装饰件' }), h('strong', { text: `${d.decorations.length} 件` })),
          h('li', {}, h('span', { text: '渲染分辨率' }), h('strong', { text: `${Math.round(d.settings.renderScale * 100)}%` }))
        )
      )
    );
  }

  const unsub = store.subscribe(() => renderSide());
  renderSide();
  return () => { unsub(); viewport.destroy(); };
}
