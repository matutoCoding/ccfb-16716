export type Child = Node | string | number | false | null | undefined | any;

interface ElOptions {
  class?: string;
  id?: string;
  title?: string;
  type?: string;
  value?: string | number | boolean;
  text?: string;
  html?: string;
  attrs?: Record<string, string | number | boolean | undefined | null>;
  props?: Record<string, unknown>;
  on?: Record<string, EventListenerOrEventListenerObject>;
  dataset?: Record<string, string | number | boolean>;
}

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, options: ElOptions = {}, ...children: Child[]): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (options.class) node.className = options.class;
  if (options.id) node.id = options.id;
  if (options.title) node.title = options.title;
  if (options.type) (node as HTMLButtonElement | HTMLInputElement).type = options.type;
  if (options.value !== undefined) (node as HTMLInputElement).value = String(options.value);
  if (options.text !== undefined) node.textContent = options.text;
  if (options.html !== undefined) node.innerHTML = options.html;
  if (options.attrs) {
    for (const [key, value] of Object.entries(options.attrs)) {
      if (value === undefined || value === null || value === false) continue;
      node.setAttribute(key, value === true ? '' : String(value));
    }
  }
  if (options.props) {
    for (const [key, value] of Object.entries(options.props)) {
      (node as unknown as Record<string, unknown>)[key] = value;
    }
  }
  if (options.on) {
    for (const [event, handler] of Object.entries(options.on)) node.addEventListener(event, handler);
  }
  if (options.dataset) {
    for (const [key, value] of Object.entries(options.dataset)) node.dataset[key] = String(value);
  }
  appendChildren(node, children);
  return node;
}

export function appendChildren(node: HTMLElement, children: Child[]): void {
  for (const child of children.flat(Infinity) as Child[]) {
    if (child === false || child === null || child === undefined) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
}

export function clear(node: HTMLElement): void {
  node.replaceChildren();
}

export function field(label: string, input: HTMLElement, hint?: string): HTMLLabelElement {
  return h('label', { class: 'field' },
    h('span', { class: 'field-label', text: label }),
    input,
    hint ? h('small', { class: 'field-hint', text: hint }) : null
  );
}

export function sliderRow(label: string, value: number, min: number, max: number, step: number, onInput: (value: number) => void, format?: (v: number) => string): HTMLElement {
  const output = h('output', { text: format ? format(value) : String(value) });
  const input = h('input', {
    attrs: { type: 'range', min, max, step, value },
    on: {
      input: () => {
        const v = Number((input as HTMLInputElement).value);
        output.textContent = format ? format(v) : String(v);
        onInput(v);
      }
    }
  }) as HTMLInputElement;
  return h('div', { class: 'slider-row' },
    h('div', { class: 'slider-head' }, h('span', { text: label }), output),
    input
  );
}

export function button(label: string, onClick: () => void, variant = '', attrs: Record<string, unknown> = {}): HTMLButtonElement {
  return h('button', {
    class: `btn ${variant}`.trim(),
    type: 'button',
    text: label,
    on: { click: () => onClick() },
    ...attrs
  }) as HTMLButtonElement;
}

export function selectRow<T extends string>(label: string, value: T, options: Array<{ value: T; label: string }>, onChange: (value: T) => void): HTMLElement {
  const select = h('select', {
    on: { change: () => onChange((select as HTMLSelectElement).value as T) }
  }) as HTMLSelectElement;
  for (const opt of options) {
    const o = h('option', { attrs: { value: opt.value }, text: opt.label }) as HTMLOptionElement;
    if (opt.value === value) o.selected = true;
    select.append(o);
  }
  return field(label, select);
}

export function colorInput(value: string, onChange: (value: string) => void): HTMLInputElement {
  return h('input', {
    attrs: { type: 'color', value },
    on: { input: (e) => onChange((e.target as HTMLInputElement).value) }
  }) as HTMLInputElement;
}

export function downloadBlob(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
