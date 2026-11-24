// 色素调色与材质参数
import type { AppSettings, MaterialKind, RGB } from '../model/types.ts'
import { clamp } from './math3d.ts'

// 店里的标准色卡（奶油基色上的可成品颜色）
export interface ColorCardItem {
  name: string
  value: RGB
}

export const COLOR_CARD: ColorCardItem[] = [
  { name: '象牙白', value: { r: 250, g: 244, b: 234 } },
  { name: '奶油黄', value: { r: 247, g: 222, b: 150 } },
  { name: '樱花粉', value: { r: 244, g: 178, b: 196 } },
  { name: '玫瑰红', value: { r: 206, g: 74, b: 96 } },
  { name: '车厘子', value: { r: 132, g: 31, b: 49 } },
  { name: '香芋紫', value: { r: 183, g: 159, b: 219 } },
  { name: '薄荷绿', value: { r: 167, g: 219, b: 197 } },
  { name: '抹茶绿', value: { r: 132, g: 166, b: 109 } },
  { name: '天空蓝', value: { r: 154, g: 196, b: 232 } },
  { name: '雾霾蓝', value: { r: 93, g: 128, b: 166 } },
  { name: '焦糖棕', value: { r: 166, g: 109, b: 74 } },
  { name: '巧克力', value: { r: 79, g: 47, b: 35 } },
  { name: '镜面黑', value: { r: 28, g: 26, b: 30 } },
  { name: '珠光金', value: { r: 214, g: 181, b: 111 } }
]

export const rgbToCss = (c: RGB): string =>
  `rgb(${Math.round(c.r)}, ${Math.round(c.g)}, ${Math.round(c.b)})`

export const rgbEqual = (a: RGB, b: RGB): boolean =>
  a.r === b.r && a.g === b.g && a.b === b.b

// 自定义调色：HSL → RGB
export function hslToRgb(h: number, s: number, l: number): RGB {
  const hue = ((h % 360) + 360) % 360
  const c = (1 - Math.abs(2 * l - 1)) * s
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1))
  const m = l - c / 2
  let r1 = 0
  let g1 = 0
  let b1 = 0
  if (hue < 60) [r1, g1, b1] = [c, x, 0]
  else if (hue < 120) [r1, g1, b1] = [x, c, 0]
  else if (hue < 180) [r1, g1, b1] = [0, c, x]
  else if (hue < 240) [r1, g1, b1] = [0, x, c]
  else if (hue < 300) [r1, g1, b1] = [x, 0, c]
  else [r1, g1, b1] = [c, 0, x]
  return {
    r: Math.round((r1 + m) * 255),
    g: Math.round((g1 + m) * 255),
    b: Math.round((b1 + m) * 255)
  }
}

// 奶油打发程度影响色深：打发越高气泡越多，颜色越浅（向白色混合）
export function whippedColor(base: RGB, whip: number): RGB {
  const t = clamp((whip - 0.4) / 0.6, 0, 1) * 0.38
  return {
    r: Math.round(base.r + (255 - base.r) * t),
    g: Math.round(base.g + (255 - base.g) * t),
    b: Math.round(base.b + (255 - base.b) * t)
  }
}

// 材质渲染参数（着色器与统计共用）
export interface MaterialParams {
  roughness: number
  // 0=奶油颗粒 1=翻糖哑光 2=镜面反射
  mode: number
  densityKey: keyof Pick<AppSettings, 'creamDensity' | 'fondantDensity' | 'glazeDensity'>
}

export const MATERIAL_PARAMS: Record<MaterialKind, MaterialParams> = {
  cream: { roughness: 0.62, mode: 0, densityKey: 'creamDensity' },
  fondant: { roughness: 0.42, mode: 1, densityKey: 'fondantDensity' },
  glaze: { roughness: 0.06, mode: 2, densityKey: 'glazeDensity' }
}

// 默认设置（首次启动写入 IndexedDB）
export const DEFAULT_SETTINGS: AppSettings = {
  creamDensity: 0.45,
  fondantDensity: 1.25,
  glazeDensity: 1.1,
  renderScale: 1,
  targetFps: 30
}
