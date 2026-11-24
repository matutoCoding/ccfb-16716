// 光线步进与光照（注入片元着色器）
export const MARCH_LIB = `
uniform vec3 uCamPos;
uniform mat4 uViewInverse;
uniform float uTanFov;
uniform vec2 uResolution;
uniform vec3 uLightDir;
uniform vec3 uLightColor;
uniform vec3 uAmbient;
uniform vec3 uEnvTop;
uniform vec3 uEnvBottom;
uniform float uTime;

const int MAX_MARCH = 96;
const float MIN_DIST = 0.02;
const int GRID_SLOTS = 96;
const int SEG_ROWS = 12000;
const int SEG_COLS = 13;

vec4 segTex(int segIndex, int col) {
  return texture(uSegments, vec2((float(col) + 0.5) / float(SEG_COLS),
                                 (float(segIndex) + 0.5) / float(SEG_ROWS)));
}

// 世界点到所有管段的最近 SDF（沿光线经过的格子里找）
vec3 tubeSDFAt(vec3 p, vec3 ro, vec3 rd, out vec3 outColor) {
  float best = 1e4;
  vec3 bestColor = vec3(0.0);
  vec3 cellSize = vec3(uCellSizeX, uCellSizeY, uCellSizeZ);
  vec3 invRd = 1.0 / (abs(rd) + vec3(1e-5));
  vec3 gridPos = (ro - uGridOrigin) / cellSize;
  ivec3 cell = ivec3(clamp(floor(gridPos), ivec3(0),
    ivec3(uGridCellsX - 1, uGridCellsY - 1, uGridCellsZ - 1)));
  ivec3 stepCell = ivec3(sign(rd));
  vec3 boundary = (vec3(cell) + max(stepCell, ivec3(0))) * cellSize + uGridOrigin;
  vec3 tDelta = cellSize * invRd;
  vec3 tMax = (boundary - ro) / (rd + vec3(1e-8) * sign(rd));
  if (stepCell.x == 0) tMax.x = 1e9;
  if (stepCell.y == 0) tMax.y = 1e9;
  if (stepCell.z == 0) tMax.z = 1e9;
  int totalCells = uGridCellsX * uGridCellsY * uGridCellsZ;

  for (int traversal = 0; traversal < 140; traversal++) {
    if (cell.x < 0 || cell.y < 0 || cell.z < 0 ||
        cell.x >= uGridCellsX || cell.y >= uGridCellsY || cell.z >= uGridCellsZ) break;
    int cellIndex = cell.x + uGridCellsX * (cell.y + uGridCellsY * cell.z);
    for (int slot = 0; slot < GRID_SLOTS; slot++) {
      int segIndex = texture(uGridIndex,
        vec2((float(slot) + 0.5) / float(GRID_SLOTS),
             (float(cellIndex) + 0.5) / float(totalCells))).x;
      if (segIndex < 0) break;
      vec4 s0 = segTex(segIndex, 0);
      vec4 s1 = segTex(segIndex, 1);
      vec4 s2 = segTex(segIndex, 2);
      vec4 s3 = segTex(segIndex, 3);
      float radiusHere;
      float d = segmentSDF(p, s0.xyz, s1.xyz, s2.x, s2.y, int(s2.z), radiusHere);
      if (d < best) {
        best = d;
        bestColor = s3.xyz;
      }
    }
    if (tMax.x < tMax.y && tMax.x < tMax.z) {
      cell.x += stepCell.x;
      tMax.x += tDelta.x;
    } else if (tMax.y < tMax.z) {
      cell.y += stepCell.y;
      tMax.y += tDelta.y;
    } else {
      cell.z += stepCell.z;
      tMax.z += tDelta.z;
    }
  }
  outColor = bestColor;
  return vec3(best, 0.0, 0.0);
}

// 管段射线步进：沿射线按管段 SDF 推进，返回命中距离
float traceTubes(vec3 ro, vec3 rd, out vec3 hitColor) {
  float t = 0.12;
  for (int i = 0; i < 48; i++) {
    vec3 p = ro + rd * t;
    vec3 color;
    float d = tubeSDFAt(p, ro, rd, color).x;
    if (d < MIN_DIST) {
      hitColor = color;
      return t;
    }
    t += clamp(d, 0.03, 0.5);
    if (t > 90.0) break;
  }
  return 1e4;
}

// 管段法线：四点有限差分（同样只遍历光线附近格子）
vec3 tubeNormal(vec3 p, vec3 ro, vec3 rd) {
  const float e = 0.05;
  vec3 tmp;
  float dx = tubeSDFAt(p + vec3(e, 0.0, 0.0), ro, rd, tmp).x
    - tubeSDFAt(p - vec3(e, 0.0, 0.0), ro, rd, tmp).x;
  float dy = tubeSDFAt(p + vec3(0.0, e, 0.0), ro, rd, tmp).x
    - tubeSDFAt(p - vec3(0.0, e, 0.0), ro, rd, tmp).x;
  float dz = tubeSDFAt(p + vec3(0.0, 0.0, e), ro, rd, tmp).x
    - tubeSDFAt(p - vec3(0.0, 0.0, e), ro, rd, tmp).x;
  return normalize(vec3(dx, dy, dz));
}

Hit mapScene(vec3 p) {
  Hit best = Hit(1e4, 0, vec3(0.0));
  for (int i = 0; i < MAX_LAYERS; i++) {
    if (i >= uLayerCount) break;
    Hit h = layerSDF(p, i);
    if (h.d < best.d) best = h;
  }
  for (int i = 0; i < MAX_DECORATIONS; i++) {
    if (i >= uDecorationCount) break;
    Hit h = decorationSDF(p, i);
    if (h.d < best.d) best = h;
  }
  return best;
}

vec3 calcNormal(vec3 p) {
  const float e = 0.035;
  vec2 k = vec2(1.0, -1.0);
  return normalize(
    k.xyy * mapScene(p + k.xyy * e).d +
    k.yyx * mapScene(p + k.yyx * e).d +
    k.yxy * mapScene(p + k.yxy * e).d +
    k.xxx * mapScene(p + k.xxx * e).d
  );
}

float softShadow(vec3 ro, vec3 rd, float mint, float maxt) {
  float res = 1.0;
  float t = mint;
  for (int i = 0; i < 24; i++) {
    float h = mapScene(ro + rd * t).d;
    if (h < 0.02) return 0.0;
    res = min(res, 10.0 * h / t);
    t += clamp(h, 0.08, 0.9);
    if (t > maxt) break;
  }
  return clamp(res, 0.0, 1.0);
}

float calcAO(vec3 p, vec3 n) {
  float occ = 0.0;
  float sca = 1.0;
  for (int i = 0; i < 4; i++) {
    float h = 0.12 + 0.14 * float(i);
    float d = mapScene(p + n * h).d;
    occ += (h - d) * sca;
    sca *= 0.72;
  }
  return clamp(1.0 - 1.6 * occ, 0.0, 1.0);
}

float hash31(vec3 p) {
  p = fract(p * 0.1031);
  p += dot(p, p.yzx + 33.33);
  return fract((p.x + p.y) * p.z);
}

float fbm(vec3 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 4; i++) {
    v += a * hash31(floor(p * 18.0));
    p = p * 2.03 + vec3(1.7, 9.2, 4.1);
    a *= 0.5;
  }
  return v;
}

// 材质：0 奶油（颗粒）1 翻糖（哑光）2 镜面淋面 3 水果 4 巧克力/糖 5 火焰
vec3 shadeMaterial(int mat, vec3 p, vec3 n, vec3 rd, vec3 albedo, out float specStrength, out float rough) {
  if (mat == 5) return albedo * (1.6 + 0.4 * sin(uTime * 9.0));
  float grain = fbm(p * 2.2) - 0.5;
  if (mat == 0) {
    n = normalize(n + 0.16 * grain);
    rough = 0.62;
    specStrength = 0.28;
    return albedo * (0.92 + 0.16 * grain);
  }
  if (mat == 1) {
    rough = 0.42;
    specStrength = 0.4;
    return albedo;
  }
  if (mat == 2) {
    rough = 0.06;
    specStrength = 1.0;
    vec3 refl = reflect(rd, n);
    float skyMix = clamp(refl.y * 0.5 + 0.5, 0.0, 1.0);
    vec3 env = mix(uEnvBottom, uEnvTop, skyMix);
    return albedo * 0.35 + env * 0.65;
  }
  if (mat == 3) {
    rough = 0.34;
    specStrength = 0.5;
    return albedo * (0.95 + 0.1 * grain);
  }
  rough = 0.28;
  specStrength = 0.7;
  return albedo;
}

vec3 shade(vec3 p, vec3 n, vec3 rd, int mat, vec3 albedo) {
  float specStrength;
  float rough;
  vec3 base = shadeMaterial(mat, p, n, rd, albedo, specStrength, rough);
  vec3 lightDir = normalize(uLightDir);
  float shadow = softShadow(p + n * 0.06, lightDir, 0.05, 22.0);
  float diff = max(dot(n, lightDir), 0.0);
  vec3 halfV = normalize(lightDir - rd);
  float spec = pow(max(dot(n, halfV), 0.0), mix(220.0, 14.0, rough)) * specStrength * shadow;
  float ao = calcAO(p, n);
  float fresnel = pow(1.0 - max(dot(n, -rd), 0.0), 5.0);
  return base * (uAmbient * ao + uLightColor * diff * shadow)
    + uLightColor * spec + base * fresnel * 0.18;
}

vec3 render(vec2 uv) {
  vec3 ro = uCamPos;
  vec3 rd = normalize((uViewInverse * vec4(uv.xy * uTanFov, -1.0, 0.0)).xyz);

  float t = 0.15;
  Hit hit = Hit(1e4, 0, vec3(0.0));
  for (int i = 0; i < MAX_MARCH; i++) {
    vec3 p = ro + rd * t;
    Hit h = mapScene(p);
    if (h.d < MIN_DIST) {
      hit = Hit(t, h.mat, h.color);
      break;
    }
    t += clamp(h.d * 0.85, 0.04, 1.4);
    if (t > 90.0) break;
  }

  vec3 tubeColor;
  float tubeT = traceTubes(ro, rd, tubeColor);
  vec3 color;
  if (tubeT < hit.d) {
    vec3 p = ro + rd * tubeT;
    vec3 n = tubeNormal(p, ro, rd);
    color = shade(p, n, rd, 0, tubeColor);
  } else if (hit.d < 1e3) {
    vec3 p = ro + rd * hit.d;
    vec3 n = calcNormal(p);
    color = shade(p, n, rd, hit.mat, hit.color);
  } else {
    float skyMix = clamp(rd.y * 0.5 + 0.55, 0.0, 1.0);
    color = mix(uEnvBottom, uEnvTop, skyMix);
    float groundT = (0.0 - ro.y) / rd.y;
    if (rd.y < 0.0 && groundT > 0.0) {
      vec3 gp = ro + rd * groundT;
      float gx = abs(mod(gp.x + 50.0, 2.0) - 1.0);
      float gz = abs(mod(gp.z + 50.0, 2.0) - 1.0);
      float gridLine = 0.35 * (1.0 - smoothstep(0.0, 0.12, min(gx, gz)));
      float fade = exp(-0.0025 * dot(gp.xz, gp.xz));
      color = mix(uEnvBottom, uEnvBottom * 0.82 + vec3(gridLine), fade);
    }
  }

  color = (color * (2.51 * color + 0.03)) / (color * (2.43 * color + 0.59) + 0.14);
  return pow(clamp(color, 0.0, 1.0), vec3(1.0 / 2.2));
}

void main() {
  vec2 uv = (gl_FragCoord.xy * 2.0 - uResolution) / uResolution.y;
  vec3 color = render(uv);
  vec2 q = gl_FragCoord.xy / uResolution;
  color *= 0.94 + 0.06 * pow(16.0 * q.x * q.y * (1.0 - q.x) * (1.0 - q.y), 0.25);
  gl_FragColor = vec4(color, 1.0);
}
`
