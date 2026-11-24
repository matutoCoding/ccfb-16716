// 顶点着色器：全屏三角形
export const VERT_SRC = `#version 300 es
precision highp float;
const vec2 VERTICES[3] = vec2[3](vec2(-1.0, -1.0), vec2(3.0, -1.0), vec2(-1.0, 3.0));
void main() {
  gl_Position = vec4(VERTICES[gl_VertexID], 0.0, 1.0);
}
`
