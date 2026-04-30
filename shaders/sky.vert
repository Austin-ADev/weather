attribute vec2 aPos;
varying vec2 vUv;

void main() {
  vUv = (aPos + 1.0) * 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}
