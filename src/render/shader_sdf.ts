// SDF 函数库（注入片元着色器）
export const SDF_LIB = `
uniform highp isampler2D uGridIndex;
uniform sampler2D uSegments;
uniform int uSegmentCount;
uniform int uGridCellsX;
uniform int uGridCellsY;
uniform int uGridCellsZ;
uniform float uCellSizeX;
uniform float uCellSizeY;
uniform float uCellSizeZ;
uniform vec3 uGridOrigin;

#define MAX_LAYERS 8
uniform int uLayerCount;
uniform vec4 uLayerShapeRadius[MAX_LAYERS]; // x:shape y:radius z:height w:yBottom
uniform vec4 uLayerMat[MAX_LAYERS];        // x:material y:drip z:unused w:unused
uniform vec3 uLayerColor[MAX_LAYERS];

#define MAX_DECORATIONS 128
uniform int uDecorationCount;
uniform vec4 uDecPosScale[MAX_DECORATIONS];  // xyz:位置 w:scale
uniform vec4 uDecMeta[MAX_DECORATIONS];      // x:kind y:rotation z:digit w:unused
uniform vec3 uDecColor[MAX_DECORATIONS];

// 命中结果：距离 + 材质 id + 基色
struct Hit {
  float d;
  int mat;
  vec3 color;
};

float sdRoundBox(vec3 p, vec3 b, float r) {
  vec3 q = abs(p) - b + r;
  return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0) - r;
}

float sdCylinderY(vec3 p, float r, float h) {
  vec2 d = vec2(length(p.xz) - r, abs(p.y) - h * 0.5);
  return min(max(d.x, d.y), 0.0) + length(max(d, 0.0));
}

// 心形平面 SDF（与 CPU 侧 sdHeartUnit 同一公式）
float sdHeart2D(vec2 p) {
  float ax = abs(p.x);
  float r = 0.3535533906;
  float d1 = length(vec2(ax - 0.25, p.y - 0.75)) - r;
  float d2 = length(vec2(ax - 0.75, p.y - 0.75)) - r;
  if (p.y + ax > 1.0) return min(d1, d2);
  float bx = 0.5 * max(ax + p.y, 0.0);
  float d3 = length(vec2(ax - bx, p.y - bx)) - r;
  return min(min(d1, d3), d2);
}

float sdHeartExtrude(vec3 p, float halfD, float h) {
  vec2 hp = vec2(p.x, p.z) / halfD;
  float d2 = sdHeart2D(hp) * halfD;
  float dy = abs(p.y) - h * 0.5;
  vec2 d = vec2(d2, dy);
  return min(max(d.x, d.y), 0.0) + length(max(d, 0.0));
}

// 五角星截面
float sdStar5(vec2 p, float rf) {
  const vec2 k1 = vec2(0.8090, -0.5878);
  const vec2 k2 = vec2(-0.3090, -0.9511);
  vec2 p2 = 2.0 * fract(0.5 * p + 0.5) - 1.0;
  p.x = abs(p.x);
  p2.x = abs(p2.x);
  p -= 2.0 * min(dot(p, k1), 0.0) * k1;
  p2 -= 2.0 * min(dot(p2, k1), 0.0) * k1;
  p -= 2.0 * min(dot(p, k2), 0.0) * k2;
  p2 -= 2.0 * min(dot(p2, k2), 0.0) * k2;
  p.x -= k1.x;
  p2.x -= k1.x;
  float wa = k2.y * p.x - k2.x * p.y;
  float wb = k2.y * p2.x - k2.x * p2.y;
  float d = dot(p / max(wa, wb), k2);
  return d * 1.0 * sign(wa);
}

// 花嘴截面（p2 为截面平面坐标，r 为基准半径）
float profileSDF(int profile, vec2 p2, float r) {
  if (profile == 0) return length(p2) - r;                          // 圆口
  if (profile == 1) return sdStar5(p2 / r, 0.5) * r;               // 星形
  if (profile == 2) return length(p2 / vec2(r, r * 1.25)) - r;     // 贝壳（椭圆）
  if (profile == 3) return length(p2 / vec2(r, r * 0.45)) - r;     // 叶齿（扁椭圆）
  if (profile == 4) return length(p2 / vec2(r, r * 0.7)) - r;      // 花瓣
  // 绳编：双圆融合
  float dA = length(p2 - vec2(r * 0.55, 0.0)) - r * 0.75;
  float dB = length(p2 + vec2(r * 0.55, 0.0)) - r * 0.75;
  return min(dA, dB);
}

// 单根管段：胶囊体长度方向 + 花嘴截面，半径沿段线性插值
float segmentSDF(vec3 p, vec3 a, vec3 b, float rA, float rB, int profile, out float radiusHere) {
  vec3 pa = p - a;
  vec3 ba = b - a;
  float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-7), 0.0, 1.0);
  vec3 center = a + ba * h;
  radiusHere = mix(rA, rB, h);
  vec3 rel = p - center;
  vec3 axis = normalize(ba);
  // 截面坐标：相对轴线的垂直平面
  vec3 perp = rel - axis * dot(rel, axis);
  vec3 helper = abs(axis.y) > 0.9 ? vec3(1.0, 0.0, 0.0) : vec3(0.0, 1.0, 0.0);
  vec3 u = normalize(cross(helper, axis));
  vec3 v = cross(axis, u);
  vec2 p2 = vec2(dot(perp, u), dot(perp, v));
  float dProfile = profileSDF(profile, p2, radiusHere);
  // 端点封闭：超出段范围回退为胶囊距离
  float axial = (h <= 0.0 || h >= 1.0) ? abs(h - clamp(h, 0.0, 1.0)) * length(ba) : 0.0;
  return max(dProfile, axial - 1e-4);
}

// 淋面滴落：顶部下盖 + 沿侧面向下流淌的周期性滴柱
float glazeDrip(vec3 p, float radius, float height, float dripRatio, int shape) {
  float top = height + 0.25;
  float yFromTop = top - p.y;
  if (yFromTop < 0.0) return 1e4;
  float radial = shape == 1
    ? max(abs(p.x), abs(p.z))
    : length(p.xz);
  float wall = shape == 2 ? radius * 0.92 : radius;
  // 滴落角度：每 32 度一道，高度用 cos 波峰模拟
  float angle = atan(p.z, p.x);
  float wave = (cos(angle * 11.3) + 1.0) * 0.5;
  float dripLen = dripRatio * height * (0.35 + 0.65 * pow(wave, 3.0));
  float sideCover = yFromTop < dripLen ? 0.0 : 1e4;
  float sideDist = abs(radial - (wall + 0.12)) + sideCover;
  float topDist = max(yFromTop - 0.25, radial - wall);
  return min(sideDist, topDist);
}

Hit layerSDF(vec3 p, int index) {
  vec4 sr = uLayerShapeRadius[index];
  vec4 meta = uLayerMat[index];
  vec3 local = vec3(p.x, p.y - sr.w - sr.z * 0.5, p.z);
  float dBody;
  if (int(sr.x) == 0) {
    dBody = sdCylinderY(local, sr.y, sr.z);
  } else if (int(sr.x) == 1) {
    dBody = sdRoundBox(local, vec3(sr.y, sr.z * 0.5, sr.y), sr.y * 0.06);
  } else {
    dBody = sdHeartExtrude(local, sr.y, sr.z);
  }
  int material = int(meta.x);
  vec3 color = uLayerColor[index];
  if (material == 2 && meta.y > 0.001) {
    float dDrip = glazeDrip(p - vec3(0.0, sr.w, 0.0), sr.y, sr.z, meta.y, int(sr.x));
    if (dDrip < dBody) return Hit(dDrip, 2, color);
  }
  return Hit(dBody, material, color);
}

// 装饰件 SDF
Hit decorationSDF(vec3 p, int index) {
  vec4 ps = uDecPosScale[index];
  vec4 meta = uDecMeta[index];
  int kind = int(meta.x);
  vec3 q = p - ps.xyz;
  // 绕 Y 旋转
  float c = cos(meta.y);
  float s = sin(meta.y);
  q.xz = mat2(c, -s, s, c) * q.xz;
  q /= ps.w;
  vec3 color = uDecColor[index];

  if (kind == 0) {
    // 草莓：圆锥体 + 籽的颗粒由材质噪声承担
    float d = length(q.xz / 0.62) + q.y * 0.9 - 0.55;
    return Hit(d * ps.w, 3, color);
  }
  if (kind == 1) {
    // 蓝莓：微扁球
    return Hit((length(q / vec3(0.55, 0.48, 0.55)) - 1.0) * ps.w, 3, color);
  }
  if (kind == 2) {
    // 巧克力片：薄圆角盒，略倾斜
    vec3 rq = q;
    float ang = 0.22;
    rq.yz = mat2(cos(ang), -sin(ang), sin(ang), cos(ang)) * rq.yz;
    return Hit(sdRoundBox(rq, vec3(0.85, 0.09, 0.42), 0.06) * ps.w, 4, color);
  }
  if (kind == 3) {
    // 糖珠：小球
    return Hit((length(q) - 0.42) * ps.w, 4, color);
  }
  // 数字蜡烛：圆柱蜡体
  float wax = sdCylinderY(q - vec3(0.0, 0.55, 0.0), 0.28, 1.1);
  float flame = length(q - vec3(0.0, 1.32, 0.0)) - 0.13;
  if (flame < wax) return Hit(flame * ps.w, 5, vec3(1.0, 0.55, 0.12));
  return Hit(wax * ps.w, 4, color);
}
`
