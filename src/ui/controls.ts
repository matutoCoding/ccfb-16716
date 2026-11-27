import { PIGMENT_CARDS } from '../data/palettes';
import { h } from './dom';

export function pigmentSwatches(onPick: (hex: string) => void, current?: string): HTMLElement {
  return h('div', { class: 'swatch-grid', dataset: { component: 'pigments' } },
    ...PIGMENT_CARDS.map((c) => h('button', {
      type: 'button',
      class: `swatch ${current?.toLowerCase() === c.hex.toLowerCase() ? 'selected' : ''}`,
      title: c.name,
      attrs: { 'aria-label': c.name, style: `background:${c.hex}` },
      on: {
        click: () => {
          onPick(c.hex);
          document.querySelectorAll('.swatch.selected').forEach((el) => el.classList.remove('selected'));
        }
      }
    }))
  );
}

export function sectionTitle(title: string, desc?: string): HTMLElement {
  return h('div', { class: 'section-title' }, h('h3', { text: title }), desc ? h('p', { class: 'muted small', text: desc }) : null);
}

export function statPill(label: string, value: string, tone = ''): HTMLElement {
  return h('div', { class: `stat-pill ${tone}`.trim() }, h('span', { text: label }), h('strong', { text: value }));
}
