import { readFileSync } from 'node:fs'

const sdf = readFileSync('./src/render/shader_sdf.ts', 'utf8')
const march = readFileSync('./src/render/shader_march.ts', 'utf8')
const renderer = readFileSync('./src/render/renderer.ts', 'utf8')

const declared = new Set<string>()
for (const src of [sdf, march]) {
  for (const m of src.matchAll(/uniform\s+(?:highp\s+|mediump\s+|lowp\s+)?\w+\s+(\w+)/g)) {
    declared.add(m[1])
  }
}

const uploaded = new Set<string>()
const uniformCalls = renderer.matchAll(/this\.uniform\(([^)]*)\)/g)
for (const m of uniformCalls) {
  const arg = m[1]
  const simple = arg.match(/'([^']+)'/)
  if (simple) {
    uploaded.add(simple[1])
  } else {
    const tmpl = arg.match(/`([^`]+)`/)
    if (tmpl) uploaded.add(tmpl[1].split('[')[0])
  }
}

const TYPE_KEYWORDS = new Set(['isampler2D', 'sampler2D', 'int', 'float', 'vec2', 'vec3', 'vec4', 'mat4'])
const missing = [...declared].filter((u) => !uploaded.has(u) && !TYPE_KEYWORDS.has(u))
console.log('着色器声明:', declared.size)
console.log('渲染器上传基名:', uploaded.size)
console.log('声明但未上传:', missing)

// 反向：上传了但着色器没声明（位置 uniform 除外，那是采样器绑定）
const extra = [...uploaded].filter((u) => !declared.has(u))
console.log('上传但未声明:', extra)
