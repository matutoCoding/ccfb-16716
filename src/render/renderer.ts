// WebGL2 渲染器：SDF 光线步进全屏通道 + 自适应分辨率保帧率
import type { CakeDesign, LightingScene } from '../model/types.ts'
import { buildScene, GRID_MAX_PER_CELL, MAX_DECORATIONS, MAX_SEGMENTS } from './scene_build.ts'
import { VERT_SRC } from './shader_vert.ts'
import { SDF_LIB } from './shader_sdf.ts'
import { MARCH_LIB } from './shader_march.ts'
import {
  cameraPosition,
  createCamera,
  LIGHTING,
  orbitDrag,
  orbitZoom,
  viewInverseMatrix,
  type OrbitCamera
} from './camera.ts'

const SEG_COLS = 13

export interface FpsSample {
  fps: number
  drawCalls: number
  adaptiveScale: number
}

export class CakeRenderer {
  private gl: WebGL2RenderingContext
  private program: WebGLProgram
  private uniforms = new Map<string, WebGLUniformLocation | null>()
  private vao: WebGLVertexArrayObject
  private segTexture: WebGLTexture
  private gridIndexTexture: WebGLTexture
  private camera: OrbitCamera = createCamera()
  private raf = 0
  private running = false
  private startTime = performance.now()
  private frameTimes: number[] = []
  private adaptiveScale = 1
  private targetFps = 30
  private design: CakeDesign | null = null
  private lighting: LightingScene = 'shop'
  private scene = buildScene({
    id: 'empty',
    name: 'empty',
    layers: [],
    paths: [],
    decorations: [],
    lighting: 'shop',
    createdAt: 0,
    updatedAt: 0
  })

  onFps: ((sample: FpsSample) => void) | null = null

  constructor(private canvas: HTMLCanvasElement) {
    const gl = canvas.getContext('webgl2', { antialias: false, alpha: false })
    if (!gl) throw new Error('当前浏览器不支持 WebGL2')
    this.gl = gl
    this.program = this.buildProgram()
    this.vao = gl.createVertexArray() as WebGLVertexArrayObject
    this.segTexture = this.createDataTexture(SEG_COLS, MAX_SEGMENTS, gl.RGBA32F, gl.RGBA, gl.FLOAT)
    this.gridIndexTexture = this.createDataTexture(
      GRID_MAX_PER_CELL,
      1,
      gl.R32I,
      gl.RED_INTEGER,
      gl.INT
    )
    this.bindStaticUniforms()
  }

  private buildProgram(): WebGLProgram {
    const gl = this.gl
    const compile = (type: number, source: string): WebGLShader => {
      const shader = gl.createShader(type) as WebGLShader
      gl.shaderSource(shader, source)
      gl.compileShader(shader)
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        const log = gl.getShaderInfoLog(shader)
        gl.deleteShader(shader)
        throw new Error(`着色器编译失败: ${log}`)
      }
      return shader
    }
    const vs = compile(gl.VERTEX_SHADER, VERT_SRC)
    const fs = compile(gl.FRAGMENT_SHADER, `#version 300 es\nprecision highp float;\n${SDF_LIB}\n${MARCH_LIB}`)
    const program = gl.createProgram() as WebGLProgram
    gl.attachShader(program, vs)
    gl.attachShader(program, fs)
    gl.linkProgram(program)
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error(`着色器链接失败: ${gl.getProgramInfoLog(program)}`)
    }
    gl.deleteShader(vs)
    gl.deleteShader(fs)
    return program
  }

  private createDataTexture(
    width: number,
    height: number,
    internal: number,
    format: number,
    type: number
  ): WebGLTexture {
    const gl = this.gl
    const texture = gl.createTexture() as WebGLTexture
    gl.bindTexture(gl.TEXTURE_2D, texture)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    gl.texImage2D(gl.TEXTURE_2D, 0, internal, width, height, 0, format, type, null)
    return texture
  }

  private uniform(name: string): WebGLUniformLocation | null {
    if (!this.uniforms.has(name)) {
      this.uniforms.set(name, this.gl.getUniformLocation(this.program, name))
    }
    return this.uniforms.get(name) ?? null
  }

  private bindStaticUniforms(): void {
    const gl = this.gl
    gl.useProgram(this.program)
    gl.uniform1i(this.uniform('uSegments'), 0)
    gl.uniform1i(this.uniform('uGridIndex'), 1)
  }

  setDesign(design: CakeDesign): void {
    this.design = design
    this.lighting = design.lighting
    this.scene = buildScene(design)
    this.uploadScene()
    const topHeight = design.layers.reduce((sum, layer) => sum + layer.height, 0)
    this.camera = createCamera(Math.max(8, topHeight * 0.55))
  }

  setLighting(scene: LightingScene): void {
    this.lighting = scene
  }

  getCamera(): OrbitCamera {
    return this.camera
  }

  drag(dx: number, dy: number): void {
    orbitDrag(this.camera, dx, dy)
  }

  zoom(delta: number): void {
    orbitZoom(this.camera, delta)
  }

  setTargetFps(fps: number): void {
    this.targetFps = fps
  }

  private uploadScene(): void {
    const gl = this.gl
    const scene = this.scene

    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, this.segTexture)
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA32F,
      SEG_COLS,
      MAX_SEGMENTS,
      0,
      gl.RGBA,
      gl.FLOAT,
      scene.segBuffer
    )

    gl.activeTexture(gl.TEXTURE1)
    const cellCount = scene.grid.cellsX * scene.grid.cellsY * scene.grid.cellsZ
    gl.bindTexture(gl.TEXTURE_2D, this.gridIndexTexture)
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.R32I,
      GRID_MAX_PER_CELL,
      cellCount,
      0,
      gl.RED_INTEGER,
      gl.INT,
      scene.gridIndex
    )

    const g = scene.grid
    gl.uniform1i(this.uniform('uSegmentCount'), scene.segments.length)
    gl.uniform1i(this.uniform('uGridCellsX'), g.cellsX)
    gl.uniform1i(this.uniform('uGridCellsY'), g.cellsY)
    gl.uniform1i(this.uniform('uGridCellsZ'), g.cellsZ)
    gl.uniform1f(this.uniform('uCellSizeX'), g.cellX)
    gl.uniform1f(this.uniform('uCellSizeY'), g.cellY)
    gl.uniform1f(this.uniform('uCellSizeZ'), g.cellZ)
    gl.uniform3f(this.uniform('uGridOrigin'), g.originX, g.originY, g.originZ)

    gl.uniform1i(this.uniform('uLayerCount'), scene.layers.length)
    scene.layers.forEach((layer, i) => {
      gl.uniform4f(
        this.uniform(`uLayerShapeRadius[${i}]`),
        layer.shape,
        layer.radius,
        layer.height,
        layer.yBottom
      )
      gl.uniform4f(this.uniform(`uLayerMat[${i}]`), layer.material, layer.drip, 0, 0)
      gl.uniform3f(this.uniform(`uLayerColor[${i}]`), layer.r, layer.g, layer.b)
    })

    gl.uniform1i(this.uniform('uDecorationCount'), scene.decorations.length)
    scene.decorations.forEach((d, i) => {
      gl.uniform4f(this.uniform(`uDecPosScale[${i}]`), d.x, d.y, d.z, d.scale)
      gl.uniform4f(this.uniform(`uDecMeta[${i}]`), d.kind, d.rotation, d.digit, 0)
      gl.uniform3f(this.uniform(`uDecColor[${i}]`), d.r, d.g, d.b)
    })
  }

  start(): void {
    if (this.running) return
    this.running = true
    const loop = (): void => {
      if (!this.running) return
      this.renderFrame()
      this.raf = requestAnimationFrame(loop)
    }
    this.raf = requestAnimationFrame(loop)
  }

  stop(): void {
    this.running = false
    cancelAnimationFrame(this.raf)
  }

  private renderFrame(): void {
    const gl = this.gl
    const dpr = Math.min(window.devicePixelRatio || 1, 2) * this.adaptiveScale
    const width = Math.max(1, Math.floor(this.canvas.clientWidth * dpr))
    const height = Math.max(1, Math.floor(this.canvas.clientHeight * dpr))
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width
      this.canvas.height = height
    }

    const now = performance.now()
    const light = LIGHTING[this.lighting]
    const eye = cameraPosition(this.camera)
    gl.uniform3f(this.uniform('uCamPos'), eye[0], eye[1], eye[2])
    gl.uniformMatrix4fv(this.uniform('uViewInverse'), false, viewInverseMatrix(this.camera))
    gl.uniform1f(this.uniform('uTanFov'), Math.tan(this.camera.fovY / 2))
    gl.uniform2f(this.uniform('uResolution'), width, height)
    gl.uniform3f(this.uniform('uLightDir'), light.lightDir[0], light.lightDir[1], light.lightDir[2])
    gl.uniform3f(this.uniform('uLightColor'), light.lightColor[0], light.lightColor[1], light.lightColor[2])
    gl.uniform3f(this.uniform('uAmbient'), light.ambient[0], light.ambient[1], light.ambient[2])
    gl.uniform3f(this.uniform('uEnvTop'), light.envTop[0], light.envTop[1], light.envTop[2])
    gl.uniform3f(this.uniform('uEnvBottom'), light.envBottom[0], light.envBottom[1], light.envBottom[2])
    gl.uniform1f(this.uniform('uTime'), (now - this.startTime) / 1000)

    gl.viewport(0, 0, width, height)
    gl.useProgram(this.program)
    gl.bindVertexArray(this.vao)
    gl.drawArrays(gl.TRIANGLES, 0, 3)

    this.frameTimes.push(now)
    while (this.frameTimes.length > 0 && now - this.frameTimes[0] > 1000) this.frameTimes.shift()
    if (now - this.startTime > 1200 && this.frameTimes.length >= 10) {
      const fps = this.frameTimes.length
      if (fps < this.targetFps * 0.85 && this.adaptiveScale > 0.5) {
        this.adaptiveScale = Math.max(0.5, this.adaptiveScale - 0.1)
      } else if (fps > this.targetFps * 1.2 && this.adaptiveScale < 1) {
        this.adaptiveScale = Math.min(1, this.adaptiveScale + 0.05)
      }
      this.onFps?.({
        fps,
        drawCalls: 1,
        adaptiveScale: Math.round(this.adaptiveScale * 100) / 100
      })
    }
  }

  snapshot(): string {
    this.renderFrame()
    return this.canvas.toDataURL('image/png')
  }

  getSegmentCount(): number {
    return this.scene.segments.length
  }

  getDecorationCapacity(): number {
    return MAX_DECORATIONS
  }
}
