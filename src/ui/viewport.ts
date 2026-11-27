import { CakeRenderer, type PointerHandlers, type SceneHit } from '../render/Renderer';
import { store } from '../state/store';
import { h } from './dom';

export interface ViewportOptions {
  mode?: 'orbit' | 'draw' | 'place';
  handlers?: PointerHandlers;
  hint?: string;
  className?: string;
}

export interface ViewportHandle {
  root: HTMLElement;
  renderer: CakeRenderer | null;
  destroy: () => void;
}

export function createViewport(options: ViewportOptions = {}): ViewportHandle {
  const fpsBadge = h('div', { class: 'fps-badge', text: 'FPS --' });
  const hint = h('div', { class: 'viewport-hint', text: options.hint ?? '拖拽旋转 · 滚轮缩放 · 右键/Shift 拖拽平移视角' });
  const canvas = h('canvas', { attrs: { 'aria-label': '蛋糕 3D 预览' } }) as HTMLCanvasElement;
  const root = h('div', { class: `viewport ${options.className ?? ''}` }, canvas, fpsBadge, hint);

  let renderer: CakeRenderer | null = null;
  let interval = 0;
  try {
    renderer = new CakeRenderer(
      canvas,
      () => store.currentDesign,
      () => store.state.designVersion
    );
    renderer.setInteraction(options.mode ?? 'orbit', options.handlers);
    interval = window.setInterval(() => {
      if (!renderer) return;
      const fps = renderer.fps;
      fpsBadge.textContent = `${fps} FPS · ${Math.round(renderer.triangleCount / 1000)}k 三角面 · ${Math.round(renderer.effectiveScale * 100)}%`;
      fpsBadge.classList.toggle('fps-warn', fps < 30);
      fpsBadge.classList.toggle('fps-good', fps >= 50);
      fpsBadge.style.display = store.state.settings.showFps ? '' : 'none';
    }, 500);
  } catch (err) {
    console.error(err);
    root.append(h('div', { class: 'webgl-error', html: `<b>WebGL2 初始化失败</b><span>${(err as Error).message}</span><small>请使用最新版 Chrome/Edge，并确认浏览器开启硬件加速。</small>` }));
  }

  return {
    root,
    renderer,
    destroy() {
      window.clearInterval(interval);
      renderer?.dispose();
    }
  };
}

export function hitToPointList(hit: SceneHit | null): [number, number, number] | null {
  if (!hit?.tierId) return null;
  return [hit.x, hit.y + 0.16, hit.z];
}
