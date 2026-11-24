// 共享 3D 视口：封装渲染器生命周期、轨道交互、FPS 浮层
import type { CakeDesign } from '../model/types.ts'
import { CakeRenderer, type FpsSample } from '../render/renderer.ts'
import { store } from '../state/store.ts'
import { el } from './dom.ts'

export interface ViewportHandle {
  root: HTMLElement
  setDesign: (design: CakeDesign) => void
  setLighting: (design: CakeDesign) => void
  renderer: () => CakeRenderer | null
  dispose: () => void
}

export function createViewport(showHud = true): ViewportHandle {
  const canvas = el('canvas', {})
  const hud = el('div', { class: 'hud' })
  const fpsBadge = el('div', { class: 'badge' }, ['FPS --'])
  const segBadge = el('div', { class: 'badge' }, ['管段 0'])
  if (showHud) hud.append(fpsBadge, segBadge)
  const root = el('div', { class: 'viewport' }, [canvas, hud])

  let renderer: CakeRenderer | null = null
  try {
    renderer = new CakeRenderer(canvas)
    renderer.onFps = (sample: FpsSample) => {
      fpsBadge.textContent = `FPS ${sample.fps} · 缩放 ${Math.round(sample.adaptiveScale * 100)}%`
    }
    renderer.setTargetFps(store.getState().settings.targetFps)
    renderer.start()
  } catch (error) {
    root.append(
      el('div', { class: 'empty-state' }, [
        el('h3', {}, ['WebGL2 不可用']),
        el('p', {}, [(error as Error).message])
      ])
    )
  }

  let dragging = false
  let lastX = 0
  let lastY = 0
  canvas.addEventListener('pointerdown', (event) => {
    dragging = true
    lastX = event.clientX
    lastY = event.clientY
    canvas.setPointerCapture(event.pointerId)
  })
  canvas.addEventListener('pointermove', (event) => {
    if (!dragging || !renderer) return
    renderer.drag(event.clientX - lastX, event.clientY - lastY)
    lastX = event.clientX
    lastY = event.clientY
  })
  const endDrag = (): void => {
    dragging = false
  }
  canvas.addEventListener('pointerup', endDrag)
  canvas.addEventListener('pointercancel', endDrag)
  canvas.addEventListener(
    'wheel',
    (event) => {
      event.preventDefault()
      renderer?.zoom(event.deltaY)
    },
    { passive: false }
  )

  return {
    root,
    setDesign(next: CakeDesign) {
      renderer?.setDesign(next)
      segBadge.textContent = `管段 ${renderer?.getSegmentCount() ?? 0}`
    },
    setLighting(next: CakeDesign) {
      renderer?.setLighting(next.lighting)
    },
    renderer: () => renderer,
    dispose() {
      renderer?.stop()
    }
  }
}
