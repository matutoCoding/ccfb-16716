// 轨道相机 + 两种灯光场景
import type { LightingScene } from '../model/types.ts'
import { clamp, normalize, v3, type Vec3 } from '../lib/math3d.ts'

export interface OrbitCamera {
  target: Vec3
  yaw: number
  pitch: number
  distance: number
  fovY: number
}

export const createCamera = (targetY = 14): OrbitCamera => ({
  target: v3(0, targetY, 0),
  yaw: 0.7,
  pitch: 0.42,
  distance: 62,
  fovY: Math.PI / 4.5
})

export function cameraPosition(camera: OrbitCamera): Vec3 {
  const cp = Math.cos(camera.pitch)
  return [
    camera.target[0] + camera.distance * cp * Math.sin(camera.yaw),
    camera.target[1] + camera.distance * Math.sin(camera.pitch),
    camera.target[2] + camera.distance * cp * Math.cos(camera.yaw)
  ]
}

// 视图逆矩阵（列主序 4x4），着色器里用它把屏幕方向转到世界
export function viewInverseMatrix(camera: OrbitCamera): Float32Array {
  const eye = cameraPosition(camera)
  const f = normalize([
    camera.target[0] - eye[0],
    camera.target[1] - eye[1],
    camera.target[2] - eye[2]
  ])
  const worldUp: Vec3 = [0, 1, 0]
  const r = normalize(cross3(f, worldUp))
  const u = cross3(r, f)
  // 旋转部分的逆 = 转置，平移 = -R^T * eye
  const tx = -(r[0] * eye[0] + r[1] * eye[1] + r[2] * eye[2])
  const ty = -(u[0] * eye[0] + u[1] * eye[1] + u[2] * eye[2])
  const tz = f[0] * eye[0] + f[1] * eye[1] + f[2] * eye[2]
  return new Float32Array([
    r[0], u[0], -f[0], 0,
    r[1], u[1], -f[1], 0,
    r[2], u[2], -f[2], 0,
    tx, ty, tz, 1
  ])
}

function cross3(a: Vec3, b: Vec3): Vec3 {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0]
  ]
}

export const orbitDrag = (camera: OrbitCamera, dx: number, dy: number): void => {
  camera.yaw -= dx * 0.006
  camera.pitch = clamp(camera.pitch + dy * 0.006, -0.15, 1.35)
}

export const orbitZoom = (camera: OrbitCamera, delta: number): void => {
  camera.distance = clamp(camera.distance * Math.exp(delta * 0.0012), 22, 130)
}

export interface LightSetup {
  lightDir: Vec3
  lightColor: Vec3
  ambient: Vec3
  envTop: Vec3
  envBottom: Vec3
}

// 店内：中性白光，柔和均匀；婚礼现场：暖金主光，暗环境突出烛光氛围
export const LIGHTING: Record<LightingScene, LightSetup> = {
  shop: {
    lightDir: normalize([0.45, 0.88, 0.32]),
    lightColor: [1.08, 1.05, 0.98],
    ambient: [0.42, 0.42, 0.44],
    envTop: [0.92, 0.93, 0.96],
    envBottom: [0.55, 0.54, 0.52]
  },
  wedding: {
    lightDir: normalize([-0.35, 0.72, 0.55]),
    lightColor: [1.18, 0.95, 0.66],
    ambient: [0.26, 0.22, 0.24],
    envTop: [0.55, 0.42, 0.36],
    envBottom: [0.18, 0.13, 0.15]
  }
}
