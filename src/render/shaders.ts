export const fullscreenVertex = `#version 300 es
precision highp float;
out vec2 vUv;
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  vUv = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}
`;

export const raymarchFragment = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;

uniform vec2 uResolution;
uniform vec3 uCamPos;
uniform mat4 uViewProj;
uniform mat4 uInvViewProj;
uniform int uTierCount;
uniform vec4 uTierA[8]; // cx, baseY, cz, size
uniform vec4 uTierB[8]; // height, shape, material, whip
uniform vec4 uTierColor[8];
uniform vec4 uDripA[96]; // x, yTop, z, radius
uniform vec4 uDripB[96]; // length, tierIndex, 0, 0
uniform int uDripCount;
uniform float uBoardRadius;
uniform int uLightMode;
uniform float uGrain;
uniform float uShadows;

float hash31(vec3 p) {
  p = fract(p * 0.1031);
  p += dot(p, p.yzx + 33.33);
  return fract((p.x + p.y) * p.z);
}

float noise3(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  float n000 = hash31(i + vec3(0,0,0));
  float n100 = hash31(i + vec3(1,0,0));
  float n010 = hash31(i + vec3(0,1,0));
  float n110 = hash31(i + vec3(1,1,0));
  float n001 = hash31(i + vec3(0,0,1));
  float n101 = hash31(i + vec3(1,0,1));
  float n011 = hash31(i + vec3(0,1,1));
  float n111 = hash31(i + vec3(1,1,1));
  return mix(mix(mix(n000,n100,f.x), mix(n010,n110,f.x), f.y),
             mix(mix(n001,n101,f.x), mix(n011,n111,f.x), f.y), f.z);
}

float sdCappedCylinder(vec3 p, float h, float r) {
  vec2 d = abs(vec2(length(p.xz), p.y)) - vec2(r, h);
  return min(max(d.x, d.y), 0.0) + length(max(d, 0.0));
}

float sdRoundBox(vec3 p, vec3 b, float r) {
  vec3 q = abs(p) - b + r;
  return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0) - r;
}

float sdCapsule(vec3 p, vec3 a, vec3 b, float r) {
  vec3 pa = p - a, ba = b - a;
  float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  return length(pa - ba * h) - r;
}

float heartF(vec2 q) {
  float a = dot(q, q) - 1.0;
  return a * a * a - q.x * q.x * q.y * q.y * q.y;
}

float sdHeartExtrude(vec3 p, float size, float h) {
  float s = size * 0.42;
  vec2 q = vec2(p.x, -p.z) / s;
  float a = dot(q, q) - 1.0;
  float f = heartF(q);
  float gx = 6.0 * q.x * a * a - 2.0 * q.x * q.y * q.y * q.y;
  float gy = 6.0 * q.y * a * a - 3.0 * q.x * q.x * q.y * q.y;
  float d2 = f / max(length(vec2(gx, gy)), 0.02);
  d2 *= s * 0.82;
  vec2 w = vec2(d2, abs(p.y) - h * 0.5);
  return min(max(w.x, w.y), 0.0) + length(max(w, 0.0));
}

vec2 mapScene(vec3 p) {
  vec2 res = vec2(sdCappedCylinder(p - vec3(0.0, -0.45, 0.0), 0.45, uBoardRadius), -1.0);
  float floorDistance = p.y + 0.92;
  if (floorDistance < res.x) res = vec2(floorDistance, -2.0);

  for (int i = 0; i < 8; i++) {
    if (i >= uTierCount) break;
    vec4 a = uTierA[i];
    vec4 b = uTierB[i];
    vec3 q = p - vec3(a.x, a.y + b.x * 0.5, a.z);
    float size = a.w;
    float h = b.x;
    float shape = b.y;
    float d = 1e5;
    if (shape < 0.5) {
      d = sdCappedCylinder(q, h * 0.5, size * 0.5 - 0.08);
    } else if (shape < 1.5) {
      float r = min(1.7, h * 0.18);
      vec3 halfB = vec3(size * 0.5 - r, max(0.12, h * 0.5 - r), size * 0.5 - r);
      d = sdRoundBox(q, halfB, r);
    } else {
      d = sdHeartExtrude(q, size, h);
    }
    if (d < res.x) res = vec2(d, float(i));
  }

  for (int j = 0; j < 96; j++) {
    if (j >= uDripCount) break;
    vec4 da = uDripA[j];
    vec4 db = uDripB[j];
    vec3 top = da.xyz;
    vec3 bottom = top - vec3(0.0, db.x, 0.0);
    float d = sdCapsule(p, top, bottom, da.w);
    if (d < res.x) res = vec2(d, db.y + 0.15);
  }
  return res;
}

vec3 calcNormal(vec3 p) {
  vec2 e = vec2(0.018, 0.0);
  return normalize(vec3(
    mapScene(p + e.xyy).x - mapScene(p - e.xyy).x,
    mapScene(p + e.yxy).x - mapScene(p - e.yxy).x,
    mapScene(p + e.yyx).x - mapScene(p - e.yyx).x
  ));
}

float softShadow(vec3 ro, vec3 rd, float maxT) {
  float res = 1.0;
  float t = 0.08;
  for (int i = 0; i < 28; i++) {
    if (t > maxT) break;
    float h = mapScene(ro + rd * t).x;
    if (h < 0.015) return 0.34;
    res = min(res, 10.0 * h / t);
    t += clamp(h, 0.08, 0.75);
  }
  return clamp(res, 0.34, 1.0);
}

vec3 aces(vec3 x) {
  return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0);
}

void main() {
  vec2 ndc = vUv * 2.0 - 1.0;
  vec4 world = uInvViewProj * vec4(ndc, 1.0, 1.0);
  world /= world.w;
  vec3 ro = uCamPos;
  vec3 rd = normalize(world.xyz - ro);

  float t = 0.0;
  vec2 hit = vec2(-1.0, 0.0);
  for (int i = 0; i < 112; i++) {
    vec3 p = ro + rd * t;
    vec2 scene = mapScene(p);
    if (scene.x < max(0.012, t * 0.0009)) { hit = vec2(t, scene.y); break; }
    t += scene.x * 0.82;
    if (t > 95.0) break;
  }

  bool wedding = uLightMode == 1;
  vec3 bgTop = wedding ? vec3(0.10, 0.055, 0.075) : vec3(0.83, 0.89, 0.94);
  vec3 bgBottom = wedding ? vec3(0.30, 0.16, 0.18) : vec3(0.97, 0.93, 0.88);
  float bgGrad = smoothstep(-0.25, 0.85, ndc.y);
  vec3 background = mix(bgBottom, bgTop, bgGrad);
  if (wedding) {
    for (int b = 0; b < 7; b++) {
      float fb = float(b);
      vec2 c = vec2(fract(sin(fb * 19.19) * 43758.5) * 1.6 - 0.3, 0.15 + fract(sin(fb * 7.7) * 1234.5) * 0.65);
      float r = 0.035 + 0.035 * fract(sin(fb * 3.3) * 987.0);
      float glow = exp(-dot((ndc - c) * vec2(1.0, 1.4), (ndc - c) * vec2(1.0, 1.4)) / (r * r));
      background += vec3(1.0, 0.63, 0.28) * glow * 0.22;
    }
  }
  background = pow(clamp(background, 0.0, 1.0), vec3(2.2));

  if (hit.x < 0.0) {
    outColor = vec4(pow(background, vec3(0.4545)), 1.0);
    gl_FragDepth = 1.0;
    return;
  }

  vec3 p = ro + rd * hit.x;
  vec3 N = calcNormal(p);
  vec3 V = -rd;
  int id = int(floor(hit.y + 0.5));
  vec3 base = vec3(0.96, 0.91, 0.84);
  float roughness = 0.75;
  float specPower = 34.0;
  float specStrength = 0.25;
  float clearCoat = 0.0;

  if (id == -1) {
    base = vec3(0.93, 0.78, 0.84);
    roughness = 0.34;
    specPower = 70.0;
    specStrength = 0.5;
  } else if (id == -2) {
    base = wedding ? vec3(0.16, 0.10, 0.11) : vec3(0.86, 0.82, 0.77);
    roughness = 0.82;
  } else {
    int ti = clamp(id, 0, uTierCount - 1);
    base = uTierColor[ti].rgb;
    float material = uTierB[ti].z;
    if (material < 0.5) {
      roughness = 0.88; specPower = 24.0; specStrength = 0.16;
      float grain = noise3(p * 72.0) * 0.65 + noise3(p * 151.0) * 0.35;
      base *= 0.93 + 0.12 * grain * uGrain;
      vec3 bump = vec3(noise3(p * 105.0 + 4.7), noise3(p * 105.0 + 19.2), noise3(p * 105.0 + 33.1)) - 0.5;
      N = normalize(N + bump * 0.13 * uGrain);
    } else if (material < 1.5) {
      roughness = 0.48; specPower = 58.0; specStrength = 0.24;
      base *= 0.985 + 0.03 * noise3(p * 18.0);
    } else {
      roughness = 0.07; specPower = 190.0; specStrength = 1.35; clearCoat = 1.0;
      float ripple = noise3(vec3(p.xz * 8.0, p.y * 2.0));
      N = normalize(N + vec3(ripple - 0.5, 0.0, noise3(p * 9.0) - 0.5) * 0.025);
    }
  }

  // 颜色色值按 sRGB 录入；光照在线性空间计算，避免深色淋面被高光直接冲成粉色。
  base = pow(clamp(base, 0.0, 1.0), vec3(2.2));

  vec3 keyDir = normalize(wedding ? vec3(-0.45, 0.82, 0.36) : vec3(-0.42, 0.88, 0.32));
  vec3 fillDir = normalize(vec3(0.62, 0.42, -0.55));
  vec3 rimDir = normalize(vec3(0.25, 0.55, -0.92));
  vec3 keyColor = wedding ? vec3(1.0, 0.72, 0.46) * 1.65 : vec3(1.0, 0.94, 0.84) * 1.45;
  vec3 fillColor = wedding ? vec3(0.46, 0.34, 0.62) * 0.55 : vec3(0.62, 0.76, 1.0) * 0.52;
  vec3 rimColor = wedding ? vec3(1.0, 0.58, 0.28) * 1.25 : vec3(1.0) * 0.55;

  float shadow = (uShadows > 0.5 && uTierCount > 0) ? softShadow(p + N * 0.035, keyDir, 18.0) : 1.0;
  float keyDiff = max(dot(N, keyDir), 0.0) * shadow;
  float fillDiff = max(dot(N, fillDir), 0.0);
  float rimDiff = max(dot(N, rimDir), 0.0);
  float hemi = 0.48 + 0.22 * N.y;
  vec3 ambient = wedding ? vec3(0.30, 0.20, 0.22) * hemi : vec3(0.66, 0.70, 0.76) * hemi;

  vec3 H = normalize(keyDir + V);
  float spec = pow(max(dot(N, H), 0.0), specPower) * specStrength * shadow;
  float fresnel = pow(1.0 - max(dot(N, V), 0.0), 5.0);
  vec3 R = reflect(-V, N);
  float envUp = smoothstep(-0.2, 0.9, R.y);
  vec3 envCol = mix(wedding ? vec3(0.35,0.18,0.16) : vec3(0.55,0.48,0.42),
                    wedding ? vec3(1.0,0.72,0.42) : vec3(1.0,0.97,0.9), envUp);
  float softbox = pow(max(dot(R, normalize(vec3(-0.35, 0.82, 0.45))), 0.0), 24.0);

  float diffuseEnergy = mix(1.0, 0.62, clearCoat);
  float ambientEnergy = mix(1.0, 0.58, clearCoat);
  vec3 color = base * (ambient * ambientEnergy + keyColor * keyDiff * diffuseEnergy + fillColor * fillDiff * diffuseEnergy + rimColor * rimDiff * 0.35);
  color += keyColor * spec;
  color += envCol * fresnel * (0.10 + clearCoat * 0.72);
  color += vec3(1.0, 0.96, 0.88) * softbox * (0.12 + clearCoat * 0.85);

  float fog = smoothstep(45.0, 95.0, hit.x);
  color = mix(color, background, fog * 0.55);
  color = aces(color);
  color = pow(color, vec3(0.4545));
  outColor = vec4(color, 1.0);

  vec4 clip = uViewProj * vec4(p, 1.0);
  gl_FragDepth = clip.z / clip.w * 0.5 + 0.5;
}
`;

export const meshVertex = `#version 300 es
layout(location=0) in vec3 aPosition;
layout(location=1) in vec3 aNormal;
layout(location=2) in vec3 aColor;
layout(location=3) in vec4 aParams;
layout(location=4) in vec2 aUv;
uniform mat4 uViewProj;
out vec3 vPos;
out vec3 vNormal;
out vec3 vColor;
out vec4 vParams;
out vec2 vUv;
void main() {
  vPos = aPosition;
  vNormal = aNormal;
  vColor = aColor;
  vParams = aParams;
  vUv = aUv;
  gl_Position = uViewProj * vec4(aPosition, 1.0);
}
`;

export const meshFragment = `#version 300 es
precision highp float;
in vec3 vPos;
in vec3 vNormal;
in vec3 vColor;
in vec4 vParams;
in vec2 vUv;
out vec4 outColor;

uniform vec3 uCamPos;
uniform int uLightMode;
uniform sampler2D uNumberAtlas;

float hash31(vec3 p) {
  p = fract(p * 0.1031);
  p += dot(p, p.yzx + 33.33);
  return fract((p.x + p.y) * p.z);
}
float noise3(vec3 x) {
  vec3 i=floor(x), f=fract(x); f=f*f*(3.-2.*f);
  float n000=hash31(i), n100=hash31(i+vec3(1,0,0));
  float n010=hash31(i+vec3(0,1,0)), n110=hash31(i+vec3(1,1,0));
  float n001=hash31(i+vec3(0,0,1)), n101=hash31(i+vec3(1,0,1));
  float n011=hash31(i+vec3(0,1,1)), n111=hash31(i+vec3(1,1,1));
  return mix(mix(mix(n000,n100,f.x),mix(n010,n110,f.x),f.y),mix(mix(n001,n101,f.x),mix(n011,n111,f.x),f.y),f.z);
}
vec3 aces(vec3 x){ return clamp((x*(2.51*x+.03))/(x*(2.43*x+.59)+.14),0.,1.); }

void main() {
  vec3 base = vColor;
  if (vParams.z > 0.5) {
    vec4 tex = texture(uNumberAtlas, vUv);
    if (tex.a < 0.22) discard;
    base = vColor * mix(vec3(1.0), tex.rgb, 0.15);
  }

  vec3 N = normalize(vNormal);
  if (!gl_FrontFacing) N = -N;
  float rough = clamp(vParams.x, 0.05, 1.0);
  float specAmt = vParams.y;
  if (rough > 0.72 && vParams.z < 0.5) {
    float g = noise3(vPos * 82.0) * 0.7 + noise3(vPos * 160.0) * 0.3;
    base *= 0.94 + 0.10 * g;
    vec3 bump = vec3(noise3(vPos*115.0+2.0), noise3(vPos*115.0+9.0), noise3(vPos*115.0+21.0)) - vec3(0.5);
    N = normalize(N + bump * 0.11);
  }
  base = pow(clamp(base, 0.0, 1.0), vec3(2.2));

  vec3 V = normalize(uCamPos - vPos);
  vec3 L = normalize(vec3(-0.42, 0.88, 0.32));
  vec3 L2 = normalize(vec3(0.62, 0.42, -0.55));
  vec3 keyColor = uLightMode > 0 ? vec3(1.0,.72,.46)*1.55 : vec3(1.0,.94,.84)*1.45;
  vec3 fillColor = uLightMode > 0 ? vec3(.46,.34,.62)*.55 : vec3(.62,.76,1.0)*.5;
  float diff = max(dot(N,L),0.0);
  float fill = max(dot(N,L2),0.0);
  float hemi = .48 + .22*N.y;
  vec3 ambient = uLightMode > 0 ? vec3(.30,.20,.22)*hemi : vec3(.66,.70,.76)*hemi;
  float shininess = mix(120.0, 14.0, rough);
  vec3 H = normalize(L+V);
  float spec = pow(max(dot(N,H),0.0), shininess) * specAmt;
  float fres = pow(1.0-max(dot(N,V),0.0), 5.0);
  vec3 color = base * (ambient + keyColor*diff + fillColor*fill) + keyColor * spec;
  color += mix(vec3(.55,.48,.42), vec3(1,.97,.9), N.y*.5+.5) * fres * specAmt * .35;
  color = pow(aces(color), vec3(.4545));
  outColor = vec4(color, 1.0);
}
`;
