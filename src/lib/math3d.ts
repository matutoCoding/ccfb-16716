// 通用工具
import type { ID } from '../model/types.ts'

export const uid = (): ID =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`

export const clamp = (v: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, v))

export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t

// 三维向量（用普通元组，减少对象噪音）
export type Vec3 = [number, number, number]

export const v3 = (x = 0, y = 0, z = 0): Vec3 => [x, y, z]

export const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]

export const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]

export const scale = (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s]

export const dot = (a: Vec3, b: Vec3): number =>
  a[0] * b[0] + a[1] * b[1] + a[2] * b[2]

export const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0]
]

export const length = (a: Vec3): number => Math.hypot(a[0], a[1], a[2])

export const normalize = (a: Vec3): Vec3 => {
  const len = length(a)
  return len < 1e-9 ? [0, 1, 0] : scale(a, 1 / len)
}

export const distance = (a: Vec3, b: Vec3): number => length(sub(a, b))

// 数字保留两位，用于表单/统计展示
export const round2 = (v: number): number => Math.round(v * 100) / 100

// 深拷贝（结构化数据，无函数）
export const clone = <T>(value: T): T => structuredClone(value)
