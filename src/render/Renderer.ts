import type { Design, TierStackInfo } from '../types';
import { getTierStack, isInsideShape } from '../lib/geometry';
import { getDrips } from '../lib/drips';
import { hexToRgb01, whippedColor } from '../lib/color';
import { buildDesignMeshes } from './sceneBuilder';
import type { MeshData } from './meshData';
import { mat4Identity, mat4Invert, mat4LookAt, mat4Multiply, mat4Perspective, type Mat4, type V3 } from './math';
import { fullscreenVertex, meshFragment, meshVertex, raymarchFragment } from './shaders';

export interface SceneHit {
  tierId?: string;
  x: number;
  y: number;
  z: number;
}

export interface PointerHandlers {
  onSceneDown?: (hit: SceneHit | null, event: PointerEvent) => void;
  onSceneDrag?: (hit: SceneHit | null, event: PointerEvent) => void;
  onSceneUp?: (hit: SceneHit | null, event: PointerEvent) => void;
}

interface GpuMesh {
  vao: WebGLVertexArrayObject;
  buffers: WebGLBuffer[];
  count: number;
}

function compileShader(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) throw new Error('无法创建 WebGL Shader');
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader);
    console.error(source);
    throw new Error(`Shader 编译失败: ${log}`);
  }
  return shader;
}

function createProgram(gl: WebGL2RenderingContext, vsSource: string, fsSource: string): WebGLProgram {
  const vs = compileShader(gl, gl.VERTEX_SHADER, vsSource);
  const fs = compileShader(gl, gl.FRAGMENT_SHADER, fsSource);
  const program = gl.createProgram()!;
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(`Program 链接失败: ${gl.getProgramInfoLog(program)}`);
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  return program;
}

export class CakeRenderer {
  readonly canvas: HTMLCanvasElement;
  private gl: WebGL2RenderingContext;
  private rayProgram: WebGLProgram;
  private meshProgram: WebGLProgram;
  private quadVao: WebGLVertexArrayObject;
  private atlasTexture: WebGLTexture;
  private gpuPiping: GpuMesh | null = null;
  private gpuDeco: GpuMesh | null = null;
  private gpuNumbers: GpuMesh | null = null;
  private resizeObserver: ResizeObserver;
  private raf = 0;
  private disposed = false;
  private lastVersion = -1;
  private design: Design | undefined;
  private stack: TierStackInfo[] = [];
  private viewProj: Mat4 = mat4Identity();
  private invViewProj: Mat4 = mat4Identity();
  private camPos: V3 = [40, 30, 48];

  theta = 0.68;
  phi = 1.04;
  radius = 52;
  target: V3 = [0, 12, 0];
  interaction: 'orbit' | 'draw' | 'place' = 'orbit';
  handlers: PointerHandlers = {};

  private pointer: { id: number; x: number; y: number; dragging: boolean; orbit: boolean; moved: boolean } | null = null;
  private lastTime = performance.now();
  private fpsAccum = 0;
  private fpsFrames = 0;
  private lowFpsTicks = 0;
  private highFpsTicks = 0;
  private adaptiveScale = 1;
  fps = 60;
  triangleCount = 0;
  get effectiveScale(): number {
    return this.adaptiveScale * (this.design?.settings.renderScale ?? 0.85);
  }

  constructor(
    canvas: HTMLCanvasElement,
    private getDesign: () => Design | undefined,
    private getVersion: () => number = () => 0
  ) {
    this.canvas = canvas;
    const gl = canvas.getContext('webgl2', { antialias: true, alpha: false, depth: true, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
    if (!gl) throw new Error('当前浏览器或设备未启用 WebGL2');
    this.gl = gl;
    this.rayProgram = createProgram(gl, fullscreenVertex, raymarchFragment);
    this.meshProgram = createProgram(gl, meshVertex, meshFragment);
    this.quadVao = gl.createVertexArray()!;
    this.atlasTexture = this.createNumberAtlas();

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas.parentElement ?? canvas);
    this.resize();

    canvas.addEventListener('pointerdown', this.handleDown);
    canvas.addEventListener('pointermove', this.handleMove);
    window.addEventListener('pointerup', this.handleUp);
    canvas.addEventListener('wheel', this.handleWheel, { passive: false });
    canvas.addEventListener('contextmenu', this.preventMenu);

    this.design = getDesign();
    if (this.design) {
      this.rebuild(this.design);
      this.fitCamera();
    }
    this.lastVersion = this.getVersion();
    this.raf = requestAnimationFrame(this.frame);
  }

  private preventMenu = (e: Event) => e.preventDefault();

  private createNumberAtlas(): WebGLTexture {
    const gl = this.gl;
    const canvas = document.createElement('canvas');
    canvas.width = 1280;
    canvas.height = 512;
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = 'rgba(0,0,0,0.18)';
    ctx.lineWidth = 10;
    ctx.font = '900 218px Arial, "Microsoft YaHei", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let d = 0; d < 10; d++) {
      const col = d % 5;
      const row = Math.floor(d / 5);
      const x = col * 256 + 128;
      const y = row * 256 + 136;
      ctx.strokeText(String(d), x, y);
      ctx.fillText(String(d), x, y);
    }
    const tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return tex;
  }

  resize(): void {
    const parent = this.canvas.parentElement;
    const w = Math.max(1, parent?.clientWidth ?? this.canvas.clientWidth ?? 800);
    const h = Math.max(260, parent?.clientHeight ?? this.canvas.clientHeight ?? 520);
    const d = this.design?.settings ?? { maxPixelRatio: 1.5, renderScale: 0.85 };
    const ratio = Math.min(window.devicePixelRatio || 1, d.maxPixelRatio) * d.renderScale * this.adaptiveScale;
    const width = Math.max(1, Math.floor(w * ratio));
    const height = Math.max(1, Math.floor(h * ratio));
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
      this.canvas.style.width = `${w}px`;
      this.canvas.style.height = `${h}px`;
    }
    this.gl.viewport(0, 0, width, height);
  }

  fitCamera(): void {
    if (!this.design) return;
    this.stack = getTierStack(this.design.tiers);
    const totalH = this.stack.at(-1)?.topY ?? 12;
    let maxBound = 12;
    for (const t of this.design.tiers) {
      const bound = t.shape === 'square' ? t.sizeCm * 0.76 : t.shape === 'heart' ? t.sizeCm * 0.60 : t.sizeCm * 0.54;
      maxBound = Math.max(maxBound, bound);
    }
    const boardBound = maxBound + 4.2;
    this.theta = 0.72;
    this.phi = 0.92;
    this.target = [0, totalH * 0.46, 0];
    this.radius = Math.max(32, boardBound * 2.55, totalH * 2.9);
  }

  setInteraction(mode: 'orbit' | 'draw' | 'place', handlers?: PointerHandlers): void {
    this.interaction = mode;
    if (handlers) this.handlers = handlers;
    this.canvas.style.cursor = mode === 'orbit' ? 'grab' : 'crosshair';
  }

  rebuild(design: Design): void {
    this.design = design;
    this.stack = getTierStack(design.tiers);
    const meshes = buildDesignMeshes(design);
    this.triangleCount = meshes.piping.indices.length / 3 + meshes.decorations.indices.length / 3 + meshes.numbers.indices.length / 3;
    this.gpuPiping = this.uploadMesh(meshes.piping, this.gpuPiping);
    this.gpuDeco = this.uploadMesh(meshes.decorations, this.gpuDeco);
    this.gpuNumbers = this.uploadMesh(meshes.numbers, this.gpuNumbers);
  }

  private uploadMesh(data: MeshData, old: GpuMesh | null): GpuMesh {
    const gl = this.gl;
    if (old) {
      old.buffers.forEach((b) => gl.deleteBuffer(b));
      gl.deleteVertexArray(old.vao);
    }
    const vao = gl.createVertexArray()!;
    gl.bindVertexArray(vao);
    const makeBuffer = (location: number, values: number[], size: number) => {
      const buffer = gl.createBuffer()!;
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(values), gl.STATIC_DRAW);
      gl.enableVertexAttribArray(location);
      gl.vertexAttribPointer(location, size, gl.FLOAT, false, 0, 0);
      return buffer;
    };
    const buffers = [
      makeBuffer(0, data.positions, 3),
      makeBuffer(1, data.normals, 3),
      makeBuffer(2, data.colors, 3),
      makeBuffer(3, data.params, 4),
      makeBuffer(4, data.uvs, 2)
    ];
    const indexBuffer = gl.createBuffer()!;
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint32Array(data.indices), gl.STATIC_DRAW);
    buffers.push(indexBuffer);
    gl.bindVertexArray(null);
    return { vao, buffers, count: data.indices.length };
  }

  private adaptQuality(): void {
    // 旋转或上百朵挤花导致持续低于 30fps 时，先动态降低光线步进/填充分辨率，而不是降低模型数量。
    if (this.fps < 30) {
      this.lowFpsTicks++;
      this.highFpsTicks = 0;
      if (this.lowFpsTicks >= 2 && this.adaptiveScale > 0.62) {
        this.adaptiveScale = Math.max(0.62, this.adaptiveScale - 0.12);
        this.lowFpsTicks = 0;
        this.resize();
      }
    } else if (this.fps >= 55) {
      this.highFpsTicks++;
      this.lowFpsTicks = 0;
      if (this.highFpsTicks >= 6 && this.adaptiveScale < 1) {
        this.adaptiveScale = Math.min(1, this.adaptiveScale + 0.05);
        this.highFpsTicks = 0;
        this.resize();
      }
    }
  }

  private frame = (now: number): void => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.frame);
    const elapsed = Math.max(0.001, (now - this.lastTime) / 1000);
    const dt = Math.min(0.05, elapsed);
    this.lastTime = now;
    this.fpsAccum += elapsed;
    this.fpsFrames++;
    if (this.fpsAccum >= 0.5) {
      this.fps = Math.round(this.fpsFrames / this.fpsAccum);
      this.fpsAccum = 0;
      this.fpsFrames = 0;
      this.adaptQuality();
    }

    const version = this.getVersion();
    const design = this.getDesign();
    if (design && (version !== this.lastVersion || design !== this.design)) {
      this.lastVersion = version;
      this.rebuild(design);
      this.resize();
    }
    if (design?.settings.autoRotate && !this.pointer) this.theta += dt * 0.18;
    this.resize();
    this.render();
  };

  private updateCamera(): void {
    const sinPhi = Math.sin(this.phi);
    this.camPos = [
      this.target[0] + this.radius * sinPhi * Math.sin(this.theta),
      this.target[1] + this.radius * Math.cos(this.phi),
      this.target[2] + this.radius * sinPhi * Math.cos(this.theta)
    ];
    const proj = mat4Perspective(Math.PI / 4.6, this.canvas.width / Math.max(1, this.canvas.height), 0.1, 220);
    const view = mat4LookAt(this.camPos, this.target, [0, 1, 0]);
    this.viewProj = mat4Multiply(proj, view);
    this.invViewProj = mat4Invert(this.viewProj);
  }

  private render(): void {
    const gl = this.gl;
    if (!this.design) return;
    this.updateCamera();
    gl.clearColor(0.96, 0.93, 0.89, 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.disable(gl.CULL_FACE);

    gl.useProgram(this.rayProgram);
    gl.bindVertexArray(this.quadVao);
    this.setRayUniforms();
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    gl.useProgram(this.meshProgram);
    gl.uniformMatrix4fv(gl.getUniformLocation(this.meshProgram, 'uViewProj'), false, this.viewProj);
    gl.uniform3f(gl.getUniformLocation(this.meshProgram, 'uCamPos'), this.camPos[0], this.camPos[1], this.camPos[2]);
    gl.uniform1i(gl.getUniformLocation(this.meshProgram, 'uLightMode'), this.design.light === 'wedding' ? 1 : 0);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.atlasTexture);
    gl.uniform1i(gl.getUniformLocation(this.meshProgram, 'uNumberAtlas'), 0);

    this.drawGpuMesh(this.gpuPiping);
    this.drawGpuMesh(this.gpuDeco);
    this.drawGpuMesh(this.gpuNumbers);
    gl.bindVertexArray(null);
  }

  private drawGpuMesh(mesh: GpuMesh | null): void {
    if (!mesh || mesh.count === 0) return;
    const gl = this.gl;
    gl.bindVertexArray(mesh.vao);
    gl.drawElements(gl.TRIANGLES, mesh.count, gl.UNSIGNED_INT, 0);
  }

  private uniform4Array(name: string, rows: number[][]): void {
    const gl = this.gl;
    const loc = gl.getUniformLocation(this.rayProgram, name);
    const flat = new Float32Array(rows.flat());
    gl.uniform4fv(loc, flat);
  }

  private setRayUniforms(): void {
    const gl = this.gl;
    const d = this.design!;
    gl.uniform2f(gl.getUniformLocation(this.rayProgram, 'uResolution'), this.canvas.width, this.canvas.height);
    gl.uniform3f(gl.getUniformLocation(this.rayProgram, 'uCamPos'), this.camPos[0], this.camPos[1], this.camPos[2]);
    gl.uniformMatrix4fv(gl.getUniformLocation(this.rayProgram, 'uViewProj'), false, this.viewProj);
    gl.uniformMatrix4fv(gl.getUniformLocation(this.rayProgram, 'uInvViewProj'), false, this.invViewProj);
    gl.uniform1i(gl.getUniformLocation(this.rayProgram, 'uTierCount'), Math.min(8, d.tiers.length));
    gl.uniform1i(gl.getUniformLocation(this.rayProgram, 'uLightMode'), d.light === 'wedding' ? 1 : 0);
    gl.uniform1f(gl.getUniformLocation(this.rayProgram, 'uGrain'), d.settings.grain ? 1 : 0);
    gl.uniform1f(gl.getUniformLocation(this.rayProgram, 'uShadows'), d.settings.shadows ? 1 : 0);

    const a: number[][] = [];
    const b: number[][] = [];
    const colors: number[][] = [];
    let boardR = 16;
    d.tiers.slice(0, 8).forEach((tier, i) => {
      const info = this.stack[i];
      a.push([info?.centerX ?? tier.offsetXCm, info?.baseY ?? 0, info?.centerZ ?? tier.offsetZCm, tier.sizeCm]);
      const shape = tier.shape === 'round' ? 0 : tier.shape === 'square' ? 1 : 2;
      const material = tier.material === 'cream' ? 0 : tier.material === 'fondant' ? 1 : 2;
      b.push([tier.heightCm, shape, material, tier.whip]);
      const rgb = hexToRgb01(whippedColor(tier.material === 'glaze' ? tier.glaze.color : tier.color, tier.whip));
      colors.push([rgb[0], rgb[1], rgb[2], 1]);
      const bound = tier.shape === 'square' ? tier.sizeCm * 0.74 : tier.shape === 'heart' ? tier.sizeCm * 0.58 : tier.sizeCm * 0.52;
      boardR = Math.max(boardR, bound + 3.2);
    });
    while (a.length < 8) { a.push([0, 0, 0, 1]); b.push([1, 0, 0, 0]); colors.push([1, 1, 1, 1]); }
    this.uniform4Array('uTierA[0]', a);
    this.uniform4Array('uTierB[0]', b);
    this.uniform4Array('uTierColor[0]', colors);
    gl.uniform1f(gl.getUniformLocation(this.rayProgram, 'uBoardRadius'), boardR);

    const drips = getDrips(d).slice(0, 96);
    const da: number[][] = [];
    const db: number[][] = [];
    drips.forEach((drip) => {
      da.push([drip.x, drip.yTop, drip.z, drip.radius]);
      db.push([drip.length, drip.tierIndex, 0, 0]);
    });
    while (da.length < 96) { da.push([0, -999, 0, 0.001]); db.push([0, 0, 0, 0]); }
    this.uniform4Array('uDripA[0]', da);
    this.uniform4Array('uDripB[0]', db);
    gl.uniform1i(gl.getUniformLocation(this.rayProgram, 'uDripCount'), drips.length);
  }

  rayFromEvent(event: PointerEvent | WheelEvent | MouseEvent): { origin: V3; dir: V3 } {
    const rect = this.canvas.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    const y = 1 - ((event.clientY - rect.top) / rect.height) * 2;
    const world = this.unproject(x, y, 1);
    const origin = this.camPos;
    let dir: V3 = [world[0] - origin[0], world[1] - origin[1], world[2] - origin[2]];
    const len = Math.hypot(...dir) || 1;
    dir = [dir[0] / len, dir[1] / len, dir[2] / len];
    return { origin, dir };
  }

  private unproject(x: number, y: number, z: number): V3 {
    const m = this.invViewProj;
    const out = [
      m[0] * x + m[4] * y + m[8] * z + m[12],
      m[1] * x + m[5] * y + m[9] * z + m[13],
      m[2] * x + m[6] * y + m[10] * z + m[14],
      m[3] * x + m[7] * y + m[11] * z + m[15]
    ];
    return [out[0] / out[3], out[1] / out[3], out[2] / out[3]];
  }

  pickTop(clientX: number, clientY: number): SceneHit | null {
    const rect = this.canvas.getBoundingClientRect();
    const x = ((clientX - rect.left) / rect.width) * 2 - 1;
    const y = 1 - ((clientY - rect.top) / rect.height) * 2;
    this.updateCamera();
    const far = this.unproject(x, y, 1);
    let dir: V3 = [far[0] - this.camPos[0], far[1] - this.camPos[1], far[2] - this.camPos[2]];
    const len = Math.hypot(...dir) || 1;
    dir = [dir[0] / len, dir[1] / len, dir[2] / len];

    let best: SceneHit | null = null;
    let bestT = Infinity;
    for (const info of this.stack) {
      if (Math.abs(dir[1]) < 1e-5) continue;
      const t = (info.topY - this.camPos[1]) / dir[1];
      if (t <= 0 || t >= bestT) continue;
      const px = this.camPos[0] + dir[0] * t;
      const py = info.topY;
      const pz = this.camPos[2] + dir[2] * t;
      const localX = px - info.centerX;
      const localZ = pz - info.centerZ;
      if (isInsideShape(info.tier.shape, info.tier.sizeCm * 0.98, localX, localZ)) {
        bestT = t;
        best = { tierId: info.tier.id, x: px, y: py, z: pz };
      }
    }
    if (!best && dir[1] < -1e-5) {
      const t = (0 - this.camPos[1]) / dir[1];
      if (t > 0) best = { x: this.camPos[0] + dir[0] * t, y: 0, z: this.camPos[2] + dir[2] * t };
    }
    return best;
  }

  private handleDown = (e: PointerEvent): void => {
    this.canvas.setPointerCapture(e.pointerId);
    const orbit = this.interaction === 'orbit' || e.button === 2 || e.altKey || e.shiftKey;
    this.pointer = { id: e.pointerId, x: e.clientX, y: e.clientY, dragging: true, orbit, moved: false };
    this.canvas.style.cursor = orbit ? 'grabbing' : 'crosshair';
    if (!orbit) this.handlers.onSceneDown?.(this.pickTop(e.clientX, e.clientY), e);
  };

  private handleMove = (e: PointerEvent): void => {
    if (!this.pointer || this.pointer.id !== e.pointerId) {
      if (this.interaction !== 'orbit') {
        // hover could be used later
      }
      return;
    }
    const dx = e.clientX - this.pointer.x;
    const dy = e.clientY - this.pointer.y;
    if (Math.abs(dx) + Math.abs(dy) > 2) this.pointer.moved = true;
    if (this.pointer.orbit) {
      this.theta -= dx * 0.008;
      this.phi = Math.max(0.28, Math.min(Math.PI - 0.22, this.phi - dy * 0.006));
    } else {
      this.handlers.onSceneDrag?.(this.pickTop(e.clientX, e.clientY), e);
    }
    this.pointer.x = e.clientX;
    this.pointer.y = e.clientY;
  };

  private handleUp = (e: PointerEvent): void => {
    if (!this.pointer || this.pointer.id !== e.pointerId) return;
    if (!this.pointer.orbit) this.handlers.onSceneUp?.(this.pickTop(e.clientX, e.clientY), e);
    try { this.canvas.releasePointerCapture(e.pointerId); } catch { /* noop */ }
    this.pointer = null;
    this.canvas.style.cursor = this.interaction === 'orbit' ? 'grab' : 'crosshair';
  };

  private handleWheel = (e: WheelEvent): void => {
    e.preventDefault();
    this.radius = Math.max(14, Math.min(150, this.radius * Math.exp(e.deltaY * 0.001)));
  };

  captureDataUrl(): string {
    this.render();
    return this.canvas.toDataURL('image/png');
  }

  dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.resizeObserver.disconnect();
    this.canvas.removeEventListener('pointerdown', this.handleDown);
    this.canvas.removeEventListener('pointermove', this.handleMove);
    window.removeEventListener('pointerup', this.handleUp);
    this.canvas.removeEventListener('wheel', this.handleWheel);
    this.canvas.removeEventListener('contextmenu', this.preventMenu);
    const ext = this.gl.getExtension('WEBGL_lose_context');
    ext?.loseContext();
  }
}
