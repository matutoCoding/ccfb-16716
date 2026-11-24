// DOM 构建辅助：统一走 el()，避免散落 innerHTML
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Partial<HTMLElementTagNameMap[K]> & { class?: string } = {},
  children: (Node | string)[] = []
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag)
  for (const [key, value] of Object.entries(props)) {
    if (key === 'class') node.className = value as string
    else if (key.startsWith('on') && typeof value === 'function') {
      node.addEventListener(key.slice(2).toLowerCase(), value as EventListener)
    } else if (key === 'dataset') {
      Object.assign(node.dataset, value)
    } else {
      ;(node as Record<string, unknown>)[key] = value
    }
  }
  for (const child of children) {
    node.append(child instanceof Node ? child : document.createTextNode(child))
  }
  return node
}

export function clear(node: HTMLElement): void {
  node.replaceChildren()
}

export function mount(node: HTMLElement): void {
  const app = document.querySelector('#app')
  if (!app) throw new Error('#app 根节点缺失')
  app.replaceChildren(node)
}

// 数字输入框，带单位与标签
export function numberField(
  label: string,
  value: number,
  onChange: (value: number) => void,
  options: { min?: number; max?: number; step?: number; unit?: string } = {}
): HTMLElement {
  const input = el('input', {
    type: 'number',
    value: String(value),
    min: options.min,
    max: options.max,
    step: options.step ?? 0.5,
    oninput: () => {
      const parsed = Number(input.value)
      if (Number.isFinite(parsed)) onChange(parsed)
    }
  })
  return el('div', {}, [
    el('label', {}, [label + (options.unit ? `（${options.unit}）` : '')]),
    input
  ])
}

export function textField(
  label: string,
  value: string,
  onChange: (value: string) => void,
  options: { type?: string; placeholder?: string } = {}
): HTMLElement {
  const input = el('input', {
    type: options.type ?? 'text',
    value,
    placeholder: options.placeholder,
    oninput: () => onChange(input.value)
  })
  return el('div', {}, [el('label', {}, [label]), input])
}
